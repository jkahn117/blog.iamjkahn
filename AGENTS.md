# AGENTS.md - blog.iamjkahn.com

## Site and scope

This is Josh Kahn's personal blog, built with Astro and EmDash on Cloudflare Workers. Optimize for secure publishing, preserved content and URLs, and Josh's visual approval. Prefer the smallest working change and native CMS features.

## Tickets

Use GitHub Issues in this repository. Follow the `tickets` skill when creating, reading, or updating tickets, including its triage labels and blocking conventions.

## Dev servers

Always ask for explicit permission before starting a dev or preview server, including test tools and subagents. Request to build, test, or verify is not implicit permission to start a server.

## Verification

Use existing checks and focused smoke tests. For small changes, test only new behavior. Don't duplicate existing coverage or fix unrelated test failures without asking.

Treat security exposure and irreversible data loss as launch blockers. Report other defects separately, and let Josh decide whether to defer them. Visual changes need Josh's approval.

## Project constraints

- Keep ordinary pages prerendered. Use request-time rendering only when request bindings or behavior require it. `src/components/Bluesky.astro` remains request-time and is rendered with `server:defer`.
- Read posts from EmDash. `_archive/content/` is historical source, not a runtime content collection.
- Build post URLs with `getPostPath()` in `src/lib/posts.ts`. Preserve imported `legacy_route` values independently of editable CMS slugs.
- Public listings and anonymous article routes expose only posts with `status: "published"`. Preserve native signed draft previews. Posts with `redirect_link` link externally and have no local article page.

## Formatting

Use Oxfmt for all formatting, including `.astro` templates. Keep `@astrojs/compiler-rs` installed for Astro formatter support.

## Completion gate

For code or configuration changes, run:

1. `pnpm lint`
2. `pnpm format:check`
3. `pnpm build`
