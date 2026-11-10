---
layout: post
title: Creating the Skeleton for a New LCDS Application
date: 2007-10-30 15:43:00.000000000 -05:00
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
Before we can generate the skeleton for our new LCDS application, we need to identify where the data services package has been installed on your computer. To do this:

1.  Launch Eclipse
2.  **Window > Preferences…**
3.  Expand “Flex Data Services” and select “FDS Installations”
4.  Click the new button and edit the path to “C:\\Program Files\\Adobe\\lcds\\flex.war”
5.  Click OK

We will now utilize Peter Martin’s FDS Plugin (installation explained in my [previous post](http://iamjosh.wordpress.com/2007/10/30/getting-started-with-adobe-livecylce-data-services-and-java/)) to generate our application skeleton:

1.  **New > Project…**
2.  Expand “Flex Data Services” and select “Flex Data Services Project”
3.  Click Next
4.  Enter a project name (e.g. “HelloWorld”)
5.  In the Target Runtim area, you can click the new button to create a Server configuration on which to run your project. In my case, I will be using JBoss 4.2. Adobe explains how to [install LCDS as a web application](http://help.adobe.com/en_US/livecycle/es/lcds_installation.html#flexj2ee) on several platforms.
6.  Click Next
7.  On the Project Facets screen, you will need to change the version of the Dynamic Web Module (there is a small black arrow to the right of the version number) for it to work with the FDS Plugin.
8.  Click Next
9.  Accept the defaults and click Next
10.  On the “Flex Data Services” screen, you will need to select the Flex WAR that we installed above (probably “fds1”), you can accept all other defaults
11.  Click Finish

When the wizard finishes, you should have a brand new LCDS application ready to go that includes handling for both Flex (client) and Java (server) components.

In future posts, I hope to explore the development of our application a bit further.