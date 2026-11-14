import { fileURLToPath } from "node:url";

import cloudflare from "@astrojs/cloudflare";
import { cacheCloudflare } from "@astrojs/cloudflare/cache";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import { access, d1, r2 } from "@emdash-cms/cloudflare";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";

function reactDomEdgeAlias() {
  return {
    name: "react-dom-server-edge",
    apply: "build" as const,
    config: () => ({
      resolve: {
        alias: { "react-dom/server": "react-dom/server.edge" },
      },
    }),
  };
}

export default defineConfig({
  site: "https://blog.iamjkahn.com",
  output: "server",
  trailingSlash: "never",
  prefetch: true,
  cache: { provider: cacheCloudflare() },
  routeRules: {
    "/": { maxAge: 3600, tags: ["posts", "pages"] },
    "/posts": { maxAge: 3600, tags: ["posts"] },
    "/posts/[year]/[month]/[slug]": { maxAge: 3600, tags: ["posts"] },
    "/about": { maxAge: 3600, tags: ["pages"] },
    "/speaking": { maxAge: 3600, tags: ["pages", "speaking"] },
    "/feed.xml": { maxAge: 3600, tags: ["posts"] },
    "/sitemap-posts.xml": { maxAge: 3600, tags: ["posts"] },
    "/sitemap-pages.xml": { maxAge: 3600, tags: ["pages"] },
    "/sitemap-speaking.xml": {
      maxAge: 3600,
      tags: ["speaking", "emdash:settings"],
    },
    "/sitemap.xml": {
      maxAge: 3600,
      tags: ["posts", "pages", "speaking", "emdash:settings"],
    },
  },
  adapter: cloudflare({
    configPath: "./wrangler.jsonc",
    imageService: {
      build: "compile",
      runtime: "cloudflare-binding",
    },
  }),
  integrations: [
    react(),
    sitemap({
      customSitemaps: [
        "https://blog.iamjkahn.com/sitemap-posts.xml",
        "https://blog.iamjkahn.com/sitemap-pages.xml",
      ],
    }),
    emdash({
      plugins: [
        {
          id: "migration-fields",
          version: "1.0.0",
          entrypoint: fileURLToPath(
            new URL("./src/admin/migration-fields-plugin.ts", import.meta.url),
          ),
          adminEntry: fileURLToPath(
            new URL("./src/admin/migration-fields.tsx", import.meta.url),
          ),
        },
      ],
      toolbar: "client",
      middleware: { outer: "./src/route-cache-middleware.ts" },
      siteUrl: process.env.EMDASH_SITE_URL ?? "https://blog.iamjkahn.com",
      database: d1({ binding: "DB" }),
      storage: r2({ binding: "MEDIA" }),
      auth: access({
        teamDomain: "iamjkahn.cloudflareaccess.com",
        audienceEnvVar: "CF_ACCESS_AUDIENCE",
        autoProvision: false,
        syncRoles: false,
      }),
    }),
  ],
  vite: {
    optimizeDeps: {
      include: [
        "@astro-community/astro-embed-bluesky",
        "@heroicons/react/24/outline",
        "date-fns",
      ],
    },
    plugins: [tailwindcss(), reactDomEdgeAlias()],
  },
  redirects: {
    "/archive": "/posts",
  },
});
