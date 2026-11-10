---
layout: post
title: Building a LiveCycle Data Service Application with Spring and Hibernate
date: 2007-11-08 19:40:59.000000000 -06:00
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
  _edit_last: '404795'
  _oembed_2a28246f5e4ed76c5bb721603f936631: "{{unknown}}"
  _oembed_b65c9d36f97c68a19ce27130f0e4d169: "{{unknown}}"
  _oembed_3b99df408dd777d4fd50632c2810bff3: "{{unknown}}"
  twitter_cards_summary_img_size: a:7:{i:0;i:300;i:1;i:274;i:2;i:2;i:3;s:24:"width="300"
    height="274"";s:4:"bits";i:8;s:8:"channels";i:3;s:4:"mime";s:10:"image/jpeg";}
  _oembed_6c8c8b9f4df227038c5692b4467d2a12: "{{unknown}}"
  _oembed_9ae8eaebb1652d661250f1567ddaba55: "{{unknown}}"
  _oembed_28ac470789739c90377a6d3ae9dda865: "{{unknown}}"
author: jkahn
---
In order to gain a better understanding of Flex and data services with Java, I decided to build a simple order management application that demonstrates a number of capabilities. The application will be responsible for managing orders and the items in them. The UI itself is extremely simplistic and the use case for the application is very limited:

![Flex Order Manager UI](/assets/images/flex-20order-20manager-20ui-small.jpg)

For the rest of this article, I am going to focus primarily on the data services aspect of the application and how it is wired up from end-to-end. I do plan to cover other aspects of my sample application, particularly my lessons learned around Hibernate, in future posts though.

[Download Sample Code](http://www.box.net/shared/7laku4k4dz) (zip)

**Data Model**

To get started, we’ll take a quick look at the data model for the application. There are three data elements that we will deal with: (1) orders, (2) products, and (3) line items. An order contains one or more line items, each of which is associated with a single order.

![Data Model Diagram](/assets/images/data-20model-20diagram.png)

**Data Service Application**

When I initially started learning about Flex and data services, I found it difficult to understand exactly how LCDS integrated with my application. In the end LCDS is actually _part_ of the web application – if you follow along with my earlier post on [generating an LCDS application skeleton](http://iamjosh.wordpress.com/2007/11/01/update-creating-the-skeleton-for-a-new-lcds-application/), you’ll find that the LCDS libraries are included in the WAR file.

In the end, LCDS acts as the controller for the application. It provides a set of servlets for receiving, sending, and interpreting messages in various formats. The web application’s descriptor file (web.xml) defines these servlets as endpoints in the application. On the Flex side, the services\_config.xml file identifies these endpoints to the Flex application. For more details, I recommend reviewing the default versions of these files included in your LCDS distribution (although this does require some knowledge of web application configuration). Although there are other options, I have chosen to use Adobe’s Action Message Format (AMF) for communication.

![LCDS Architecture](/assets/images/lcds-20architecture-small.jpg)

With the controller (LCDS) and view (Flex) layers of my application complete, I turned to the model layer. I decided to use [Hibernate](http://hibernate.org/) to provide object-relational mapping and data persistence and [Spring](http://www.springframework.org/) to manage transactions and the Hibernate session factory (primarily to make my life easier). There are numerous references online that discuss integrating Spring and Hibernate as well as information on utilizing the power of these tools for a Flex data service. In the end, the model layer of my application flows as follows:

![Flow Diagram](/assets/images/flow-20diagram-small.jpg)

**Beans**

With our order management application service designed, we can start to work on building its various pieces. LCDS, Spring, and Hibernate handle much of the heavy lifting here, but we need to fill in a few gaps in the BO, DAO, and bean layers.

Being the simplest, I started by building the three Java beans that my application requires along with the associated ActionScript models (they are _very_ similar).

There are a couple of key points to notice:

*   For each property in the Java bean, there is an associated public attribute in the ActionScript class (of the same name!). This allows LCDs to serialize and deserialize objects properly.
*   In the ActionScript class, I have included two metadata tags:
    *   `[Managed]` - provides utility methods for objects managed by a data service
    *   `[RemoteClass(alias="iamjosh.samples.lcds.models.Order")]` - maps this class directly to a remote Java class
*   One other items of note, particularly for the LineItem class, are the equals() and hashCode() method. These are _extremely_ important for Hibernate, so much so that I will review them in a future post.

**Flex-Spring Integration**

Since Spring wil be managing Hibernate, we only need to wire Spring to Flex. Luckily, Christophe Coenraets provides [detailed information](http://www.adobe.com/devnet/flex/articles/spring_flex_print.html) of how to do so. Like Christophe, we will be utilizing Jeff Vroom’s SpringFactory to provide Flex with initialized instances of Spring beans. All we need to do is include the SpringFactory class (avaiable on Adobe Exchange), register it in services-config.xml, and install the Spring libraries.

WEB-INF/flex/services-config.xml - register the SpringFactory with Flex

> <factories>
>     <factory id="spring" class="iamjosh.samples.lcds.factories.SpringFactory"/>
> </factories>

WEB-INF/web.xml - include Spring configuration in the web application

```
<!-- Application context configuration for Spring -->
<context-param>
  <param-name>contextConfigLocation</param-name>
  <param-value>/WEB-INF/applicationContext.xml</param-value>
</context-param>
```

```
<!-- listener for Spring -->
<listener>
    <listener-class>org.springframework.web.context.ContextLoaderListener</listener-class>
</listener>
```

From the Spring framework, there are two JAR files that need to be included in the application: (1) spring.jar and (2) spring-hibernate3.jar. The latter provides integration between Spring and Hibernate.

**Flex Data Assembler**

When a request is made from the client (Flex) side, they are sent to an object called an _assembler_. We will need to create a custom assembler class to provide the interface from the data service to our business layer (BO) or data access layer (DAO). The assembler class extends the `flex.data.assemblers.AbstractAssembler` abstract class. The custom assembler is responsible for providing a set of callback methods (essentially get, update, create, and delete) that can be invoked from the client application (actually, in the Flex application, you’ll see that we call these methods “directly”).

Once we have created this class, we need to wire it to a destination that can will be referenced by the Flex application:

WEB-INF/flex/data-management-config.xml

```
<destination id="order.spring">
    <adapter ref="java-dao"/>
        <properties>
            <source>orderAssemblerBean</source>
            <factory>spring</factory>
            <metadata>
                <identity property="id"/>
            </metadata>
        </properties>
        <channels>
            <channel ref="my-rtmp"/>
        </channels>
</destination>
```

The above XML essentially maps a destination (order.spring) to an assembler (orderAssemblerBean), which is contructed by the Spring factory.

The configuration to map the order assembler to an actual implementation is handled in the Spring configuration (WEB-INF/applicationContext.xml). We also point to a business object that is utilized by the assembler class here.

```
<bean id="orderAssemblerBean" class="iamjosh.samples.lcds.assemblers.OrderAssembler">
    <property name="orderDAO" ref="orderDAOBean"/>
</bean>
```

**Spring-Hibernate Integration**

The final step is to integrate Spring and Hibernate by configuring the Hibernate session factory that the DAO class will utilize (once again in applicationContext.xml):

```
<bean id="orderDAOBean" class="iamjosh.samples.lcds.dao.OrderDAOImpl">
    <property name="sessionFactory" ref="sessionFactory"/>
</bean>
```

Our DAO implementation (OrderDAOImpl) is responsible for making calls to the database via the Hibernate package. You will also need to download and include the hibernate3 library as well.

**Accessing the Data Service from Flex**

The last step in building our sample application is to call the data service from the Flex application. I chose to use the DataService object to do so:

```
<mx:DataService id="orderService" destination="order.spring" autoCommit="true" />
<mx:ArrayCollection id="\_orders"/>

<mx:Script>
    <!\[CDATA\[
        private function onCreationComplete() : void
        {
            // call the method we want from the OrderAssembler (our service)
            this.orderService.fill(this.\_orders);
        }
    \]\]>
</mx:Script>
```

As you can see above, we are referencing the data service destination defined in data-management-config.xml and the fill() method, one of the four standard methods provided by a data service. The fill() method is defined in the OrderAssembler. Other methods in the Assembler (e.g. `createItem`) can also be called in the same manner (`orderService.createItem(newItem)`).

**Final Thoughts**

Of course there is a great deal more depth to this subject than I am able to cover here, but my goal was to document how I built a basic working LCDS application and bring together information that I found in a number of different sources.

**References**

*   Flex Data Management Tutorial: [http://coenraets.org/blog/2007/01/flex-data-management-services-tutorial/](http://coenraets.org/blog/2007/01/flex-data-management-services-tutorial/)
*   Spring-Flex Integration: [http://www.adobe.com/devnet/flex/articles/spring\_flex.html](http://www.adobe.com/devnet/flex/articles/spring_flex.html)
*   Flex Data Services with Spring and Hibernate: [http://devblog.ezmo.com/2007/05/29/using-flex-data-services-with-spring-and-hibernate/](http://devblog.ezmo.com/2007/05/29/using-flex-data-services-with-spring-and-hibernate/)