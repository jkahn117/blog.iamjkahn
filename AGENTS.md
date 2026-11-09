# Repository instructions

## Project constraints

- Keep ordinary pages prerendered. Use request-time rendering only when request bindings or behavior require it. `src/components/Bluesky.astro` remains request-time and is rendered with `server:defer`.
- Blog filenames use `YYYY-MM-DD-slug.md`. Build post URLs with `getPostSlug()` so the day is omitted from the route.
- Exclude posts with `publish: false` from public listings and routes. Posts with `redirect_link` link externally and have no local post page.

## Completion gate

For code or configuration changes, run:

1. `pnpm lint`
2. `pnpm format:check`
3. `pnpm build`

