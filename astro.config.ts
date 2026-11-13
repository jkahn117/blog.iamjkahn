import cloudflare from "@astrojs/cloudflare";
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
  adapter: cloudflare({
    configPath: "./wrangler.jsonc",
    imageService: "compile",
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
      siteUrl: process.env.EMDASH_SITE_URL,
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
