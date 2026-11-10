---
layout: post
title: Styling "Browse…" button on file input fields
date: 2007-06-18 16:39:00.000000000 -05:00
type: post
parent_id: '0'
published: true
password: ''
status: publish
categories:
- Rails
tags:
- css
meta:
  blogger_blog: railsrockit.blogspot.com
  blogger_author: Josh
  blogger_permalink: "/2007/06/styling-browse-button-on-file-input.html"
author: jkahn
---
So this first post isn't about Ruby or Rails, but something that I've struggled to figure out for some time now...how to style that silly "Browse..." button that appears when you create a file upload field in an HTML form.

[Quirksmode](http://www.quirksmode.org/dom/inputfile.html) proposes two solutions, one CSS-based and other reliant on Javascript. My preference is the CSS technique as Javascript tends to be more hit or miss:

```
div.fileinputs {   position: relative;   }`

div.fakefile {  
position: absolute;  
top: 0px;  
left: 0px;  
z-index: 1;  
}

input.file {  
position: relative;  
text-align: right;  
\-moz-opacity:0 ;  
filter:alpha(opacity: 0);  
opacity: 0;  
z-index: 2;  
}

<div class="fileinputs">  
<input type="file" class="file" />  
<div class="fakefile">  
<input />  
<img src="search.gif" />  
</div>  
</div>
```