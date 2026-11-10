---
layout: post
title: Twitter Bootstrap Scrollspy
date: 2013-10-30 15:05:26.000000000 -05:00
type: post
parent_id: '0'
published: true
password: ''
status: publish
categories:
- Boostrap
tags:
- Bootstrap
- Twitter Bootstrap
meta:
  _edit_last: '404795'
  publicize_twitter_user: joshuaakahn
  publicize_twitter_url: http://t.co/dh2aANtOAG
  _wpas_done_944212: '1'
  _publicize_done_external: a:1:{s:7:"twitter";a:1:{i:193406412;b:1;}}
author: jkahn
---
Implementing Twitter Bootstrap 3's Scrollspy plug-in took a bit of trial-and-error, below is my approach and findings for posterity sake (and perhaps someone else's benefit in the future):

My goal was to implement a menu listing on the left with content on the right for an FAQ page.  Bootstrap 3's [navbar](http://getbootstrap.com/components/#navbar) was not the right fit, the [list-group](http://getbootstrap.com/components/#list-group) was closer, but not perfect (more on that later).

A few findings of note:

*   Scrollspy is built to work with `li` elements that are children of an element of class `.nav`.  See [Scrollspy source](https://github.com/twbs/bootstrap/blob/master/js/scrollspy.js).
*   Scrollspy keeps an eye on any element with a scrollbar, but for most page, this is going to be the page itself, which in reality is the `body` element.  If you have a frame with scrollbars (a la the Bootstrap documentation sample), Scrollspy will work, but this is atypical.
*   While Scrollspy watches a scrollable element, events are fired on the navigation element.

Let's get to the details.  Bottom line is available as a [JSFiddle](http://jsfiddle.net/TFhGa/24/).

HTML
====

The HTML used here is fairly simple, utilizing Bootstrap classes to style a left-hand navigation built with a list-group and content on the right.

<div class="row">
  <div class="col-sm-4 col-xs-4" id="nav">
    <ul class="nav list-group affix">
      <li class="list-group-item"><a href="#g1">Item 1</a></li>
      <li class="list-group-item"><a href="#g2">Item 2</a></li>
      <li class="list-group-item"><a href="#g3">Item 3</a></li>
      <li class="list-group-item"><a href="#g4">Item 4</a></li>
      <li class="list-group-item"><a href="#g5">Item 5</a></li>
    </ul>
  </div>
  <div class="col-sm-8 col-xs-8">
    <section id="g1">Content 1</section>
    <section id="g2">Content 2</section>
    <section id="g3">Content 3</section>
    <section id="g4">Content 4</section>
    <section id="g5">Content 5</section>
  </div>
</div>

Although possible, I chose not to use Bootstrap's declarative interface to add Scrollspy here because as part of a larger application, another template defines the `body` element.

JavaScript
==========

As explained above, adding Scrollspy to the body element typically makes the most sense; however, some of the other articles / discussions on this topic seemed incorrect.

```
$(document).ready(function() {
  // plugin is applied to a scrollable element, targeting my navigation element
  $('body').scrollspy({ 'target': '#nav', 'offset': 10 });

  // listen for scrollspy events on the navigation element itself
  $('#nav').on('activate.bs.scrollspy', function() {
    console.log('scroll spy!!')
  });
});
```

CSS
===

Finally, a bit of CSS to pretty things up and style the list-group to look as desired (very simple approach for demonstration):

```
section {
 height: 250px;
 background-color: #eee;
 padding: 10px;
 margin: 10px 0;
}
li.list-group-item:hover {
 background-color: #eee;
 cursor: pointer;
}
li.list-group-item.active > a,
li.list-group-item.active > a:hover,
li.list-group-item.active > a:focus {
 color: #fff;
 background-color: #428BCA;
}
```

Depending on your content, you may need to change the offset.

That's it.  Again, the [JSFiddle](http://jsfiddle.net/TFhGa/24/) has a working example.