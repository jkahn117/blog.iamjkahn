---
layout: post
title: Debugging LCDS in Eclipse
date: 2007-11-05 21:08:19.000000000 -06:00
type: post
parent_id: '0'
published: true
password: ''
status: publish
categories:
- Data Services
- Flex
tags: []
meta:
  _oembed_a2807cfc5d51ba95ae40aa6153dc25c8: "{{unknown}}"
  _oembed_0e379c728895184bd949a67255d0fc75: "{{unknown}}"
author: jkahn
---
I found a very helpful tidbit this afternoon…how to via AMF traffic as part of your debug logging stream. In the WEB-INF/flex/services-config.xml file, change “Error” to “Debug” in the following line:

``` xml
    <logging>
        <target class="flex.messaging.log.ConsoleTarget" level="Debug">
        …
    </logging>
```

After restarting your application, you should see the console fill with output such as:

```
15:06:11,652 INFO  \[STDOUT\] \[Flex\] Deserializing AMF/RTMP request
Version: 0
  (Command method=connect (2) trxId=1.0)
    (Object #0)
      app = ""
      flashVer = "WIN 9,0,60,235"
      swfUrl = "http://localhost:8080/LCDS-Sample/bin/Main.swf"
      tcUrl = "rtmp://localhost:2038"
      fpad = false
      capabilities = 15.0
      audioCodecs = 1639.0
      videoCodecs = 252.0
      videoFunction = 1.0
      pageUrl = "http://localhost:8080/LCDS-Sample/bin/Main.html"
      objectEncoding = 3.0
    false
    "nil"
```

**References:**

*   [http://weblogs.macromedia.com/dharfleet/archives/2006/08/debugging\_flex.cfm](http://weblogs.macromedia.com/dharfleet/archives/2006/08/debugging_flex.cfm)