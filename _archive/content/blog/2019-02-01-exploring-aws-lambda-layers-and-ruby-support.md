---
layout:	post
title:	"Exploring AWS Lambda Layers and Ruby Support"
date:	2019-02-01
background: '/assets/images/1*g7Mi5qGirKpD7M503DD55Q.jpeg'
---
  
> For an update to this post, see [Update - Building Lambda Layers with AWS SAM](htts://blog.iamjkahn.com/2020/09/update-to-building-lambda-layers-with-aws-sam.html)

I’ve been meaning to explore [Lambda Layers](https://docs.aws.amazon.com/lambda/latest/dg/configuration-layers.html) and [Lambda support for Ruby](https://docs.aws.amazon.com/lambda/latest/dg/ruby-handler.html) since both were announced at re:Invent 2018. Over the past few days, I’ve finally had the opportunity and wanted to share my findings.

### Ruby on Lambda

Ruby has long been one of my favorite programming languages, since the early days of Ruby on Rails. Ruby support on Lambda is implemented via the [Custom Runtime](https://docs.aws.amazon.com/lambda/latest/dg/runtimes-custom.html) feature also introduced at re:Invent, though in this case, officially supported by AWS.

Building a Lambda function in Ruby is not all that different from other supported runtimes, define a handler function and write your business logic:

```
# app.rb  
def lambda_handler(event:, context:)  
 executeBusinessLogic(event['payload'])  
 { success: true }  
end
```

Like other supported runtimes, Ruby on Lambda supports bundling of dependencies (Ruby Gems) with your function code. The Lambda runtime makes packaging your dependencies simple, by including those Gems in the appropriate path (more on this shortly). The excellent [SAM CLI](https://github.com/awslabs/aws-sam-cli) makes bundling dependencies even simpler via its [Ruby build support](https://aws.amazon.com/blogs/developer/announcing-ruby-build-support-for-aws-sam-cli/).

Using the SAM CLI, we can build a simple Ruby Lambda function with dependencies as follows:

```
# create a new function  
$ sam init -r ruby2.5 -n my-ruby-function$ cd my-ruby-function

# modify the function code as desired...  
$ nano hello_world/app.rb

# add dependencies via bundler, be sure to require in function  
$ bundle add httparty

# build  
$ sam build

# if bundling dependencies with native extensions (hello, nokogiri)  
$ sam build --use-container # package and deploy or test locally
```

When using the `sam build` command, the CLI will create a new `.aws-sam` directory that contains all of your build artifacts. The SAM CLI will use the SAM template and code artifacts in this directory for deployments and local testing going forward, so always run `sam build` after updating your template or code.

![Build artifacts after running sam build.](/assets/images/1*TYrGgm7lB3SStoCacdbOhg.png)

Note the contents of the `.aws-sam/build directory` in the screenshot above, for each serverless function, SAM will bundle the function Ruby code and generate a `vendor` directory containing dependencies identified by the function’s Gemfile. As we explore Lambda Layers, note the `GEM_PATH` — SAM bundles dependencies in `vendor/bundle/ruby/2.5.0`, which is part of the default path.

### Lambda Layers

Previous to Layers, one of the challenges in building Lambda functions was in packaging shared code or common libraries across anything more than one function. The general recommendation previous to Layers was to rely on the runtime’s mechanism for distributing shared code (e.g. gems, modules, or libraries). While this worked well for shared code, it required the library to be distributed with each function, increasing the size of the function package as well as operational burden.

Lambda Layers allows us to distribute shared code or libraries in a single, versioned, immutable package. That package can be attached to and used by multiple Lambda functions, thus simplifying business logic, easing dependency management, and slimming deployment packages. A maximum of five layers with an unzipped deployment package size limit of 250 MB can be attached to a single function.

Layers are particularly useful in managing shared code, for example your model or data access code, or distributing slow-changing (or slow to build) libraries. In my case, I wanted to share common code and also avoid building nokogiri each time I wanted to deploy an update to my function (remember, `sam build` will build and package all dependencies on each run, this can be slow). The SAM CLI does not yet support building Ruby layers, so we’ll explore a manual approach here.

All Lambda runtimes provide paths in the `/opt` directory that can be used to provide your function with access to its dependencies. Note though that these [paths differ by runtime](https://docs.aws.amazon.com/lambda/latest/dg/configuration-layers.html#configuration-layers-path). For Ruby, we can use both `GEM_PATH` (`/opt/ruby/gems/2.5.0`) and `RUBY_LIB` (`/opt/ruby/lib`) to distribute common dependencies and shared code via `GEM_PATH` and `RUBY_LIB`, respectively.

To build a functional Lambda Layer, we will need to package our dependencies and shared code in a .zip file with a folder structure as follows:

* `ruby/gems/2.5.0/<dependencies>`
* `ruby/lib/<common code>`

![Layer directory structure](/assets/images/1*BmV8t93BQ2R880EtGjKKlQ.png)

In the end, our uncompressed package will look something like the image at left. To deploy as a layer, use a ZIP utility to compress the `ruby` directory and its contents and deploy via the AWS Console, CLI, or SAM (more on this option shortly).

In order to support Gems with native extensions, we can use Docker to replicate the Lambda environment locally and build there. The following is my approach to building and packaging a layer. This approach assumes that you have Docker installed, all dependencies are listed in a Gemfile, and all Ruby (`.rb`) files are to bundled as shared code:

```
$ mkdir ruby && mkdir ruby/gems  
$ docker run --rm \  
             -v $PWD:/var/layer \  
             -w /var/layer \  
             lambci/lambda:build-ruby2.5 \  
            bundle install --path=ruby/gems
            
# move directories and throw out cache  
$ mv ruby/gems/ruby/* ruby/gems/ && \  
   rm -rf ruby/gems/2.5.0/cache && \  
   rm -rf ruby/gems/ruby
   
# bundle shared code  
$ mkdir ruby/lib && \  
   cp *.rb ruby/lib
   
# zip and clean-up  
$ zip -r layer.zip ruby  
$ rm -rf .bundle && rm -rf ruby
```

Above, we use a Docker image provided by LambCI to build our dependencies before packaging per the Lambda Layer specification in a file named `layer.zip`.

In our function code, we can directly require both the shared code and dependencies included in our layer (note that HTTParty is not included in the function Gemfile, only the layer in our sample):

```
require 'httparty'  
require 'shared'

def lambda_handler(event:, context:)  
  p ENV['GEM_PATH']
 
  begin  
    response = HTTParty.get('http://checkip.amazonaws.com')  
  rescue HTTParty::Error => error  
    p error.inspect  
    raise error  
  end
  
  # method defined in shared.rb in our layer  
  build_response(response.code, response.body)  
end
```

Using SAM, we can define a template that includes our sample function and the layer. While outside the scope of this post, you can use the SAM CLI to build, package, and deploy your serverless application. Here, we will create a new version of the Layer each time the template is deployed, deleting old versions (see `RetentionPolicy`).

```
# template.yaml  
Resources:  
  MyFunction:
    Type: AWS::Serverless::Function  
    Properties:  
      CodeUri: sample/  
      Handler: app.lambda_handler  
      Runtime: ruby2.5  
      Layers:  
        - !Ref MyLayer

  MyLayer:  
    Type: AWS::Serverless::LayerVersion  
    Properties:  
      LayerName: my-first-layer  
      Description: A sample Ruby layer  
      ContentUri: layer/layer.zip  
      CompatibleRuntimes:  
        - ruby2.5  
      RetentionPolicy: Delete
 ```
 
 Once deployed, if you invoke the function, note that the default value of `GEM_PATH` for Ruby Lambda functions is `/var/task/vendor/bundle/ruby/2.5.0:/opt/ruby/gems/2.5.0`. This means that you can package your dependencies both with the function and in a layer. When using `sam build` and the above packaging for Layers, function dependencies will be found in the `/var/task` directory with your function code; layer dependencies in `/opt/ruby/gems`. In my research on Layers, I noted several articles that suggested changing the `GEM_PATH` via a Lambda environment variable, this **will break** your function if you package dependencies with your function as well as your layer. In the packaging approach shown here, we respect the default path used by Lambda.

Thanks for reading and please feel free to leave a comment with any questions. Complete sample code can be found on Github:

[**jkahn117/aws-lambda-ruby-layers**  
*Simple example of AWS Lambda with Ruby and Layers. Contribute to jkahn117/aws-lambda-ruby-layers development by…*github.com](https://github.com/jkahn117/aws-lambda-ruby-layers "https://github.com/jkahn117/aws-lambda-ruby-layers")[](https://github.com/jkahn117/aws-lambda-ruby-layers)  