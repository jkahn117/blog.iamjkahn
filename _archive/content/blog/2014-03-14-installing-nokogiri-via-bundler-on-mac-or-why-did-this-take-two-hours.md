---
layout: post
title: Installing Nokogiri via Bundler on Mac (or why did this take two hours?)
date: 2014-03-14 21:00:00.000000000 -05:00
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
  _wpas_done_944212: '1'
  publicize_twitter_user: joshuaakahn
  publicize_twitter_url: http://t.co/lWURirjT00
  _publicize_done_external: a:1:{s:7:"twitter";a:1:{i:193406412;b:1;}}
  _wpas_skip_944212: '1'
author: jkahn
---
If this post saves one person the headache of several hours of trying to build Nokogiri via Bundler on a Mac, maybe my time wasn't wasted, but it was painful.

The setup...  
Trying to install Nokogiri 1.6.1 as a dependency for other gems via Capistrano's bundle:install task, I continually ran into "Failed to build gem native extension" error. Scrolling through the errors, the one item that stuck out was "You have to install development tools first."

Although 100% certain my server had Xcode Command Line tools installed (it was recently updated at noted in the App Store), I reinstalled manually and tried to deploy again. Same error.

I then proceeded down the path of using Homebrew to install the various Nokogiri dependencies (e.g. libxml2, libxslt). Deploy...build...fail.

I ran "gem install nokogiri" locally on the server. Build...success. Tried to deploy again...build...fail.

Finally, I dug up the make log for Nokogiri (path below for reference) where I noted a message indicating that "gcc-4.2" was not installed. gcc is installed, but the build script seems specific. Not finding a switch to change the name of gcc, I went brute force:

`sudo ln -s /usr/bin/gcc /usr/bin/gcc-4.2`

Deploy...build...success! Annoying problem, solved.

Better suggestions welcome.

Make log: /shared/bundle/ruby/2.0.0/gems/nokogiri-1.6.1/ports/x86\_64-apple-darwin13.1.0/ext/nokogiri/mkmf.log

**Update**  
After all that, I noticed a warning: "Nokogiri was built against LibXML version 2.8.0, but has dynamically loaded 2.9.1". After trying a few paths, I was able to rectify the warning via the steps in the comments of this [](http://stackoverflow.com/questions/6802410/warning-nokogiri-was-built-against-libxml-version-2-7-8-but-has-dynamically-lo "Stack Overflow question"):

1.  brew remove --force libxml2
2.  bundle config --delete build.nokogiri
3.  bundle exec gem uninstall nokogiri libxml-ruby
4.  bundle

The commenter notes that Nokogiri 1.6+ now bundle the necessary libraries so there is no need to use the Homebrew versions.