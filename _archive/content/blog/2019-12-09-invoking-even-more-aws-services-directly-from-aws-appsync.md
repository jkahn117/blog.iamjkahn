---
layout: post
title: Invoking even more AWS services directly from AWS AppSync
date: 2019-12-09 15:58 -0600
summary: A collection of AWS AppSync resolvers that can be used to directly invoke AWS services, including Secrets Manager, SQS, S3, and Step Functions.
background: '/assets/images/patrick-perkins-ETRPjvb0KM0-unsplash.jpg'
---

A few months ago, I wrote a [post on the AWS Mobile Blog](https://aws.amazon.com/blogs/mobile/invoke-aws-services-directly-from-aws-appsync/) that demonstrated how to invoke AWS service directly from AWS AppSync. In that case, I specifically focused on AWS Step Functions, but it is possible to integrate AppSync with many other AWS services. The goal of this post is to document the integration of AppSync with services beyond Step Functions.

AWS AppSync uses GraphQL resolvers to define the interaction between AppSync and each data source. These are Apache Velocity Templates that will be unique per GraphQL operation. By moving integration of AWS services to resolvers, we can minimize the maintenance of integration code. Velocity Templates generally require little upkeep over time. This approach can be even more maintainable than relying on a thin layer of Lambda code for integration, which would still require dependency management and updates.

## Adding an AWS data source

The first step in integrating AppSync with an AWS service is to create an HTTP data source for the service. For an AWS service, the data source endpoint is set to the service API endpoint for the given AWS region and we configure [SigV4](https://docs.aws.amazon.com/general/latest/gr/signature-version-4.html) signing.

Currently, to configure signing of HTTP data sources, we can use either the AWS CLI or CloudFormation. My preference is to utilize CloudFormation for these needs, though my earlier blog post demonstrates the CLI approach as well. For example, we can add a new data source to invoke Amazon SQS using CloudFormation as follows

``` yaml
SQSHttpDataSource:
  Type: AWS::AppSync::DataSource
  Properties:
    ApiId: !GetAtt MyApi.ApiId
    Name: SQSDataSource
    Description: SQS Data Source
    Type: HTTP
    # IAM role defined elsewhere in AWS CloudFormation template
    # Note: this role needs a policy with 'sqs:SendMessage' permission
    ServiceRoleArn: !GetAtt AppSyncServiceRole.Arn
    HttpConfig:
      Endpoint: !Sub https://sqs.${AWS::Region}.amazonaws.com/
      AuthorizationConfig:
        AuthorizationType: AWS_IAM
        AwsIamConfig:
          SigningRegion: !Ref AWS::Region
          SigningServiceName: sqs
```

AppSync will require an AWS IAM role that allows the service to perform the desired action. For example, SQS would require `sqs:SendMessage` permission and Step Functions `states:StartExecution`.

After creating the data source, we can implement the resolvers that allow interaction with the AWS service. Let's step through a few example integrations.

## Amazon SQS

For each service reviewed in this post, we will start with a sample GraphQL schema that defines the interactions and data associated with the resolver.

We will begin with Amazon Simple Queue Service (SQS), one of the earliest AWS services and one of my favorites for building reliable, decoupled workloads. Here, we send a messsage via a queue, though other operations are available as well. For example, we could list all messages on a particular queue.

``` graphql
input SendMessageInput {
  email: String!
  message: String!
}

type Message {
  id: ID!
  email: String!
  message: String!
}

type Mutation {
  sendMessage(input: SendMessageInput!): Message
}
```

AppSync can be used to deliver a message to an SQS Queue using the following resolver. While SQS also [supports a `POST` API](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-making-api-requests.html) as well, I have implemented here using a `GET`. Note that the endpoint resource path includes the AWS Account ID and name of the queue. Infrastructure as code approaches, such as CloudFormation, would make wiring this information easy.

**`sendMessage` - Request Mapping**

``` json
{
  "version": "2018-05-29",
  "method": "GET",
  "resourcePath": "/<ACCOUNT_ID>/<QUEUE_NAME>",
  "params": {
    "query": {
      "Action": "SendMessage",
      "Version": "2012-11-05",
      "MessageBody": "$util.urlEncode($util.toJson($ctx.args.input))"
    }
  }
}
```

The response from SQS is encoded in XML and can be easily transformed to a JSON payload using the `$util` functions provided by AppSync.

**`sendMessage` - Response Mapping**

``` json
#set( $result = $utils.xml.toMap($ctx.result.body) )
{
  "id": "$result.SendMessageResponse.SendMessageResult.MessageId",
  "email": "$ctx.args.input.email",
  "message": "$ctx.args.input.message",
}
```

## AWS Secrets Manager

AWS Secrets Manager allows customers to protect sensitive information such as API keys. In a future blog post (UPDATE: [blog post](https://blog.iamjkahn.com/2020/01/securely-storing-api-secrets-for-aws-appsync-http-resolvers.html)), I will share how I incorporated Secrets Manager in an [AWS AppSync Pipeline Resolver](https://docs.aws.amazon.com/appsync/latest/devguide/pipeline-resolvers.html) to first retrieve a secret API key before querying a third-party web service for data, all via AppSync resolvers. For now, we can simply retrieve and return a secret from Secrets Manager.

``` graphql
type Query {
  getSecret(SecretName: String!): String
}
```

**`getSecret` - Request Mapping**

``` json
{
  "version": "2018-05-29",
  "method": "POST",
  "resourcePath": "/",
  "params": {
    "headers": {
      "content-type": "application/x-amz-json-1.1",
      "x-amz-target": "secretsmanager.GetSecretValue"
    },
    "body": {
      "SecretId": "$ctx.args.SecretName"
    }
  }
}
```

**`getSecret` - Response Mapping**

``` json
#set( $result = $util.parseJson($ctx.result.body) )
$util.toJson($result.SecretString)
```

## AWS Step Functions

Although I discussed Step Functions in the earlier mentioned blog, I will include starting a Step Functions state machine here for completeness and to document handling more complex input.

``` graphql
type Mutation {
  submitOrder(input: OrderInput!): Order
}
```

**`submitOrder` - Request Mapping**

```json
$util.qr($ctx.stash.put("orderId", $util.autoId()))
{
  "version": "2018-05-29",
  "method": "POST",
  "resourcePath": "/",
  "params": {
    "headers": {
      "content-type": "application/x-amz-json-1.0",
      "x-amz-target":"AWSStepFunctions.StartExecution"
    },
    "body": {
      "stateMachineArn": "<STATE_MACHINE_ARN>",
      "input": "$util.escapeJavaScript($util.toJson($input))"
    }
  }
}
```

**`sumitOrder` - Response Mapping**

```json
{
  "id": "${ctx.stash.orderId}"
}
```

## Amazon S3

Inspired by a customer, we can also read and write objects from Amazon S3 via AppSync. Like the other examples included here, we rely on an HTTP Data Source configured with AWS IAM authorization. Unlike other service endpoints, S3 requires us to include the name of the target bucket in the endpoint. In CloudFormation, configuration of an S3 Data Source is as follows:

``` yaml
StorageDataSource:
  Type: AWS::AppSync::DataSource
  Properties:
    ApiId: !GetAtt MyApi.ApiId
    Name: S3DataSource
    Description: Amazon S3 Bucket
    Type: HTTP
    ServiceRoleArn: !GetAtt AppSyncServiceRole.Arn
    HttpConfig:
      Endpoint: !Sub "https://${MyBucket}.s3.${AWS::Region}.amazonaws.com"
      AuthorizationConfig:
        AuthorizationType: AWS_IAM
        AwsIamConfig:
          SigningRegion: !Sub "${AWS::Region}"
          SigningServiceName: s3
```

For this use case, the customer asked to read and write JSON payloads to S3 and automatically generate a unique identifier on write. The GraphQL schema for these operations is as follows:

``` graphql
type Mutation {
  putPayload(input: Payload): Response
}
input Payload {
  payload: AWSJSON!
}
type Query {
  getPayload(payloadId: ID!): Response!
}
type Response {
  payloadId: String!
  payload: AWSJSON
}
```

Remember, each data source works with a single S3 Bucket. If your application interacts with multiple S3 Buckets, create a data source for each.

**`putPayload` - Request Mapping**

To write an object to S3, we use the [`putObject` REST API](https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutObject.html). We assume the AppSync service role has appropriate permissions to perform this operation on the S3 bucket. Note that other content types may require changes to the body of the request or content type header.

``` json
## generate a unique identifier for the payload
$util.qr($ctx.stash.put("payloadId", $util.autoId()))
{
  "version": "2018-05-29",
  ## put the object in the bucket
  "method": "PUT",
  ## specify the name of the object in the resource path
  "resourcePath": "/${ctx.stash.payloadId}.json",
  "params": {
    "headers": {
      ## specify the content type of the object, e.g. JSON
      "Content-Type" : "application/json"
    },
    "body": $util.toJson($ctx.args.input.payload)
  }
}
```

**`putPayload` - Response Mapping**

The response to putting the payload in S3 is the unique identifier for that object in S3:

``` json
{
  "payloadId": "${ctx.stash.payloadId}"
}
```

**`getPayload` - Request Mapping**

To retrieve an object from S3, we can use the ['getObject` REST API](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html). Again, the AppSync service role referenced for this data source will need appropriate permissions.

``` json
{
  "version": "2018-05-29",
  "method": "GET",
  ## specify name of the object to retrieve
  "resourcePath": "/${ctx.args.payloadId}.json"
}
```

**`getPayload` - Response Mapping**

For the response, we include both the payload JSON (string encoded) as well as the payload identifier. As noted earlier, this can be modified to support different use cases.

``` json
{
  "payloadId": "${ctx.args.payloadId}",
  "payload": $ctx.result.body
}
```

## AWS EventBridge

Thanks to [Ed Lima for posting a solution on integrating AppSync with AWS EventBridge](https://github.com/awsed/AppSync2EventBridge). A typical operation for interacting with EventBridge is to put an event on an event bus, this is a mutation.

``` graphql
type Mutation {
  putEvent(event: String!): Event
}
```

**`putEvent` - Request Mapping**

Like other services documented here, the `x-amz-target` header is important in specifying the intended action. The body also must be formatted as the REST API for the service expects.

``` json
{
  "version": "2018-05-29",
  "method": "POST",
  "resourcePath": "/",
  "params": {
    "headers": {
      "content-type": "application/x-amz-json-1.1",
      "x-amz-target":"AWSEvents.PutEvents"
    },
    "body": {
      "Entries":[ 
        {
          "Source":"appsync",
          "EventBusName": "default",
          "Detail":"{ \\\"event\\\": \\\"$ctx.arguments.event\\\"}",
          "DetailType":"Event Bridge via GraphQL"
          }
      ]
    }
  }
}
```

**`putEvent` - Response Mapping**

Ed provides a nice response mapping that will raise an error if EventBridge responds with an error message. See service documentation for details on how each AWS service handles errors.

``` json
#if($ctx.error)
  $util.error($ctx.error.message, $ctx.error.type)
#end
## if the response status code is not 200, then return an error. Else return the body **
#if($ctx.result.statusCode == 200)
  ## If response is 200, return the body.
  {
    "result": "$util.parseJson($ctx.result.body)"
  }
#else
  ## If response is not 200, append the response to error block.
  $utils.appendError($ctx.result.body, $ctx.result.statusCode)
#end
```

Please let me know if there are other integrations you would be interested in seeing.


_Photo by Patrick Perkins on Unsplash_