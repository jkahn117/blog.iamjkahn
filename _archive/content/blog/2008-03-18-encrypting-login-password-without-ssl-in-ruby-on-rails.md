---
layout: post
title: Encrypting Login Password without SSL in Ruby on Rails
date: 2008-03-18 03:04:56.000000000 -05:00
type: post
parent_id: '0'
published: true
password: ''
status: publish
categories:
- Rails
tags: []
meta:
  _edit_last: '404795'
author: jkahn
---
For a personal project, I am building a Rails site that has an administration section. Of course, I don't want any nefarious person who snoops my network traffic to be able to login. SSL isn't an easy option because (1) my site is on a shared host, (2) I don't want to pay for an SSL certificate, and (3) I would prefer that my users do not need to accept a self-signed certificate.

Given these conditions, I felt that a private/public key pair would successfully obfuscate login credentials without SSL. At a high level, my Rails application generates a 1024-bit RSA key on the fly and shares a public version with the client. The client utilizes an open source RSA library for JavaScript to encrypt the credentials on the client before sending them back to the server, which then uses the private key to decrypt them. I'm not an encryption expert, but I think the worst that could happen is that someone could decrypt the credentials for the one request they capture (feel free to correct me though).

Let's get to the code. To set the situation, I am following REST conventions for authentication, so I have a `SessionsController` with a `new` action and a `create` action. The former is responsible for setting up the login and the latter for processing the user's input.

First, the "new" action, which creates the RSA key, provides the public components to the view template, and stores the key (in PEM format) in session:

``` ruby
  def new
    key = OpenSSL::PKey::RSA.new(1024)
    @public\_modulus  = key.public\_key.n.to\_s(16)
    @public\_exponent = key.public\_key.e.to\_s(16)
    session\[:key\] = key.to\_pem
  end
```

Then in the view template ("new.html.erb"), we provide the public modulus and exponent (the necessary component of the public key) as well as input forms for the username and password:

```
  <%= javascript\_include\_tag('rsa/jsbn', 'rsa/prng4', 'rsa/rng', 'rsa/rsa', 'rsa/base64', :cache => true) %>

  <% form\_tag session\_path, :id => 'login' do -%>
  <fieldset>
    <legend>Please Login</legend>
    <label for="login" class="required">Login</label>
    <%= text\_field\_tag :username, params\[:username\] %><br />
    <label for="password" class="required">Password</label>
    <%= password\_field\_tag :upassword, params\[:upassword\] %><br />
    <%= hidden\_field\_tag :password, '' %>
  </fieldset>
  <%= submit\_tag 'Log in' %>
  <% end -%>

  <%= hidden\_field\_tag :public\_modulus, @public\_modulus %>
  <%= hidden\_field\_tag :public\_exponent, @public\_exponent %>
```

Two things to note here. First, we are including the [four necessary JavaScript libraries](http://www-cs-students.stanford.edu/~tjw/jsbn/) on this page only. Second, we use a hidden field to store/commit the password - this field is populate via JavaScript.

My application utilizes [jQuery](http://www.jquery.com), so attaching a function to encrypt the password before form submission is straightforward:

``` javascript
  $(document).ready(function() {
    $("form#login").submit(function() {
      var rsa = new RSAKey();
      rsa.setPublic($('#public\_modulus').val(), $('#public\_exponent').val());
      var res = rsa.encrypt($('#upassword').val());
      if (res) {
        $('#password').val(hex2b64(res));
        $('#upassword').val('');
        return true;
      }
      return false;
    })
  });
```

Before submission occurs, we encrypt the value of the "upassword" field, store an encrypted Base64 version in "password," and clear "upassword." If there is a problem, the form is not submitted.

On the server-side, this form is submitted to the `SessionsController#create` action:

``` ruby
  def create
    key = OpenSSL::PKey::RSA.new(session\[:key\])
    password = key.private\_decrypt(Base64.decode64(params\[:password\]))
    user = User.authenticate(params\[:username\], password)
    if user
      reset\_session  # reset session after login
      session\[:user\_id\] = user.id
      flash\[:notice\] = "Welcome back, #{user.username}"
      redirect\_to admin\_url
    else
      flash\[:error\] = 'Invalid username/password entered'
      new and render :action => 'new'
    end
  end
```

Here, we pull the key out of session and use it to decrypt the form input before attempting to authenticate the user. It is important to note the the `private_decrypt` method wants binary data, so we need decode the Base64 text passed in the request (using Base64 seemed more appropriate than binary data here). After the authenticate method is called, things proceed as usual.

So far, this is working fairly well. There are a few options for improvement - perhaps a `before_filter` to preprocess any encrypted data. I'd be interested in hearing other ideas on this topic as well.

**References**

*   [Help with OpenSSL RSA](http://www.ruby-forum.com/topic/120848#601572)
*   [BigIntegers and RSA in JavaScript](http://www-cs-students.stanford.edu/~tjw/jsbn/)
*   [Encrypting Sensitive Data with Ruby (on Rails)](http://stuff-things.net/2007/06/11/encrypting-sensitive-data-with-ruby-on-rails/)