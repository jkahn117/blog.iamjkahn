---
layout: post
title: Adding Ant to Flex Builder 3
date: 2008-08-11 15:46:57.000000000 -05:00
type: post
parent_id: '0'
published: true
password: ''
status: publish
categories:
- Flex
tags: []
meta:
  _edit_last: '404795'
author: jkahn
---
I wanted to use [Cairngen](http://code.google.com/p/cairngen) in a recent project and quickly noticed that the standalone version of Flex Builder 3 does not have Ant support available by default.  Getting it set-up is pretty easy though:

1.  In Flex Builder, Help -> Software Updates -> Find and Install...
2.  Select "Search for new features to install" and click Next
3.  Pick "The Eclipse Project Updates" and click Finish
4.  Expand "The Eclipse Project Updates" and "Eclipse 3.3.2"
5.  Select "Eclipse Java Development Tools 3.3.2..." and click "Finish"
6.  When prompted, select "Install All"
7.  Restart Flex Builder

When Flex Builder starts up again, you will have Ant support available (e.g. any build.xml files will have a little ant on the icon).  You can also verify by selecting Window -> Other Views... and checked if an Ant directory exists.