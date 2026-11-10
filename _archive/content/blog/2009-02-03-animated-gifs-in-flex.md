---
layout: post
title: Displaying Animated GIFs in Flex
date: 2009-02-03 23:03:54.000000000 -06:00
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
author: jkahn
---
This morning, I found myself wanting to add a nice-looking, but quick loading indicator into a Flex application. In the Ajax world, it's simple...just use an animated GIF that can be downloaded from any number of sites. In Flex, it's not quite that easy. The default `Image` component in Flex does not support animated images, nor does Flex itself.

A quick Google search turned up the [as3gif](http://code.google.com/p/as3gif/) library, which provides support for playing animated GIFs. The download did not include a SWC, so I pulled the source code into Flex Builder and quickly compiled one, which I then included in my Flex project.

To enable animated GIF images, I extended the `Image` component to utilize as3gif as follows:

``` java
package iamjosh.samples.components
{
	import flash.net.URLRequest;
	
	import mx.controls.Image;
	import mx.core.UIComponent;
	
	import org.gif.player.GIFPlayer;

	public class AnimatedGIFImage extends Image
	{
		private var \_gifImage  : UIComponent;
		
		public function AnimatedGIFImage()
		{
			super();
			this.\_gifImage  = new UIComponent();
		}
		
		override public function set source(value : Object) : void
		{
			if (!value is String)
			{
				throw new ArgumentError("Source must be of type String");
			}
			
			super.source = value;
		}
		
		override protected function createChildren() : void
		{
			super.createChildren();
			var player : GIFPlayer = new GIFPlayer();
			player.load(new URLRequest(this.source as String));
			this.\_gifImage.addChild(player);
		}
		
		override protected function updateDisplayList(unscaledWidth : Number, unscaledHeight : Number) : void
		{
			this.addChild(this.\_gifImage);
			super.updateDisplayList(unscaledWidth, unscaledHeight);
		}
	}
}
```

This class simply pulls in the source for the image and then utilizes the as3gif library. Using the `AnimatedGIFImage` component is as simple as:

```
<components:AnimatedGIFImage source="assets/images/loading.gif"/>
```

Although I have not tested it thoroughly, the class should also support the basic capabilities of the `Image` component as well.