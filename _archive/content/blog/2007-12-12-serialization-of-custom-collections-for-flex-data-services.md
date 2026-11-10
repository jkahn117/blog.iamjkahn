---
layout: post
title: Serialization of Custom Collections for Flex Data Services
date: 2007-12-12 15:53:37.000000000 -06:00
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
meta:
  _oembed_85afea86b223920f4086be1f5054e91f: "{{unknown}}"
  _oembed_cd30426ac14fd61996c89e7b23c95519: "{{unknown}}"
author: jkahn
---
In my current project, we have a custom collection on the Java side that is supposed to be sent via LCDS to the Flex client. When we began testing, however, we found that the collection was not being passed, only the properties of "standard" Java types were (e.g. `String`, `int`). It seems that if LCDS does not know how to handle an object, it simply ignores it and does not include it in the serialization process. This was the case here, LCDS did not understand how to serialize our custom collection and simply did not include it in the transfer.

For example, in the model code below, when an instance of `MyListKeeper` is serialized and sent to the Flex client, only the name property is included, not `myList`.

```
     public class CustomList
         extends ArrayList<Foo>
         implements List<Foo>, Serializable
     {
         // constructors
         // extension methods, e.g.
         public Bar getFirstBar() { ... }
     }

     public class MyListKeeper
         implements Serializable
     {
         private CustomList myList;
         private String name;

         // getters & setters
     }
```

We were able to solve this by writing custom serialization methods (via the `java.io.Externalizable` interface) for both the collection and the class that contains a reference to it. In the code below, notice that our classes now implement `Externalizable` (a subclass of `Serializable`).

```
     public class CustomList
         extends ArrayList<Foo>
         implements List<Foo>, Externalizable
     {
         // as in the previous example ...

         public void writeExternal(ObjectOutput out)
             throws IOException
         {
             // externalizes the list - LCDS knows how to handle an ArrayList
             out.writeObject(new ArrayList(this));
         }

         public void readExternal(ObjectInput in)
             throws IOException, ClassNotFoundException
         {
             // start by clearing the current collection
             this.clear();
             // now read in the new list and store it
             this.addAll((List)in.readObject());
         }
     }

     public class MyListKeeper
         implements Externalizable
     {
         // as in the previous example ...

         public void writeExternal(ObjectOutput out)
             throws IOException
         {
             out.writeUTF(this.name);
             out.writeObject(this.myList);
         }

         public void readExternal(ObjectInput in)
             throws IOException, ClassNotFoundException
         {
             this.name  = in.readUTF();
             // the following may not be 100% correct, feel free to correct me
             this.myList = (CustomList)this.readObject();
         }
     }
```

Finally, we need to mirror our custom serialization on the Flex side. In ActionScript, classes with custom serialization implement the `flash.utils.IExternalizable` interface.

```
    \[Managed\]
    \[RemoteClass(alias="CustomList")\]
    public class CustomList
        implements IExternalizable
    {
        public var list : IList;

        // other methods, etc

        public function readExternal(input : IDataInput) : void
        {
            this.list = ArrayCollection(input.readObject());
        }

        public function writeExternal(output : IDataOutput) : void
        {
            output.writeObject(this.list);
        }
    }

    \[Managed\]
    \[RemoteClass(alias="MyListKeeper")\]
    public class MyListKeeper
        implements IExternalizable
    {
        public var myList : CustomList;
        public var name : String;

        // other methods, etc

        public function readExternal(input : IDataInput) : void
        {
            this.name = input.readUTF();
            // the list itself is received as an ArrayCollection, so we just assign it directly
            this.myList.list = input.readObject();
        }

        public function writeExternal(output : IDataOutput) : void
        {
            output.writeUTF(this.name);
            output.writeObject(this.myList);
        }
    }
```

Adobe has a nice [overview of custom serialization](http://livedocs.adobe.com/flex/201/html/wwhelp/wwhimpl/common/html/wwhelp.htm?context=LiveDocs_Book_Parts&file=ent_services_config_097_11.html) as well, but focuses primarily on utilizing it to control which parameters are serialized.

**References**

*   [http://livedocs.adobe.com/flex/201/html/wwhelp/wwhimpl/common/html/wwhelp.htm?context=LiveDocs\_Book\_Parts&file=ent\_services\_config\_097\_11.html](http://livedocs.adobe.com/flex/201/html/wwhelp/wwhimpl/common/html/wwhelp.htm?context=LiveDocs_Book_Parts&file=ent_services_config_097_11.html)