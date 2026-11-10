---
layout: post
title: Rotating Logs for Rails on Passenger (Mac)
date: 2013-08-05 18:11:02.000000000 -05:00
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
  geo_public: '0'
  publicize_reach: a:2:{s:7:"twitter";a:1:{i:944212;i:14;}s:2:"wp";a:1:{i:0;i:4;}}
  publicize_twitter_user: joshuaakahn
  _wpas_done_944212: '1'
  _publicize_done_external: a:1:{s:7:"twitter";a:1:{i:193406412;b:1;}}
  _oembed_8b34a1d70de32be3a647848e58b809ce: "{{unknown}}"
author: jkahn
---
Like many Linux utilities not included on Mac OS X, Homebrew can provide logrotate to more effectively manage large log files. Setup:

1.  brew install logrotate
    
2.  Once installation is complete, create a configuration file for logrotate. I chose to use the same configuration defined here: [http://overstimulate.com/articles/logrotate-rails-passenger](http://overstimulate.com/articles/logrotate-rails-passenger) and named the file "logrotate.conf".
3.  We can now kick logrotate in to gear:
    
    /usr/loca/sbin/logrotate -f -s logrotate.status logrotate.conf
    

Note that in the above, I defined explicitly where to stick the logrotate status file so that it is owned by the current user and not reliant on sudo, etc.