---
layout: post
title: Passing Arguments to Advice in Spring with @AspectJ Support
date: 2008-01-20 12:49:39.000000000 -06:00
type: post
parent_id: '0'
published: true
password: ''
status: publish
categories:
- Java
tags: []
meta: {}
author: jkahn
---
In building an aspect-oriented validation framework, I encountered the need for passing arguments to my advice methods. Not being an AOP expert, I found numerous methods via Google for doing this in Spring. Unfortunately, none of them worked. I ran into error messages along the lines of "wrong number of arguments" and something about formal parameters. I eventually created the following solution (note that pointcuts are defined in a single class called "SystemArchitecture"):

``` java
package iamjosh.samples.util;

@Aspect
public class SystemArchitecture
{
    // pointcuts that are called when a "create" or "update" method is called in the service package
    @Pointcut("onCreate() || onUpdate()")
    public void onCreate() {}

    @Pointcut("execution(\* iamjosh.samples.service..\*.create(..))")
    public void onCreate() {}

    @Pointcut("execution(\* iamjosh.samples.service..\*.update(..))")
    public void onUpdate() {}
}
    ```

And now the advice:

``` java
package iamjosh.samples.validation;

@Aspect
public class Validator
{
    @Around("iamjosh.samples.util.SystemArchitecture.onCreateOrUpdate()"
        + " && args(validateable)")
    public void validate(ProceedingJoinPoint called, Validateable validateable)
        throws Throwable
    {
        // do whatever here
    }
}
```

Two things of note in the above example:

*   Around advice is used here so that execution can be halted if the validateable object is found to be invalid, but this method will apply to any type of advice.
*   Only classes implementing the `Validateable` interface can be passed into the create() and update() methods in my application. The parameter in "args" that defines the advice references the name of the argument, not its type.

Like I said in the opening, I found a number of different methods that claimed to accomplish this same task, but this was the one I found to be most effective. The one change I would like to make is to define the argument type (here, "Validateable") as part of the pointcut itself instead of with the advice, but no luck so far. Please feel free to comment with enhancements.