import type { APIRoute } from "astro";
import { getEmDashCollection } from "emdash";
import { XMLBuilder } from "fast-xml-parser";

export const prerender = false;

export const GET: APIRoute = async ({ site, cache }) => {
  const pages: { loc: string; lastmod: string }[] = [];
  for (const slug of ["about", "speaking"] as const) {
    const result = await getEmDashCollection("pages", {
      status: "published",
      where: { slug },
      limit: 1,
    });
    if (result.error) throw result.error;
    if (cache?.enabled) cache.set(result.cacheHint);
    const entry = result.entries.find(
      ({ data }) => data.status === "published" && data.slug === slug,
    );
    if (entry) {
      pages.push({
        loc: new URL(`/${slug}`, site).href,
        lastmod: entry.data.updatedAt.toISOString(),
      });
    }
  }
  const xml = new XMLBuilder({ ignoreAttributes: false }).build({
    urlset: {
      "@_xmlns": "http://www.sitemaps.org/schemas/sitemap/0.9",
      url: pages,
    },
  });
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>${xml}`, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
