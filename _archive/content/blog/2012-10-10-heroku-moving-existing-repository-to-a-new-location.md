---
layout: post
title: 'Heroku: Moving existing repository to a new location'
date: 2012-10-10 00:30:26.000000000 -05:00
type: post
parent_id: '0'
published: true
password: ''
status: publish
categories: []
tags: []
meta:
  _edit_last: '404795'
  _wpas_done_944212: '1'
  _publicize_done_external: a:1:{s:7:"twitter";a:1:{i:193406412;b:1;}}
author: jkahn
---
Faced this a few times now that I am on a new laptop...moving an existing repository and app to a new location. It's really a two step process:

1.  Pull the existing Git repo into the new location:
    
    git clone git@heroku.com:.git 
    
2.  Change the Heroku configuration on the existing repo (not sure if I explained that quite right):
    
    cd 
    git remote rm heroku (this may fail, no worries)
    git remote add heroku git@heroku.com:.git
    

You can also use

git remote -v

to understand what is being pushed where.