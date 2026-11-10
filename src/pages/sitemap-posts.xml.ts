import type { APIRoute } from "astro";
import { XMLBuilder } from "fast-xml-parser";

import { getPublicPosts } from "@/lib/posts";

export const prerender = false;

export const GET: APIRoute = async ({ site, cache }) => {
  const { posts, cacheHint } = await getPublicPosts();
  if (cache?.enabled) cache.set(cacheHint);
  const xml = new XMLBuilder({ ignoreAttributes: false }).build({
    urlset: {
      "@_xmlns": "http://www.sitemaps.org/schemas/sitemap/0.9",
      url: posts
        .filter((post) => post.path)
        .map((post) => ({
          loc: new URL(post.path!, site).href,
          lastmod: post.updatedAt.toISOString(),
        })),
    },
  });
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>${xml}`, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
