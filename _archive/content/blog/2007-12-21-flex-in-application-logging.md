---
layout: post
title: Flex in Application Logging
date: 2007-12-21 21:43:51.000000000 -06:00
type: post
parent_id: '0'
published: true
password: ''
status: publish
categories:
- Flex
tags: []
meta:
  _oembed_91d396e73156b5683d4301397cd50c7f: "{{unknown}}"
  _oembed_8dcab96aaa9dfdcfa78855c1078007af: "{{unknown}}"
  _oembed_a6c38a83ee4e9c74ca957c26bac6f047: "{{unknown}}"
  _oembed_4efee2532fdcc370205b42c0b214e10e: "{{unknown}}"
  _oembed_6bdffcf62da1eceff83cc69522305ee2: "{{unknown}}"
author: jkahn
---
For an LCDS application that we are building, I wanted to be able to display log messages to the screen, such as "Sending request to server" and "Received server response: OK." Although this has little to do with actual functionality, I wanted to document my efforts to create this component.

To utilize the Flex logging framework, we need to provide a Logger and a Log Target. The Logger, of course, does the logging itself based on two factors: (1) its category and (2) the logging level. This is similar to the operation of the popular Java logging framework [Log4J](http://logging.apache.org/log4j/). The Log Target defines where the messages are written. Flex comes with the `TraceTarget` predefined - this is the target for all `trace()` statements. For this example, I will also provide an MXML component that can be used to display log messages on screen.

First, the `Logger` class:

```
    public class Logger
    {
        //~ Instance Attributes -----------------------------------------------
        private var logger : ILogger;

        //~ Constructor -------------------------------------------------------
        /\*\*
         \* SingletonEnforcer parameter ensures that only the getInstance
         \* method can create an instance of this class.
         \*/
        public function Logger(category : String, enforcer : SingletonEnforcer) : void
        {
            this.logger = Log.getLogger(category);
        }

        //~ Methods -----------------------------------------------------------
        public static function getInstance(category : String) : Logger
        {
            return new Logger(category, new SingletonEnforcer());
        }

        public static function addTarget(target : ILoggingTarget) : void
        {
            Log.addTarget(target);
        }

        public static function removeTarget(target : ILoggingTarget) : void
        {
            Log.removeTarget(target);
        }

        public function debug(message : String) : void
        {
            this.logger.debug(message);
        }

        // other logging methods by level (e.g. warn, error)

    }
```

With our `Logger` class in place, we can now define a `LogTarget` class that defines a `TextArea` to which the log messages will be written:

```
    // be sure to use the mx\_internal namespace (and import it)
    import mx.core.mx\_internal;
    use namespace mx\_internal;

    public class LogPanelTarget extends LineFormattedTarget
    {
        private var console : TextArea;

        public function LogPanelTarget(console : TextArea)
        {
            super();
            this.console = console;
        }

        override mx\_internal function internalLog(message : String) : void
        {
            this.console.text += message + "\\n";
            }
        }
    }
```

Finally, our `LogPanel` MXML component brings everything together by (1) instantiating a new `Logger` and (2) providing a TextArea for log messages:

```
<mx:Canvas xmlns:mx="http://www.adobe.com/2006/mxml"
        width="300" height="300" initialize="init()">
    <mx:Script>
        <!\[CDATA\[
            import mx.logging.Log;
            import mx.logging.LogEventLevel;
            import mx.collections.ArrayCollection;

            public  var open   : Boolean = true;
            private var target : LogPanelTarget;
            \[Bindable\] private var targets : ArrayCollection;

            private function init() : void
            {
                this.target = new LogPanelTarget(output);
                // here we define which categories are written to our target
                this.target.filters = \["iamjosh.samples.\*"\];
                // and here which log levels are written
                this.target.level   = LogEventLevel.ALL;
                this.target.includeCategory = true;
                this.target.includeTime = true;
                Logger.addTarget(this.target);
            }

            private function setVerticalPosition() : void
            {
                this.output.verticalScrollPosition =
                        this.output.maxVerticalScrollPosition + 1;
            }
        \]\]>
    </mx:Script>

    <mx:TextArea  id="output" x="0" y="0" width="100%" height="100%"
            editable="false" updateComplete="this.setVerticalPosition()"
            verticalScrollPolicy="on"/>
</mx:Canvas>
```

We can now include the `LogPanel` component anywhere we wish and log messages from anywhere in our code within the category "iamjosh.samples.\*" will be written to it. For example:

```
    public class Foo
    {
        // notice that we provide a category here, this determines if the log
        // message will be written to a give LogTarget
        private var logger : Logger = Logger.getInstance("iamjosh.samples.Foo");

        public function logSomething() : void
        {
            this.logger.debug("I log because I can");
        }
    }
```

That's it. Although I would prefer to define where my log messages go external to the code, Flex's logging framework is fairly straightforward and easy to work with.

**References**

*   [http://livedocs.adobe.com/flex/2/docs/wwhelp/wwhimpl/common/html/wwhelp.htm?context=LiveDocs\_Parts&file=00001533.html](http://livedocs.adobe.com/flex/2/docs/wwhelp/wwhimpl/common/html/wwhelp.htm?context=LiveDocs_Parts&file=00001533.html)