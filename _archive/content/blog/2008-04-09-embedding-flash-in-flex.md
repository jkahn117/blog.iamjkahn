---
layout: post
title: Embedding Flash in Flex
date: 2008-04-09 19:30:47.000000000 -05:00
type: post
parent_id: '0'
published: true
password: ''
status: publish
categories:
- Flex
tags: []
meta:
  _edit_last: '404795'
  _oembed_130220e53b273c3c4c6ac79cf4aab0f9: "{{unknown}}"
  _oembed_610db312718117618a1341bea5872e6c: "{{unknown}}"
  _oembed_aaf6de89cd82735c5320702f201e7dd2: "{{unknown}}"
  _oembed_739c26a466f2e87d8dd46084e6516fe9: "{{unknown}}"
  _oembed_3d91c299cc4614251167fc778fed17bb: "{{unknown}}"
  _oembed_06be104bce44366569c88770c8921117: "{{unknown}}"
author: jkahn
---
I recently ran into user interface design that included a component better built in Flash than Flex due to the high degree of interaction required (my time is short these days as well, so one of our designers will be building it). This raised the question of how to embed a Flash movie in a Flex application and enable interaction between the two.

This is actually fairly straightforward when working with Flash Player 9 and ActionScript 3. I started by building a very simple Flash component (I know nothing about Flash) - it simply contains a slider and a label that changes with the value of the slider:

[![](/assets/images/simple-flash-component.png)](http://iamjosh.files.wordpress.com/2008/04/simple-flash-component.png)

My goal is to embed this component in a simple Flex application that can read/display the current value of the slider.

Next, I created a new Flex application and included both the SWF and FLA file for my Flash component in the "src/assets" directory. I then used a `SWFLoader` to load the Flash component into the application and position it properly on the screen. I also added a few simple Flex components to display the currently selected value, etc.:

[![](/assets/images/flexflash.png)](http://iamjosh.files.wordpress.com/2008/04/flexflash.png)

Now, we need to wire everything together. To do this, we need access to the Flash component from the `SWFLoader`via the content property. With access to the component, we have access to public properties/methods, can listen for events, etc. In fact, to synchronize the currently selected value between Flash and Flex, the slider in the Flash component will dispatch an event on change that the Flex component listens for. Pertinent code snippets:

**Flash Action Code** (remember, I'm not a Flash programmer):

```
slider1.addEventListener(SliderEvent.CHANGE,dispatchSliderEvent);
function dispatchSliderEvent(evt : SliderEvent) : void
{
    dispatchEvent(new SliderEvent(SliderEvent.CHANGE, evt.value, null, null));
}
// returns the current value of the slider
function get sliderValue() : Number
{
    return slider1.value;
}
```

**Flex**

```
<mx:Script>
<!\[CDATA\[
    import mx.events.SliderEvent;
    private var \_mainTimeline : \*;
    \[Bindable\] private var \_sliderValue  : Number = 0;

    private function swfLoaded(event:Event) : void
    {
        this.\_mainTimeline = this.swfLoader.content;
        this.\_mainTimeline.addEventListener(SliderEvent.CHANGE, updateValue);
        this.updateValue();
    }

    private function updateValue(evt : Event=null) : void
    {
        this.\_sliderValue = this.\_mainTimeline.sliderValue;
    }
\]\]
</mx:Script>

<mx:SWFLoader id="swfLoader" y="73" x="10" source="assets/Simple Flash Component.swf"
    complete="swfLoaded(event);"/>
```

Two items of note:

*   I did not explicitly assign a type to the `_mainTimeline` object in order to be able to arbitrarily call methods on it (e.g. no compile-time checking)
*   There is a strange problem in trying to directly call the `_mainTimeline.sliderValue()` method in which the Flash component did not render properly, hence why I used an intermediate variable (`_slideValue`).

That's it, it really is fairly straightforward. Although I have not tested it yet, Flex should be able to set values in the Flash component in much the same way.

**References**

*   [http://seantheflashguy.com/blog/2007/09/27/flash-cs3-and-flex-2-communication-using-actionscript-30/](http://seantheflashguy.com/blog/2007/09/27/flash-cs3-and-flex-2-communication-using-actionscript-30/)
*   [http://www.actionscript.org/resources/articles/501/1/Flex-2-and-Flash-9-Together/Page1.html](http://www.actionscript.org/resources/articles/501/1/Flex-2-and-Flash-9-Together/Page1.html)