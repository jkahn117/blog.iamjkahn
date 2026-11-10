---
layout: post
title: Getting Started with Adobe LiveCycle Data Services and Java
date: 2007-10-30 15:03:22.000000000 -05:00
type: post
parent_id: '0'
published: true
password: ''
status: publish
categories:
- Data Services
- Flex
tags: []
meta: {}
author: jkahn
---
**Update**: Unfortunately, it didn’t take much longer before this configuration ran into memory and other problems. I am looking into other options that are more robust.

Over the past few days, I’ve been experimenting with Adobe LiveCycle Data Services and Java to build a Java-backed Flex application. Over the next few posts, I will chronicle my experiences in the hopes of others avoiding some of the pitfalls I have encountered.

**Setup**

To get started, we’ll set-up and configure our development environment. In order to support development of both the client (Flex) and server (Java), I wanted to configure my IDE to handle both Flex and Java EE.

_Note:_ I always like to use the latest and greatest, but Flex Builder 3 beta 2 and Eclipse 3.3 do **not** play nicely together. This configuration led to an “Out of Memory” error every twenty minutes or so, which became unmanageable. The approach I followed utilizes Flex Builder 2 with Eclipse 3.3, this is not a support configuration, but it is done in a way that allows you to easily disable the Flex Builder features if desired.

Software

*   [Eclipse 3.3 for Java EE Developers](http://www.eclipse.org/downloads/download.php?file=/technology/epp/downloads/release/20070927/eclipse-jee-europa-fall-win32.zip)
*   [Flex Builder 2](http://www.adobe.com/products/flex/flexbuilder/) (free 30 day trial available)
*   [LiveCycle 2.5.x](http://www.adobe.com/products/livecycle/dataservices/)
*   Flex SDK 2.01 hotfix 2 (included in the above FB distribution)

Installation

1.  Download all of the above packages.
2.  Extract Eclipse to a known location. I used “C:\\eclipse3.3”
3.  Install Flex Builder 2 at “C:\\Program Files\\Adobe\\Flex Builder 2” as the _stand alone_ version, not the plug-in
4.  Install LiveCycle Data Services at “C:\\Program Files\\Adobe\\lcds”

Configure Eclipse

Out of the box, Flex Builder 2 does not work with Eclipse 3.3. A [detailed tutorial on how to configure Eclipse to use Flex Builder 2](http://blog.aerothread.net/bumble/2007/09/26/how-install-flexbuilder-2-under-eclipse-3.3) is available, but the following is the process that I utilized:

1.  Create a new Eclipse extension:
    1.  Create a new directory “C:\\eclipse3.3\\extensions” and a second directory “C:\\eclipse3.3\\extensions\\eclipse”
    2.  In this directory, create an empty “.eclipseextension” file (_hint:_ from a command prompt, enter “echo > .eclipseextension”)
    3.  Create two additional directories in the new eclipse directory: “plugins” and “features”
    4.  In Eclipse, select **Help > Software Updates > Manage Configuration…**
    5.  In the right panel, click on “Add an Extension Location”
    6.  Navigate to “C:\\eclipse3.3\\extensions” and click “Ok”
    7.  Close Eclipse
2.  If you have a license for Flex Builder 2, you should launch Flex Builder and enter the license key now. You can then close FB.
3.  We will now merge Flex Builder into Eclipse:
    1.  Copy “C:\\Program Files\\Adobe\\Flex Builder 2\\configuration\\com.adobe.flexbuilder.”
    2.  Copy “C:\\Program Files\\Adobe\\Flex Builder 2\\features\\com.adobe.flexbuilder.\*” to your extension feature directory “C:\\eclipse3.3\\extensions\\eclipse\\features.”
    3.  Copy “C:\\Program Files\\Adobe\\Flex Builder 2\\features\\com.adobe.flexbuilder.\*” to your extension plugins directory “C:\\eclipse3.3\\extensions\\eclipse\\plugins.” _Note:_ There are directories and jar files that need to be copied.
4.  Finally, restart Eclipse via the clean option (open a command prompt at “C:\\eclipse3.3” and enter “eclipse – – clean”). This forces a reload of all Eclipse plugins.

You can verify that Flex Builder capabilities have been installed by checking if the “Flex Development” perspective is available (**Window > Open Perspective > Other**).

Finally, we will install Peter Martin’s outstanding [FDS plugin](http://weblogs.macromedia.com/pmartin/archives/2007/01/fds_plugin_2_be.cfm), which we can use to generate application skeletons for LCDS projects:

1.  [Download](http://weblogs.macromedia.com/pmartin/eclipse/com.adobe.flex.enterprise.site.zip) the plugin
2.  Launch Eclipse (if not already open)
3.  Select **Help > Software Updates > Find and Install**
4.  Select **Search for new features to install**
5.  Click **New Archived Site**
6.  Select the plugin ZIP file you downloaded
7.  Click **Finish**
8.  Check the feature
9.  Complete the wizard and restart Eclipse when prompted

I’ve been running this configuration for some time now and it seems to be stable (i.e. no Out of Memory errors). I will post updates with any glitches that need to be fixed.