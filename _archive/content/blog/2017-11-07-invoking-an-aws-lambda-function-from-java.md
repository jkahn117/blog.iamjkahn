---
layout:	post
title:	"Invoking an AWS Lambda Function from Java"
date:	2017-11-07
---

Although it’s been quite some time since I wrote anything in Java, I recently worked on a [project](https://github.com/jkahn117/flume-aws-lambda) that required me to pull old bits of knowledge from the recesses of my brain. The task was fairysimple, invoke an AWS Lambda function from Java.

Interestingly, a complete, current example was challenging to find (primarily due to a number of examples leveraging deprecated code), thus I hope that this example will be beneficial to others.

```
import com.amazonaws.regions.Regions;  
import com.amazonaws.services.lambda.AWSLambda;  
import com.amazonaws.services.lambda.AWSLambdaClientBuilder;  
import com.amazonaws.services.lambda.model.InvokeRequest;  
import com.amazonaws.services.lambda.model.InvokeResult;

// ...

// (1) Define the AWS Region in which the function is to be invoked  
Regions region = Regions.fromName("us-east-1");

// (2) Instantiate AWSLambdaClientBuilder to build the Lambda client  
AWSLambdaClientBuilder builder = AWSLambdaClientBuilder.standard()  
                                    .withRegion(region);
 
 // (3) Build the client, which will ultimately invoke the function  
AWSLambda client = builder.build();

// (4) Create an InvokeRequest with required parameters  
InvokeRequest req = new InvokeRequest()  
                      .withFunctionName("myFunctionName")  
                      .withPayload("{ ... }"); // optional
 
 // (5) Invoke the function and capture response  
InvokeResult result = client.invoke(req);

// (6) Handle result  
...
```

The above will invoke Lambda synchronously; however, you can also [invoke asynchronously](https://docs.aws.amazon.com/sdk-for-java/v1/developer-guide/basics-async.html) using Java Futures or callbacks.

### Invocation with Access Key and Secret Key

The above sample will utilize the `DefaultAWSCredentialsProviderChain` to utilize environment variables, EC2 Instance Profile, etc. when invoking the function. While this is often best practice, there are also scenarios when you may need to provide access and secret keys. To do so, we only need to make a small change to the code above:

```
import com.amazonaws.auth.AWSStaticCredentialsProvider;  
import com.amazonaws.auth.BasicAWSCredentials;

// (1a) Instantiate credentials  
BasicAWSCredentials credentials = new   
 BasicAWSCredentials("myAccessKey", "mySecretKey");
 
 // (2) Modify to leverage credentials  
AWSLambdaClientBuilder builder = AWSLambdaClientBuilder.standard()  
   .withCredentials(new AWSStaticCredentialsProvider(credentials));   
   .withRegion(region);// carry on...  
 ```