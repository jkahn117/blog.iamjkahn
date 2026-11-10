---
layout: post
title: Rails Asset Pipeline + Bootstrap 3 Fonts
date: 2014-02-05 19:14:45.000000000 -06:00
type: post
parent_id: '0'
published: true
password: ''
status: publish
categories:
- Rails
tags: []
meta:
  _edit_last: '404795'
  publicize_twitter_user: joshuaakahn
  publicize_twitter_url: http://t.co/k8xM5iVWLI
  _wpas_done_944212: '1'
  _publicize_done_external: a:1:{s:7:"twitter";a:1:{i:193406412;b:1;}}
  _oembed_d8bce27750fb9d5da4d6ec5ca5fbe7cc: "{{unknown}}"
  _oembed_a32f58aa38b529c3115dcf99a7c4e790: "{{unknown}}"
  _oembed_70dce6ceab57ae3887adfef964f623ca: "{{unknown}}"
  _oembed_31b302be7fd17466f1a9f69cb679b3ca: "{{unknown}}"
  _oembed_5f2bd4614b54a841f5bf78913994d33a: "{{unknown}}"
author: jkahn
---
I admit it, I find the Rails Asset Pipeline confusing at times (as do seemingly many others judging from Stackoverflow and elsewhere).  Successfully adding the Bootstrap 3 glyphicon fonts took some trial-and-error amongst the various solutions I found as many still resulted in not found errors.

While there may be a better way, I found this approach most effective:

1.  Copy the contents of the Bootstrap "dist/fonts" directory to the "vendor/assets/fonts" directory (you will need to create a "fonts" directory.  Bootstrap's minified JavaScript and CSS files can be copied to the appropriate directly in "vendor/assets" as well.
2.  Add the following to "config/application.rb" within the application config block:
    
```
config.assets.paths << Rails.root.join('vendor', 'assets', 'fonts')

config.assets.precompile += %w(.svg .eot .woff .ttf)
```
    
3.  Utilizing SASS (or LESS) here is useful in order to leverage built-in asset pipeline helper methods.  In a common file used across your site, include the following:
    
``` css
@font-face {
  font-family: 'Glyphicons Halflings';
  src: font-url('glyphicons-halflings-regular.eot');
  src: font-url('glyphicons-halflings-regular.eot?#iefix') format('embedded-opentype'),
  font-url('glyphicons-halflings-regular.woff') format('woff'),
  font-url('glyphicons-halflings-regular.ttf') format('truetype'),
  font-url('glyphicons-halflings-regular.svg#glyphicons-halflingsregular') format('svg');
}
```
    

Thus far, Not Found errors seem to have been eliminated.  If there is a better way, please comment.