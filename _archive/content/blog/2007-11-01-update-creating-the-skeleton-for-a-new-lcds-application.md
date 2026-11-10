---
layout: post
title: 'Update: Creating the Skeleton for a New LCDS Application'
date: 2007-11-01 14:19:05.000000000 -05:00
type: post
parent_id: '0'
published: true
password: ''
status: publish
categories:
- Flex
tags: []
meta: {}
author: jkahn
---
First, the good news…my LCDS development environment and server have been running since yesterday afternoon (15+ hours) without a failure yet.  If you missed the set-up, check my earlier post [Finally…A Working LCDS Development Environment](http://iamjosh.wordpress.com/2007/10/31/finallya-working-lcds-development-environment/).

Since getting the development environment set-up, I’ve been working on building a sample LCDS application, which I will post on this site when finished.  The first step is building the application skeleton to support both Flex and Java development.  I posted an article on this earlier in the week ([Creating the Skeleton for a New LCDS Application](http://iamjosh.wordpress.com/2007/10/30/creating-the-skeleton-for-a-new-lcds-application/)), but my current approach turned out to be slightly different.  The major differences were: (1) included the web app in an EAR project for deployment and (2) utilized JBoss 4.0 instead of 4.2.

In the end, you should have a project structure similar to the following, with the exception of the Spring (applicationContext.xml) and Hibernate (hibernate.cfg.xml) configuration files.  These files were added as part of my web app development and I will cover their purpose in my next post.

![LCDS Application Structure](/assets/images/lcds-20application-20structure-small.jpg)

I also needed to modify my project’s Flex and Java compiler settings to get everything working properly.  In the project properties menu (right click on project name and select “Properties”), do the following:

1.  Select “Project Facets” and the click on the “Add/Remove Project Facets” button.
2.  Select the Java facet version and select “6.0.”  Java 6 is not necessary at this point, but some of the Hibernate code that I will be using requires it.
3.  Click “Finish”
4.  Select “Java Compiler” from the left hand menu and set the “Compiler Compliance Level” to 6.0.
5.  Select “Flex Compiler” from the left menu and set the “Flex SDK Version” to “Use the server’s SDK.”

You may notice that the server’s Flex SDK is version 2.0.1 and not 3.0.  Because of changes to resource bundle handling in 3.0, Flex will not compile our application as-is with the 3.0 SDK.  I am still working to resolve this issue, but for now, Flex 2.0 is sufficient for our purposes (please feel free to share insights via comments).

Next up, building the sample application.