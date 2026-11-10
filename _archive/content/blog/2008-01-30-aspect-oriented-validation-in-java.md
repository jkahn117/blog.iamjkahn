---
layout: post
title: Aspect Oriented Validation in Java
date: 2008-01-30 20:26:49.000000000 -06:00
type: post
parent_id: '0'
published: true
password: ''
status: publish
categories:
- Data Services
- Java
tags: []
meta: {}
author: jkahn
---
This will be the first of a two part series that discusses my approach towards validation in a data service application. The first part (this post) will cover the server-side aspects of the validation framework and the second (coming soon, I hope) will detail how validation information is shared with the Flex application.

In designing the validation component, I wanted the following:

1.  Little to no impact on business logic (e.g. no validation code inline with business logic)
2.  Minimal configuration
3.  Able to send validation errors to Flex client

The first design principal lends itself to aspect oriented programming, which enables us to handle "cross-cutting" concerns (see my [previous post](http://iamjosh.wordpress.com/2008/01/16/aspect-oriented-error-handling-in-java/) for more details). In short, we'll be implementing a "Validator" class (an aspect) that is called upon to validate persistent objects whenever a create or update method is called in the data access layer. For this application, I have used Spring with @AspectJ annotations to build AOP components and have previously documented [details on the AOP configuration for the Validator](http://iamjosh.wordpress.com/2008/01/20/passing-arguments-to-advice-in-spring-with-aspectj-support/).

For the most part, the Validator class is fairly straightforward, with the exception of it being Spring application context aware (e.g. it has access to our Spring configuration). By making the Validator context aware, we can configure validation beans via Spring and dynamically load them as needed.

``` java
@Aspect
public final class Validator implements ApplicationContextAware
{
    private ApplicationContext appContext;

    @Around("iamjosh.samples.util.SystemArchitecture.onCreateOrUpdate()"
        + " && args(validateable)")
    public void validate(ProceedingJoinPoint called, Validateable validateable) throws Throwable
    {
        // returns simple name, e.g. "user"
        String beanType = validateable.getSimpleName();

        // try to load a validator bean for this object
        org.springframework.validation.Validator validator
                = this.loadValidatorBean(beanType);
        // if we didn't get a validator back, stop trying to validate
        if (validator == null) return;

        // run the validation
        ValidateableErrors errors =
            new ValidateableErrors(validateable, beanType);
        validator.validate(validateable, errors);

        // check the result of the validation -- if there are errors, assign
        // them to the validateable object
        if (errors.hasErrors())
            validateable.setErrors(errors);
        else
            // proceed if valid, be sure to pass the validateable on
            called.proceed(new Object\[\] { validateable });
    }

    // need to implement this method to be application context aware
    public void setApplicationContext(ApplicationContext applicationcontext) throws BeansException
    {
        this.appContext = applicationcontext;
    }

    private org.springframework.validation.Validator loadValidatorBean(String validateableBeanName)
    {
        String validatorBeanName = validateableBeanName + "Validateable";
        org.springframework.validation.Validator validator = null;
        try
        {
            validator =
                (org.springframework.validation.Validator)this.appContext.getBean(validatorBeanName);
        }
        catch(NoSuchBeanDefinitionException nsbde) { // do something }
        catch(BeansException be) { // do something }
        return validator;
    }
}
```

In this case, I am favoring the idea of convention over configuration. The naming convention for my validator beans should be "_modelClassName_Validator" or "userValidator" for the User class. This keeps things simple. In the future, I plan to add an option to override this default.

I won't go into the details of the `ValidateableErrors` class, but it is just a wrapper around Spring's `BindingResult` class that defers all method calls and adds a few others. For those familiar with Rails, this class and its relationship to the model are very similar to the `Errors` class in `ActiveRecord` classes. Each validateable model class has an "errors" property that references a `ValidateableErrors` object - this is what is eventually passed to Flex (more on this in a future post).

Any persistent model that is to be validated by our validation framework must implement the `Validateable` interface and extend the `BaseValidateable` abstract class.

Finally, a quick discussion of how the validation rules are defined. I wanted to avoid mixing validation code with business logic and partially achieved this by utilizing AOP to call my validation framework. But I also wanted to avoid defining validation rules in code as this can be become cumbersome and create extraneous classes. To that end, I chose to utilize the [Valang](https://springmodules.dev.java.net/docs/reference/0.8/html_single/#valang) validation language, which is part of the [Spring Modules](https://springmodules.dev.java.net/) library, a set of extension to Spring. Details on Valang can be found in the references below, but it allows us to write succinct validation rules as part of the Spring configuration. For the user class our Valang code looks like this:

``` xml
<bean id="userValidator" class="org.springmodules.validation.valang.ValangValidator">
    <property name="valang">
        <value>
            <!\[CDATA\[
                { firstName : ? is not blank : 'First name is blank' : 'first\_name\_empty' }
                { firstName : length(?) < 30 : 'First name too long' : 'first\_name\_length' : 30}
                { lastName  : ? is not blank : 'Last name is blank' : 'last\_name\_empty' }
                { lastName  : length(?) < 50 : 'Last name too long' : 'last\_name\_length' : 50 }
                { email     : ? is not blank : 'E-mail is blank' : 'email\_empty' }
                { email     : email(?) == false : 'E-mail is invalid' : 'email\_invalid' }
                { email     : ? is blank or length(?) > 3 : 'E-mail is too short' : 'email\_to\_short' }
            \]\]>
        </value>
    </property>
</bean>
```

By naming the validation bean "userValidator" the validation framework will automatically identify this bean as the validation bean for the `User` class. We can then apply whatever Valang rules are deemed necessary by our requirements to implement server-side validation. Any errors are then inserted into the `Validateable` object as a `ValidateableErrors` object that will be sent back to Flex.

**References**

*   [Valang Validation Language](https://springmodules.dev.java.net/docs/reference/0.8/html_single/#valang)
*   [Spring Modules Library](https://springmodules.dev.java.net/)