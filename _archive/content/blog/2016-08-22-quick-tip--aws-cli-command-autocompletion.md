---
layout:	post
title:	"Quick Tip: AWS CLI Command Autocompletion"
date:	2016-08-22
---

  The AWS CLI is extremely powerful and can enable access to AWS services and data for scripting and other purposes. Personally, remembering the breadth of commands available is a challenge, but I learned today that autocomplete is available.

The following describes how to setup autocompletion for a system using bash and installed via pip, yum, or Homebrew.

Locate the auto completer package:

$ which aws\_completerEnable command autocompletion (assumes default path to aws\_completer):

$ complete -C '/usr/local/bin/aws\_completer' awsTest command completion:

$ aws e*TAB  
*ec2 efs elastictranscoder esecr elasticache elb eventsecs elasticbeanstalk emrTo enable auto completion in the future, add it to the bash user’s profile (assuming default path):

$ cat >> ~/.bash\_profile  
complete -C '/usr/local/bin/aws\_completer' aws  
export PATH=/usr/local/aws/bin:$PATH  
*CTRL+D*Further detail can be found in [AWS Documentation](https://docs.aws.amazon.com/cli/latest/userguide/cli-command-completion.html), including details on other types of shells and where else you may find the aws\_completer package.

  