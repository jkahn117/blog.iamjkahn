---
layout:	post
title:	"Building a Unified Backend with AWS AppSync"
date:	2018-06-19
background: '/assets/images/1*uHai2RyMNueGeZ0sdcWeTg.png'
---
  
Since its announcement at re:Invent 2017, [AWS AppSync](https://aws.amazon.com/appsync/) has caused me to rethink my preferred approach to building mobile backends. While REST is well-understood, I often found it less flexible than I would like, particularly when designing consistent and efficient communication between client and server. Add the need to manage offline user data and conflicts and I would often find myself in a hot mess.

AppSync is a managed [GraphQL](https://graphql.org/) service from AWS that helps tackle these challenges. In addition to addressing offline data and conflict resolution, AppSync also introduces flexibility via GraphQL and the capability to integrate with a variety of data sources.

In this post and accompanying sample code, my goal was to build a fully-functional AWS AppSync-driven backend for a conference management app (“Session Manager”). The app will deliver end users a set of features that allow booking sessions, building a personalized schedule, and searching for sessions. As part of that work, I also wanted to:

1. Integrate with multiple data sources supported by AppSync
2. Manage all resources via [AWS CloudFormation](https://aws.amazon.com/cloudformation/)
3. Leverage [Amazon Cognito](https://aws.amazon.com/cognito/) to secure resources and scope mutations to appropriate roles

[**jkahn117/aws-appsync-session-manager**  
*aws-appsync-session-manager - AWS AppSync Session Manager*github.com](https://github.com/jkahn117/aws-appsync-session-manager "https://github.com/jkahn117/aws-appsync-session-manager")[](https://github.com/jkahn117/aws-appsync-session-manager)

### Session Manager Schema

To get started, let’s define the GraphQL schema for the Session Manager API:

 gist 9b8dc733fa6751617473ba39e3c8fc60 

Our schema is primarily concerned with the `Session` type as the API mostly retrieves and manipulates session data, both public and user-specific. Of note is the use of `@aws_auth(cognito_groups: ["Editors"])`, this will limit access of the associated mutations to users in the Editors group in the application’s Cognito User Pool.

### Data Sources

AppSync currently supports three data sources: [Amazon DynamoDB](https://aws.amazon.com/dynamodb/), [Amazon Elasticsearch Service](https://aws.amazon.com/elasticsearch-service/), and [AWS Lambda](https://aws.amazon.com/lambda/) (though Lambda can provide access to a wide variety of other options, such as RDS or ElastiCache). Our Session Manager API currently makes use of DynamoDB (two tables: user schedules and sessions) and Elasticsearch. The [CloudFormation template](https://github.com/jkahn117/aws-appsync-session-manager/blob/master/template.yaml) included in the sample project defines these resources and associated AppSync Data Source configuration. For example, we can define the DynamoDB sessions table as a Data Source as follows:

 gist c566a8b80eb95bff8a097936942261f2 

Additionally, AppSync offers a data source of type NONE that can be used with [local resolvers](https://docs.aws.amazon.com/appsync/latest/devguide/tutorial-local-resolvers.html) to simply forward data to the response mapping template. We’ll make use of a local resolver shortly.

### Resolvers

Resolvers are where you will find some of the magic of AWS AppSync. Resolvers allow you to attach data (types or fields), queries, and mutations to configured data sources. Each resolver is compose of (1) a data source, (2) a request mapping template, and (3) a response mapping template. A request template defines how incoming or contextual data is passed to the data source. In a single request template, for example, you can include a pagination token (request parameter) and Cognito identifier (identity context). The response template maps the result from the data source to the response to be sent to the client.

AppSync resolvers are built using the Apache Velocity Template Language (VTL). This means that a resolver template can include logic to transform data, iterate over collections, filter results, and more. AppSync also provides a broad array of [utility functions](https://docs.aws.amazon.com/appsync/latest/devguide/resolver-context-reference.html) that can be helpful in validation, transforming data, and dealing with dates.

Each AppSync Data Source communicates through operations unique to the data source. For example, communicating with a DynamoDB data source is similar to interacting with DynamoDB via an AWS SDK.

Per my earlier stated goals, I have defined all Session Manager resources using CloudFormation. For example, the DynamoDB resolver for the `allSessions` query is as follows:

 gist 32a84b3dc2cf80c7b39deefc9527609d 

If you are familiar with DynamoDB, the request mapping should look relatively familiar. We are performing a DynamoDB `scan` and paginating the result. The response mapping filters and transforms the result. Note that `$util` are the useful AppSync utility functions mentioned earlier.

Like a DynamoDB resolver, an Elasticsearch resolver feels very similar to interfacing with Elasticsearch itself. For example, our search resolver:

 gist 9eef086d87588eca7bcd72dcbf1496ba 

To review the remaining resolvers associated with the Session Manager API, check out the complete [CloudFormation template](https://github.com/jkahn117/aws-appsync-session-manager/blob/master/template.yaml). Although slightly slower to roll out updates, I found managing resolvers in CloudFormation useful as I was able to peruse the full set in a single file.

### A More Complex Query Resolver

One of the most important requirements of Session Manager is that is allows users to register for sessions. The `userSchedule` query allows the currently logged in user to retrieve his list of registered sessions. The resolver for the `userSchedule` query is slightly different than our other resolvers in that (1) both the query and the `UserSchedule` type cooperate to build the response, (2) `UserSchedule` fields are resolved independently, and (3) the `Sessions` field is filled using a multi-step batch resolver.

![UserSchedule resolvers from AWS Console](/assets/images/1*I-_hYiOuVSRwBIYFB6mnfA.png)

When resolving the `userSchedule` query, AppSync will first execute the resolver attached to the query:

 gist 8723aa554631ba143226c126fa7e2be3 

Next, AppSync will resolve the `UserSchedule` return type associated with the query. As noted (and shown) above, the fields in the `UserSchedule` type are resolved separately. The User field uses our aforementioned local resolver to pass through data available in the identity context (from Cognito):

 gist 90dc081211125cc28e3b2c3bcde619a1 

The `Sessions` attribute meanwhile is a more complex, DynamoDB Batch resolver. In this case, the resolver collects the unique identifiers of the sessions the logged in user has registered for to build a `BatchGetItem` query. The registered session list was captured as part of the `userSchedule` query resolver. We use VTL to build a list of `SessionId` values and then perform the query, retrieving and responding with a collection of `Sessions`. Note that our CloudFormation template for both the request and response mappings make use of string substitution to insert the name of the DynamoDB table resource (`${DDBSessionsTable}`):

 gist 7a83c2d9bc1856c9313ea984951f3102 

Revisiting, we first retrieve a listing of the the logged in user’s registered sessions (from the DynamoDB user schedule table) and then use DynamoDB’s batch query mechanism to retrieve the details about those registered sessions. That result is paired with data available in AppSync’s identity context to return the complete `UserSchedule` result. This example demonstrates how to build a more complex resolution workflow, needing only a few lines of simple VTL code and an understanding of our data sources.

### Deploying the Session Manager API

As part of this project, I have included a [Makefile](https://github.com/jkahn117/aws-appsync-session-manager/blob/master/template.yaml) that makes it easy to deploy the Session Manager API for your own testing. The repository [README](https://github.com/jkahn117/aws-appsync-session-manager/blob/master/README.md) contains detailed instructions as well as suggestions for testing. AWS AppSync is currently available in the following AWS Regions: us-east-1 (N. Virginia), us-east-2 (Ohio), us-west-2 (Oregon), eu-west-1 (Ireland), ap-northeast-1 (Tokyo), and ap-southeast-2 (Sydney).

I hope you have found this article useful and enjoy working with AWS AppSync as much as I have.

[**jkahn117/aws-appsync-session-manager**  
*aws-appsync-session-manager - AWS AppSync Session Manager*github.com](https://github.com/jkahn117/aws-appsync-session-manager "https://github.com/jkahn117/aws-appsync-session-manager")[](https://github.com/jkahn117/aws-appsync-session-manager)  