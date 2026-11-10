---
layout: post
title: Aspect Oriented Error Handling in Java
date: 2008-01-16 20:03:26.000000000 -06:00
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
Over the past few days I've been building out several application architecture components to support our Flex data service application. My goal was to make these components as unobtrusive as possible in the core code, primarily because it allows our developers to focus on business logic instead of peripheral concerns. That goal led me to look at Aspect Oriented Programming (AOP).In short, AOP handles "cross-cutting concerns" or modules that span multiple parts of the system. Logging errors is an example of a cross-cutting concern, because all classes that might throw an exception require such a service. A much deeper explanation of AOP can be found on [Wikipedia](http://en.wikipedia.org/wiki/Aspect-oriented_programming). I am by no means an AOP expert, but I felt that detailing my approach might be of value to others.

To get started, we need a library that will enable us to build AOP components. I selected the [Spring Framework](http://www.springframework.org) because we are already using Spring in our application and it provides good support for AOP. The latest version of Spring (2.5) also includes integration with [AspectJ](http://www.eclipse.org/aspectj/) to be more expressive and offer a simpler programming model than past versions of Spring. It allows us to define aspects, point cuts, etc. via a combination of XML/annotations and code.

Using the annotation approach, we can use regular Java classes to create aspects. In our case, the ErrorHandler class is an aspect that defines its join point into the application. A "join point" is a point of execution in software, for example, when an exception is thrown. The after-throwing join point to identify application code or "advice" that should be run after an exception is thrown:

``` java
@Aspect
public final class ErrorHandler
{
    @AfterThrowing(
        pointcut="within(iamjosh.samples..\*)",
        throwing="exception"
    )
    public void processError(JoinPoint logged, RuntimeException exception)
    {
        // log the error message via the logging component
    }
}
```

The annotations in this class do two things: (1) define this class as an aspect (or cross-cutting module) and (2) indicate its join point (or where and how it is called). In this case, we call the "processError" method after an exception is thrown.

The other key here is the "pointcut." The pointcut defines where a join point should be run; any join point that matches the pointcut will cause the advice to be run. In our example, the advice (the processError method) will be run after an execption is thrown (the join point) anywhere in the "iamjosh.samples" package and its descendants (the pointcut). For simplicity, I have included the pointcut definition in the ErrorHandler class, but a better practice would be to include it in another class so that it can be accessed throughout the application. For example:

``` java
package iamjosh.samples;

@Aspect
public class SystemArchitecture
{
    // matches on all methods called in the service package
    @Pointcut("execution(\* iamjosh.samples.service.\*.\*(..))")
    public void serviceMethod() {}
}
```

The ErrorHandler could then be revised to log service method call exceptions in a special way:

``` java
@AfterThrowing(
    pointcut="iamjosh.samples.SystemArchitecture.serviceMethod()",
    throwing="exception"
)
public void processServiceMethodError(JoinPoint logged, RuntimeException exception)
{
    // log the error message via the logging component
}
```

The terminology can be quite confusing, but sometimes that's just how it goes. [Spring's AOP documentation](http://static.springframework.org/spring/docs/2.5.x/reference/aop.html) offers a nice high level overview of each topic. Defining pointcuts could be a topic on its own as well.

Let's finish up our example. We now have to let Spring know about our ErrorHandler by configuring it as a Spring managed bean and enabling @AspectJ (in our Spring configuration file):

That should do it. Any exceptions thrown in the "iamjosh.samples" package and its descendants should now be logged (see caveats below). From a programmer's perspective, we can now focus on business logic and trust that thrown exceptions are logged.

A couple of caveats (the first of which really got me):

*   Exceptions must cross the proxy boundary - Spring's AOP framework utilizes a proxy around managed beans to implement aspect contracts. In order to be "caught" by the framework, an exception must cross the boundary by being thrown from a class to its caller.
*   The exception thrower must be Spring managed - in order to wrap the AOP proxy, Spring must manage the bean in order to weave an aspect into it. In other words, objects created with new will not have our error handling framework.
*   There are other ways to do this - Spring offers the flexibility to implement AOP in a number of ways, including the use of XML and annotations. Spring 2 offers a new style of XML configuration, but is still backwards compatible to the version 1 style. AspectJ can also be used on its own.

AOP is a much bigger topic than I can cover here, but I hope my relatively simply example will be of use in getting you going.