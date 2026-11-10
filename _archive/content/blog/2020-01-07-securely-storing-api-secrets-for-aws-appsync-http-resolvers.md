---
layout: post
title: Securely Storing API Secrets for AWS AppSync HTTP Data Sources
date: 2020-01-07 19:29 -0600
background: '/assets/images/dave-HT_tLT8mGLA-unsplash.jpg'
summary: This post discusses an approach to securely storing and using API Keys for HTTP Data Sources by leveraging AWS AppSync Pipeline Resolvers.
---

At AWS re:Invent 2019, I presented a [Chalk Talk on alternative data sources for AWS AppSync](https://d1.awsstatic.com/events/reinvent/2019/REPEAT_2_AWS_AppSync_does_that_Support_for_alternative_data_sources_MOB318-R2.pdf). During one repeat of the session, an attendee asked about storing API Keys for web services. The attendee specifically referenced [Algolia](https://www.algolia.com/), though numerous services use API Keys to identify the number and frequency of calls from a particular user.

To build an AWS AppSync [HTTP Resolver](https://docs.aws.amazon.com/appsync/latest/devguide/tutorial-http-resolvers.html) to "GraphQL-ify" a service that uses API Keys, it would be easy to hardcode the key in the request resolver. Resolvers are not exposed to the end user of the API, but they are committed to source control, which could potentially leak API Keys. An application may also use different API Keys in different environments, for example to allow for higher throughput in production.

This post discusses an approach to securely storing and using API Keys by leveraging [Pipeline Resolvers](https://docs.aws.amazon.com/appsync/latest/devguide/pipeline-resolvers.html). API Keys are stored in [AWS Secrets Manager](https://aws.amazon.com/secrets-manager/) and injected into the request to the downstream API.

To demonstrate, I extended the [GraphQL Weather API built by Adrian Hall](https://adrianhall.github.io/cloud/2018/07/20/build-a-graphql-weather-api-with-openweathermap-and-aws-appsync/). Adrian built an API using [OpenWeatherMap](https://openweathermap.org/), which uses API keys, as an HTTP data source. Here, I've used the same GraphQL schema and resolvers for interacting with OpenWeatherMap.

## Building the Pipeline Resolver

The Pipeline Resolver for my weather API is composed of two stages: (1) retrieve secret value from Secrets Manager and (2) query OpenWeatherMap. We can define the resolver using [AWS CloudFormation](https://aws.amazon.com/cloudformation/) as follows:

``` yaml
WeatherByCityQueryResolver:
  Type: AWS::AppSync::Resolver
  Properties:
    ApiId: !GetAtt WeatherApi.ApiId
    TypeName: Query
    FieldName: weatherByCity
    Kind: PIPELINE
    PipelineConfig:
      Functions:
        - !GetAtt GetSecretValue.FunctionId   # (1) get secret value
        - !GetAtt GetWeatherByCity.FunctionId # (2) query OpenWeatherApi
    RequestMappingTemplate: |
      $util.qr($ctx.stash.put("SecretId", "/sample/openweathermap/apikey"))
      {}
    ResponseMappingTemplate: |
      $util.toJson($ctx.result)
```

We'll take a deeper look at the two functions that compose the resolver shortly, but take note of the request mapping template. Here, we use the AppSync `stash` (a map that lives through a single resolver execution) to store the unique name of the secret in Secrets Manager. The secret name is hardcoded in the request mapping template, but by elevating that name to the top of the pipeline, our `GetSecretValue` function is more flexible. We could pass the name of any arbitrary secret (presuming AppSync has permission to access it) and retrieve the secret value with the one function.

For this example, the OpenWeatherMap API Key is stored in Secrets Manager with the name `/sample/openweathermap/apikey`. To implement this solution on your own, you will need to sign-up for the OpenWeatherMap service.

### Getting the Secret Value

In an earlier [blog post](https://blog.iamjkahn.com/2019/12/invoking-even-more-aws-services-directly-from-aws-appsync.html), I described how to invoke various AWS services directly from AWS AppSync, including Secrets Manager. The `GetSecretValue` function is almost identical to the resolver described in that post, though here the caller passes the name of the secret in the `stash`.

In CloudFormation, the function is configured as follows:

``` yaml
GetSecretValue:
  Type: AWS::AppSync::FunctionConfiguration
  Properties:
    ApiId: !GetAtt WeatherApi.ApiId
    Name: GetSecretValue
    Description: >
      Retrieves the value of the specified secrets from
      AWS Secrets Manager.
    DataSourceName: !GetAtt SecretsManagerDataSource.Name
    FunctionVersion: "2018-05-29"
    RequestMappingTemplate: |
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
            "SecretId": "$ctx.stash.SecretId"
          }
        }
      }
    ResponseMappingTemplate: |
      #set( $result = $util.parseJson($ctx.result.body) )
      $util.toJson($result.SecretString)
```

As noted in my previous post as well, it is extremely important to configure the HTTP Data Source to sign requests that invoke AWS Services. We also need to provide an AppSync service role with permissions to get the secret (`secretsmanager:GetSecretValue`). Again, in CloudFormation:

``` yaml
SecretsManagerDataSource:
  Type: AWS::AppSync::DataSource
  Properties:
    ApiId: !GetAtt WeatherApi.ApiId
    Name: SecretsManager
    Description: AWS Secrets Manager
    Type: HTTP
    ServiceRoleArn: !GetAtt AppSyncServiceRole.Arn
    HttpConfig:
      Endpoint: !Sub "https://secretsmanager.${AWS::Region}.amazonaws.com/"
      AuthorizationConfig:
        AuthorizationType: AWS_IAM
        AwsIamConfig:
          SigningRegion: !Sub "${AWS::Region}"
          SigningServiceName: secretsmanager
```

### Querying OpenWeatherMap

Armed with the secret API Key, we can call the OpenWeatherAPI. Both the Data Source and response mapping template are identical to Adrian's article; however, we need to slightly modify the request mapping to use the API key retrieved in the previous function. The request mapping template is as follows (note the use of `$ctx.prev.result`):

``` json
{
  "version": "2018-05-29",
  "method": "GET",
  "resourcePath": "/data/2.5/weather",
  "params":{
    "query": {
      "q": "$context.args.city",
      "appid": "$ctx.prev.result"
    },
    "headers": {
      "Content-Type": "application/json"
    }
  }
}
```

## Closing

By using a Pipeline Resolver that directly invokes Secrets Manager, we have alleviated the need to hardcode a secret and secured it using IAM permissions. We also did so without writing a line of code ... well, just a few Velocity Templates, which are very easy to maintain. Our new API allows us to query for the current weather in Nashville (or many other cities):

``` graphql
query Weather {
  weatherByCity(city: "Nashville") {
    timestamp
    temperature
    location
  }
}
```

And the result:

``` json
{
  "data": {
    "weatherByCity": {
      "timestamp": "2020-01-07T22:55:43Z",
      "temperature": 48.18,
      "location": "Nashville, US"
    }
  }
}
```

While I'm not sure if the re:Invent attendee who inspired this post will find it, I hope you have found it useful. Similar approaches can also be used to build more complex data retrievals as well, without the need to write code.

_Photo by [Dave](https://unsplash.com/@johnwestrock?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText) on [Unsplash](https://unsplash.com/s/photos/weather?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText)_
