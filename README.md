# blog.iamjkahn.com

Josh Kahn's personal blog, built with Astro, React, Tailwind CSS, and EmDash on Cloudflare Workers. D1 stores CMS content; R2 stores uploaded media.

## Development

Use Node.js 24 or later and pnpm.

```sh
pnpm install
EMDASH_SITE_URL=http://localhost:4321 pnpm dev
```

Open `http://localhost:4321/_emdash/admin` for the CMS. Local development uses passkeys and emulated D1/R2 storage under `.wrangler/`. A fresh clone needs the CMS schema and content restored from an approved backup or site export; generated types do not provision them.

Posts, About, and Speaking are editable in EmDash and update without rebuilding. `_archive/content/` preserves the original Markdown and is not read at runtime. Historical images remain static assets in `public/`; keep those URLs available.

Keep credentials in ignored environment files or Cloudflare Worker secrets. Preserve existing `EMDASH_ENCRYPTION_KEY` values with database backups if encrypted CMS settings are used.

## Checks and deployment

```sh
pnpm lint
pnpm format:check
pnpm test
pnpm build
```

The test command skips HTTP checks unless a local server is specified:

```sh
EMDASH_RENDER_TEST_URL=http://localhost:4321 \
  EMDASH_PUBLIC_TEST_URL=http://localhost:4321 \
  EMDASH_NOT_FOUND_TEST_URL=http://localhost:4321 pnpm test
```

The HTTP checks expect the imported archive and accept only loopback targets.

Run `pnpm run deploy` to build and deploy through Wrangler. For an EmDash upgrade with database migrations, retain a database recovery point and media backup, follow the generated upgrade work order, and deploy the same build used for migration with `pnpm exec wrangler deploy` rather than rebuilding. GitHub Actions in `.github/workflows/deploy.yml` is manual-only. Pushes and pull requests do not run checks or deploy. Use Run workflow in the Actions tab to run checks and deploy explicitly.

## Admin access

Production uses Cloudflare Access as EmDash's login provider. The Access identity must match an existing EmDash account; automatic provisioning and role synchronization are disabled. Set the protected application's AUD tag as the runtime `CF_ACCESS_AUDIENCE` Worker secret.

Protect `/_emdash` and `/_emdash/*` with an owner-only Access policy. Allow public uploads through a more-specific Bypass application for `/_emdash/api/media/file/*`, not the broader media API. Access applications and policies are managed in Cloudflare, outside this repository.

## Illustration prompt

Create blog post featured illustrations with the prompt:

```
Create a wide, 2:1 editorial illustration for a personal technology blog.

- Light, hand-drawn colored pencil and graphite on warm, off-white paper.
- Whimsical, storybook-inspired imagery with subtle imperfections and natural pencil textures.
- Soft, muted colors and restrained shading.
- Simple compositions with generous negative space.
- Use visual metaphors to convey technical concepts rather than illustrating their literal implementation.
- Avoid text, labels, diagrams, dashboards, and overt technology iconography wherever possible.

The illustration should feel like a thoughtful sketch accompanying an editorial essay, not a piece of corporate marketing. Evocative rather than explanatory.

Here's the post excerpt: INSERT_EXCERPT
```
