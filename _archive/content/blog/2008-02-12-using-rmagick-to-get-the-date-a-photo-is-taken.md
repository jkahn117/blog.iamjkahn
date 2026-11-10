---
layout: post
title: Using RMagick and EXIF to get the date a photo is taken in Rails
date: 2008-02-12 04:20:02.000000000 -06:00
type: post
parent_id: '0'
published: true
password: ''
status: publish
categories:
- Rails
tags: []
meta: {}
author: jkahn
---
Wow, it's been a long time since my last Rails-related post (actually months). That's because it's been about that long since I've done much in the way of Rails development. Over the past few weeks, I've been rebuilding my personal website in Rails 2.0, which (per my wife's requirements) will include a photo gallery.

My `Photo` class utilized attachment\_fu to easily support image uploads. I also wanted to be able to display the date the photo _was taken_, not the date is was uploaded. This information is encoded in the JPEG image file by the digital camera, we just need to pull it out. Although there are several methods to do this, I chose to use RMagick as it is already included in my application for attachment\_fu. We can use the `get_exif_by_entry` method to get this (as well as a great deal of other) information:

``` ruby
class Photo  < ActiveRecord::Base
  @@exif\_date\_format = '%Y:%m:%d %H:%M:%S'
  cattr\_accessor :exif\_date\_format

  # some stuff

  def date\_taken
    photo = Magick::Image.read(full\_filename).first
    # the get\_exif\_by\_entry method returns in the format: \[\["Make", "Canon"\]\]
    date  = photo.get\_exif\_by\_entry('DateTime')\[0\]\[1\]
    return unless date
    DateTime.strptime(date, exif\_date\_format)
  end

  #some more stuff
end
```

That's it. Read the [EXIF](http://www.exif.org/) information, provide it's format, and create a new `DateTime` object.