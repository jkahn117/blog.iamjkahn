---
date: "2026-05-27T05:00:00.000Z"
title: "Building background agents on Cloudflare"
author: "Josh"
summary: ""
---

Over the past months, we’ve seen a dramatic increase in the use of coding agents like Claude Code and Cursor. The harnesses for these agents fit well within the traditional developer workflow: an inner loop of edit → build → test → debug complemented by an outer loop of pull request → code review → integration → deploy.

Coding agents follow a third loop (the “agent loop”) that fits neither of the above: receive task → research → edit → run tests → iterate → open pull request. The coding agent loop is interactive iteration, like the developer’s inner loop, but executed like the automated / unattended outer loop. It’s a hybrid that the traditional approach does not support.

The problem is that most engineering infrastructure was not designed for the agent loop.

An agent doesn’t just “write code.” It spins environments up and down, executes untrusted changes, connects to test systems, and opens pull requests at machine speed.

Without strong isolation and controlled connectivity, an agent fixing a flaky test can accidentally rewrite shared staging data. Without ephemerality, two concurrent tasks can interfere in subtle, non-deterministic ways. Without egress control, a prompt injection can turn into a data exfiltration.

The agent loop amplifies every weakness in your development infrastructure.

When you look at how companies like Stripe, Ramp, WorkOS, and Amplitude are approaching the agent loop, a pattern emerges. Across implementations, the same architectural concerns show up repeatedly. They cluster into four major themes:

**Ephemeral isolated execution.** The agent runtime is closer to a CI runner than a developer workstation. Each task gets a fresh environment that disappears when the task ends.

1. _Tasks are ephemeral._ The environment is ready for use quickly, generally on the order of tens of seconds.
2. _Strong isolation._ Each task runs untrusted code (the agent's output) with strong isolation from other tasks and systems. VM-level or microVM isolation is increasingly favored for agent workloads because the agent's code is untrusted at the moment of execution (container-level isolation shares a kernel).
3. _Orchestration._ A control plane outside the sandbox manages task lifecycle: receiving triggers, allocating environments, tracking state, and routing results. Sandboxes are disposable execution primitives; the orchestrator is what makes them addressable and accountable.
4. _Parallelism._ Human engineers run one or two environments; agent workloads scale to hundreds or thousands of concurrent environments, controlled by a programmatic lifecycle.
5. _Snapshot / restore._ Pre-warming with a snapshot is what makes per-task spin-up fast enough for the agent loop to feel real-time.

**Full-fidelity environment.** Strong isolation is necessary but not sufficient, the environment must also be useful.

6. _Full toolchain._ The agent environment has access to the same dependencies, services, and configuration that a human engineer would have. We will address this particular need later as we have found it to be an acute pain point for customers investigating this topic.

**Controlled connectivity.** Once the agent is running, the question becomes what it can reach and what it can leak.

7. _Egress control and secrets protection._ Agents may try to exfiltrate data, call unintended APIs, publish secrets, or take other undesirable actions either deliberately, via prompt injection, or via compromised dependencies. The agent environment requires policy-controlled outbound traffic and secret injection at the boundary.
8. _Private service access._ Agents need to reach the organization's databases, internal APIs, and staging systems that are not on the public Internet.
9. _Context via MCP._ Agents need standardized access to internal knowledge, including observability, code search, and internal docs, through the Model Context Protocol.

**Human-gated review.** Throughput shifts the bottleneck.

10. _Human review._ Humans act as a review gate before agent-authored code is accepted. As agents ship more code, review becomes the limiting factor in completing tasks in the agent loop.

If the agent environment feels somewhat familiar, that’s because it’s a cross between a continuous integration (CI) environment and a cloud development environment. Existing CI runners match the ephemeral nature of the agent loop but are thin on capabilities; developer environments are full-fidelity environments, but persistent. Stripe spent years building per-engineer cloud devboxes — Amazon EC2 instances acquired in \~10 seconds from a pre-warmed pool, with the codebase cloned, caches warmed, and background services started ahead of time. Engineers were already able to run multiple devboxes per task; agents extended the model.

Agent productivity is downstream of dev infrastructure. Companies that already invested in moving development off laptops have a head start; companies still on local dev have a foundation to lay first. Others who have built shared test / staging environments in support of integration testing need to answer different questions to make those environments per-task ephemeral rather than per-user persistent.

What does that infrastructure actually look like, and what questions do you need to answer to build it on your own platform? The rest of this post walks through the reference architecture we recommend, the trade-offs at each layer, and the specific Cloudflare primitives that compose into a working system.

<div class="mb-8 rounded-xl border border-teal-500 bg-zinc-100 px-6 pb-4 dark:border-teal-400 dark:bg-zinc-900">

<h2 class="mt-6!">Where do I start?</h2>

Three quick questions to place company:

1. Where do engineers run code during inner-loop development? On their laptop? In a cloud environment? An ephemeral environment?
2. Can your development environment be created in response to a trigger, like a webhook or API call? Always / Sometimes / No
3. Does the development environment see secrets directly? Yes / No  
    **_If you are on local dev:_** the first move is reproducibility, adopt the [dev container spec](https://containers.dev/implementors/spec/). Background agents can come later.

   **_If you are on ephemeral environments (e.g., Tilt, Codespaces, preview environments):_** the first move is per-task ephemerality with snapshot/restore and isolation. The Tilt-shaped problem of “how does my microservice stack relate to the per-task sandbox” is the next section.

   **_If you are already at per-task agent-ready infrastructure:_** skip ahead. The reference architecture below is what you’ve built, we’ll show you how to map it to Cloudflare primitives.
   </div>

# A convergent pattern

The ten concerns described above are not independent, they can be composed into a single pattern, much of which any background agent implementation would share.

It all starts with a multi-surface entry point. Depending on your organizational needs and the agent’s purpose, this may be Slack or Jira or a generic webhook. The entry point funnels requests to a trusted control plane (“orchestrator”) that owns identity, lifecycle, and task state.

The orchestrator interacts with a per-task sandbox that provides the agent’s workspace. The sandbox critically provides isolation from other tasks. The sandbox is the trust boundary – agent-authored (untrusted) code runs inside the sandbox. The sandbox is the environment that provides the agent with the tools to complete the developer’s inner loop (edit → build → test → debug). Parallelism is provided by the sandbox infrastructure via the orchestrator, each sandbox is for one and only one task.

An egress proxy provides a pinch point for outbound traffic and credential injection. The proxy lives in a trusted space to access credentials. The agent should not have direct access to raw credentials and all outbound requests should be filtered / inspected. The egress proxy boundary enforces all internet access policies.

A single task ends with a pull request that passes through CI. Agents are not allowed to self-approve their own PR, a human review is the gate (and is the limiting factor in the throughput of the agent loop).

![Background agent conceptual view](/images/2026-5-27-building-background-agents-on-cloudflare/01-background-agent-conceptual.svg)

# The integration collision

Feature development and bug fixes almost never live in isolation, particularly in a microservices style architecture. Builders solved for integration testing of downstream dependencies in a number of ways in the human-oriented developer loop: long-lived stacks of microservices and shared development/testing clusters were common solutions. But these were designed to run once and stay running for the relatively small and slow human development loop. Agents want to run hundreds to thousands of parallel verifications, each starting from a clean slate. A human developer tolerates a shared staging cluster that drifts slightly over time. An agent running 500 tasks in parallel cannot. If one task modifies a shared database schema while another assumes yesterday’s shape, the failure is non-deterministic and nearly impossible to debug. Existing approaches are insufficient.

The core question is how existing long-lived, generally slow to spin-up dependencies relate to the per-task sandbox. Our aspiration is that dependencies come and go with the sandbox without impacting how long it takes for the sandbox to be ready.

The reality is that most organizations have yet to reach this aspirational state. They are navigating existing codebases with legacy dependencies, built on technologies that simply weren’t designed for the velocity of the agent loop. We see three primary paths for addressing this collision between agent workloads and integration dependencies. Because each path involves specific architectural trade-offs, the "correct" choice is ultimately a function of your own environment and constraints.

1. _Sandbox hosts the entire stack._ Run technologies like Docker-in-Docker or k3s in the sandbox using existing service definitions (e.g.`docker-compose.yaml`) as you would on a developer’s laptop. While closest to the current state and fastest to implement, this approach comes with increased burden per task and likely increased sandbox start-up times. Snapshot/restore functionality becomes even more essential.
2. _Shared external stack._ Microservices and other dependencies run outside the sandbox in a persistent, shared environment. The agent connects via its egress proxy and private network binding. The persistent nature of this approach means there is low impact on sandbox start-up latency but the state of the persistent stack is mutable, meaning the agent loop is not guaranteed a clean state.
3. _Decompose and mock._ Run only the subset of dependent services required by the agent in the sandbox, mock or stub others. This middle ground requires the most engineering investment, but has a lighter impact on the sandbox while providing meaningful verification.

None of the three paths is free. Each one pushes a cost somewhere: sandbox startup time, isolation guarantees, or engineering investment. The underlying shape of the background agent does not change with your approach. But the choice of platform has a meaningful impact depending on the cost and complexity of assembling primitives to meet our ten concerns.

The architectural shape is consistent regardless of platform. The difference is in how much assembly you need to do yourself. On Cloudflare, the primitives map cleanly to the pattern. Here’s what that looks like on Cloudflare.

# Cloudflare background agent reference architecture

The convergent pattern maps one-to-one onto a small set of Cloudflare primitives. Here's what each node in the pattern corresponds to.

**Start with the trust boundary.** One constraint shapes the entire design: the orchestrator, outbound handler, and all credential bindings live in the trusted Cloudflare Workers runtime. The sandbox sits outside that boundary. This separation is not cosmetic. It ensures that even if the agent generates malicious or compromised code, the blast radius is limited to the sandbox instance for that task. The agent's code, including anything it writes, executes, or fetches, runs inside the sandbox and is architecturally prevented from directly accessing credentials or bindings.

_Router Worker:_ A stateless Cloudflare Worker acts as the front door for all trigger surfaces: Slack, GitHub webhooks, cron, CLI, etc. It handles webhook signature verification, normalizes the payload into a task object, and routes to the orchestrator. It never runs agent code and never holds state.

_Orchestrator: Agent DO or Workflows._ Both provide durable execution well beyond the five-minute Worker request limit, and both support uniquely named identities suitable for per-task work. The choice depends on the shape of the task. The Agents SDK (built on Durable Objects) is the right fit for conversational or multi-turn work, it holds per-task state and can hibernate between LLM calls. Cloudflare Workflows is the right fit for discrete multi-step pipelines where each step needs independent retries and timeouts; a Workflow ID gives you natural deduplication for free. If you are building a pull request-scoped agent, start with Workflows. The two can also be composed: a Durable Object holds addressable task identity while delegating long-running operations to Workflows.

_Sandbox:_ The orchestrator allocates a per-task ephemeral virtual machine via the Sandbox SDK. Three things go inside: the agent harness, your existing dev container image, and a pre-warmed snapshot. Each sandbox is addressed by a task ID and is disposed of when the task ends. This is where the trust boundary is drawn — the agent's code runs inside the sandbox and cannot reach the credentials that live in the trusted runtime outside.

_Outbound handler:_ A static configuration on your Sandbox class, running in the trusted Workers runtime alongside the orchestrator (not inside the sandbox). Every `fetch()` that leaves the sandbox passes through it. The handler allows or denies by host, injects credentials at the boundary, and can log every egress call for audit. The agent issues a plain `fetch('https://github.com/...')`, the handler intercepts it and injects the token from an environment variable (`env.GITHUB_TOKEN`) before forwarding. The agent never sees the secret.

![Background agent Cloudflare view](/images/2026-5-27-building-background-agents-on-cloudflare/02-background-agent-cloudflare.svg)

_Private service access: Workers VPC and Cloudflare Tunnel._ Agents need to reach things that are not on the public internet, e.g., internal databases, staging APIs, and code search. The path is: `fetch('http://my.db/...')` from the sandbox → outbound handler catches it, optionally attaches credentials, and forwards via a Workers VPC binding → binding rides on a Cloudflare Tunnel connection established by a `cloudflared` daemon in your network → reaches the private service. No public IPs, no inbound firewall rules. Most organizations running Cloudflare One already have the necessary infrastructure. Note that Workers VPC is currently in beta.

_MCP Server Portal:_ The agent needs context that lives outside of the sandbox, such as observability data, internal documentation, or ticket history. The Cloudflare MCP Server Portal aggregates every MCP server the agent needs behind a single endpoint. From the agent’s perspective, this is just another `fetch()` through the outbound handler.

_Output: a PR under the engineer's identity:_ The agent harness opens a pull request from inside the sandbox. The outbound handler attaches the triggering engineer's personal token on the outbound request. The PR is attributed to the human who triggered the task (humans are still responsible for agent-written code), ensuring the agent cannot self-approve its work. The agent accelerates authorship, but it does not remove accountability. From the PR onward, everything is a normal workflow: existing CI runs, code owners are notified, and a human acts as the final gate.

# Getting off the ground

Getting started with a tightly scoped background agent is achievable in days for teams containerized CI or cloud development environments. We recommend starting with a pull request-scoped agent; a project-scoped agent can come later.

The smallest end-to-end build follows the PR-scoped shape: a GitHub webhook triggers a Workflow, the Workflow drives an agent in a Sandbox, the agent posts a PR, and a human reviews.

1. Wrap your existing dev container as a Sandbox. Same image you use for CI or Codespaces — pre-install your agent harness of choice.
2. Write a Worker to receive GitHub webhooks. Verify the signature; on `pull_request.opened` or a comment trigger, derive a Workflow ID from the PR number and head SHA (natural deduplication) and start the Workflow.
3. Write the Workflow. Two steps: setup boots the Sandbox and clones the branch; the agent runs the harness with a skill file and returns a typed result. The agent commits output to a side branch, not the PR branch.
4. Write the outbound handler. Allow the LLM provider and the GitHub endpoints you need; deny everything else; inject tokens at the boundary. Start narrow and expand.
5. Post a PR review with a capability link. Store a handoff record in KV (PR number, head SHA, side branch). Post inline annotations and a "Merge Changes" link — valid only while the head SHA matches.
6. Write the publish step. On link click: validate the token, check the head SHA, boot a fresh Sandbox, merge the side branch, push. Leave CI alone — it runs on the result exactly as it does today.

From here the path is additive: swap the skill file to add a new capability, add MCP for observability context, add snapshot/restore when cold-start becomes the bottleneck. The first PR the agent opens is the proof of concept. Everything after is configuration.

Background agents are not primarily an AI problem. They are an infrastructure problem. The organizations seeing the most leverage today are not those with the best prompts, but those with reproducible environments, strong isolation boundaries, and explicit control planes. The agent loop does not replace your development infrastructure. It stress tests it.
