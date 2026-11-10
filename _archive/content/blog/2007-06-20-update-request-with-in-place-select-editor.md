---
layout: post
title: Update request with in place select editor
date: 2007-06-20 14:35:00.000000000 -05:00
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
  blogger_permalink: "/2007/06/update-request-with-in-place-select.html"
author: jkahn
---
Following the train of my past two posts, I am continuing to work on enabling a page to handle multiple in place editors with a RESTful controller on the backend. Today, I needed to utilize an in place select editor (instead of text) to allow the user to pick from a collection of options (in this case, cities).

Earlier in the project, I had used a [script](http://wiki.script.aculo.us/scriptaculous/show/InPlaceSelect) that I found on the Scriptaculous wiki on the [Ajax.InPlaceEditor](http://wiki.script.aculo.us/scriptaculous/show/Ajax.InPlaceEditor) page. For my purposes at the time, it was adequate. In today's scenario, I found that I would not be able to (1) make a PUT request and (2) include the parameters needed by my RESTful controller - the new value and the name of the attribute to be updated.

After some digging, I found that Scriptaculous had added an [Ajax.InPlaceCollectionEditor](http://wiki.script.aculo.us/scriptaculous/show/Ajax.In+Place+Collection+Editor) in version 1.5.3 (or something) that seemed to be more robust, being based on the InPlaceEditor. I quickly put together the following code, based on my earlier work in creating a similar in place text editor:  
`    new Ajax.InPlaceCollectionEditor('user_profile_1_office',   'http://myurl/profiles/1',   {   collection:[[1, 'Chicago'],[2, 'Bangalore'],[3, 'London']],   ajaxOptions:{ method:'put' },   callback:function(form, value) { return 'attr=office&value='+escape(value) }   });    `  
Unfortunately, this did not work. Upon reviewing the Rails logs, I found that while the value was submitted (as the parameter "value"), the attribute name was not. This indicated that my callback (used to include the additional parameter in the request) was not being called.

A review of the Scriptaculous library's `control.js` file showed that the Ajax.InPlaceCollectionEditor was in fact overriding my callback with one of its own that only submitted the value. I commented out of the following lines and my callback worked as expected:

`    this.options.callback = function(form, value) {   return "value=" + encodeURIComponent(value);   }    `

This does, of course, open a question around long term support for the solution. Although a ticket has been opened against this issue, it has not been fixed yet. If we upgrade to a new version of Scriptaculous, we will also break our user profile update functionality. For now, we'll go with it.

Finally, we wrapped the Javascript above in a Rails helper and we were ready to roll.