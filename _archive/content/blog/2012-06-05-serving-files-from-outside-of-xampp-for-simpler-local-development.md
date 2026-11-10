---
layout: post
title: Serving Files from Outside of XAMPP for Simpler Local Development
date: 2012-06-05 15:41:01.000000000 -05:00
type: post
parent_id: '0'
published: true
password: ''
status: publish
categories: []
tags: []
meta:
  _edit_last: '404795'
  _wpas_skip_twitter: '1'
author: jkahn
---
I recently started working with Aptana (customized build of Eclipse) for PHP and web development and wanted to simplify publishing to the local XAMPP server I use for development.  Copying files back and forth was fun, but there is an easier way...

Using Apache virtual hosts, you can easily setup a second document root to serve content directly from your Aptana/Eclipse workspace (I'm on Windows, but same will work for any OS):

1.  Open C:\\xampp\\apache\\conf\\extra\\httpd-vhosts.conf in your favorite text editor.
2.  Uncomment (remove the "#") line 19 - "NameVirtualHost \*:80"
3.  Uncomment the block of XML starting at line 27 to read as follows:  
    `    <VirtualHost *:80>   DocumentRoot "C:\your-aptana-workspace-directory"   ServerName workspace.localhost   <Directory "C:\your-aptana-workspace-directory">   Order allow,deny   Allow from all   </Directory>   ErrorLog "logs/workspace.localhost-error.log"   CustomLog "logs/workspace.localhost-access.log" combined   </VirtualHost>    `
4.  Open C:\\Windows\\System32\\drivers\\etc with Notepad, running as Administrator.  (This is for Win7, hosts file exists elsewhere on other systems.)
5.  Enter the following and save:

`    127.0.0.1 localhost workspace.localhost    `

Restart XAMPP and browse to http://workspace.localhost/your-project-name and you should be good to go. Simple.

**Update:** After reviewing, I noticed that you will also need to add a second virtual host so that localhost continues to respond as previously.

`    <VirtualHost *:80>   DocumentRoot "C:\xampp\htdocs"   ServerName localhost   <Directory "C:\xampp\htdocs">   Order allow,deny   Allow from all   </Directory>   ErrorLog "logs/error.log"   CustomLog "logs/access.log" combined   </VirtualHost>    `