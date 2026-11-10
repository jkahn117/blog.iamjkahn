---
layout: post
title: Unit Testing DAO Classes with JUnit, Spring
date: 2007-12-11 19:59:44.000000000 -06:00
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
Unit testing data access code can be quite challenging - we need to be constantly aware of what is currently in the database, what should be there, and what will be there next. This makes testing a simple data access class more complex than it need be. That's where [Spring](http://springframework.org) comes in. Spring provides a convenient base class ([`AbstractTransactionalDataSourceSpringContextTests`](http://static.springframework.org/spring/docs/2.5.x/api/org/springframework/test/AbstractTransactionalDataSourceSpringContextTests.html)) that extends the [JUnit](http://junit.org/) base test case class to provide per-test transactions. At the end of each test method, all changes are automatically rolled back, meaning that our database is never in a testing induced state of flux. Since Spring provides support for a number of persistence frameworks, it is fairly easy to test both Hibernate and iBatis-based DAO classes. To start, I created a simple abstract class to provide the basis for all of my DAO test cases:

```
    public abstract class AbstractDataAccessTest
        extends AbstractTransactionalDataSourceSpringContextTests
    {
        /\*\*
         \* Reference the Spring configuration file for the test case.
         \*/
         protected String\[\] getConfigLocations()
         {
             return new String\[\]{ "test-applicationContext.xml" };
         }

        /\*\*
         \* Spring will automatically inject the SessionFactory instance on startup.
         \* Only necessary for Hibernate-backed DAO testing
         \*/
         public void setSessionFactory(SessionFactory factory)
         {
             this.sessionFactory = factory;
         }
    }
```

Our abstract class simply defines where Spring can find our configuration (in the classpath) and, for Hibernate, provides a setter for the `SessionFactory` , which will be injected by Spring when the test begins. Spring wires components of our test case together (e.g. DataSource, SessionFactory) via dependency injection as defined in the Spring configuration.

Next, we define our data source, session factory (for Hibernate only), and transaction manager in test-applicationContext.xml (I will leave the data source and session factory, if needed, to you):

> **Hibernate**
> 
> <bean id="txManager" class="org.springframework.orm.hibernate3.HibernateTransactionManager">
>     <property name="sessionFactory"><ref local="sessionFactory"/></property>
> </bean>

> **iBatis**
> 
> <bean id="transactionManager" class="org.springframework.jdbc.datasource.DataSourceTransactionManager">
>     <property name="dataSource"><ref bean="dataSource"/></property>
> </bean>

We can now define our test class:

```
    public class UserDAOTest
        extends AbstractDataAccessTest
    {
        private UserDAO dao;

        // Spring will automatically inject the UserDAO
        public void setUserService(UserDAO dao)
        {
            this.dao= dao;
        }

        @Test
        public void testGetUser()
        {
            // query with jdbc template to get expected value
            String query = "select first\_name from users where id=1";
            String name  = (String)this.jdbcTemplate.queryForObject(query, String.class);
            assertNotNull("User of id 1 was not found", name);

            // call the UserDAO to get the actual value returned
            User user = this.dao.getUserById(1);

            // test if the correct record was returned
            assertNotNull("User of id 1 was not found by service", user);
            assertEquals("User first names do not match", name, user.getFirstName());
       }
    }
```

One item of particular note here is the use of the jdbcTemplate, which is provided by Spring to query for or set-up test data in the database without going through the DAO class under test. Here, we use the JDBC template to check the first name of the record found by our class under test.

That's it. When our test completes, any transactions that affected the database will be rolled back. For example, had we updated a user record during the test, we would find all of the changes gone after the test completes. This ensures that we will always know that state of our test database at the start and end of tests.