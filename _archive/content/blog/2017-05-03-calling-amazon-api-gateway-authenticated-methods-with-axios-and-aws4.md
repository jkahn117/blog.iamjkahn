---
layout:	post
title:	"Calling Amazon API Gateway Authenticated Methods with axios and aws4"
date:	2017-05-03
---

[Amazon API Gateway](https://aws.amazon.com/api-gateway/) provides a convenient, easy-to-use service that allows developers to publish, monitor, and maintain APIs. It also provides a separation of concerns between your custom business logic and common needs such as caching, throttling, and authorization.

For a recent project, I needed to secure my APIs such that only authorized users could call them (e.g. administrator endpoints). API Gateway supports a number of approaches to [controlling access to your services](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-control-access-to-api.html). I also needed to provide authentication for a pool of users and opted to leverage AWS’s powerful IAM capability to control access via [Amazon Cognito](https://aws.amazon.com/cognito/). Cognito provides both user management as well as federated identity to provide secure access to AWS resources, including [calling an API Gateway method](https://docs.aws.amazon.com/apigateway/latest/developerguide/permissions.html).

Enough background, on to the code…

On the frontend, I used the popular [axios](https://github.com/mzabriskie/axios) HTTP library in addition to [aws4](https://github.com/mhart/aws4), a library to sign requests using [AWS Signature v4](https://docs.aws.amazon.com/general/latest/gr/signature-version-4.html). While the configuration of API Gateway is beyond the scope of this post, know that we need to sign and provide an `Authentication` header in order for the call to be allowed by secured APIs. This is what aws4 helps to enable. Signing the requests allows the frontend to assume an AWS Role authorized to call the API.

Note: the following code snippets assume the user has already authenticated via Cognito and retrieved temporary credentials (including an access key, secret key, and session token).

First, the following code demonstrates a `GET` to an API secured with `AWS_IAM` authorization:

 gist 06f0cc95c0356e175b5bbca8eab196a7 

Next, let’s consider how the above changes for a `PUT` request. Note the addition to the request body as well as a content-type header.

 gist 3fb39f28728f5fc30362768d7c1abd49 

I hope you found the above useful as you work with these great frontend packages and Amazon API Gateway.

  