import assert from "node:assert/strict";
import test from "node:test";

import provider from "@astrojs/cloudflare/cache/provider";
import { createContext, sequence } from "astro/middleware";

import config from "../astro.config.ts";
import {
  applyCacheHeaders,
  AstroCache,
  isCacheActive,
} from "../node_modules/astro/dist/core/cache/runtime/cache.js";
import {
  compileCacheRoutes,
  matchCacheRoute,
} from "../node_modules/astro/dist/core/cache/runtime/route-matching.js";
import { onRequest as legacyRedirects } from "../src/middleware.ts";
import { onRequest } from "../src/route-cache-middleware.ts";

const routes = compileCacheRoutes(config.routeRules!, "/", "never");

const cmsImagePath =
  "/_image?href=%2F_emdash%2Fapi%2Fmedia%2Ffile%2Fphoto.jpg&w=576&h=640&f=webp&q=80";

await test("CMS transformations cache for one day and retain validators", async () => {
  for (const status of [200, 304]) {
    const { context, cache, request } = fixture(cmsImagePath);
    const response = await onRequest(
      context,
      async () =>
        new Response(status === 304 ? null : "Image bytes", {
          status,
          headers: {
            "Content-Type": "image/webp",
            "Cache-Control": "public, max-age=0, must-revalidate",
            ETag: 'W/"source-transform"',
          },
        }),
    );
    assert.ok(response instanceof Response);
    applyCacheHeaders(cache, response, request);
    assert.equal(
      response.headers.get("Cache-Control"),
      "public, max-age=86400",
    );
    assert.equal(
      response.headers.get("Cloudflare-CDN-Cache-Control"),
      "public, max-age=86400",
    );
    assert.equal(response.headers.get("ETag"), 'W/"source-transform"');
  }
});

await test("image caching requires a valid CMS transform and raster response", async () => {
  for (const [path, contentType] of [
    [cmsImagePath.replace("w=576", "w=-1"), "image/webp"],
    ["/_image?href=https://example.com/photo.jpg&w=576", "image/webp"],
    [cmsImagePath, "text/html"],
    [cmsImagePath, "image/svg+xml"],
  ]) {
    const { context, cache, request } = fixture(path);
    const response = await onRequest(
      context,
      async () =>
        new Response("Not cacheable", {
          headers: { "Content-Type": contentType },
        }),
    );
    assert.ok(response instanceof Response);
    applyCacheHeaders(cache, response, request);
    assert.equal(isCacheActive(cache), false);
    assert.equal(
      response.headers.get("Cloudflare-CDN-Cache-Control"),
      "no-store",
    );
  }
});

function fixture(path: string, init?: RequestInit) {
  const request = new Request(`https://blog.iamjkahn.com${path}`, init);
  const cache = new AstroCache(provider(undefined));
  const rule = matchCacheRoute(new URL(request.url).pathname, routes);
  if (rule) cache.set(rule);
  const context = Object.assign(
    createContext({ request, defaultLocale: "en" }),
    { cache },
  );
  return { context, cache, request };
}

await test("each public CMS rule has a one-hour lifetime, native tags, and no SWR", async () => {
  assert.equal(config.cache?.provider?.name, "cloudflare");
  const expected = {
    "/": ["posts", "pages"],
    "/posts": ["posts"],
    "/posts/[year]/[month]/[slug]": ["posts"],
    "/about": ["pages"],
    "/speaking": ["pages", "speaking"],
    "/feed.xml": ["posts"],
    "/sitemap-posts.xml": ["posts"],
    "/sitemap-pages.xml": ["pages"],
    "/sitemap-speaking.xml": ["speaking", "emdash:settings"],
    "/sitemap.xml": ["posts", "pages", "speaking", "emdash:settings"],
  };
  assert.deepEqual(Object.keys(config.routeRules!), Object.keys(expected));
  for (const [route, tags] of Object.entries(expected)) {
    assert.deepEqual(config.routeRules![route], { maxAge: 3600, tags });
    const { context, cache, request } = fixture(
      route.replace("[year]/[month]/[slug]", "2020/02/story"),
    );
    const response = await onRequest(context, async () => {
      cache.set({ tags: ["entry-fixture"] });
      return new Response("Published content");
    });
    assert.ok(response instanceof Response);
    applyCacheHeaders(cache, response, request);
    assert.equal(
      response.headers.get("Cloudflare-CDN-Cache-Control"),
      "public, max-age=3600",
    );
    assert.equal(response.headers.get("Cache-Control"), "no-cache");
    assert.equal(response.headers.get("Last-Modified"), null);
    assert.equal(response.headers.get("ETag"), null);
    for (const tag of [...tags, "entry-fixture"]) {
      assert.ok(response.headers.get("Cache-Tag")!.split(",").includes(tag));
    }
  }
});

await test("hints and component CDN headers cannot cache excluded routes", async () => {
  for (const path of [
    "/_emdash/admin",
    "/_emdash/api/content/posts",
    "/_emdash/api/auth/session",
    "/_server-islands/Bluesky",
    "/posts/story",
    "/home",
    "/404",
    "/unknown",
    "/sitemap-unknown.xml",
    "/sitemap-posts-2.xml",
  ]) {
    const { context, cache, request } = fixture(path);
    assert.equal(matchCacheRoute(context.url.pathname, routes), null, path);
    const response = await onRequest(context, async () => {
      cache.set({ tags: ["posts"] });
      return new Response("Excluded content", {
        headers: {
          "Cloudflare-CDN-Cache-Control": "public, max-age=604800",
          "Cache-Tag": "posts",
        },
      });
    });
    assert.ok(response instanceof Response);
    applyCacheHeaders(cache, response, request);
    assert.equal(isCacheActive(cache), false, path);
    assert.equal(
      response.headers.get("Cloudflare-CDN-Cache-Control"),
      "no-store",
      path,
    );
    assert.equal(response.headers.get("Cache-Tag"), null);
  }
});

await test("errors, redirects, private responses and native opt-outs stay uncached", async () => {
  for (const scenario of [
    "301",
    "302",
    "307",
    "404",
    "403",
    "500",
    "503",
    "private",
    "no-store",
    "cookie",
    "native opt-out",
    "authorization",
    "editor",
    "POST",
  ]) {
    const { context, cache, request } = fixture("/posts", {
      method: scenario === "POST" ? "POST" : "GET",
      headers:
        scenario === "authorization" ? { Authorization: "Bearer fixture" } : {},
    });
    const response = await onRequest(context, async () => {
      cache.set({ tags: ["posts"] });
      if (scenario === "editor") {
        Object.assign(context.locals, { user: { id: "editor", role: 50 } });
      }
      if (scenario === "native opt-out") cache.set(false);
      const headers = new Headers();
      if (["private", "no-store"].includes(scenario))
        headers.set("Cache-Control", scenario);
      if (scenario === "cookie") headers.set("Set-Cookie", "fixture=value");
      return new Response("Not shareable", {
        status: /^\d+$/.test(scenario) ? Number(scenario) : 200,
        headers,
      });
    });
    assert.ok(response instanceof Response);
    applyCacheHeaders(cache, response, request);
    assert.equal(isCacheActive(cache), false, scenario);
    assert.equal(
      response.headers.get("Cloudflare-CDN-Cache-Control"),
      "no-store",
      scenario,
    );
  }
  const { context, cache } = fixture("/posts");
  await assert.rejects(
    async () =>
      onRequest(context, async () => {
        throw new Error("Database unavailable");
      }),
    /Database unavailable/,
  );
  assert.equal(isCacheActive(cache), false);
});

await test("every preview and edit URL stays private even if rendering sets hints", async () => {
  for (const query of [
    "?_preview=valid-fixture",
    "?_preview=invalid",
    "?_preview=expired",
    "?_preview=",
    "?_edit",
    "?_edit=1",
  ]) {
    const { context, cache, request } = fixture(`/posts/2020/02/story${query}`);
    const response = await onRequest(context, async () => {
      cache.set({ tags: ["entry-fixture"] });
      return new Response("Preview or edit content");
    });
    assert.ok(response instanceof Response);
    applyCacheHeaders(cache, response, request);
    assert.equal(isCacheActive(cache), false);
    assert.equal(
      response.headers.get("Cloudflare-CDN-Cache-Control"),
      "no-store",
    );
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  }
});

await test("legacy middleware redirects never announce cache intent", async () => {
  for (const suffix of ["", ".html"]) {
    const { context, cache, request } = fixture(`/2020/02/story${suffix}`);
    const response = await sequence(onRequest, legacyRedirects)(
      context,
      async () => new Response("Unexpected render"),
    );
    assert.ok(response instanceof Response);
    applyCacheHeaders(cache, response, request);
    assert.equal(response.status, 301);
    assert.equal(response.headers.get("Location"), "/posts/2020/02/story");
    assert.equal(
      response.headers.get("Cloudflare-CDN-Cache-Control"),
      "no-store",
    );
  }
});
