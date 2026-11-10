---
layout: post
title: 'Rails: Page Specific JavaScript with Asset Pipeline'
date: 2014-01-07 22:43:35.000000000 -06:00
type: post
parent_id: '0'
published: true
password: ''
status: publish
categories:
- Rails
tags: []
meta:
  publicize_twitter_user: joshuaakahn
  _edit_last: '404795'
  publicize_twitter_url: http://t.co/vzHerULp31
  _wpas_done_944212: '1'
  _publicize_done_external: a:1:{s:7:"twitter";a:1:{i:193406412;b:1;}}
  _wpas_skip_944212: '1'
author: jkahn
---
After being away from Rails for several years, coming back to Rails 3/4 and its asset pipeline was a challenge at times.  While the performance gains and automation are quite valuable, the asset pipeline isn't without its occasional challenges.  One of those challenges was the growing amount of JavaScript being executed on every page of our site.  While this mostly amounted to at worst errors in the console, it just felt icky (that's a technical term).

Upon exploring Stack Overflow and various blog posts, I finally found a solution that felt somewhat better: [Page-Specific Javascript using Coffeescript](http://www.rigelgroupllc.com/blog/2012/10/07/page-specific-javascript/).  The overall solution was fairly clean, didn't cause an explosion in the number of JS files, and also did not require an update to the config each time a new JS file was added.  For larger, more modular needs, other solutions (e.g. [this one](http://blog.seancarpenter.net/2012/11/05/page-specific-javascript-with-the-asset-pipeline/)) may be more applicable, but this approach works fine for our medium size app.

I will not review the entire approach verbatim here, but I did make several changes to the aforementioned article.  It's important to note that this solution utilizes the object-oriented nature of CoffeeScript to simplify life.

First, we will create a base class that houses the common code executed on every page.  I named this class base.js.coffee (in app/assets/javascripts).

window.MyApp ||= {}  # namespace for your app, replace as you desire
class MyApp.Base
  constructor:() ->
    # common code we want to run on every page
    console.log('I print on every page!')
    # be sure to return this
    this

Next, we can begin to build controller-specific classes on top of the base class.  Like Rails, we will use the convention of the naming the class the same as the accompanying controller.  For example, our CommentsController will be accompanied by a CoffeeScript class called MyApp.Comments in the file comments.js.coffee.

window.MyApp ||= {}
class MyApp.Comments extends MyApp.Base
  constructor:() ->
    super  # call Base class for core functionality
    this   # and be sure to return this

  # now, we enumerate the actions for which we want page-specific behavior
  index:() ->
    console.log('I only print on the comments#index page')
  show:() ->
    console.log('I only print on the comments#show page')
  edit:() ->
    # something special for the comments#edit page

Continue to build a CoffeeScript class for each of your controllers that require JavaScript beyond whatever your Base class takes responsibility for.  Be sure to include a method for each action/page on which unique functionality is required.

Finally, we need to bring everything together and ensure our code is called wherever necessary.  One approach would be to include the following in your application's layout view, though it could also be included anywhere sure to be called.

```
<%= javascript\_tag do %>
$(document).ready(function() {
  window.$M = new (MyApp.<%= params\[:controller\].capitalize %> || MyApp.Base)();
  if (typeof $M.<%= params\[:action\] %> === 'function') {
    return $M.<%= params\[:action\] %>.call();
  }
});
<% end %>
```

The above first instantiates a new instance of our controller's accompanying class and then attempts to call the action method, if it exists.  The approach used in our app is slightly different, but this works as well.

Note that I did run into an issue using Turbolinks in conjunction with the above approach that we are yet to solve.  In short, despite using jquery.turbolinks and other known approaches, the action methods were being called multiples times per page.  I have seen mention of this behavior when Turbolinks is used in conjunction with anonymous functions (e.g. those created by CoffeeScript), but have not found a fix.  Please comment if you can help.