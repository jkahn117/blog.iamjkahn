---
layout: post
title: Trouble with LCDS Object Deserialization
date: 2007-11-05 20:25:02.000000000 -06:00
type: post
parent_id: '0'
published: true
password: ''
status: publish
categories:
- Data Services
- Flex
tags: []
meta:
  _oembed_a020b4b5e011210a7b233fbe4d4ea13b: "{{unknown}}"
  _oembed_b5129fd79f0247078c1abbacd450db5e: "{{unknown}}"
  _oembed_509b6627f9fd1251fdf24b8ed543c929: "{{unknown}}"
  _oembed_a0d0cce5457db4e019a35bc2740ab394: "{{unknown}}"
author: jkahn
---
Found something interesting today in the course of trying to solve a problem in my sample LCDS application:

> **Why are my ValueObject member variables undefined in the results from my RemoteObject requests?**
> 
> The Flash Player deserializes objects in a special order that can confuse developers used to object serialization from other RPC systems. When a strongly typed object is returned to the player it first creates an instance from the prototype of the registered class without calling the constructor. It then populates the object with the properties sent in the result and finally, it calls the constructor without arguments. If your ValueObject constructor expects arguments to initialize an instance be sure to check whether arguments were actually sent to the constructor before overriding member variable values. Note that the Flash Player does not currently honor getter/setter properties in object serialization or deserialization.

I have been dealing with this exact problem – an object referenced (Product) by the objects returned from my data service (LineItem) are not typed, but are instead only of type Object. This was not an easy problem to track down because it did manifest itself as I would have expected. Will post an update with a solution when I find one.

**Update:**

I ran into this problem again while testing a new application that we are building and I found a "fix" of sorts. If the _class is referenced somewhere in the Flex application_ (instead of just including it), the class will be compiled into the application.  Once compiled, the Flash player will deserialize the object to a strongly typed object instead of a weak one (e.g. of type "Product" instead of "Object").

This is not the most of elegant solutions, so please comment with better options. I hope the Flex team takes a look at this problem soon.

**Reference**

*   [http://www.cflex.net/showfaq.cfm](http://www.cflex.net/showfaq.cfm)
*   [http://jessewarden.com/2005/04/class-deserialization-openamf-flashcom.html](http://jessewarden.com/2005/04/class-deserialization-openamf-flashcom.html)