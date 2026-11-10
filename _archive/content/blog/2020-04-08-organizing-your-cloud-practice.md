---
layout: post
title: Organizing Your Cloud Practice
date: 2020-04-08 10:30 -0500
summary: Real world reaction to Forrest Brazeal's recent article on organizational impact to CI/CD pipelines.
background: /assets/images/ricardo-resende-PqqJ340jrow-unsplash.jpg
---

Forrest Brazeal published an interesting article a few weeks ago on how your organizational structure is a good predictor of your CI/CD pipeline. Given the number of AWS customers I have worked with over the past four years, I found Forrest's thoughts on target...

[BRAZEAL: HOW YOUR ORG PREDICTS YOUR CI/CD PIPELINE](https://info.acloud.guru/resources/brazeal-how-your-org-predicts-your-ci/cd-pipeline)

> Your CI/CD pipeline will be broken and messy in exactly the same ways your engineering org is broken and messy.

Most customers as they come to cloud are organized in what Forrest calls "Gumbo." In particular, Development and Operations are siloed as are Security and Networking. These teams meet when necesssary, but generally own separate workstreams or siloes of infrastructure. Development does not understand the concerns of Operations. Security is a blocker, sometimes unsure and untrusting of the others.

These customers tend to struggle in their first steps to cloud. Devlopers are keen to test new services, others less so. New development models (e.g. serverless) are prone to failure. CI/CD is a mix of "whatever works."

The most successful customer I have worked with is the definition of Forrest's "Umbrella" model. Operating in the financial services industry, this customer has strict regulations and security concerns. They also have a large number of AWS accounts and disparate teams working on a variety of products, driving towards cloud-native architectures.

The key to success at this customer? A strong center of excellence (or "Cloud Operations" team). The team is managed by a strong director, who has the support of the CIO. The team has its own financial operations manager, who keeps an eye on team and individual budgets (yes, individuals have their own development accounts) and actively seeks optimization opportunnities. The team organizes cloud-centric learning events and encourages cooperation. Each team that needs access to the cloud gets its own account, pre-configured with organizational rules and controlled access. Security is an active participant. Teams are cross-functional.

Will this approach for every organization? Possibly not, but it is something to strive for as the "Umbrella" approach allows your to move fast and stay safe.

*Photo by [Ricardo Resende](https://unsplash.com/@rresenden) on [Unsplash](https://unsplash.com/)*