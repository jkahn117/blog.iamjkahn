---
layout: post
title: Adobe Open Sourcing LiveCycle Data Services as BlazeDS
date: 2007-12-13 14:32:46.000000000 -06:00
type: post
parent_id: '0'
published: true
password: ''
status: publish
categories:
- Data Services
tags: []
meta:
  _oembed_47576d0e637bed7ae4e1612c0fa839ae: "{{unknown}}"
  _oembed_ff1df73eab9cb71373176f26d563af2b: "{{unknown}}"
  _oembed_2aec72b075591f5cff026a30f4f0c451: "{{unknown}}"
  _oembed_276021a5464d22eafcbd3706ad68981e: "{{unknown}}"
author: jkahn
---
One of the downsides for LCDS development for me has been the lack of folks out there who have worked with the technology and that it is only available for Java backends (unless you use third party technology). Now, Adobe has announced that it will be open sourcing LCDS under the name "[BlazeDS](http://labs.adobe.com/technologies/blazeds/)," with a beta version available now on the Adobe Labs site. This is very exciting news as it will open the messaging and remoting framework that we use for Java to other platforms and will probably increase the pool of developers using it.

Adobe is also publishing the Action Message Format (AMF) protocol specification. According to Adobe, delivery of messages via AMF is up to ten times faster than with XML as it is already in a machine readable format (binary) and does not need to be translated, as is the case with XML.

Of note, however, is that the data management services component (which is what I have primarily been using) will still only be available as part of LCDS, which will also include new technologies around offline data synchronization in the future.

This is extremely exciting news for those of us working with LCDS...I mean BlazeDS.

**References**

*   [http://www.readwriteweb.com/archives/adobe\_blazeds.php](http://www.readwriteweb.com/archives/adobe_blazeds.php)
*   [http://coenraets.org/blog/2007/12/blazeds-open-sourcing-remoting-and-messaging/](http://coenraets.org/blog/2007/12/blazeds-open-sourcing-remoting-and-messaging/)