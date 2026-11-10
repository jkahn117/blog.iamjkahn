---
layout:	post
title:	"Building AWS AppSync Pipeline Resolvers with AWS CloudFormation"
date:	2019-03-11
background: '/assets/images/1*-FdFpSBYzsa6YyfDakasQA.jpeg'
---

Among the many updates from [AWS AppSync](https://aws.amazon.com/appsync/) over the past few months, the addition of [Pipeline Resolvers](https://docs.aws.amazon.com/appsync/latest/devguide/pipeline-resolvers.html) was particularly exciting. Pipeline Resolvers allow us to build a resolver from a series of reusable functions, each of which can query a separate data source. This approach can be useful in performing an authorization check or resolving a batch request across data sources.

For example, I recently built a Pipeline Resolver composed of two functions:

1. Retrieves a list of recent items, each identified by a unique ID, from [Amazon ElastiCache](https://aws.amazon.com/elasticache/) via a AWS Lambda data source.
2. Retrieves each of the items from an Amazon DynamoDB data source using BatchGetItem.
Using a Pipeline Resolver allowed for separation of functionality as well as composition via AppSync.

Instead of reviewing how I built the resolver, in this post, I will share how I *built it using *[*AWS CloudFormation*](https://aws.amazon.com/cloudformation/). If you are interested in an overview of Pipeline Resolvers or an example implementation, see the Resources section below.

### Building a Pipeline Resolver with CloudFormation

When building a Pipeline Resolver in CloudFormation, we specify a resolver as well as the functions that compose that resolver. The resolver and its composite functions will contain request and response mapping templates, but only the functions will have a data source. To demonstrate, we will implement theListPosts resolver found in Nader Dabit’s [Intro to AWS AppSync Pipeline Functions](https://medium.com/@dabit3/intro-to-aws-appsync-pipeline-functions-3df87ceddac1):

First, we’ll implement the resolver. We’ll assume the AppSync API and other applicable resources have already been created:

```
ListPostsQueryResolver:  
 Type: AWS::AppSync::Resolver  
 DependsOn: MySchema  
 Properties:
   ApiId: !GetAtt MyApi.ApiId  
   TypeName: Query  
   FieldName: listPosts  
   # configure this resolver as a pipeline  
   Kind: PIPELINE  
   PipelineConfig:  
     Functions:  
       - !GetAtt IsUserCallerFunction.FunctionId  
       - !GetAtt GetPostsFunction.FunctionId  
   # see Nader's article for details on these templates  
   RequestMappingTemplate: |  
     $util.qr($ctx.stash.put("callerId", $ctx.identity.sub))  
     $util.qr($ctx.stash.put("userId", $ctx.args.userId))  
     {}  
   ResponseMappingTemplate: |  
     $util.toJson($ctx.result)
```

Next, we will implement the first of two pipeline functions:

```
IsUserCallerFunction:  
 Type: AWS::AppSync::FunctionConfiguration  
 Properties:  
   ApiId: !GetAtt MyApi.ApiId  
   Name: is_user_caller  
   Description: Checks to see if the user is also the caller  
   DataSourceName: !GetAtt UsersDynamoDBDataSource.Name  
   FunctionVersion: "2018-05-29"  
   RequestMappingTemplate: |  
     #if($ctx.stash.callerId == $ctx.stash.userId)  
       #return($ctx.prev.result)  
     #else  
     {  
       "operation": "GetItem",  
       "key": {  
         "id": $util.dynamodb.toDynamoDBJson($ctx.stash.callerId),  
       }  
     }  
     #end  
   ResponseMappingTemplate: |  
     #if($ctx.result.level != "admin")  
       $util.error("User is not authorized to make this query")  
     #else  
     $util.toJson($ctx.result)  
     #end
```
     
Finally, we’ll add the second function:

```
GetPostsFunction:  
 Type: AWS::AppSync::FunctionConfiguration  
 Properties:  
   ApiId: !GetAtt MyApi.ApiId  
   Name: get_posts  
   Description: Scan table and retrieve items created by user  
   DataSourceName: !GetAtt PostsDynamoDBDataSource.Name  
   FunctionVersion: "2018-05-29"  
   RequestMappingTemplate: |  
     {  
       "operation" : "Scan",  
       "filter" : {  
         "expression" : "#userId = :userId",  
         "expressionNames" : {  
           "#userId" : "userId"  
         },  
         "expressionValues" : {  
           ":userId" : $util.dynamodb.toDynamoDBJson($ctx.stash.userId)  
         }  
       },  
       "nextToken": $util.toJson($util.defaultIfNullOrBlank($ctx.args.nextToken, null))  
     }  
   ResponseMappingTemplate: |  
     #if($ctx.error)  
       $util.error($ctx.error.message, $ctx.error.type)  
     #end  
     {  
       "items": $util.toJson($ctx.result.items),  
       "nextToken": $util.toJson($util.defaultIfNullOrBlank($context.result.nextToken, null))  
     }
```

After creating the CloudFormation stack, we can test the resolver via the AppSync Console. As usual, CloudFormation brings the value of reuse, portability, configurability.

Thanks for reading and please feel free to leave a comment with any questions.

### Resources

* [Intro to AWS AppSync Pipeline Functions](https://medium.com/@dabit3/intro-to-aws-appsync-pipeline-functions-3df87ceddac1)
* [Tutorial: Pipeline Resolvers](https://docs.aws.amazon.com/appsync/latest/devguide/tutorial-pipeline-resolvers.html)
* [AWS AppSync Resource Types Reference](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/cfn-reference-appsync.html)
  