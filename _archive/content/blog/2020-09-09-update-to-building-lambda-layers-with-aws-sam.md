---
layout: post
title: Update - Building Lambda Layers with AWS SAM
date: 2020-09-09 09:30 -0500
background: '/assets/images/1*g7Mi5qGirKpD7M503DD55Q.jpeg'
summary: Update to my earlier post on building AWS Lambda Layers for Ruby
---

Last year, I posted an [article](https://blog.iamjkahn.com/2019/02/exploring-aws-lambda-layers-and-ruby-support.html) exploring [AWS Lambda](https://aws.amazon.com/lambda/) support for Ruby and [Lambda Layers](https://docs.aws.amazon.com/lambda/latest/dg/configuration-layers.html). Since that time AWS has released [support for Ruby 2.7](https://aws.amazon.com/about-aws/whats-new/2020/02/aws-lambda-supports-ruby-2-7/) and [AWS SAM introducd support for building layers](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/building-layers.html).

In this post, I will revisit the build process used to build a Ruby layer, but this time using the build support available in SAM.

When including a layer in your SAM template file, you can now include a `Metadata` resource that defined the build method for the layer. Two build methods are supported: (1) a Lambda runtime or (2) a Makefile. When including the `Metadata` attribute on a `AWS::Serverless::LambdaLayer` resource, the `sam build` command will build the layer either as an independent object or as a dependency of a Lambda function. The layer will also work when running your functions locally using SAM CLI.

To define a Lambda Layer version in your SAM template:

``` yaml
Resources:
  RubyLayer:
    Type: AWS::Serverless::LayerVersion
    Properties:
      ContentUri: ./ruby_layer
      CompatibleRuntimes:
        - ruby2.7
    Metadata:
      BuildMethod: makefile
```

Unfortunately, I've found that the default `ruby2.7` build process does not properly package the layer and have opened an [issue on Github](https://github.com/aws/aws-lambda-builders/issues/177) to fix. Using the work from my earlier post, I was able to easily use the Makefile approach to properly package a layer that contains both Gems and shared code.

To use the Custom Makefile build, we need to include a `Makefile` in the layer `ContentUri` with a target named `build-{MyLayerResourceName}`. Following the example above, my target would be named `build-RubyLayer`. Before we get to the contents of that target, a quick look at the contents of the layer directory:

```
ruby_layer/
  |-- Gemfile
  |-- Makefile
  |-- lib/
       |-- { common directory }/
       |-- { common file }.rb
```

In the `lib/` directory, include any shared Ruby code. This may include model classes or utility code used by Lambda functions that leverage this layer.

The `Gemfile` is a standard Gemfile, including the various Gems to be bundled with the layer. Manage this Gemfile as you would any others.

The `Makefile` contains a single target that is run by the `sam build` command to build and package your layer. Again, the name of the target in this file will vary based on the name of the layer, but the remainder should be the same for the directory structure above.

``` bash
build-RubyLayer:
	bundle install --path=$(ARTIFACTS_DIR)
	rm -rf $(ARTIFACTS_DIR)/ruby/2.7.0/cache && rm -rf $(ARTIFACTS_DIR)/ruby/2.7.0/bin
	mkdir $(ARTIFACTS_DIR)/ruby/gems
	mv $(ARTIFACTS_DIR)/ruby/2.7.0 $(ARTIFACTS_DIR)/ruby/gems
	mkdir $(ARTIFACTS_DIR)/ruby/lib
	cp -r lib/* $(ARTIFACTS_DIR)/ruby/lib
```

> For further details on the package structure see my [previous post](https://blog.iamjkahn.com/2019/02/exploring-aws-lambda-layers-and-ruby-support.html) and [AWS documentation](https://docs.aws.amazon.com/lambda/latest/dg/configuration-layers.html#configuration-layers-path).

The resulting layer will contain bundled Gems in the path `ruby/gems/2.7.0` (`GEM_PATH`) and shared libraries/code in `ruby/lib` (`RUBYLIB`). Because the structure of Gems is slightly different than the desired `GEM_PATH`, we need to flip the directory structure.

With the Layer defined, you can now reference it from Lambda functions in your SAM template file and use `sam build` to build both the function and layer. This functionality is supported with the latest version of the SAM CLI.

``` yaml
MyRubyFunction:
  Type: AWS::Serverless::Function
    Properties:
      CodeUri: my-ruby-function/
      Layers:
        - !Ref RubyLayer
      ...
```
For a working version of this approach, see the project associated with my [previous post on Amazon API Gateway Lambda Authorizers](https://blog.iamjkahn.com/2020/09/exploring-api-gateway-custom-authorizers.html).
