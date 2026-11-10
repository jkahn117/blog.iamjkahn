---
layout: post
title: 'jQuery: Focus on First Form Element'
date: 2008-03-10 14:04:03.000000000 -05:00
type: post
parent_id: '0'
published: true
password: ''
status: publish
categories:
- jQuery
tags: []
meta:
  _edit_last: '404795'
  _oembed_40dff3089a56705a5213a400bdfc957d: "{{unknown}}"
  _oembed_526806027a2c19984db30dae8f0db670: "{{unknown}}"
  _oembed_ba0bb08fd311276b5b8162f167502169: "{{unknown}}"
author: jkahn
---
All in all, jQuery is pretty cool. I just stated working with it for a personal project and have found it simple and fairly intuitive to use, not to mention the plethora of available plug-ins.

I wanted to focus on the first input element in a form using jQuery. I haven't tested this extensively, but I came up with the following:

``` javascript
$(document).ready(function() {
  // focus on the first text input field in the first field on the page
    $("input\[type='text'\]:first", document.forms\[0\]).focus();
});
```

We are simply using a selector to pick the first input element of type "text" in the first form on the page (that's the "document.forms\[0\]" stuff) and then focus on it. Of course, this is limited only to text fields, but could be extended to other types as well. I'd be interested in hearing about alternatives.