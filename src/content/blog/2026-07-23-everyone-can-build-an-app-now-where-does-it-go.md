---
date: "2026-07-23T05:00:00.000Z"
title: "Everyone can build an app now. Where does it go?"
author: "Josh"
summary: "Customers kept asking for a governed space to host the apps their people build — vibe-coded, AI-assisted, or hand-written. I built a prototype on Cloudflare to explore the problem, and the control plane turned out to be the hard part."
---

Earlier this summer, I kept having the same conversation with customers across different industries — manufacturing, financial services, higher education. The discussions usually started with agentic use cases or vibe coding, but they kept tilting toward the same question: when everyone can build, where do you host the applications?

These customers wanted to give their students or employees a governed, trusted space to host applications — whether those apps were fully vibe-coded, AI-assisted, or written by hand. But these applications are often short-lived and/or lightly-used. In a couple of cases, the customer needed to host a business-sensitive prototype behind a secure login, maintainable by a central IT team. No EC2 instance, no S3 bucket, no infrastructure to babysit.

Eventually I started drawing. A simple diagram showing a control plane and a data plane for a platform that would let these organizations provide a governed deployment experience. The idea was that you could give your coding assistant a set of skills and simple tools, and it could publish applications into an environment the platform controlled.

That drawing became the first step in building what I started calling a "governed deployment architecture" (or GDA). And while you could argue that hosting platforms have existed for a long time, it's never been easier to build a platform completely your own. Customized with your own policies, exposing services (including private ones) and capabilities that you want, while only paying for what gets used.

## The control plane is the hard part

Practical experience since that drawing has confirmed something I suspected early on: the control plane is the _hard part_. [Workers for Platforms](https://www.cloudflare.com/products/workers-for-platforms/) makes it relatively straightforward to host web applications on Cloudflare. The decisions you need to make around policy, resource allocation, and build approach are actually harder.

Hosting tenant applications — building them, routing to them, serving them — has a fairly clear shape. Cloudflare gives you good primitives for that. What's harder is everything around it: who is allowed to deploy, what they're allowed to change, what capabilities their app receives, who approves a production promotion, what happens when something goes wrong, and how you keep an audit trail that holds up. Those decisions don't have a single right answer. They depend on the organization, its risk tolerance, and its existing controls.

## Primitives, not packaging

Everyone's control plane is going to look a little different. This isn't packaged software. It's also not constrained by the configuration or customization features a vendor chose to expose. That is a feature, not a gap.

This isn't just about the control plane. I see this era of building not as replacing every SaaS product (the "SaaSpocalypse") but as an opportunity to truly customize function or behavior by building on top of great primitives. Lenny Pruss comments on this in [The primitive is the product](https://www.amplifypartners.com/blog-posts/the-primitive-is-the-product):

> All of this means the winning products and strategies going forward will look very different from those of the SaaS era. The most valuable companies will allow every use case to emerge instead of trying to solve each one themselves.

Every organization's control plane emerges from its own policies, pipelines, and capabilities. Having the right building blocks and understanding how they fit together is more valuable than a one-size-fits-all product.

## What I'm planning to write

My take on a [governed deployment architecture](https://github.com/jkahn117/governed-deployment-architecture) is available on GitHub. I'm planning to write about specific patterns, including dispatch routing with [Workers Cache](https://developers.cloudflare.com/workers/cache/), service bindings as gatekeepers / facilitators, platform observability, and building a control plane that works for humans and agents.
