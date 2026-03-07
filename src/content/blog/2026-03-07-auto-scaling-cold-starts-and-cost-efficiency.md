---
date: "2026-03-07T05:00:00.000Z"
title: "Auto-scaling, cold starts, and cost efficiency"
author: "Josh"
summary: "An explainer of the Cloudflare Workers scaling model, its trade-offs, and how it compares to virtual machines and containers."
---

## An explainer of the Cloudflare Workers scaling model, its trade-offs, and how it compares to virtual machines and containers

Cloudflare Workers scales differently than virtual machines, containers, or functions-as-a-service like AWS Lambda — and that difference matters for cost, performance, and operational complexity. This post walks through a simplified scenario to show how those differences play out in practice.

### The scenario

Consider a simple web API. A user sends an HTTP request, some code runs, and immediately returns a response to the user. The exact work performed by the code is not important right now. Web APIs power experiences across the internet: websites, apps, every SaaS product -- how APIs scale has a direct impact on every service or application it enables.

<img src="/images/2026-3-7-auto-scaling-cold-starts-and-cost-efficiency/01-api-request-response.png" alt="Simple API request and response diagram" class="mx-auto block" />

### Scaling to handle more work

<img src="/images/2026-3-7-auto-scaling-cold-starts-and-cost-efficiency/02-horizontal-vertical-scaling.png" alt="Horizontal vs vertical scaling diagram" width="250" class="float-right ml-4" />

Scalability is the property of a system to add or remove capacity to meet demand of that system. In the case of our API, it will _scale up_ when it needs more capacity and _scale down_ when it needs less. Described another way, scalability is the capability of a system to handle increased workloads by adding resources, without sacrificing performance.

Most cloud workloads scale _horizontally_, adding more capacity by adding additional compute resources. Pre-cloud on-premise environments sometimes differed in this regard, utilizing _vertical_ scaling by increasing the capacity of the existing compute resource. In other words, by buying a bigger server.

<div class="my-8 rounded-xl border border-teal-500 bg-zinc-100 px-6 py-4 dark:border-teal-400 dark:bg-zinc-900">
  <p class="mt-10 font-semibold text-zinc-800 dark:text-zinc-100">What would happen if the API did <u>not</u> scale in response to increased demand?</p>
  <p>When an API like the one in our scenario fails to scale up, it's like when a large crowd of people tries to leave through a single door at the same time. It's slow and painful. The API will become sluggish, requests back up, and a request that typically takes 50ms now takes 1 second -- that's a huge difference. The slowdown is caused by the server reaching the finite limits of its hardware. At some point the API is likely to stop responding and starts to return 503 (Service Unavailable) and 504 (Gateway Timeout) errors.</p>
  <p>APIs rarely work alone, especially in modern systems. Slow downs and service failures impact any websites, apps, and other systems that are dependent on the API. The impact will vary by system and how <em>resilient</em> the system is to issues.</p>
  <p class="font-semibold text-zinc-800 dark:text-zinc-100">If the server hits its resource limits, why not just make the server bigger?</p>
  <p>Replacing the server with a more powerful server is known as <em>vertical scaling</em>. Vertical scaling was popular on-premise and remains so for some categories of software. But vertical scaling is slow and will generally interrupt service, at least momentarily. And what happens when traffic goes down? We've now <em>over-provisioned</em> and it costs money (on-premise this was less of a concern because the server was a sunk cost; in the cloud, larger servers cost more on a per-minute basis).</p>
  <p class="mb-0">Most modern software utilizes <em>horizontal scaling</em> to increase capacity. Hyperscalars made pools of virtually limitless servers available that can automatically grow and shrink to match demand. <em>Elasticity</em> is the automation of scaling up and down.</p>
</div>

Our API currently handles ten requests each second (this is a trivially small number for most systems, but we're going to keep the numbers simple).

<img src="/images/2026-3-7-auto-scaling-cold-starts-and-cost-efficiency/03-initial-load-comparison.png" alt="Initial load: VM vs Containers vs Workers at 10 rps" width="420" class="float-left mr-4" />

Let's consider three different technical options to implement our API: virtual machines (e.g., EC2), containers (orchestrated by a system such as Kubernetes), and Workers[^1]. Each will behave differently in how it handles the user requests and how it scales.

Conceptually, each option will handle the initial load of 10 requests per second as shown in the diagram:

- A single virtual machine may handle all 10 requests concurrently.

- Two containers, with a load balancer, may be suitable to handle all 10 requests.

- Ten Worker isolates (Cloudflare's term for an isolated execution of a Worker) will be required.

The initial load illustrates a key difference in behavior between these three technology options: whereas virtual machines and containers handle many concurrent requests within a single instance, Workers handles requests using lightweight isolated execution contexts. For ten simultaneous requests, Workers scales to as many isolates as needed[^2], each with its own compute resources. This isolation model makes scaling behavior predictable (capacity scales linearly with concurrent requests) and eases "noisy-neighbor" problems where one request's resource usage impacts another.

A few minutes later, our API suddenly becomes twice as busy as it initially was, receiving on average twenty requests per second (again trivially small). Let's consider both (1) how the API scales for each option and (2) the impact on our users.

As you can imagine, each of the three options will scale differently:

<img src="/images/2026-3-7-auto-scaling-cold-starts-and-cost-efficiency/04-scaling-to-20rps.png" alt="Scaling comparison at 20 requests per second" class="mx-auto block" />

Workers will scale instantly to handle the additional requests, without the need for a scaling policy, adding enough isolates to handle all twenty concurrent requests. Each Worker isolate has the same compute resources available to it.

The container environment will start to add additional container instances based on a scaling policy. This is configured and managed by a service such as Kubernetes. New container instances can become available quite quickly (though not as quickly as a Worker isolate), so a third instance may be on the scene and ready to handle requests thirty seconds after the surge in traffic. The (auto-)scaling policy and latency to handle requests will determine how soon after the traffic surge the environment will be able to handle all requests.

The virtual machine option behaves somewhat similarly to containers but with a few key differences. Most importantly, virtual machines are slower to start handling requests. They are also more expensive to use for variable or bursty workloads. So while a virtual machine can handle more requests _per_ compute resource, it takes longer (and more expensive) to make more available to handle the influx of traffic.

#### Will anyone think of the users?

Before we continue examining scaling behavior, let's take a moment to consider the user (generally referred to as a "client") experience.

Even thirty seconds after the sudden increase in user requests, the container and virtual machine environments may still not be scaled up substantially enough to handle all twenty requests. Think of this as a gap between supply (the number of requests we can serve) and demand (the number of users sending requests).

<img src="/images/2026-3-7-auto-scaling-cold-starts-and-cost-efficiency/05-user-impact.png" alt="User impact during scaling gap" width="420" class="float-right ml-4" />

The impact on the users is dependent on factors outside the scope of this narrative, but the end result generally falls into one of the following:

1. Some or all users begin to experience slow response times as the environment struggles to keep pace with demand. It can be hard to predict how many users suffer or by how much.
2. Some or all users may receive _no_ response from the API. Again, we're in unpredictable territory with how many users this impacts.

This scenario is intentionally simplified. In practice, CDNs, DDoS protection, and caching layers would help reduce user impact — but our example API isn't using any of those tools.

#### Back to scaling

Let's jump forward sixty seconds, to ninety seconds after the increase in user requests. There is still an average load of 20 requests per second.

Workers looks the same as it did before. There are still twenty isolates humming along.

By this time, both our container environment and our virtual machine environment have scaled up by an additional unit: there are now four container instances and two virtual machine instances. Users across all three scenarios are jumping for joy as our API is back to being as performant as the initial baseline.

<img src="/images/2026-3-7-auto-scaling-cold-starts-and-cost-efficiency/06-over-provisioned.png" alt="Over-provisioned containers and VMs" width="420" class="float-right ml-4" />

But there is an issue here. Both the container and virtual machine environments are now _over-provisioned_. We are now paying for more capacity than we actually need.

And with both technologies, because those instances are \_always running, we pay for them every second, whether or not they're processing requests.

Paying for that over-capacity illustrates a primary benefit of Workers -- its resource and cost efficiency. There are only as many isolates as we need AND we only pay for those isolates when the isolates are processing requests. This difference is best illustrated by extending our scenario to a period of zero traffic to the API.

<img src="/images/2026-3-7-auto-scaling-cold-starts-and-cost-efficiency/07-zero-traffic.png" alt="Zero traffic: always-on VMs/containers vs Workers" width="420" class="float-right ml-4" />

Both containers and virtual machines are "always-on" and typically require at least one instance to respond to requests, even in periods of low or no traffic to the API. While platforms like GCP Cloud Run and AWS Fargate support container scale-to-zero, the cold start penalty makes it impractical for most latency-sensitive workloads. Workers responds to current demand, they disappear when their work is complete and if there is no more work to complete. Zero work means zero isolates.

The difference between "always-on" and the Workers approach is somewhat subtle and can be difficult for new customers to understand. What's important is that for request-driven, latency-sensitive workloads, Workers is among the most cost and resource efficient options available today.

#### Art and science of auto-scaling policies

Both containers and virtual machines rely on auto-scaling policies to adjust instance counts based on demand. Configuring these policies well is notoriously difficult: scale up too aggressively and you overpay for idle capacity; scale up too conservatively and users experience degraded performance during traffic spikes.

Compounding this challenge is instance startup time. As discussed in the previous section, new instances take time to initialize before they can serve requests, from seconds for containers to minutes for virtual machines. This delay means auto-scaling policies must anticipate demand rather than simply react to it[^3].

<img src="/images/2026-3-7-auto-scaling-cold-starts-and-cost-efficiency/08-capacity-vs-utilization.png" alt="Capacity vs utilization mismatch over time" class="mx-auto block" />

<img src="/images/2026-3-7-auto-scaling-cold-starts-and-cost-efficiency/09-scale-to-zero.png" alt="Scale to zero comparison" width="320" class="float-right ml-4" />

There is almost always a mismatch between capacity and utilization, especially for spiky workloads like web sites and APIs. This is particularly acute when there is no traffic to the system. Both containers and virtual machines require at least one instance to respond. And because it takes seconds to minutes to serve traffic from a new instance, builders will almost never choose to scale to zero. The consequence is that they are always paying for that one instance, even at times of no traffic, waiting for the next request.

Managing a scaling policy is not required when you build with Workers. The service manages scaling up and down on its own, without any customer interaction. Workers automatically matches capacity and utilization. That includes the ability to scale to zero.

Workers can scale to zero because it can almost instantly instantiate a new instance to serve the next request. The user who made that next request may see a slightly higher latency, though Workers cold starts are typically measured in single-digit milliseconds.

Creating a new isolate is called a "cold start." Cold starts are a known trade-off for ephemeral compute[^4]. Cloudflare's isolate technology allows the service to quickly create new environments to serve requests[^5], faster than standard Lambda and most comparable products and significantly faster than virtual machines or containers.

#### How Workers achieves even higher cost efficiency

<img src="/images/2026-3-7-auto-scaling-cold-starts-and-cost-efficiency/10-cpu-time-billing.png" alt="CPU time billing: pay only when code runs" width="370" class="float-right ml-4" />

Customers using Workers only pay for CPU time, the actual compute cycles their code consumes. Time spent waiting for external services (e.g., database queries, API calls, LLM responses) is free. Workers scales up and down efficiently and only charges customers when code runs, not when the Worker is waiting.

Most modern applications are a composite of multiple services. For example, a Worker may call a Stripe API to create a new charge or an LLM to generate an image. In both cases, the Worker is waiting for a response for milliseconds to minutes. This waiting time is free to the customer.

The Workers serverless model truly means that customers only pay when their code runs. And because the service automatically matches utilization and capacity, they are never paying for more than they need.

---

[^1]: This post won't discuss AWS Lambda or similar serverless functions in detail here. While Lambda shares the "scale-to-zero" and "pay-per-use" properties with Workers, key differences exist: Lambda can experience non-trivial cold start latency (though features like SnapStart have meaningfully reduced this for some runtimes), runs in full microVMs rather than V8 isolates, and is regional rather than globally distributed by default. These differences generally favor Workers for latency-sensitive workloads, but a full comparison is outside the scope of this post.

[^2]: For more technical readers: assume that 0 isolates existed until this moment.

[^3]: Hyperscalers, such as AWS, are introducing predictive scaling policies that aim to better match capacity and utilization using AI.

[^4]: AWS Lambda, GCP Cloud Functions, and similar ephemeral compute products also experience cold starts. It's a trade-off of the compute model. Engineers follow a variety of techniques to minimize cold start latency, but competing products like Lambda and Cloud Functions offer _reservation_ features to maintain a minimum number of execution environments at all times. This means the compute will never scale to zero.

[^5]: When Workers receives requests sequentially rather than concurrently, the service may reuse an existing isolate rather than creating a new one. This is called a "warm start." Warm starts avoid the cold start initialization penalty.
