---
date: "2026-02-15T05:00:00.000Z"
title: "A new framework, a new home"
author: "Josh"
summary: "Migrating my blog from Next.js and GitHub Pages to Astro and Cloudflare Workers, with a little help from Claude."
---

Over the years, my (lightly-read) blog has found its home across a number of platforms: Blogger, Medium, and GitHub Pages most recently.

Now that I work for Cloudflare, I wanted to take the opportunity to learn some tools I don't use day-to-day — DNS configuration, redirect rules, Cloudflare Access. I also wanted to experience a migration from Next.js to [Astro](https://astro.build), a framework Cloudflare has invested in and recommends for building on Workers.

Claude made fairly quick work of the migration over the weekend — within ~15 minutes I had a development version of the blog up and running on Astro. I cleaned up a few extraneous components, fixed the light/dark theme toggle, and revised the GitHub Actions deployment pipeline.

I use Claude and similar tools daily at work. The improvement in capability has been dramatic over the past few months — this migration would have taken me hours to do manually.

There were a few hiccups along the way:

- Pinning the Wrangler version in GitHub Actions (the bundled version didn't support `wrangler.jsonc`)
- Fixing an SSR bundling issue where React 19 pulled in a browser-only module that referenced APIs unavailable in the Workers runtime
- Figuring out that Cloudflare runtime environment variables aren't available at build time for prerendered pages

I also added [Counterscale](https://counterscale.dev) for self-hosted web analytics.

And now, I wait for DNS to propagate after moving my domain from Route53 to Cloudflare...
