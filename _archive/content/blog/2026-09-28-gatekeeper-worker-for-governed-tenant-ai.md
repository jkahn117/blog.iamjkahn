---
date: "2026-09-28T05:00:00.000Z"
title: "A gatekeeper Worker for governed tenant AI"
author: "Josh"
summary: "Tenant apps need AI access, but governed — per-tenant quota, no shared API key, identity you can trust. I used a single gatekeeper Worker with ctx.props for identity and a Durable Object for quota. The same pattern applies beyond AI."
publish: false
---

Over the summer, I wrote a few posts about a [governed deployment architecture](/posts/2026/07/everyone-can-build-an-app-now-where-does-it-go). That architecture is designed to answer the question: when everyone can build an app, where does it go?

One of the more interesting challenges in designing that multi-tenant architecture was figuring out how tenant applications could do more than simply serve static content. At some point, useful applications need to interact with data, call services, maintain state, and perform work on behalf of their users.

On Cloudflare, these are services like D1, R2, Workers AI, and KV. A typical Cloudflare Workers application uses [bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/) to allow interaction with these services. Isolation between tenant data is critical in a multi-tenant platform. The platform may also want to gate feature access and monitor usage of resources.

The approach I landed on is what I termed a _gatekeeper Worker_ (to be honest, I borrowed the idea and the term from [Cloudflare OS](https://blog.cloudflare.com/cloudflare-os/)). A gatekeeper is a Cloudflare Worker that sits between the tenant application and downstream resources.1


If you're building a multi-tenant platform, you'll hit this question quickly. Tenant apps want to call an LLM — for summarization, classification, a chatbot, whatever the app is for. You want them to have that capability. But you don't want to hand every tenant a shared API key, and you don't want one tenant impersonating another. You need per-tenant quota, identity you can trust, and cost attribution you control.

The approach I landed on is a _gatekeeper Worker_ — one shared Worker that sits between tenant code and the AI backend. Tenant apps never see a key. They call `env.AI.run(model, input)` and nothing else. The gatekeeper enforces a model allowlist and per-app quota before forwarding to [Workers AI](https://developers.cloudflare.com/workers-ai/) through [AI Gateway](https://developers.cloudflare.com/ai-gateway/).

## The constraint that shapes everything

The platform owns `wrangler.jsonc` for every tenant app. It can inject whatever bindings it chooses at deploy time. The tenant's editable surface is `src/` only.

That's the lever. The platform decides what bindings a tenant app gets, and it can set properties on those bindings that tenant code can't read or override. This is what makes governed AI possible without credentials.

## One gatekeeper, not one per tenant

The platform deploys a single gatekeeper Worker — not one per tenant or per app. Every AI-enabled tenant app gets a [service binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/) injected as `env.AI`, pointing at this one shared Worker.

From the tenant's perspective, the surface is simple:

```ts
const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", {
  messages: [
    { role: "system", content: "Answer questions using the provided context." },
    { role: "user", content: question },
  ],
});
```

No key, no identity argument, no gateway configuration. The tenant doesn't need to know how identity, quota, or logging work. They just call `env.AI.run()`.

## Identity rides in ctx.props, not in tenant code

The Workers RPC system doesn't expose caller identity to the callee. The gatekeeper can't tell which app is calling it through runtime introspection. So identity has to come from somewhere else.

The platform uses [`ctx.props`](https://developers.cloudflare.com/workers/runtime-apis/context/#props) — a platform-authenticated property object on the service binding — to carry the `appId` to the gatekeeper. When the platform deploys a tenant app, it sets `props: { appId }` on the `AI` service binding in the tenant's `wrangler.jsonc`:

```ts
bindings.push({
  type: "service",
  name: "AI",
  service: AI_GATEKEEPER_SCRIPT_NAME,
  entrypoint: AI_GATEKEEPER_ENTRYPOINT,
  props: { appId: input.appId },
});
```

The Workers runtime guarantees that `ctx.props` can only be set by someone with permission to deploy the callee Worker. Tenant code in `src/` has no access to `ctx.props` and no way to override it. The gatekeeper reads `this.ctx.props.appId` on every call and trusts it without cryptographic verification or secret keys.

This is the part I like most about the identity model. There's no credential to mint, rotate, or leak. The binding _is_ the identity. If you need to revoke access, you pause the capability grant and the binding disappears on the next deploy.

## The gatekeeper: allowlist, quota, forward

The gatekeeper is a [WorkerEntrypoint](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/rpc/#named-entrypoints) with one RPC method that tenant apps call:

```ts
export class AiGatekeeperEntrypoint extends WorkerEntrypoint<Env, AiGatekeeperProps> {
  async run(model: string, input: unknown): Promise<unknown> {
    const appId = this.readAppIdFromProps();

    if (!isAllowedAiModel(model)) {
      throw new AiGatekeeperError("model_not_allowed", `AI model is not allowed: ${model}`);
    }

    if (!isRecord(input)) {
      throw new AiGatekeeperError("invalid_input", "AI input must be an object");
    }

    const reservation = await this.env.AI_QUOTAS.getByName(appId).reserveRequest();
    if (!reservation.ok) {
      throw new AiGatekeeperError("quota_exceeded", "AI request quota exceeded", reservation.usage);
    }

    return this.env.WORKERS_AI.run(model, input, {
      gateway: {
        id: readAiGatewayId(this.env),
        collectLog: true,
        metadata: { appId, tenantId: reservation.usage.tenantId },
      },
    });
  }
}
```

Three things happen before the request reaches the model:

1. **Model allowlist.** The gatekeeper checks the model against a platform-level list. A model not on the list is rejected before anything costs money. Expanding the allowlist is a gatekeeper redeploy, not a per-tenant change.
2. **Quota check.** A per-app [Durable Object](https://developers.cloudflare.com/durable-objects/) counter is checked and incremented. If the app is at its limit, the request is denied.
3. **Forward with metadata.** The request goes to Workers AI through AI Gateway, tagged with `appId` and `tenantId` for observability.

The allowlist is a flat constant, not per-tenant configuration. Every tenant app granted the AI capability gets access to the same set of models. Per-tenant model grants are possible later — the capability-grant model has a `resourceRef` field that could carry a model-allowlist override — but the prototype starts simple.

## Quota in a Durable Object, not in AI Gateway

Quota enforcement lives in a per-app Durable Object, not in AI Gateway.

[AI Gateway](https://developers.cloudflare.com/ai-gateway/features/spend-limits/) supports [spend limits](https://developers.cloudflare.com/ai-gateway/features/spend-limits/), but a gateway supports at most 20 spend-limit rules. That's nowhere near enough for one rule per app at any real tenant count. The gateway is good for a small number of coarse, global cost caps — a per-day maximum across all tenants, for example — but not for per-app enforcement.

The Durable Object counter gives strongly consistent quota checks. One DO instance per app id owns the request counter, so the reserve is atomic — no double-spend under concurrency:

```ts
reserveRequest(): Promise<QuotaReservation> {
  const usage = this.readUsageOrThrow();

  if (usage.used >= usage.limit) {
    return Promise.resolve({ ok: false, usage });
  }

  this.ctx.storage.sql.exec("UPDATE quota SET used = used + 1 WHERE id = 1");

  return Promise.resolve({ ok: true, usage: this.readUsageOrThrow() });
}
```

The prototype uses request count for quota, not token count. Token counting requires parsing the response body on every call, which adds latency and complexity that isn't justified yet. The upgrade path is straightforward — change the counter increment from `1` to the token count parsed from the response, with no interface change.

AI Gateway still plays a role. Every forwarded request carries `appId` and `tenantId` as custom metadata, which gives per-app usage visibility in the AI Gateway dashboard. And one or two coarse gateway-level spend limits act as a secondary safety net. But the DO counter is the primary enforcement point. Gateway is observability; the gatekeeper is control.

## The same pattern, applied to other services

The gatekeeper pattern isn't specific to AI. The capability-grant model in the prototype distinguishes two shapes of platform-provided resource, and the gatekeeper is one of them.

**Dedicated resource per app.** This is the simpler pattern. D1, [R2](https://developers.cloudflare.com/r2/), [KV](https://developers.cloudflare.com/kv/), Queues, and Vectorize all support cheap per-tenant instantiation. You provision an isolated resource per app — a D1 database, an R2 bucket, a KV namespace — and inject a binding that points directly at it. Quota is the only governance concern, and the resource itself provides isolation. No gatekeeper needed.

**Centralized gatekeeper for shared backends.** This is the pattern I've been describing. AI is the first example because Workers AI is a shared backend — you don't provision a separate AI instance per tenant. But any capability that brokers access to a single shared backend fits this shape.

The question is: when does a service move from the dedicated-resource pattern to the gatekeeper pattern?

For R2 and KV, the default is dedicated resource per app. Provisioning an isolated bucket or namespace per tenant is cheap, and it gives you isolation for free. But there are cases where you might want a gatekeeper instead:

- **Shared bucket with per-app quota.** If you want all tenant objects in one R2 bucket — for cost, management, or cross-tenant features — a gatekeeper Worker can prefix keys by `appId` and enforce per-app storage quota. The tenant calls `env.STORAGE.put(key, value)`. The gatekeeper resolves the key to `{appId}/{key}`, checks quota, and forwards to R2. The tenant never sees another app's objects.
- **Shared KV namespace with per-app rate limiting.** Same idea for KV. A gatekeeper can enforce per-app read/write limits on a shared namespace, with `ctx.props` carrying identity the same way.
- **Any backend that doesn't support cheap per-tenant instantiation.** If the backend charges per-instance or has provisioning latency, a gatekeeper in front of a shared instance is the better trade-off.

The gatekeeper pattern costs more — an extra Worker invocation on every call, a Durable Object for quota, the operational surface of the gatekeeper itself. For R2 and KV, the dedicated-resource pattern avoids all of that. The gatekeeper is worth it when the backend doesn't give you cheap isolation, or when you need per-app controls the backend doesn't support natively.

The mechanics are the same either way: one shared Worker, `ctx.props` for identity, a per-app DO for quota, and a binding injected at deploy time that the tenant can't override. Adding a new capability after AI follows the same pattern — one provisioner, one binding-loop case, one quota dimension. The model doesn't change.

## Trade-offs

The gatekeeper is a new runtime dependency for every AI-capable tenant app. A gatekeeper outage degrades AI inference for all of them, though it doesn't affect non-AI requests. That's a real concentration risk — one Worker, one failure domain — and it's worth monitoring accordingly.

There's also latency. The service binding call into the gatekeeper is fast — it stays on Cloudflare's network — but it's still an extra hop. The DO quota check adds another. For AI calls that take hundreds of milliseconds or more, the overhead is negligible. For a hypothetical capability with sub-millisecond latency requirements, it would matter more.

The identity model has a limitation: `ctx.props` is set at deploy time. If you need to revoke AI access immediately without a redeploy, the gatekeeper can check grant status on every call — the capability-grant model supports a `"paused"` status that takes effect right away. But the binding itself persists until the next deploy. For the AI use case, checking grant status in the gatekeeper is enough. For a capability where the binding itself is the risk, you'd need a different approach.

There's also the architectural cost I mentioned in the Workers Cache post. The tenant's `env.AI` looks like a direct binding, but it's actually an RPC into a gatekeeper that does real work before forwarding. That indirection is invisible to the tenant, which is the point — but it means the platform operator owns the gatekeeper's availability, performance, and correctness.

## What I'd take from this

The pattern — one gatekeeper Worker, `ctx.props` for trusted identity, per-app DO for quota — is a clean way to expose a shared backend to tenant apps without credentials. The tenant's surface is a single binding. The platform controls what models are available, how much each app can use, and who called what. No API keys to rotate, no identity to spoof.

The generalization matters more than the AI-specific implementation. Any shared backend that doesn't support cheap per-tenant instantiation can use the same shape. The decision is whether the backend gives you isolation for free — like R2 and KV do — or whether you need the gatekeeper to provide it.
