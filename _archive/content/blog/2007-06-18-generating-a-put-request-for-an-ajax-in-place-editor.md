---
layout: post
title: Generating a PUT request for an AJAX in place editor
date: 2007-06-18 21:49:00.000000000 -05:00
type: post
parent_id: '0'
published: true
password: ''
status: publish
categories:
- Rails
tags:
- ajax
- javascript
meta:
  blogger_blog: railsrockit.blogspot.com
  blogger_author: Josh
  blogger_permalink: "/2007/06/generating-put-request-for-ajax-in.html"
author: jkahn
---

Earlier today, I was working on adding an [in place editor field](http://wiki.script.aculo.us/scriptaculous/show/Ajax.InPlaceEditor) to our application (my manager is a big fan) and found (1) that they don't mesh well with REST principles and (2) getting them to generate PUT requests for RESTful updates isn't overly intuitive.

After some quick Googling, I found a [comment from Josh Susser](http://blog.codahale.com/2006/01/14/a-rails-howto-simplify-in-place-editing-with-scriptaculous/#comment-14979) on the same problem - not being able to create a PUT request nor change the parameter name. For me, the latter is not as much of an issue as the field I am trying to change in my model is in fact called "value," which just happens to be the parameter that the in place editor sends in the request. The remaining question was how to generate a PUT request. Another comment on the aforementioned site claimed to offer a solution, but it did not work for me. After digging through the Rails Javascript macro helpers, I found the following solution:

`    in_place_editor "my_dom_id",   :url => "my_url",   :options => "{ method:'put' }"    `

This in place editor does in fact generate a PUT request that is routed (correctly) to the #update action in my controller. Since the parameter name is not an issue for me, I have not tried to figure that one out yet, but you might be able to use the :with option in the Rails helper to pass the parameter correctly.