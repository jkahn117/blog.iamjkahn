---
layout: post
title: '"Banners" = Bad in Ad Blocker World'
date: 2014-03-24 15:38:04.000000000 -05:00
type: post
parent_id: '0'
published: true
password: ''
status: publish
categories:
- Rails
tags: []
meta:
  _edit_last: '404795'
  publicize_twitter_user: joshuaakahn
  publicize_twitter_url: http://t.co/hO3T0rw5Mq
  _wpas_done_944212: '1'
  _publicize_done_external: a:1:{s:7:"twitter";a:1:{i:193406412;b:1;}}
author: jkahn
---
Just ran into a rather aggravating issue...

In building a site meant to preview mobile ads, I used the term "banners" in the URL to point to image previews then spent 2+ hours tracking down why it worked in my development environment but not in production.

Luckily a colleague pointed out my ad blocker, which seems to have a broad match on the word "banner"...block all. Changing the name in the path fixed the problem.