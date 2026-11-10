---
layout: post
title: Finally...A Working LCDS Development Environment!
date: 2007-10-31 19:48:36.000000000 -05:00
type: post
parent_id: '0'
published: true
password: ''
status: publish
categories:
- Flex
tags: []
author: jkahn
---
I think (and hope) that I finally have a working, stable environment for LiveCycle Data Services development. In my previous attempts, I have been plagued by Out of Memory errors (Eclipse 3.3 + Flex Builder 3 beta 2), strange “Unknown” problems (Eclipse 3.3 + Flex Builder 2), and missing plug-ins (Flex Builder 3 beta 2 stand alone).

My current approach is based on a great article titled [Eclipse WTP + JBoss + Flex Builder + FDS Dev Environment Tutorial](http://brianmriley.com/blog/?p=59). In this case, the developer built his environment using slightly older versions of the tooling than I preferred, so I took a stab at building the environment with the following:

*   [Eclipse WTP 1.5.5](http://archive.eclipse.org/webtools/downloads/drops/R1.5/R-1.5.5-200708291442/)
*   [JBoss 4.0.5 GA](http://labs.jboss.com/downloading/?projectId=jbossas&url=http://sourceforge.net/project/showfiles.php?group_id=22866&package_id=16942&release_id=456223)
*   [Flex Builder 3 beta 2](http://labs.adobe.com/technologies/flex/flexbuilder3/)
*   [LiveCycle Data Service 2.5](http://www.adobe.com/products/livecycle/dataservices/) (formerly known as Flex Data Services or “FDS”)
*   [Peter Martin’s FDS Project Facet 2.0.1](http://weblogs.macromedia.com/pmartin/archives/2007/02/fds_plugin_v2.cfm)

You might notice that Eclipse WTP and JBoss are not the latest and greatest as of this writing (in the case of Eclipse WTP, the latest is 2.0.1 and JBoss is 4.2.2). I made both of these choices for a reason. First, I had trouble running WTP 2 (built on Eclipse 3.3) with Flex Builder 3b2 earlier, so I wanted to avoid it initially. As for JBoss, the aforementioned tutorial points out that the Eclipse plug-in associated with the 4.2 version is a memory and CPU hog – a problem I had with my earlier trials also.

I am not going to go into full detail on set-up and configuration of the development environment here, because the development environment tutorial does a tremendous job there. Instead, I will point out a few, albeit minor, differences as well as a few key points:

*   I installed my environment at “C:\\LCDSEnv,” so pathes listed below will differ from the tutorial.
*   Memory setting changes are a must for both Eclipse and JBoss:
*   Eclipse (C:\\LCDSEnv\\eclipseWTP\\eclipse.ini)  
    
    > `-vmargs   -Xms256m   -Xmx512m   -XX:MaxPermSize=256m   -XX:PermSize=128m`
    
*   JBoss (C:\\LCDSEnv\\jboss\\bin\\run.bat):  
    
    > `set JAVA_OPTS=%JAVA_OPTS% -Xms256m -Xmx740m`
    
*   Utilize Peter Martin’s plugin instead of building your application based on the sample WAR file provided by LCDS.
*   Do not deploy “flex.war” from the LCDS installation to your appication server (I found a tutorial that stated otherwise and all this will do is cause a port conflict and unnecessary headaches).

Now that I have a working environment, I can start to integrate my previously built Java application (Spring + Hibernate + FDS) with my Flex frontend. I will document my efforts in future posts.

**References**

*   [Eclipse WTP + JBoss + Flex Builder + FDS Dev Environment Tutorial](http://brianmriley.com/blog/?p=59)