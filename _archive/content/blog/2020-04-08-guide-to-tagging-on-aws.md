---
layout: post
title: Guide to Tagging on AWS
date: 2020-04-08 09:10 -0500
summary: Tagging can be one of the most useful mechanisms to understand and track resources in AWS. The linked guide provides a great overview of how to get started.
background: /assets/images/edgar-chaparro-RBOAn6vSqJE-unsplash.jpg
---

Tagging can be one of the most useful mechanisms to understand and track resources in AWS. Often I find that organizations new to cloud treat tagging as an afterthought or are just unsure where to start. k9 Security provides a nice guide of the types of tags to include as part of a default taxonomy:

[Cloud Deployment Tagging Guide](https://k9security.io/docs/guide-to-tagging-cloud-deployments/)

> This tagging model will help you answer questions like:
>
> * Who owns this resource? What application does it belong to?
> * Who should we call when the application is broken?
> * Who should pay for this resource? Which applications are driving our costs?
> * Do access controls secure this resource appropriately?
> * How much risk does our Cloud deployment have? Where is that risk concentrated?
> * Which security improvements reduce our risk the most?

Tagging can be useful for cloud operations, finance, security, and new team members to understand your current cloud environment. Most AWS resources now support up to 50 tags. Using tools like [AWS Service Catalog](https://aws.amazon.com/servicecatalog/), [AWS CloudFormation](https://aws.amazon.com/cloudformation/), and [AWS Config](https://aws.amazon.com/config/) can help enforce use of tagging either proactively or reactively.

AWS also provides a managed Config Rule, [required-tags](https://docs.aws.amazon.com/config/latest/developerguide/required-tags.html), that checks whether resources have the set of tags required by your organization. You can also extend this capability by [building your own Config Rules](https://docs.aws.amazon.com/config/latest/developerguide/evaluate-config_develop-rules.html). What to do when a resource is not properly tagged? That is an organizational decision, but can range from notification to remediation to deletion.

*Photo by [Edgar Chaparro](https://unsplash.com/@echaparro) on [Unsplash](https://unsplash.com/)*