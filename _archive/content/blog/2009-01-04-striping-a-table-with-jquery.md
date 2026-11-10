---
layout: post
title: Striping a table with jQuery
date: 2009-01-04 01:52:17.000000000 -06:00
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
  _oembed_e0179d73a74df75d06b9ef2fa89480f6: "{{unknown}}"
  _oembed_dca7b6fd1fd8e53fa4b8421534769ae8: "{{unknown}}"
author: jkahn
---
jQuery makes striping an HTML table very simple with what amounts to a one line function.  First, let's start with our HTML:

`   <table class="striped">   <tr>   <td>Lorem</td>   <td>ipsum</td>   </tr>   <tr>   <td>dolor</td>   <td>sit</td>   </tr>   <tr>   <td>amet</td>   <td>consectetur</td>   </tr>   </table>`

Should be pretty straightforward.  Notice that we haven't done anything bayond a simple table here, no styling, nothing.  Next, we can create a simple CSS style for our alternating rows:

`    tr.alt {   background-color: #ebe9dc;   }    `

Finally, let's create a Javascript function that we can call to stripe the table:

`    jQuery.fn.stripe = function() {   return this.each(function(){   $('tbody > tr:even', this).addClass('alt');   });   };    `

Again, this function primarily boils down to one line, the rest is [boilerplate](http://docs.jquery.com/Plugins/Authoring) jQuery plugin code that allows us to make calls to the function as follows `$('table.striped').stripe`.

The power here is the line `$('tbody > tr:even', this).addClass('alt');`. Here, we are using selectors mixed with the scope of "this" (i.e. table's with class "striped") to select the even rows in the table and apply the class "alt" which we defined earlier in our style sheet to them.