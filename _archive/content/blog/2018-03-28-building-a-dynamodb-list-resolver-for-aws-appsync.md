---
layout:	post
title:	"Building a DynamoDB List Resolver for AWS AppSync"
date:	2018-03-28
background: '/assets/images/1*pCU6g7anwbtwYl1gKL-yGQ.jpeg'
---
  
Building native and web apps with [AWS AppSync](https://aws.amazon.com/appsync/) allows you to quickly add support for real-time updates and offline data synchronization. Recently, I’ve been working on a web app that leverages AppSync with data stored in [Amazon DynamoDB](https://aws.amazon.com/dynamodb/). In building the app, it took some time to understand how to properly craft the GraphQL resolver to update List data in my table. Here’s how I solved it:

For the purpose of this article, our application will manage shopping lists. Each list has a unique identifier and a list of items to purchase at the store. The GraphQL schema looks something like this:

```
type ShoppingList {  
  ListId: ID!  
  Name: String!  
  Items: [String]  
}

type Mutation {  
  createList(Name: String!)  
  updateList(ListId: ID!, Items: [String]!)  
}

type Query {  
  allLists: [ShoppingList]  
  getList(ListId: ID!): ShoppingList  
}

schema {  
  query: Query  
  mutation: Mutation  
}
```

The `ShoppingList` data will be stored in a DynamoDB table, using ListId as the Hash Key. Note in the schema above that Items is an array of strings, e.g. “flour”, “chocolate”.

AppSync provides a set of resolver templates that provide a jump start for writing common queries and mutations. These templates include good examples of the allLists and getList queries noted above, so I will not discuss those here. Instead, let’s dig deeper into the mutation resolvers.

When we create a shopping list, the user provides a name (passed from the client) and our resolver will utilize an AppSync function to generate a unique identifier:

```
{  
  "version": "2017-02-28",  
  "operation": "PutItem",  
  "key": {  
    "ListId": { "S": "${util.autoId()}" }  
  },  
  "attributeValues": {  
    "Name": { "S": "${context.arguments.Name}" }  
  }  
}
```

While this is fairly straightforward, how to deal with updating the shopping list was more complex. The resolver needs to (1) update the Items attribute appropriately (DynamoDB List) and (2) not overwrite the Name attribute as we only pass the ID and Items attributes to the updateList mutation.

The final updateList resolver looks like this:

```
{  
  "version": "2017-02-28",  
  "operation": "UpdateItem",  
  "key": {  
    "ListId": { "S": "${util.context.arguments.ListId}" }  
  },  
  "update": {  
    "expression": "SET List = :List",  
    "expressionValues": {  
      #set( $List = $context.arguments.List )  
      ":List": $util.dynamodb.toListJson($List)  
    }  
  }  
}
```

For further details on building AppSync DynamoDB resolvers, check out: [Resolver Mapping Template Reference for DynamoDB](https://docs.aws.amazon.com/appsync/latest/devguide/resolver-mapping-template-reference-dynamodb.html)

AppSync also provides a number of helpful utility functions for interacting with arguments and various data sources: [Resolver Mapping Template Context Reference](https://docs.aws.amazon.com/appsync/latest/devguide/resolver-context-reference.html#dynamodb-helpers-in-util-dynamodb). In addition to prepping data to be passed to various backend, AppSync also provides useful functions for generating timestamps, unique identifiers, and parsing data.

  