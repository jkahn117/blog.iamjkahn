---
layout: post
title: 'Git: Easily Remove Multiple Files After Deletion'
date: 2013-08-19 16:43:28.000000000 -05:00
type: post
parent_id: '0'
published: true
password: ''
status: publish
categories: []
tags: []
meta:
  _publicize_done_external: a:1:{s:7:"twitter";a:1:{i:193406412;b:1;}}
  publicize_twitter_user: joshuaakahn
  _wpas_done_944212: '1'
  _edit_last: '404795'
  geo_public: '0'
  _wpas_skip_944212: '1'
author: jkahn
---
I almost always forget to `git rm <file>` before deleting it.  Here's a quick way to pull deleted files from a Git repository and remove them:

```
git rm $(git ls-files --deleted)
```