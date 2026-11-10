# AGENTS.md - blog.iamjkahn.com

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
