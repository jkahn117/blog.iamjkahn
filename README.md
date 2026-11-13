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

Run `pnpm run deploy` to build and deploy through Wrangler. For an EmDash upgrade with database migrations, retain a database recovery point and media backup, follow the generated upgrade work order, and deploy the same build used for migration with `pnpm exec wrangler deploy` rather than rebuilding. GitHub Actions deployment also remains configured in `.github/workflows/deploy.yml`.

## Admin access

Production uses Cloudflare Access as EmDash's login provider. The Access identity must match an existing EmDash account; automatic provisioning and role synchronization are disabled. Set the protected application's AUD tag as the runtime `CF_ACCESS_AUDIENCE` Worker secret.

Protect `/_emdash` and `/_emdash/*` with an owner-only Access policy. Allow public uploads through a more-specific Bypass application for `/_emdash/api/media/file/*`, not the broader media API. Access applications and policies are managed in Cloudflare, outside this repository.
