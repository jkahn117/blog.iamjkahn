---
layout: post
title: Two New Ways to Test Mobile Devices
date: 2012-06-13 21:04:08.000000000 -05:00
type: post
parent_id: '0'
published: true
password: ''
status: publish
categories: []
tags: []
meta:
  _edit_last: '404795'
author: jkahn
---
Two novel ways to test mobile devices came to my attention today.  This has traditionally been a sticky area for developers as you could not exactly point the device to "localhost" and hack away.

[xip.io](http://xip.io/) is a service from 37Signals, who bring us Ruby on Rails-based products like Basecamp.  At a glance, it's somewhat simple, but pretty cool.  You can use the service to point your mobile device towards a local development server, passing through a public DNS server. Be sure to use your internal LAN address (not necessarily the one the public internet sees).

[Adobe Shadow](http://labs.adobe.com/technologies/shadow/) is a different take.  This Adobe Labs project essentially allows you to mirror your desktop on a mobile device via a small application installed on each.  With it, you can synchronously browse your site, viewing both the desktop and mobile experiences.