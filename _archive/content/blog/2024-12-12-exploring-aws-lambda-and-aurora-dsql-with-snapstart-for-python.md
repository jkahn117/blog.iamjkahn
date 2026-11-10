---
date: "2024-12-12T06:00:00.000Z"
title: "Exploring AWS Lambda and Amazon Aurora DSQL with SnapStart for Python"
author: "Josh"
summary: "A hands-on walkthrough of building an AWS Lambda function with Amazon Aurora DSQL and SnapStart for Python, announced at AWS re:Invent 2024."
---

Just back from AWS re:Invent and excited to dive into some of the newly announced updates! In this article, I'll walk you through building an [AWS Lambda](https://aws.amazon.com/lambda/) function that manages data in the *public preview* of [Amazon Aurora DSQL](https://aws.amazon.com/rds/aurora/dsql). I’ll also show you how to enable the new [SnapStart for Python](https://aws.amazon.com/blogs/aws/aws-lambda-snapstart-for-python-and-net-functions-is-now-generally-available/).

When building serverless applications, we often reach for NoSQL solutions like [Amazon DynamoDB](https://aws.amazon.com/dynamodb/). However, many developers are more familiar with the concepts and tools available in relational databases. There’s always a trade-off to consider: NoSQL databases offer schema flexibility, while relational databases require you to define your access patterns upfront.

So why do we often turn to NoSQL with serverless? Mainly because it’s a great fit. NoSQL databases don’t require setting up VPCs, security groups, or networks. Plus, we can leverage IAM to control access directly. Relational databases, on the other hand, traditionally come with the overhead of configuring VPCs and the potential issues that come with keeping connections open.

This is where Aurora DSQL comes in. It’s designed to bring the benefits of serverless to relational databases—offering virtually unlimited scalability and high availability. If your use case requires it, you can even scale across multiple regions with its active-active architecture.

Aurora DSQL is Postgres-compatible (though there are some limitations in the public preview at the time of writing), which means we can use existing Postgres libraries to interact with the database.

In this article, I’ll build a classic todo manager using Lambda and Aurora DSQL. We’ll also make use of [Powertools for AWS Lambda](https://docs.powertools.aws.dev/lambda/python/latest/) and enable SnapStart for a performance boost.

> Amazon Aurora DSQL is currently in public preview and subject to change. As with all serverless offerings, I would expect the service to grow and improve over the coming months and years.

## Creating an Aurora DSQL Cluster

As of writing, [Amazon CloudFormation](https://aws.amazon.com/cloudformation/) and [AWS CDK](https://aws.amazon.com/cdk/) don’t yet support Aurora DSQL. So, for now, we’ll create the cluster the old-fashioned way—through the AWS Console.

...

The DSQL cluster takes just a few minutes to launch. Once it’s ready, you’ll need the ARN and endpoint for the cluster — and that’s pretty much it!

## Infrastructure Definition

Next, we’ll define the infrastructure for our Lambda function using [AWS SAM](https://aws.amazon.com/serverless/sam/). SAM is an extension of CloudFormation that simplifies the process of building serverless applications. If you prefer, feel free to use [AWS CDK](https://aws.amazon.com/cdk/), Terraform, or whatever infrastructure-as-code tool you’re most comfortable with.

I like to use the [`Globals` section](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-specification-template-anatomy-globals.html) in the SAM template to reduce repetition. In this section, we can specify the runtime (Python 3.12 in our case), set a reasonable timeout, and enable [AWS X-Ray](https://aws.amazon.com/xray/).


``` yaml
Globals:
  Function:
    Timeout: 5
    MemorySize: 512
    Runtime: python3.12
    Tracing: Active
    LoggingConfig:
      LogFormat: JSON # configure log outputs in JSON format
  Api:
    TracingEnabled: true
```

We can define the Lambda function configuration using the `AWS::Serverless::Function` type:

``` yaml
Resources:
  ManageTodosFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: app.handler
      CodeUri: todos
      Description: Manage todos in DSQL database
```

For simplicity, we'll build a "Lambdalith" architecture with a single function responsible for all CRUD operations. There are trade-offs to this approach but fine for our purposes. Powertools for AWS Lambda (Python) provides a nice [REST API event handler](https://docs.powertools.aws.dev/lambda/python/latest/core/event_handler/api_gateway/) with basic routing, JSON encoding, and all that we'll need.

``` yaml
      # continued from above
      Events:
        GetAllTodos:
          Type: Api
          Properties:
            Path: /todos
            Methods: GET
        CreateTodo:
          Type: Api
          Properties:
            Path: /todos
            Methods: POST
```

We also need to include an enviornment variable that passes the endpoint for our DSQL cluster to the function. The endpoint is available in the AWS Console:

``` yaml
      # continued from above
      Environment:
        Variables:
          DSQL_ENDPOINT: xxxxxxx.dsql.us-east-1.on.aws
```

