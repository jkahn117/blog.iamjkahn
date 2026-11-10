---
layout: post
title: Data Services with Server-Side Validation
date: 2008-01-31 13:16:00.000000000 -06:00
type: post
parent_id: '0'
published: true
password: ''
status: publish
categories:
- Data Services
- Flex
- Java
tags: []
meta: {}
author: jkahn
---
Out of the box, Flex provides a set of great validators for client-side validation of form input (e.g. for phone numbers), but for instances in which we need to involve the server, things become a bit trickier. Before we get into the how though, a quick discussion of the why. There are numerous situations in which server-side validation is not only nice, but a must. Consider an application that asks users to register themselves. The application might ask the user to create a username, but that username must be unique. We don't want to send our entire list of username to the client, so instead we'll utilize validation code on the server. In a [previous post](http://iamjosh.wordpress.com/2008/01/30/aspect-oriented-validation-in-java/), I detailed my approach for server-side validation.

In general, the design follows a similar pattern to Rails - we store a map of errors in an object within the model object itself. Persistent classes that implements the `Validateable` interface can be validated by our framework and an instance of `ValidateableErrors` will be injected into the object with a map of validation errors. If the validation framework encounters an error, it halts execution and sends the invalid object (with errors) back to the client.

Once Flex receives the updated object, the application needs to be able to display those errors. To do this, we'll utilize a custom implementation of the `mx.validators.Validator` class. Before we dig into the validator class, let's take a quick look at the ActionScript implementation of the `ValidateableErrors` class:

```
\[Bindable\]
public class ValidateableErrors
{
    private var \_errors : Object;

    public function ValidateableErrors(errors : Object) : void
    {
        this.\_errors = errors;
    }

    public function getFieldErrors(field : String) : Array
    {
        return this.\_errors\[field\] == null ?
            \[\] : \[ this.createValidationResult(this.\_errors\[field\]) \];
    }

    private function createValidationResult(msg : String) : ValidationResult
    {
        return new ValidationResult(true, "", "SERVER\_ERROR", msg);
    }
}
```

The first thing to note is that instead of using a `Dictionary`, we are in fact just using a plain old object as this is how LCDS deserializes Java `Maps` on the Flex side. Each of the keys in the map are now properties for this object. We can this utilize the "\[\]" notation to retrieve the value of a given property. The validation message is wrapped in a `ValidationResult` object, which is utilized by the validator to display error messages in the UI.

Let's now take a quick look at the validator implementation:

```
public class ServerErrorValidator extends Validator
{
    private var \_errors : ValidateableErrors;
    public var field : String;

    public function ServerErrorValidator()
    {
        this.\_errors = null;
        super();
    }

    public function set errors(errors : ValidateableErrors) : void
    {
        this.\_errors = errors;
        validate();
    }

    override protected function doValidation(value : Object) : Array
    {
        return this.\_errors.getFieldErrors(this.field);
    }
}
```

Our validator simply accesses the `ValidateableErrors` object referenced by the "errors" property for a given field. It then displays the error message via the return `ValidationResult` object. We can make this a clearer by looking at an example:

```
<validation:ServerErrorValidator id="firstNameValidator" field="firstName"
    errors="{ this.\_user.validationErrors }" listener="{ this.firstName }"/>
<validation:ServerErrorValidator id="lastNameValidator" field="lastName"
    errors="{ this.\_user.validationErrors }" listener="{ this.lastName }"/>

<mx:Label x="10" y="10" text="User Validation Test" fontSize="16" color="#FFFFFF" fontWeight="bold"/>
<mx:Panel x="10" y="42" width="480" height="200" layout="absolute" title="Create User">
    <mx:Label x="10" y="10" text="First Name:"/>
    <mx:Label x="10" y="36" text="Last Name:"/>
    <mx:TextInput x="127" y="8" id="firstName"/>
    <mx:TextInput x="127" y="34" id="lastName"/>
    <mx:Button x="385" y="128" label="Create" click="createUser()"/>
</mx:Panel>
```

The `User` instance ("`_user`") is defined elsewhere. Although not ideal, we do need to instantiate one validator per field even though we only reference a single object. The response from the data service's "createItem" method is an updated version of the user object with the associated validation errors. Flex takes care of updating the UI appropriately to display the errors.

This implementation has worked well thus far for my purposes; however, I do see room for improvement in displaying multiple errors messages per field and in making the solution as a whole more flexible. I do welcome feedback.