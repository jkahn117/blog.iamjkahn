import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { transform } from "@astrojs/compiler-rs";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import ts from "typescript";

import type { Post } from "../emdash-env.ts";

// Render only the detail layout and its structural components, without a server
// or CMS connection. Media rendering is outside these taxonomy-focused checks.
const root = new URL("../", import.meta.url);
const emptyImage = new URL(
  "./fixtures/empty-portable-text.astro",
  import.meta.url,
).href;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === emptyImage) return { url: specifier, shortCircuit: true };
    if (specifier === "emdash/ui") {
      return {
        url: `data:text/javascript,${encodeURIComponent(`export { default as Image } from ${JSON.stringify(emptyImage)};`)}`,
        shortCircuit: true,
      };
    }
    if (specifier.startsWith("@/")) {
      return {
        url: new URL(`src/${specifier.slice(2)}`, root).href,
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (!url.endsWith(".astro")) return nextLoad(url, context);
    const source =
      url === emptyImage ? "<slot />" : readFileSync(new URL(url), "utf8");
    const { code } = transform(source, {
      filename: fileURLToPath(url),
      internalURL: "astro/compiler-runtime",
      resultScopedSlot: true,
      inlineComponentAssets: true,
      resolvePath: (specifier) => specifier,
    });
    return {
      format: "module",
      source: ts.transpileModule(code, {
        compilerOptions: {
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
        },
      }).outputText,
      shortCircuit: true,
    };
  },
});
const layoutPath = "../src/components/PostLayout.astro";
const { default: PostLayout } = await import(layoutPath);
const container = await AstroContainer.create();
after(() => hooks.deregister());

function term(name: string, slug: string, label: string) {
  return {
    id: `${name}-${slug}`,
    name,
    slug,
    label,
    children: [],
    locale: "en",
    translationGroup: `${name}-${slug}`,
  };
}

async function render(terms?: Post["terms"]) {
  const html = await container.renderToString(PostLayout, {
    props: {
      title: "Fixture article",
      date: new Date("2020-02-03T00:00:00Z"),
      terms,
    },
    slots: { default: "<p>Article body</p>" },
  });
  const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/)?.[1];
  assert.ok(article);
  return article;
}

await test("detail layout puts category after the date and topic badges below the body", async () => {
  const html = await render({
    category: [term("category", "cloud", "Cloud")],
    tag: [
      term("tag", "graphql", "GraphQL"),
      term("tag", "era-aws-and-serverless", "AWS and serverless"),
      term("tag", "aws", "AWS"),
    ],
  });
  const header = html.match(/<header\b[^>]*>([\s\S]*?)<\/header>/)?.[1];
  assert.ok(header);
  assert.match(header, /datetime="2020-02-03T00:00:00\.000Z"/);
  assert.ok(header.indexOf("</time>") < header.indexOf('aria-hidden="true"'));
  assert.ok(header.indexOf('aria-hidden="true"') < header.indexOf("Category:"));
  assert.match(header, /Category: <\/span>\s*Cloud/);
  assert.equal(
    [...header.matchAll(/text-zinc-400 dark:text-zinc-500/g)].length,
    2,
  );
  assert.match(header, /bg-zinc-400 dark:bg-zinc-500/);
  const footer = html.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/)?.[1];
  assert.ok(footer);
  assert.ok(html.indexOf("Article body") < html.indexOf("<footer"));
  const badges = footer.match(
    /<ul\b[^>]*aria-label="Topics"[^>]*>([\s\S]*?)<\/ul>/,
  )?.[1];
  assert.ok(badges);
  assert.equal([...badges.matchAll(/<li\b/g)].length, 2);
  assert.match(badges, /rounded-full border/);
  assert.ok(badges.indexOf("AWS") < badges.indexOf("GraphQL"));
  assert.doesNotMatch(badges, /AWS and serverless|<a\b/);
  assert.match(
    footer.replace(/\s+/g, " "),
    /From the archives tour: the AWS and serverless era\./,
  );
  assert.match(
    footer.replace(/\s+/g, " "),
    /An era groups posts by when I wrote them, not what they're about\./,
  );
});

await test("detail layout handles missing, topic-only, and era-only terms", async () => {
  for (const scenario of ["missing", "topics", "era"] as const) {
    const html = await render(
      scenario === "missing"
        ? undefined
        : {
            tag: [
              scenario === "topics"
                ? term("tag", "ruby", "Ruby")
                : term("tag", "era-web-and-mobile", "Web and mobile notebooks"),
            ],
          },
    );
    const header = html.match(/<header\b[^>]*>([\s\S]*?)<\/header>/)?.[1];
    assert.ok(header);
    assert.doesNotMatch(header, /Category:|aria-hidden="true"/);
    if (scenario === "missing") {
      assert.doesNotMatch(
        html,
        /<footer\b|aria-label="Topics"|From the archives tour:/,
      );
    } else if (scenario === "topics") {
      assert.match(html, /aria-label="Topics"/);
      assert.match(html, /Ruby/);
      assert.doesNotMatch(html, /From the archives tour:/);
    } else {
      assert.match(
        html.replace(/\s+/g, " "),
        /From the archives tour: the Web and mobile notebooks era\./,
      );
      assert.doesNotMatch(html, /aria-label="Topics"/);
    }
  }
});
