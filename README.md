# https://blog.iamjkahn.com

Personal blog built with [Astro 5](https://astro.build), React, Tailwind CSS v4, and deployed to Cloudflare Workers.

## Commands

| Command             | Description                                           |
| ------------------- | ----------------------------------------------------- |
| `pnpm dev`          | Start dev server                                      |
| `pnpm build`        | Production build (also runs `wrangler types`)         |
| `pnpm preview`      | Preview production build locally via Wrangler         |
| `pnpm create`       | Interactive CLI to scaffold a new blog post           |
| `pnpm format`       | Format files with Oxfmt and Astro files with Prettier |
| `pnpm format:check` | Check formatting without writing files                |
| `pnpm lint`         | Lint code with Oxlint                                 |
| `pnpm lint:fix`     | Apply safe Oxlint fixes                               |

## Project structure

```
src/
├── content/
│   └── blog/           # Markdown blog posts (YYYY-MM-DD-slug.md)
├── content.config.ts   # Astro content collection schema
├── middleware.ts        # Legacy URL redirect handler
├── pages/
│   ├── index.astro
│   ├── about.astro
│   ├── speaking.astro
│   ├── posts/
│   │   ├── index.astro
│   │   └── [year]/[month]/[slug].astro
│   └── feed.xml.ts     # RSS feed
├── layouts/
│   └── Base.astro      # Root HTML layout (head, analytics)
├── components/         # Astro + React components
└── css/                # Tailwind and Prism styles
```

## Blog posts and content collections

Posts are Markdown files in `src/content/blog/` following the naming convention `YYYY-MM-DD-slug.md`. They are loaded via Astro's [Content Collections](https://docs.astro.build/en/guides/content-collections/) with a glob loader defined in `src/content.config.ts`.

Each post supports the following frontmatter:

| Field           | Required | Description                                                      |
| --------------- | -------- | ---------------------------------------------------------------- |
| `title`         | Yes      | Post title                                                       |
| `date`          | Yes      | Publish date (ISO 8601)                                          |
| `author`        | No       | Author name                                                      |
| `summary`       | No       | Short description (used in RSS and post listings)                |
| `redirect_link` | No       | External URL — makes the post a link-style post pointing offsite |

Run `pnpm create` for an interactive prompt that scaffolds the frontmatter and file automatically.

## Middleware

`src/middleware.ts` handles **legacy Blogger URL redirects** (301) so that old URLs previously indexed by Google continue to resolve:

- `/{year}/{month}/{slug}.html` → `/posts/{year}/{month}/{slug}`
- `/{year}/{month}/{slug}` → `/posts/{year}/{month}/{slug}`

The `/archive` → `/posts` redirect is a static redirect configured in `astro.config.ts`.

## Deployment

The site deploys to Cloudflare Workers via GitHub Actions (`.github/workflows/deploy.yml`) on push to `main`. All pages use `export const prerender = true`, so the site builds as fully static HTML and is served via Cloudflare's asset pipeline.

Environment variables required at build time:

| Variable               | Description                     |
| ---------------------- | ------------------------------- |
| `PUBLIC_SITE_URL`      | Canonical site URL              |
| `PUBLIC_ANALYTICS_URL` | Counterscale tracker script URL |
