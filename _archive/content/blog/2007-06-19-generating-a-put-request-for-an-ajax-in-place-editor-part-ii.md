---
layout: post
title: Generating a PUT request for an AJAX in place editor - part II
date: 2007-06-19 18:43:00.000000000 -05:00
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
  blogger_permalink: "/2007/06/generating-put-request-for-ajax-in_19.html"
author: jkahn
---
Looks like I jumped the gun on my post yesterday afternoon, I did end up needing to include a parameter name for another AJAX in place editor...

Changing the parameter name of the submitted value in the AJAX in place editor required a bit of trickery that I have used before - using the `:with` option in the Rails tag to include some inline Javascript to "look up" the value on the page before sending the request.

To illustrate, let's take an example of wanting to change a user's job title using an inline editor from "supervisor" to "manager" via the UserProfilesController that follows REST principles.

**Controller**  
`    # assumes request is from an in place editor with only one attribute to update   def update   @user_profile = UserProfile.find(params[:id])   @user_profile.update_attribute(params[:attr].to_sym, params[:value])   end    `

**View**  
`    <span id="<%= dom_id(@user_profile) %>"><%= @user_profile.jobtitle %></span>   <%= in_place_editor dom_id(@user_profile),   :url => user_profile_url(@user_profile),   :options => "{ method:'put' }",   :with => "'jobtitle='+escape($F(Form.findFirstElement(form)))" %>    `

The magic here is in the `:with` option in the `in_place_editor` tag. We are leveraging the `callback` option in the [Ajax.InPlaceEditor](http://wiki.script.aculo.us/scriptaculous/show/Ajax.InPlaceEditor), which creates a function that will be called just before the request is sent to the server. The Rails helper only passes one parameter to the callback function that is a pointer to the HTML form element, we need to utilize a little Javascript to look up the value of the in place input field.

Now, our controller will receive a parameter with the correct name in the request. Although I did not do it here, our controller code could also be made to handle arbitrary parameter names in the `#update` action.