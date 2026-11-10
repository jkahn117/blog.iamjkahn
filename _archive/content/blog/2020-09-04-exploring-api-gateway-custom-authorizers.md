---
layout: post
title: Exploring API Gateway Lambda Authorizers
date: 2020-09-08 11:24 -0500
summary: Learning in Public - exploring Amazon API Gateway Lambda Authorizers.
background: /assets/images/2020-09-08/scott-webb-TvFQWHJbDUU-unsplash.jpg
---

> More ["learning in public"](https://www.swyx.io/writing/learn-in-public/), capturing knowledge that will be useful for myself and others.

Over the past few weeks, I have spent quite a bit more time discussing [Amazon API Gateway](https://aws.amazon.com/api-gateway/) than I have in years. API Gateway currently offers three types of APIs: (1) REST, (2) HTTP, and (3) WebSocket. The REST and HTTP flavors have quite a bit of overlap, with the HTTP option being the new generation with a growing set of capabilities (while driving towards parity with REST).

In working with APIs, authorization is often a key concern. Unless you are building a truly public API, some level of authorization will be needed to control or limit access to the API. API Gateway offers several options that allow developers to separate authorization from business logic. While these differ dependent on the type of API, options include AWS IAM, [Amazon Cognito](https://aws.amazon.com/cognito/), OpenID Connect, and [AWS Lambda](https://aws.amazon.com/lambda/) authorization.

[Lambda authorizers](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-use-lambda-authorizer.html) are particularly interesting given the flexiblity they can provide. A Lambda Authorizer is a a Lambda function to which API Gateway will defer authorization decisions. The function receives one of two types of [inputs](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-lambda-authorizer-input.html) and responds with [output](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-lambda-authorizer-output.html) that includes a policy statement. As with other API Gateway features, separating authorization to its own function allows developers to focus on writing business logic.

While Lambda authorizers can be useful, consider the requirements for your service before implementing universally. Other authorizer types may be more appropriate. For example, consider AWS IAM authorization for service-to-service calls or Cognito User Pool authoizers when using Cognito. Lambda Authorizers will introduce latency when called as the authorization logic will need to be executed before returning a response. API Gateway attempts to mitigate this latency by optionally caching the response for up to one hour. When cached, API Gateway will not call the authorizer function on subsequent requests.

A Lambda authorizer can take one of two forms: (1) token-based and (2) request parameter-based. The type of authorizer dictates the event payload received by the Lambda function when invoked by API Gateway. The token-based authorizer (`TOKEN`) receives the caller's identity encoded as a bearer token (e.g. JWT or OAuth). A request parameter-based authorizer (`REQUEST`) receives the complete request, including headers, query string parameters, and API Gateway context information. Which you select is determined by the information required to make an authorization decision.

The response from a Lambda authorizer is composed primarily of a policy statement, not unlike an IAM policy. The policy describes the API resources the caller has access to. Resources are described using an ARN, meaning the authorization can have very fine-grained control over access to various APIs, stages, and/or resources. Wildcards are also available, but be careful so as not to provide inadvertent access. In addition to a policy, the authorizer response can also contain two fields, `context` and `usageIdentifierKey`. The `context` map can be used to pass additional information to the backend service. For example, `context` could contain details about the caller retrieved by the authorizer from a database lookup. If the API has a [usage plan](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-api-usage-plans.html), the `usageIdentifierKey` is an API key associated with that plan.

> Looking to go deeper? See Alex DeBrie's excellent article [The Complete Guide to Custom Authorizers with AWS Lambda and API Gateway](https://www.alexdebrie.com/posts/lambda-custom-authorizers/).

## Building a sample project

To better understand Lambda authorizers, doing as I often do, I built a sample project. The premise of the project is an affiliate API for a book seller.

On signing up, affiliates are provides with a means to authenticate with the book seller's identity provider (IdP). The authentication mechanism is out of scope and does not matter. When an affiliate successfully authenticates, he receives a [JWT](http://jwt.io) token encoded with identifying data, including a unique affiliate identifier (`orgId`). The affiliate uses the JWT token to access the API by passing it in the `Authorization` header as a bearer token.

> Complete sample code for this project can be found on [GitHub](https://github.com/jkahn117/aws-apigateway-custom-authorizer). Details on deploying the project yourself are included.

Let's take a deeper look at the Lamdba authorizer included in the project (`custom-authorizer/app.rb`). The authorizer is a typical Lambda function, wherein the `handler` method is called on invocation. For our use case, the function performs the following:

1. Decodes the JWT token received in the incoming event payload.
2. Checks if the token represents an administrator or an affiliate.
3. If an affiliate, look up the affiliate in a DynamoDB table using the `orgId` included in the token.
4. Builds an authorization policy applicable to the caller. If an affiliate, various affiliate attributes are included in the `context` map.
5. Returns the policy.

API Gateway then uses the returned policy to determine if the caller can access the called API method. The authorizer result is cached for five minutes.

The API methods available in the project are simplistic, primarily returning static data. The `add-affiliate` function performs the task of creating a new affiliate in the DynamoDB table, creating an API key, and associating that key with a usage plan. A real-world onboarding process is likely more complex, but this was sufficient for a sample.

> To enable sharing of common resources and libraries, this project makes use of [Lambda Layers](https://docs.aws.amazon.com/lambda/latest/dg/configuration-layers.html). For a deeper dive on Layers, specifically for Ruby, see my earlier [blog post](https://blog.iamjkahn.com/2019/02/exploring-aws-lambda-layers-and-ruby-support.html).

### Taking the API for a spin

We can use [Postman](https://www.postman.com), cURL, or a similar tool to exercise the sample project.

First, we will act as an administrator to configure our first affiliate. We will use the `POST /admin/add` endpoint to add a new affiliate, passing a request body such as:

``` json
{
  "name": "New Affiliate",
  "plan": "GOLD"
}
```

If we attempt the request now, it will fail (unauthorized) as we have not provided a JWT token in the `Authorization` header. Let's add a bearer token in the `Authorization` header that specifies the user is an administrator. Again, we're not concerned with the creation of this token here, only that it is issued by a valid source.

You can create your own token at [http://jwt.io](http://jwt.io) or use the one provided below (the payload should contain a field called `admin` which is set to a value of `true`):

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkkgYW0gQURNSU4iLCJpYXQiOjE1MTYyMzkwMjIsImFkbWluIjp0cnVlfQ.CiYHMxM1x1y7YGCn1NPpXP8JI006kPSxBVqD58Tgv3o
```

Attempting the request again with the header results in the new affiliate being created (the `orgId` value will vary):

``` json
{
  "message": "Affiliate New Affiliate created! An API Key has been provisioned.",
  "name": "New Affiliate",
  "plan": "GOLD",
  "orgId": "81c95682-104a-4567-9ff5-e0af794d392e"
}
```

We now have an affiliate account that can be used to access other API methods. Grab the `orgId` and create a new JWT token, removing the `admin` field and adding `orgId` with the value found in the previous step. Set the secret key to `my-secret-key` (shhhh, very secret) as shown in the image below.

![JWT Creation](/assets/images/2020-09-08/jwt_creation.png)

Return to Postman. We'll test an affiliate endpoint at `GET /products`. Be sure to also update the `Authorization` header with the new token (remove the old body payload).

The result will include an array of books, for example:

``` json
[
  {
      "id": 12,
      "title": "A book",
      "author": "By someone",
      "price": 8.99
  },
  ...
]
```

If you remove the token from the header, you will receive an `Unauthorized` response.

### A light load test

Before closing this post, I wanted to perform a light load test on the API to confirm usage plans were enforced when a Lambda authorizer provided the API Key. To do so, I used [Artillery](https://artillery.io/) with a simple scenario that simulates a small number of requests per second over one minute. This is not a true load test as much as a means to verify usage plan behavior. The usage plan limits are set artificially low.

The Artillery configuration is simple: call the two affiliate endpoints at a rate of 15 requests per second for one minute. Because the usage plan limits the client to five requests per second, I expected that roughly two-thirds of the requests would yield a 429 response (To Many Requests). The Artillery configuration is as follows (note the bearer token in the `Authorization` header, I precomputed it using [http://jwt.io](http://jwt.io) for the affiliate `OrgId` created earlier):

``` yaml
config:
  target: "https://abcdefg.execute-api.us-east-1.amazonaws.com/dev"
  phases:
    - duration: 60
      arrivalRate: 15
  defaults:
    headers:
      Authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6Ik5ldyBBZmZpbGlhdGUiLCJpYXQiOjE1MTYyMzkwMjIsIm9yZ0lkIjoiODFjOTU2ODItMTA0YS00NTY3LTlmZjUtZTBhZjc5NGQzOTJlIn0.-9tXCDNaAXpOGSlek7ENpMjuFXq1yzWfXmBJUgCtQ3Q"
scenarios:
  - flow:
    - get:
        url: "/products"
    - get:
        url: "/products/1"
```

The result showed that *all* requests succeeded, meaning that Usage Plan throttling *did not work*. After some digging, I came to realize that the [source of the API key](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-api-key-source.html) was inccorrect. By default, API Key Source is set to `HEADER`, but here we need to change to `AUTHORIZER`. While available in the API Gateway Console, SAM does not have a property to change this setting (though [CloudFormation does](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-apigateway-restapi.html#cfn-apigateway-restapi-apikeysourcetype)). Each deployment of the serverless application also resets the Key Source, meaning we either need to reset via the AWS CLI/Console after each deployment or use an OpenAPI specification.

For now, I've elected to manually configure the Key Source in the AWS Console:

![API Key Source Setting](/assets/images/2020-09-08/apigw_apikeysource_setting.png)

With Key Source setting fixed, we can run the "load test" again. Looking at just the first ten seconds, we see that roughly fifty requests are allowed, which aligns with the GOLD usage plan rate of five requests per second. Over the course of the next two ten-second periods, the client exhausts the 100 requests allowed by the usage plan per day (set purposefully low for this demonstration) and all subsequent requests are blocked.

``` bash
Started phase 0, duration: 60s @ 11:19:47(-0500) 2020-09-08
Report @ 11:19:57(-0500) 2020-09-08
Elapsed time: 10 seconds
  Scenarios launched:  149
  Scenarios completed: 147
  Requests completed:  295
  Mean response/sec: 30
  Response time (msec):
    min: 43.4
    max: 2862.7
    median: 92.6
    p95: 1849.3
    p99: 2197.4
  Codes:
    200: 56
    429: 239
```

## Conclusion

Building a more complex Lambda authorizer was useful in building my own understanding of how they can be used in a broader serverless application. For a deeper dive, I recommend Alex DeBrie's excellent article [The Complete Guide to Custom Authorizers with AWS Lambda and API Gateway](https://www.alexdebrie.com/posts/lambda-custom-authorizers/).

Complete sample code for this project can be found on [GitHub](https://github.com/jkahn117/aws-apigateway-custom-authorizer). 

*Photo by [Scott Webb](https://unsplash.com/@scottwebb) on [Unsplash](https://unsplash.com/)*
