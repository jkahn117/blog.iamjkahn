---
layout: post
title: Paperclip without Form Upload
date: 2013-06-26 23:05:31.000000000 -05:00
type: post
parent_id: '0'
published: true
password: ''
status: publish
categories:
- Rails
tags:
- paperclip
- qrencoder
meta:
  _edit_last: '404795'
  _wpas_done_944212: '1'
  publicize_twitter_user: joshuaakahn
  _publicize_done_external: a:1:{s:7:"twitter";a:1:{i:193406412;b:1;}}
author: jkahn
---
I have recently been building a Rails application for which I need to generate a QR code for one of my models that has a URL.  Already using the excellent [QREncoder](https://github.com/harrisj/qrencoder) library, I needed to attach the generated PNG to my Rails model.  Being that we are already using [Paperclip](https://github.com/thoughtbot/paperclip) to manage file attachments, we wanted to utilize the same functionality here.  
`   attr_accessible :qrcode   has_attached_file :qrcode`

`   def after_create     qr = QREncoder.encode(self.url)     temp_file = Tempfile.new(['qr', '.png'], "#{Rails.root.to_s}/tmp/")   `

  `begin       qr.save_png(temp_file.path)       self.qrcode = File.open(temp_file.path)       self.save     ensure       temp_file.close       temp_file.unlink # cleanup the temp file...     end   end`

In the code above, after calling a few Paperclip setup methods, we start by encoding the QR code for the desired URL stored in the model.  We then create a temporary PNG file to which we write the QR code via the QREncoder library (`save_png`). Paperclip then expects a `File` be presented to be attached, so we open the temporary file via `File.open` and save the model. Before we go, we make sure to close and remove (unlink) the temporary file for cleanliness.

Hope this is helpful to others, took a bit of playing.