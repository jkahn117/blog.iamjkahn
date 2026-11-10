---
layout:	post
title:	"Inspecting Node.js Traffic with Charles"
date:	2016-07-18
---

  A good web debugging proxy like [Charles](https://www.charlesproxy.com/) can be incredibly valuable when building mobile or web apps that are intended to talk to others. Charles (and Fiddler) will automatically configure itself as a proxy for your browser traffic, but configuring it to work properly in other environments (especially those that require SSL) requires a bit more finesse.

Recently, I used [tunnel](https://github.com/koichik/node-tunnel), to push requests from a Node.js application through Charles in order to debug an issue. Below is a quick recap.

First, save the Charles Root Certificate (Help > SSL Proxying > Save Charles Root Certificate):

![](/images/1*X4qFk2B4tbSZgbaBOWdxTA.png)Save Charles Root Certificate (charles-ssl-proxying-certificate.pem) via Help menuNext, include tunnel in your application:

var tunnel = require("tunnel")Finally, before setting up any HTTPS requests, configure tunnel to utilize your proxy:

```
var tunnelAgent = tunnel.httpsOverHttp({  
 ca: [fs.readFileSync('charles-ssl-proxying-certificate.pem')],  
 proxy: {  
 host: '127.0.0.1',  
 port: 8888  
 }  
});
```

Launch Charles, run your application, and watch that network traffic flow in. Simple.

  