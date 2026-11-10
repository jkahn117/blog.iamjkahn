---
layout: post
title: 'Ransack: Search with Multiple Checkboxes (Rails)'
date: 2014-03-07 21:47:23.000000000 -06:00
type: post
parent_id: '0'
published: true
password: ''
status: publish
tags: rails
meta:
  _edit_last: '404795'
  publicize_twitter_url: http://t.co/3dG20cL7MP
  publicize_twitter_user: joshuaakahn
  _wpas_done_944212: '1'
  _publicize_done_external: a:1:{s:7:"twitter";a:1:{i:193406412;b:1;}}
  geo_public: '0'
  _wpas_skip_944212: '1'
author: jkahn
---
I've been using the outstanding [Ransack](https://github.com/activerecord-hackery/ransack) gem to enable search for a recent project. Ransack provides a tremendous amount of flexibility in a straightforward manner, but it took me a bit to understand how to search a single field across multiple values selected via checkboxes. My approach follows.

(Note that the field I was searching contained a serialized array of data, not to make life more difficult)

To start, a simplified model:  
``` ruby 
class Zoo < ActiveRecord::Base  
has\_many :animals  
end

class Animal < ActiveRecord::Base  
belongs\_to :zoo # we'll assume an animal can only belong to one zoo  
validates\_presence\_of :name  
end  
```

Next, the controller, which is pretty much out-of-the-box from the Ransack documentation:  

``` ruby
class ZoosController < ApplicationController  
def search # or index  
@search = Zoo.search(params\[:q\])  
@zoos = @search.result(distinct: true)  
end  
end  
```

And finally, the magic is really in the view:  

```
<%= search_form_for @search, url: search_zoos_url do |f| %>  
<% Animal.all.uniq.each do |animal| %>  
# the check_box helper will not work as effectively here  
<%= check_box_tag('q[animals_name_cont_any][]', animal.name) %>  
<%= animal.name %>  
<% end %>  
<%= f.submit "Search" %>  
<% end %>  
```

The key is the name of the check box field. We are passing an array and also using Ransack's `cont_any` predicate, which searches for any records whose name field contains one of the selected names.