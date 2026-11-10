---
layout:	post
title:	"Swift Quick Tip: Check if String is not nil and not empty"
date:	2016-08-05
---

  Nothing earth-shattering, but a reminder for myself on how to check if a String is not nil and not empty in Swift 2:

// check if 'string' is not nil and not empty  
if let myString = string where !myString.isEmpty {  
 // string is not nil and not empty...  
}  