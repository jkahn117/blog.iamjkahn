---
layout: post
title: Starting an AWS Step Functions State Machine from Java
date: 2020-01-27 12:41 -0600
summary: Quick post on how to start execution of an AWS Step Functions state machine from Java.
background: '/assets/images/header1.jpg'
---

Just over two years ago, I wrote a quick post to document [how to invoke an AWS Lambda function from Java](https://blog.iamjkahn.com/2017/11/invoking-an-aws-lambda-function-from-java.html). I recently was asked how to start execution of an AWS Step Function state machine and also found a working example challenging to dig up ... so I put together a quick example:

``` java
import com.amazonaws.regions.Regions;
import com.amazonaws.services.stepfunctions.AWSStepFunctions;
import com.amazonaws.services.stepfunctions.AWSStepFunctionsClientBuilder;
import com.amazonaws.services.stepfunctions.model.StartExecutionRequest;
import com.amazonaws.services.stepfunctions.model.StartExecutionResult;
import org.json.JSONObject;

// ...

// (1) Define the AWS Region in which the function is to be invoked.
Regions region = Regions.fromName(System.getenv("AWS_REGION"));

// (2) Instantiate AWSStepFunctionsClientBuilder to build the client
AWSStepFunctionsClientBuilder builder = AWSStepFunctionsClientBuilder.standard()
                                          .withRegion(region);

// (3) Build the client, which will ultimately do the work
AWSStepFunctions client = builder.build();

// (4) Construct the JSON input to the state machine
JSONObject sfnInput = new JSONObject();
sfnInput.put("key1", "hello");
sfnInput.put("key2", "world");

// (5) Create a request to start execution with needed parameters
StartExecutionRequest request = new StartExecutionRequest()
                                      .withStateMachineArn("MY_STATE_MACHINE_ARN")
                                      .withInput(sfnInput.toString());

// (6) Start the state machine and capture response
StartExecutionResult result = client.startExecution(request);

// (7) Handle the result, this includes the execution ID
```

The example above makes use of the `DefaultAWSCredentialsProviderChain` to pull credentials from environment variables, instance profile, etc. You can use `BasicAWSCredentials` if you need to hardcode keys, but this is a much less desirable option.