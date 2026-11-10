---
layout:	post
title:	"Deploying to AWS Lambda with Node.js and Grunt (CoffeeScript)"
date:	2016-07-08
---

  Having spent some time writing several Node.js Lambda functions, I thought it would be useful to document the packaging / deployment steps involved for reuse. This article is not a complete introduction to AWS, nor will it detail the steps involved in creating a function, instead we focus on subsequently publishing a function. This article will make use of [CoffeeScript](http://coffeescript.org/) for aspects of the work.

### Configure AWS Credentials

We will be using the AWS SDK to deploy code from our development system to Lambda, which requires that we provide credentials for an IAM User with appropriate permissions. The AWS SDK provides several options to load credentials, listed below in order of recommendation:

1. Loaded from IAM roles in Amazon EC2
2. Loaded from shared credentials (on Mac: ~/.aws/credentials)
3. Loaded from environment variables
4. Loaded from JSON
5. Hardcoded in application
For local development, we will utilize the shared credentials approach (#2), though you could also use options #3 or #4 as well. To do so, create or edit your shared credentials to include the AWS access key and secret access key for an appropriate User (I called mine “lambda”, see [Creating an IAM User in Your AWS Account](http://docs.aws.amazon.com/IAM/latest/UserGuide/id_users_create.html)):

```
[lambda]  
aws\_access\_key\_id = <ACCESS\_KEY>  
aws\_secret\_access\_key = <SECRET\_ACCESS\_KEY>
```

#### A Word on IAM Policy

In order for the AWS SDK to deploy your code, you must attach an IAM policy with an appropriate set of permissions to the User (“lambda”) that will deploy the code. For our purposes, the following policy provides the least permissions required (be sure to attach this policy to the User):

```
{  
 "Version": "2012-10-17",  
 "Statement": [  
 {  
 "Effect": "Allow",  
 "Action": [  
 "lambda:CreateAlias",  
 "lambda:GetAlias",  
 "lambda:GetFunction",  
 "lambda:PublishVersion",  
 "lambda:UpdateAlias",  
 "lambda:UpdateFunctionCode",  
 "lambda:UpdateFunctionConfiguration",  
 "lambda:UploadFunction"  
 ],  
 "Resource": [  
 "arn:aws:lambda:*"  
 ]  
 }  
 ]  
}
```

### Create NPM Package

Next, we will create a new NPM package for our sample project, which we will call “my-sample-lambda-function”.

```
mkdir my-sample-lambda-function  
cd my-sample-lambda-function  
npm initOpen the package.json file in your favorite text editor and add the following:
```

```
{  
 "name": "my-sample-lambda-function",  
 "version": "0.0.1",  
 "description": "A simple continuous integration sample.",  
 "main": "index.js",  
 "dependencies": {  
 "aws-sdk": "~2.4.5"  
 },  
 "devDependencies": {  
 "grunt": "~0.4.5",  
 "grunt-aws-lambda": "~0.12.0",  
 "grunt-contrib-coffee": "~1.0.0"  
 },  
 "scripts": {},  
 "author": "me",  
 "license": "ISC"  
}
```

Before we move to wiring our packaging and deploy tasks, be sure to install dependencies via the command line:

```npm install```

### Gruntfile

Before we start writing our Lambda code, let’s set-up our build and deployment process using [Grunt](http://gruntjs.com/) ([how to install Grunt on Mac](https://changelog.com/install-node-js-with-homebrew-on-os-x/)). Create a file named Gruntfile.coffee at the root of the my-sample-lambda-function directory:

```
module.exports = (grunt) ->  
 grunt.initConfig  
 lambda\_invoke:  
 default:  
 options:  
 file\_name: 'index.js',  
 event: 'event.json'  
 lambda\_deploy:  
 default:  
 arn: '<YOUR\_LAMBDA\_ARN>'  
 options:  
 profile: 'lambda'  
 region: '<YOUR\_LAMBDA\_REGION>'  
 lambda\_package:  
 default: {}  
 coffee:  
 # compile all CoffeeScript files to a single JS file, index.js  
 compile:  
 files:  
 'index.js': 'src/*.coffee'  
 grunt.loadNpmTasks('grunt-contrib-coffee')  
 grunt.loadNpmTasks('grunt-aws-lambda') # simplify packaging and deployment  
 grunt.registerTask('package', [ 'coffee', 'lambda\_package' ])  
 grunt.registerTask('deploy', [ 'package', 'lambda\_deploy' ])
 ```
 
 The exact details of the Gruntfile are beyond the scope of this article.

Before you can deploy your function, you will need to create the Lambda function via the AWS Console or CLI with handler named “index.handler” (note that our policy above does not allow the “lambda” user to create a Lambda function). Grab the Region and ARN for the Lambda and paste into the Gruntfile as appropriate.

The Gruntfile includes two tasks to simplify packaging of the function and deployment: “package” and “deploy”. These functions make use of the [grunt-aws-lambda](https://github.com/Tim-B/grunt-aws-lambda) plug-in for Grunt to easily create the Lambda package and push to AWS.

### Finally, Some Code

Now that we have laid the groundwork for deploying to Lambda, we can write some code. Our example is a “Hello World” application, my next installment will cover utilizing the AWS SDK.

Create a new directory named “src” with a file named “index.coffee”:

mkdir src  
touch index.coffeeOpen index.coffee in your favorite text editor and insert the following:

'use strict'  
console.log 'Loading function'exports.handler = (event, context, callback) ->  
 # echo back 'Hello World'  
 callback null, 'Hello World'  
 returnNow, launch a command prompt and deploy to Lambda:

grunt deployIf successful, you will see the message:

Done, without errors.### Conclusion

At this point, we have a nice base to develop, package, and deploy code to AWS Lambda that we will use to build additional functionality in the future.

  