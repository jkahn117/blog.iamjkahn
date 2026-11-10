---
layout: post
title: A Change to iBatis
date: 2007-12-11 19:11:10.000000000 -06:00
type: post
parent_id: '0'
published: true
password: ''
status: publish
categories:
- Data Services
tags: []
meta: {}
author: jkahn
---
In my previous post, I covered how to build a small LCDS application that utilizes Spring and Hibernate on the backend. This application was very simple and limited, but I was able to easily apply the same principles to a more complex project at work.

Following the design pattern I typically follow, I started by designing the data model (I guess I am a bit bias towards how Rails does things, but in general, I feel this is a better pattern for designing applications). The data model was slightly more complex than my sample in that it would require a couple of `joins` to support my model classes appropriately. I felt this was simple enough, the SQL is.

Hibernate seemed to disagree though. It became very difficult to map my data model to my model classes and if I wanted to follow my designed data model, I would be forced to change the semantics of the model layer. I also ran into difficult in persisting a custom collection, but was able to solve that (will try to post details soon). In the end it all just became to much. Hibernate is great, if you do things the way it does things - I evidently do not.

A colleague recommended that I check out [iBatis](http://ibatis.apache.org/) as an alternative to Hibernate. When using iBatis, the developer is responsible for creating the SQL called by the application and defining the relationship between query results and model properties. Hibernate, on the other hand, requires a mapping from the database schema to the model classes and generates SQL on its own. You could say that there is some degree of "magic" to Hibernate.

Utilizing the same architectural pattern I followed in my sample application, I was able to quickly replace Hibernate-backed implementations of my DAO classes with iBatis ones. [Spring](http://springframework.org) also provides integration with iBatis, so bringing it into the application was very straightforward.

In the end, I was a bit disappointed to have to pull out Hibernate, but there were just to many challenges on to short of a schedule.