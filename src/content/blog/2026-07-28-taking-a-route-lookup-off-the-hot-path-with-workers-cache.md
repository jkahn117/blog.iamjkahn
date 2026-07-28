---
date: "2026-07-28T17:00:00.000Z"
title: "Taking a route lookup off the hot path with Workers Cache"
author: "Josh"
summary: "Building a multi-tenant platform on Workers for Platforms requires the dispatch Worker to resolve some value to a script name on every request. In my governed deployment architecture, that lookup requires a database read on a Durable Object. In this post, I explore how I used Workers Cache to take the database read off the hot path."
---

In [my last post](/posts/2026/07/everyone-can-build-an-app-now-where-does-it-go), I wrote about building a [governed deployment architecture](https://github.com/jkahn117/governed-deployment-architecture) (GDA) on Cloudflare. GDA is a platform for hosting tenant apps behind your own policies and controls. The control plane is the hardest part of this type of platform. Its design depends on the organization, so your decisions may look very different from mine.

Before digging further into the control plane, I want to look at one part of the hosting (or data) plane: how I used the newly available [Workers Cache](https://developers.cloudflare.com/workers/cache/) to avoid a lookup on every request.

GDA tenant apps are deployed as [Workers for Platforms](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/) [User Workers](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/how-workers-for-platforms-works/#user-workers). Every inbound request passes through a [dispatch Worker](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/how-workers-for-platforms-works/#dynamic-dispatch-worker) before reaching tenant code, including page loads, asset fetches, and API calls.

Before the dispatch Worker can hand off to the right User Worker, it needs to resolve the request's slug into the internal script name of the deployed User Worker. The slug is encoded in the subdomain, something like `my-app.apps.example.dev` with its mapping in a [Durable Object](https://developers.cloudflare.com/durable-objects/). The lookup needs to happen for _every_ request.

The mapping itself does not change often, only when a tenant promotes a new build, which uploads a new User Worker script and updates the slug-to-script mapping. Promotions are infrequent. Requests are not.

Slow-moving data is a good opportunity for caching and [Workers Cache](https://developers.cloudflare.com/workers/cache/) provides a platform-managed cache situated in front of the Worker entrypoint. The Worker can also control the cache itself through standard `Cache-Control` headers and cache tags. You enable it with one line of Wrangler config and return appropriate headers. On a cache hit, the Worker will not run at all.

That last part is what made it interesting for this use case. A cache hit skips the control-plane Worker and the Durable Object behind it.

## The hot path

Each route lookup flows as follows:

```
Browser
  → dispatch Worker (app-router)
      → service binding fetch → control-plane Worker (AppDirectoryEntrypoint)
          → Durable Object stub (SQLite read: getAppBySlug)
      ← { scriptName }
  → dispatch to User Worker
```

The [service binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/) hop into the control-plane Worker and the DO read happen on every request. Serving a slightly stale script name is safe: an old script still serves the previous version correctly, and the new script is uploaded before any invalidation occurs.

This is a good candidate for caching. But _where_ the cache lives and _how_ it gets invalidated is the interesting part.

## Why not the Cache API?

The first approach you might reach for is the [Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/), exposed as `caches.default`. It's been around for a while and lets you explicitly `put`, `match`, and `delete` responses in code.

But it has some limitations that matter here:

- It's local to the PoP. A `cache.delete` only purges the cache in the colo that handles the request.
- No request collapsing. Concurrent cache misses each invoke the Worker.
- No `stale-while-revalidate`. You either serve fresh or you don't.

Workers Cache addresses each limitation. Tiered caching consolidates misses from lower-tier locations. It also collapses concurrent requests and supports `stale-while-revalidate`. Invalidation via [`ctx.cache.purge`](https://developers.cloudflare.com/workers/cache/purge/) is global rather than local.

The trade-off is control. Workers Cache is configured declaratively through `wrangler.jsonc` and `Cache-Control` headers rather than explicit `put/match/delete` calls. That is enough control for this idempotent `GET` lookup. If you needed to cache POST responses by hashing the body into a synthetic key, the Cache API would still be the better tool.

## The catch: Workers Cache only applies to `fetch()`

Workers Cache does not apply to custom RPC methods. From the [docs](https://developers.cloudflare.com/workers/cache/limitations/):

> Only `fetch()` invocations on a `WorkerEntrypoint` go through Workers Caching. Custom RPC methods like `ctx.exports.Backend.getUser(id)` bypass the cache and always run the callee, regardless of the entrypoint's `cache.enabled` setting.

The route lookup was originally a custom RPC method on a [named entrypoint](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/rpc/#named-entrypoints). It returned a plain object rather than a `Response`, so Workers Cache could not cache it.

This required adding a `fetch` handler to the entrypoint and changing the caller to use `.fetch()`.

```ts
export async function resolveAppRouteFetch(input: {
  request: Request;
}): Promise<Response> {
  // parse request, do lookup, etc.

  return Response.json(routeResolution, {
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=60",
      "Cache-Tag": createAppRouteCacheTag(routeResolution.slug),
    },
  });
}
```

The `Cache-Control` header specifies a one-hour TTL with a 60-second stale-while-revalidate window. During that window, the router gets an immediate response while the cache refreshes in the background. The refresh does not add latency to the route lookup.

The `Cache-Tag` lets us purge that route when an app is promoted. I derive the tag from the slug with a prefix so it is unique to the route.

On the caller side:

```ts
const response = await appDirectory.fetch(
  new Request(
    `https://app-directory.internal/route/${encodeURIComponent(slug)}`,
  ),
);
```

## Per-entrypoint cache config

Most control-plane operations should not be cached. Workers Cache lets you [configure caching per entrypoint](https://developers.cloudflare.com/workers/cache/configuration/#per-entrypoint-caching):

```jsonc
"cache": { "enabled": true },
"exports": {
  "default": { "type": "worker", "cache": { "enabled": false } },
  "AppDirectoryEntrypoint": { "type": "worker", "cache": { "enabled": true } },
},
```

Cache is enabled on the control-plane Worker, disabled on `default`, and enabled only on `AppDirectoryEntrypoint`. This configuration caches only the route lookup entrypoint.

## Invalidation on a lifecycle event

We want to invalidate the cached mapping when an application build is promoted. After the new User Worker script is uploaded and live, the control-plane calls a purge method on `AppDirectoryEntrypoint`:

```ts
async purgeAppRoute(slug: string): Promise<void> {
  const slugResult = appSlugSchema.parse(slug);
  this.ctx.waitUntil(cache.purge({ tags: [createAppRouteCacheTag(slugResult)] }));
}
```

[`ctx.cache.purge`](https://developers.cloudflare.com/workers/cache/purge/) operates globally across all cache tiers. Once the purge propagates, the next request misses and fetches a fresh resolution.

Purges are [scoped to the entrypoint](https://developers.cloudflare.com/workers/cache/purge/) that calls `purge()`. The cached route responses are owned by `AppDirectoryEntrypoint.fetch()`, so the purge must run from that entrypoint, not from the default control-plane entrypoint or the `AppDirectory` Durable Object.

The purge runs in `ctx.waitUntil` so it doesn't extend the critical path. If it fails, the TTL still applies. Users continue to see the previous version instead of an error.

The lifecycle event drives invalidation, while the TTL remains a fallback. The cache tag keeps the purge precise by invalidating only the affected slug.

## Trade-offs

Workers Cache isn't free. Enabling it on `AppDirectoryEntrypoint` changes the billing profile of the service-binding call from the dispatch Worker to the control plane. Worker-to-worker service binding invocations are normally free. Once `cache: { enabled: true }` is set on the callee, every invocation is billed at the standard Workers request rate. That includes cache hits, although they don't consume CPU time.

At high traffic with a good hit ratio, the saved CPU and DO read load may outweigh the added request cost. At prototype scale, the absolute numbers are negligible.

There is also a small architectural cost. The caller now has to parse and validate a `fetch` response instead of receiving a typed object from an RPC method.

## Takeaways

Putting the cache on the callee side of a service-binding read keeps ownership clear. The entrypoint owns both the cached response and the purge method, while the caller remains unaware of the cache. Per-entrypoint configuration keeps the rest of the control plane uncached.
