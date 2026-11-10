---
layout: post
title: Flex Custom Preloader
date: 2007-12-18 17:00:43.000000000 -06:00
type: post
parent_id: '0'
published: true
password: ''
status: publish
categories:
- Flex
tags: []
meta:
  _oembed_8f718db0faa5985309f997d1dfe56f98: "{{unknown}}"
  _oembed_0eba3ff87e5fc65fa82ab758d8417f99: "{{unknown}}"
  _oembed_e89651e0e40b3694ed06861fded5837b: "{{unknown}}"
  _oembed_c79630e43910687f6832850c8b87b9be: "{{unknown}}"
  _oembed_f1924dfd3dc3172828caff223629c53a: "{{unknown}}"
  _oembed_4299254e985820d8d9bbb4aca0216789: "{{unknown}}"
  _oembed_bf14e65b01d37f0886c6c6df46224c30: "{{unknown}}"
  _oembed_f408dcffefb14a20b4aa68c834315d0f: "{{unknown}}"
  _oembed_3a9478ad3c78f9d177fad0ce2a288368: "{{unknown}}"
author: jkahn
---
I was getting a little tired of the aqua loading screen that appears by default in all of my Flex applications, so I took a stab at building a custom preloader. A Flex application is really a two frame Flash movie, with the first frame containing all of the initialization and the second the application itself. The preloader is part of the initialization frame and we can use it to create a custom loading screen for our application. I found a few articles on the topic, with the most promising being this one from [Ted on Flex](http://www.onflex.org/ted/2006/07/flex-2-preloaders-swf-png-gif-examples.php).

I wanted my custom preloader to contain two elements: (1) a graphical logo and (2) a progress bar. Ted's article provides information on loading the graphic (a PNG) by utilizing a subclass of `flash.display.Loader`. Because our preloader will perform its actions during the initialization frame, those handy graphical Flex classes (e.g. `Image`, `ProgressBar`) will not be available to us. Instead, we will need to create these items on our own.

If you would like to follow along, I have posted my [complete source code](http://www.box.net/shared/7k4pn7oj2i). Please note that I embedded an MP3 in the application purely to increase its download size. I would recommend that you include a 2-3MB MP3 in your application, otherwise, the progress will not be noticeable.

To get started, we will extend the `mx.preloaders.DownloadProgressBar` class as suggested by Ted. As explained in the [Flex documentation](http://livedocs.adobe.com/flex/201/langref/mx/preloaders/DownloadProgressBar.html), the `DownloadProgressBar` can be extended to provide user feedback on the download and initialization phases of our Flex application. Also of note is that we need to implement it as an ActionScript class and not in MXML as the latter loads to slowly at runtime.

The `CustomPreloader` class is very much like Ted's sample code, the exception being that as the SWF is loaded, we calculate the percent complete and update the progress value in our custom loading screen (`LoadScreen`):

```
    private function SWFDownloadProgress(event : ProgressEvent) : void
    {
        var prog : Number = event.bytesLoaded / event.bytesTotal \* 100;
        if (this.loader)
            this.loader.progress = prog;
     }
```

On initialization of the `CustomPreloader`, we also utilize a `Timer` to ensure the `stage` is available before we try to add and position the load screen:

```
    override public function initialize() : void
    {
        super.initialize();

        this.loader = new LoadScreen();
        this.addChild(this.loader);

        this.\_timer = new Timer(1);
        this.\_timer.addEventListener(TimerEvent.TIMER, handleTimerTick);
        this.\_timer.start();
    }
```

From here, we extend `flash.display.Loader` to provide the utility for loading our logo image and drawing the progress bar. We do this by drawing both the logo and the progress bar on screen by creating a `BitMap` and then using the `PNGEncoder` to write the image to the screen as a PNG image. We are actually creating an animation on the fly here:

```
    public function refresh() : void
    {
        this.\_logoData = this.draw();
        var encoder : PNGEncoder = new PNGEncoder();
        var bytes   : ByteArray  = encoder.encode(this.\_logoData);
        this.loadBytes(bytes);
    }

    private function draw() : BitmapData
    {
        // create bitmap data to create the data
        var data : BitmapData = new BitmapData(this.width, this.height, true, 0);

        // draw the progress bar
        var s : Sprite = new Sprite();
        var g : Graphics = s.graphics;

        // draw the bar background
        g.beginFill(\_BarBackground);
        g.lineStyle(2, \_BarOuterBorder, 1, true);
        var barX : int = (this.width - \_BarWidth) / 2;
        var barY : int = \_TopMargin + \_LogoHeight + \_Padding;
        g.drawRoundRect(barX, barY, \_BarWidth, \_BarHeight, 2);
        var containerWidth : Number = \_BarWidth - 4;
        var progWidth : Number = containerWidth \* this.progress / 100;
        g.beginFill(\_BarColor);
        g.lineStyle(1, \_BarInnerColor, 1, true);
        g.drawRect(barX + 1, barY + 1, progWidth, \_BarHeight - 3);
        data.draw(s);

        // draw the logo
        data.draw(this.\_logo.bitmapData, null, null, null, null, true);
        return data;
    }
```

To bring everything together, we are utilizing a `Timer` instance in our `CustomPreloader` class to update and redraw the progress bar on each timer tick. This calls the `refresh()` method in `LoadScreen`, which then redraws the an updated progress image. Now, we just need to add the following to our as an attirbute of the `Application` tag in our application MXML file to utilize the our custom preloader:

```
preloader="iamjosh.samples.preloader.CustomPreloader"
```

Finally, let's change the background color of the application to match our logo a little better. Just add the following Flex compiler argument:

``` css
  -default-background-color #FFFFFF
```

**References**

*   [http://www.onflex.org/ted/2006/07/flex-2-preloaders-swf-png-gif-examples.php](http://www.onflex.org/ted/2006/07/flex-2-preloaders-swf-png-gif-examples.php)
*   [http://www.onflex.org/ted/2006/04/custom-flex-2-builder-compiler-options.php](http://www.onflex.org/ted/2006/04/custom-flex-2-builder-compiler-options.php)
*   [http://flexiblemyself.blogspot.com/2007/10/custom-preloader.html](http://flexiblemyself.blogspot.com/2007/10/custom-preloader.html)

_Update:_ I just found an article that accomplishes a similar task to my own buried in the comments of one of Ted's articles. I was a little happier with how he handled the graphics of drawing the progress bar, so I have updated my code and added the article as a reference.