import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { ContentEntry, EntryResult } from "emdash";

import type { Page } from "../emdash-env.ts";
import { aboutPageSeed, getAboutPage } from "../src/lib/about.ts";

function pageFixture(overrides: Partial<Page> = {}): ContentEntry<Page> {
  return {
    id: "about",
    data: {
      id: "page-1",
      slug: "about",
      status: "published",
      ...aboutPageSeed.data,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-02T00:00:00Z"),
      publishedAt: new Date("2026-01-02T00:00:00Z"),
      ...overrides,
    },
    edit: {},
  };
}

function resultFixture(
  overrides: Partial<EntryResult<Page>> = {},
): EntryResult<Page> {
  return {
    entry: pageFixture(),
    isPreview: false,
    cacheHint: { tags: ["pages", "page-1"] },
    ...overrides,
  };
}

test("about seed preserves the original heading and all four biography paragraphs", () => {
  assert.equal(aboutPageSeed.slug, "about");
  assert.equal(aboutPageSeed.status, "draft");
  assert.equal(
    aboutPageSeed.data.title,
    "I'm Josh Kahn. Solutions architect, speaker, technology guy, dad.",
  );
  assert.deepEqual(
    aboutPageSeed.data.content.map((block) => block.children[0]!.text),
    [
      "I've loved building things for as long as I can remember. From Legos to constructs to my first computer program with BASIC on my Apple IIe, I enjoy building and solving problems.",
      "After years of blogging on various platforms, I've tried to pull together almost 15 years of posts in one place. While mostly technical, you'll find a variety of topics discussed here, including a long ago trip to Australia.",
      "This site is built using Astro, Cloudflare Workers, and the Tailwind UI Spotlight theme.",
      "Enjoy! Josh",
    ],
  );
});

test("getAboutPage queries native pages/about and preserves published data, edit attributes, and cache hints", async () => {
  const published = resultFixture();
  const actual = await getAboutPage(async (collection, slug) => {
    assert.equal(collection, "pages");
    assert.equal(slug, "about");
    return published;
  });
  assert.equal(actual, published);
  assert.equal(actual.entry?.data.status, "published");
  assert.equal(actual.entry?.data.title, aboutPageSeed.data.title);
  assert.deepEqual(actual.cacheHint.tags, ["pages", "page-1"]);
});

test("getAboutPage hides unavailable or unpublished pages unless native EmDash authorizes preview", async () => {
  for (const entry of [
    null,
    pageFixture({ status: "draft" }),
    pageFixture({ status: "archived" }),
  ]) {
    const result = await getAboutPage(async () => resultFixture({ entry }));
    assert.equal(result.entry, null);
    assert.equal(result.isPreview, false);
    assert.deepEqual(result.cacheHint, {});
    assert.equal(
      JSON.stringify(result).includes(aboutPageSeed.data.title),
      false,
    );
  }

  const draft = resultFixture({
    entry: pageFixture({ status: "draft", title: "Unpublished biography" }),
    isPreview: true,
  });
  assert.equal(await getAboutPage(async () => draft), draft);
});

test("getAboutPage rejects another page even in native preview mode", async () => {
  for (const isPreview of [true, false]) {
    const result = await getAboutPage(async () =>
      resultFixture({
        entry: pageFixture({ slug: "another-page", title: "Private page" }),
        isPreview,
      }),
    );
    assert.equal(result.entry, null);
    assert.equal(JSON.stringify(result).includes("Private page"), false);
  }
});

// Read-only proof against build output, without starting a CMS runtime:
// pnpm build && EMDASH_ABOUT_BUILD_TEST=1 pnpm test
// This covers the inactive prerendered page, not the unapproved CMS activation.
test(
  "prerendered about preserves public content, metadata, portrait, layout, links, and sitemap",
  {
    skip: process.env.EMDASH_ABOUT_BUILD_TEST !== "1",
  },
  () => {
    const html = readFileSync(
      new URL("../dist/client/about/index.html", import.meta.url),
      "utf8",
    );
    const text = html.replace(/&#39;|&apos;/g, "'");
    assert.match(html, /<title>About - Josh Kahn<\/title>/);
    assert.ok(
      html.includes(
        '<meta name="description" content="I\'m Josh Kahn. Solutions architect, speaker, technology guy, dad.">',
      ),
    );
    assert.ok(
      html.includes(
        '<link rel="canonical" href="https://blog.iamjkahn.com/about">',
      ),
    );
    assert.ok(text.includes(aboutPageSeed.data.title));
    const biography = text.match(
      /<div class="mt-6 space-y-7 text-base text-zinc-600 dark:text-zinc-400">([\s\S]*?)<\/div>/,
    )?.[1];
    assert.ok(biography);
    assert.equal([...biography.matchAll(/<p\b/g)].length, 4);
    for (const block of aboutPageSeed.data.content) {
      assert.ok(biography.includes(block.children[0]!.text));
    }
    for (const className of [
      "grid grid-cols-1 gap-y-16 lg:grid-cols-2 lg:grid-rows-[auto_1fr] lg:gap-y-12",
      "lg:order-first lg:row-span-2",
      "aspect-square rotate-3 rounded-2xl bg-zinc-100 object-cover dark:bg-zinc-800",
      "text-4xl font-bold tracking-tight text-zinc-800 sm:text-5xl dark:text-zinc-100",
    ])
      assert.ok(html.includes(`class="${className}"`), className);
    for (const href of [
      "https://bsky.app/profile/iamjkahn.com",
      "https://github.com/jkahn117",
      "https://www.linkedin.com/in/joshuaakahn/",
      "https://x.com/joshuaakahn",
    ])
      assert.ok(html.includes(`href="${href}"`), href);
    assert.match(html, /<img[^>]+alt="Josh Kahn"/);
    assert.ok(html.includes('sizes="(min-width: 1024px) 32rem, 20rem"'));
    const sitemap = readFileSync(
      new URL("../dist/client/sitemap-0.xml", import.meta.url),
      "utf8",
    );
    assert.ok(sitemap.includes("<loc>https://blog.iamjkahn.com/about</loc>"));
  },
);

test("getAboutPage treats native not-found errors as missing but surfaces CMS failures", async () => {
  const missing = new Error("No entry");
  missing.name = "LiveEntryNotFoundError";
  const result = await getAboutPage(async () =>
    resultFixture({ entry: null, error: missing }),
  );
  assert.equal(result.entry, null);
  assert.equal("error" in result, false);

  const failure = new Error("Database unavailable");
  await assert.rejects(
    getAboutPage(async () => resultFixture({ entry: null, error: failure })),
    failure,
  );
});
