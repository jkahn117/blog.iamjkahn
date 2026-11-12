import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { transform } from "@astrojs/compiler-rs";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import ts from "typescript";

import type { Post } from "../emdash-env.ts";
import archive from "./fixtures/archive-posts.json" with { type: "json" };

// Compile the real route and shared design without starting EmDash middleware or
// writing CMS data. CMS queries, empty PortableText, and build-time assets are
// fixtures; token validation remains native EmDash middleware's responsibility.
let entry: { data: Post } | null = null;
let isPreview = false;
let entryError: Error | undefined;
let previewId: string | undefined;
let requestedId: string | undefined;
const cms = {
  getEmDashCollection: async (
    _collection: string,
    filter: { status: string },
  ) => {
    assert.equal(filter.status, "published");
    return { entries: entry?.data.status === "published" ? [entry] : [] };
  },
  getEmDashEntry: async (_collection: string, id: string) => {
    requestedId = id;
    return { entry, isPreview, error: entryError, cacheHint: {} };
  },
  getRequestContext: () => ({
    preview: previewId ? { collection: "posts", id: previewId } : undefined,
  }),
};
const fixtureUrl = `data:text/javascript,${encodeURIComponent("export const { getEmDashCollection, getEmDashEntry, getRequestContext } = globalThis.__articleNotFoundCms;")}`;
Object.assign(globalThis, { __articleNotFoundCms: cms });
const root = new URL("../", import.meta.url);
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.endsWith("/fixtures/empty-portable-text.astro"))
      return { url: specifier, shortCircuit: true };
    if (specifier === "astro:react:opts")
      return {
        url: "data:text/javascript,export default {}",
        shortCircuit: true,
      };
    if (specifier === "emdash/ui")
      return {
        url: `data:text/javascript,${encodeURIComponent(`export { default as PortableText } from ${JSON.stringify(new URL("./fixtures/empty-portable-text.astro", import.meta.url).href)};`)}`,
        shortCircuit: true,
      };
    if (specifier === "emdash") return { url: fixtureUrl, shortCircuit: true };
    if (specifier.startsWith("@/")) {
      let url = new URL(`src/${specifier.slice(2)}`, root);
      if (!existsSync(url)) url = new URL(`${url.href}.ts`);
      return { url: url.href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".css")) {
      return { format: "module", source: "", shortCircuit: true };
    }
    if (/\.(jpg|png)$/.test(url)) {
      return {
        format: "module",
        source:
          'export default { src: "/fixture.jpg", width: 64, height: 64 };',
        shortCircuit: true,
      };
    }
    if (url.endsWith(".astro") || url.endsWith(".tsx")) {
      const source = url.endsWith("/fixtures/empty-portable-text.astro")
        ? "<slot />"
        : readFileSync(new URL(url), "utf8");
      const code = url.endsWith(".astro")
        ? transform(source, {
            filename: fileURLToPath(url),
            internalURL: "astro/compiler-runtime",
            resultScopedSlot: true,
            inlineComponentAssets: true,
            resolvePath: (specifier) => specifier,
          }).code
        : source;
      return {
        format: "module",
        source: ts.transpileModule(code.replaceAll("import.meta.env", "({})"), {
          compilerOptions: {
            target: ts.ScriptTarget.ESNext,
            module: ts.ModuleKind.ESNext,
            jsx: ts.JsxEmit.ReactJSX,
          },
        }).outputText,
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

const { default: reactRenderer } = await import("@astrojs/react/server.js");
const articlePath = "../src/pages/posts/[year]/[month]/[slug].astro";
const article = await import(articlePath);
const fallbackPath = "../src/pages/posts/[id].astro";
const fallback = await import(fallbackPath);
const notFoundPath = "../src/pages/404.astro";
const notFound = await import(notFoundPath);
const container = await AstroContainer.create();
container.addServerRenderer({
  name: "@astrojs/react",
  renderer: reactRenderer,
});
container.addClientRenderer({
  name: "@astrojs/react",
  entrypoint: "@astrojs/react/client.js",
});

function post(overrides: Partial<Post> = {}): Post {
  return {
    id: "post-1",
    slug: "fixture-post",
    status: "published",
    title: "Fixture article title",
    excerpt: "Fixture article excerpt",
    content: [],
    legacy_route: "2020/02/fixture-post",
    createdAt: new Date("2020-02-01T00:00:00Z"),
    updatedAt: new Date("2020-02-02T00:00:00Z"),
    publishedAt: new Date("2020-02-03T00:00:00Z"),
    ...overrides,
  };
}

async function render(route: "article" | "fallback", path: string) {
  return container.renderToResponse(
    route === "article" ? article.default : fallback.default,
    {
      routeType: "page",
      request: new Request(`http://localhost${path}`),
      params:
        route === "article"
          ? {
              year: path.split("/")[2],
              month: path.split("/")[3],
              slug: path.split("/")[4]?.split("?")[0],
            }
          : { id: path.split("/")[2]?.split("?")[0] },
      partial: false,
    },
  );
}

function assertNotFound(response: Response, html: string) {
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("location"), null);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/);
  assert.match(html, /<title>Page not found - Josh Kahn<\/title>/);
  assert.match(
    html,
    /Sorry, the page you&#39;re looking for doesn&#39;t exist or has been moved\./,
  );
  assert.match(html, /Back to home/);
  assert.match(html, /<main\b/);
  assert.match(html, /<footer\b/);
  assert.match(html, /dark:text-zinc-100/);
  assert.doesNotMatch(
    html,
    /Fixture article|article:published_time|property="article:author"|<article\b/,
  );
}

await test("unavailable article routes render the shared 404 without disclosing content", async (t) => {
  for (const scenario of [
    "unknown",
    "wrong historical path",
    "draft",
    "external link",
    "not-found error",
  ]) {
    await t.test(scenario, async () => {
      isPreview = false;
      previewId = undefined;
      entryError = undefined;
      entry = { data: post() };
      if (scenario === "unknown" || scenario === "not-found error")
        entry = null;
      if (scenario === "not-found error")
        entryError = Object.assign(new Error("missing"), {
          name: "LiveEntryNotFoundError",
        });
      if (scenario === "draft") entry = { data: post({ status: "draft" }) };
      if (scenario === "external link")
        entry = { data: post({ redirect_link: "https://example.com/story" }) };
      const path =
        scenario === "wrong historical path"
          ? "/posts/2020/03/fixture-post"
          : "/posts/2020/02/fixture-post";
      for (const query of ["", "?_preview=invalid-token"]) {
        const response = await render("article", path + query);
        assertNotFound(response, await response.text());
        if (scenario !== "wrong historical path") {
          const fallbackResponse = await render(
            "fallback",
            "/posts/fixture-post" + query,
          );
          assertNotFound(fallbackResponse, await fallbackResponse.text());
          assert.match(
            fallbackResponse.headers.get("cache-control") ?? "",
            /private, no-store/,
          );
          assert.equal(
            fallbackResponse.headers.get("referrer-policy"),
            "no-referrer",
          );
        }
      }
    });
  }
});

await test("published articles and native preview results retain rendering and redirects", async () => {
  assert.equal(article.prerender, false);
  assert.equal(fallback.prerender, false);
  entryError = undefined;
  for (const preview of [false, true]) {
    isPreview = preview;
    previewId = preview ? "post-1" : undefined;
    entry = { data: post({ status: preview ? "draft" : "published" }) };
    const query = preview
      ? "?_preview=signed-fixture-token"
      : "?_preview=invalid-token";
    const response = await render(
      "article",
      "/posts/2020/02/fixture-post" + query,
    );
    assert.equal(response.status, 200);
    assert.match(
      await response.text(),
      /<article\b[^>]*>[\s\S]*Fixture article title/,
    );
    assert.equal(requestedId, "post-1");
    if (preview) {
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
    }
    const redirect = await render("fallback", "/posts/post-1" + query);
    assert.equal(redirect.status, 302);
    assert.equal(
      redirect.headers.get("location"),
      "/posts/2020/02/fixture-post" + (preview ? query : ""),
    );
    assert.equal(redirect.headers.get("cache-control"), "private, no-store");
    assert.equal(await redirect.text(), "");
  }
});

await test("article query failures are not disguised as missing content", async () => {
  entry = null;
  entryError = new Error("Database unavailable");
  for (const route of ["article", "fallback"] as const) {
    await assert.rejects(
      render(
        route,
        route === "article"
          ? "/posts/2020/02/fixture-post"
          : "/posts/fixture-post",
      ),
      /Database unavailable/,
    );
  }
  entryError = undefined;
});

await test("ordinary 404 retains the same prerendered presentation", async () => {
  assert.equal(notFound.prerender, true);
  const response = await container.renderToResponse(notFound.default);
  const html = await response.text();
  assert.match(html, /Page not found/);
  assert.match(html, /Back to home/);
});

after(() => {
  hooks.deregister();
  Reflect.deleteProperty(globalThis, "__articleNotFoundCms");
});

// Optional read-only checks against an existing local archive fixture, in dev or
// production preview. Never provision content to satisfy this test.
const target = process.env.EMDASH_NOT_FOUND_TEST_URL;
await test(
  "local HTTP article fallbacks have styled 404 responses",
  { skip: !target },
  async () => {
    const origin = new URL(target!);
    assert.ok(["http:", "https:"].includes(origin.protocol));
    assert.ok(["localhost", "127.0.0.1"].includes(origin.hostname));
    const draft = archive.find((entry) => entry.status === "draft")!;
    const external = archive.find(
      (entry) => entry.status === "published" && !entry.path,
    )!;
    for (const path of [
      "/posts/2026/03/nonexistent-article",
      "/posts/nonexistent-article",
      "/posts/2007/11/finallya-working-lcds-development-environment",
      `/posts/${draft.slug}`,
      draft.path!,
      `/posts/${external.slug}`,
    ]) {
      for (const query of ["", "?_preview=invalid-token"]) {
        const response = await fetch(new URL(path + query, origin), {
          redirect: "manual",
        });
        const html = await response.text();
        assertNotFound(response, html);
        assert.equal(html.includes(draft.title), false);
      }
    }
    const published = archive.find(
      (entry) => entry.status === "published" && entry.path,
    )!;
    const response = await fetch(new URL(published.path!, origin), {
      redirect: "manual",
    });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /<article\b/);
  },
);
