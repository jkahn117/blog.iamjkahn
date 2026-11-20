import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test, { after } from "node:test";

import { XMLParser } from "fast-xml-parser";

import type { Post } from "../emdash-env.ts";
import {
  getPostDate,
  getPostPath,
  getPublicPosts,
  toPublicPost,
} from "../src/lib/posts.ts";
import archive from "./fixtures/archive-posts.json" with { type: "json" };

function postFixture(overrides: Partial<Post> = {}): Post {
  return {
    id: "post-1",
    slug: "fixture-post",
    status: "published",
    title: "Fixture post",
    excerpt: "A fixture excerpt",
    legacy_route: "2020/02/fixture-post",
    redirect_link: undefined,
    legacy_published_at: "2007-11-01T00:48:36.000Z",
    createdAt: new Date("2020-02-01T00:00:00.000Z"),
    updatedAt: new Date("2020-02-02T00:00:00.000Z"),
    publishedAt: new Date("2020-02-03T00:00:00.000Z"),
    ...overrides,
  };
}

test("public post dates use publishedAt, never the rollback legacy field", () => {
  assert.equal(
    getPostDate(postFixture()).toISOString(),
    "2020-02-03T00:00:00.000Z",
  );
  assert.equal(
    getPostDate(postFixture({ legacy_published_at: "not-a-date" })).getTime(),
    new Date("2020-02-03T00:00:00.000Z").getTime(),
  );
  assert.throws(
    () => getPostDate(postFixture({ publishedAt: null })),
    /no valid publication date/,
  );
  assert.throws(
    () => getPostDate(postFixture({ publishedAt: new Date("invalid") })),
    /no valid publication date/,
  );
});

test("historical post paths stay fixed when the current slug changes", () => {
  assert.equal(getPostPath(postFixture()), "/posts/2020/02/fixture-post");
  assert.equal(
    getPostPath(
      postFixture({
        slug: "renamed-post",
        publishedAt: new Date("2026-12-01T00:00:00.000Z"),
      }),
    ),
    "/posts/2020/02/fixture-post",
  );
  for (const legacy_route of [
    "2020/13/fixture-post",
    "2020/00/fixture-post",
    "2020/02/../fixture-post",
    "2020/02/%2e%2e",
    "/2020/02/fixture-post",
  ]) {
    assert.equal(
      getPostPath(postFixture({ legacy_route })),
      null,
      legacy_route,
    );
  }
});

test("new post paths use publication dates and creation dates for draft previews", () => {
  const native = postFixture({
    legacy_route: undefined,
  });
  assert.equal(getPostPath(native), "/posts/2020/02/fixture-post");
  assert.equal(
    getPostPath({ ...native, legacy_route: "" }),
    "/posts/2020/02/fixture-post",
  );
  const draft = {
    ...native,
    status: "draft",
    publishedAt: null,
    createdAt: new Date("2019-12-31T23:30:00-02:00"),
  };
  assert.equal(getPostDate(draft).toISOString(), "2020-01-01T01:30:00.000Z");
  assert.equal(getPostPath(draft), "/posts/2020/01/fixture-post");
  assert.equal(toPublicPost(draft), null);
  assert.equal(getPostPath({ ...native, slug: null }), null);
  assert.equal(getPostPath({ ...native, slug: "../unsafe" }), null);
  assert.equal(toPublicPost(native)?.path, "/posts/2020/02/fixture-post");
});

test("public conversion excludes drafts and keeps external posts pathless", () => {
  assert.equal(toPublicPost(postFixture({ status: "draft" })), null);
  const external = toPublicPost(
    postFixture({ redirect_link: "https://example.com/story" }),
  );
  assert.equal(external?.href, "https://example.com/story");
  assert.equal(external?.path, null);
  assert.throws(
    () => toPublicPost(postFixture({ redirect_link: "javascript:alert(1)" })),
    /HTTP or HTTPS/,
  );
  assert.throws(
    () => toPublicPost(postFixture({ redirect_link: "data:text/html,unsafe" })),
    /HTTP or HTTPS/,
  );
  assert.equal(
    toPublicPost(postFixture({ slug: "renamed-post" }))?.href,
    "/posts/2020/02/fixture-post",
  );
});

test("public filter metadata includes categories and only era tags", () => {
  const term = (slug: string) => ({
    id: slug,
    name: "tag",
    slug,
    label: slug,
    children: [],
    locale: "en",
    translationGroup: slug,
  });
  const post = toPublicPost(
    postFixture({
      terms: {
        category: [term("cloud")],
        tag: [term("graphql"), term("era-aws")],
      },
    }),
  );
  assert.deepEqual(post?.categories, [{ slug: "cloud", label: "cloud" }]);
  assert.deepEqual(post?.eras, [{ slug: "era-aws", label: "era-aws" }]);
  assert.deepEqual(toPublicPost(postFixture())?.categories, []);
  assert.deepEqual(toPublicPost(postFixture())?.eras, []);
});

// Fixture order records native ordering within equal publication timestamps.
const publicArchive = archive
  .filter((entry) => entry.status === "published")
  .toSorted((left, right) => Date.parse(right.date) - Date.parse(left.date));

let queryPosts: Post[] = [];
let queryError: Error | undefined;
const calls: Array<{
  status: string;
  limit: number;
  cursor?: string;
  orderBy: Record<string, string>;
}> = [];
const cms = {
  getEmDashCollection: async (
    collection: string,
    filter: (typeof calls)[number],
  ) => {
    assert.equal(collection, "posts");
    calls.push(filter);
    const start = Number(filter.cursor ?? 0);
    const entries = queryPosts.slice(start, start + filter.limit);
    const end = start + entries.length;
    return {
      entries: entries.map((data) => ({ data })),
      nextCursor: end < queryPosts.length ? String(end) : undefined,
      error: queryError,
      cacheHint: {
        tags: ["collection:posts", `page:${start}`],
        lastModified: new Date(2026, 0, calls.length),
      },
    };
  },
};
Object.assign(globalThis, { __publicPostsCms: cms });
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "emdash") {
      return {
        url: `data:text/javascript,${encodeURIComponent("export const { getEmDashCollection } = globalThis.__publicPostsCms;")}`,
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});
after(() => hooks.deregister());

function resetQueries(posts: Post[]) {
  queryPosts = posts;
  queryError = undefined;
  calls.length = 0;
}

const importedPosts = publicArchive.map((entry) =>
  postFixture({
    title: entry.title,
    slug: entry.slug,
    legacy_route: entry.path?.slice("/posts/".length),
    redirect_link: entry.path ? undefined : entry.href,
    publishedAt: new Date(entry.date),
  }),
);

test("bounded native queries return exactly five or ten without walking the archive", async () => {
  for (const limit of [5, 10]) {
    resetQueries(importedPosts);
    const { posts } = await getPublicPosts({ limit });
    assert.equal(posts.length, limit);
    assert.deepEqual(
      posts.map((post) => post.href),
      publicArchive.slice(0, limit).map((post) => post.href),
    );
    assert.deepEqual(calls, [
      {
        status: "published",
        limit,
        cursor: undefined,
        orderBy: { published_at: "desc" },
      },
    ]);
  }
});

test("bounded queries fetch only the remaining count after ineligible paths", async () => {
  const valid = (slug: string) =>
    postFixture({ slug, legacy_route: undefined });
  resetQueries([
    postFixture({ legacy_route: "2020/13/invalid" }),
    valid("z-first"),
    postFixture({ slug: null, legacy_route: undefined }),
    valid("a-second"),
    postFixture({ status: "draft" }),
    postFixture({
      legacy_route: "invalid",
      redirect_link: "https://example.com/external",
    }),
    valid("third"),
    postFixture({ legacy_route: "invalid" }),
    valid("fourth"),
    valid("fifth"),
    valid("not-needed"),
  ]);
  const { posts, cacheHint } = await getPublicPosts({ limit: 5 });
  assert.deepEqual(
    posts.map((post) => post.href),
    [
      "/posts/2020/02/z-first",
      "/posts/2020/02/a-second",
      "https://example.com/external",
      "/posts/2020/02/third",
      "/posts/2020/02/fourth",
    ],
  );
  assert.deepEqual(
    calls.map(({ limit, cursor }) => ({ limit, cursor })),
    [
      { limit: 5, cursor: undefined },
      { limit: 3, cursor: "5" },
      { limit: 1, cursor: "8" },
    ],
  );
  assert.deepEqual(cacheHint.tags, [
    "collection:posts",
    "page:0",
    "page:5",
    "page:8",
  ]);
  assert.equal(
    cacheHint.lastModified?.getTime(),
    new Date(2026, 0, 3).getTime(),
  );
});

test("unlimited queries retain the full archive, local sitemap routes, and native tie order", async () => {
  resetQueries(importedPosts);
  const { posts } = await getPublicPosts();
  assert.equal(posts.length, 112);
  assert.deepEqual(
    posts.map((post) => post.href),
    publicArchive.map((post) => post.href),
  );
  assert.deepEqual(
    posts.filter((post) => post.path).map((post) => post.path),
    publicArchive.filter((post) => post.path).map((post) => post.path),
  );
  assert.equal(posts.filter((post) => post.path).length, 97);
  assert.deepEqual(
    calls.map(({ limit, cursor }) => ({ limit, cursor })),
    [
      { limit: 100, cursor: undefined },
      { limit: 100, cursor: "100" },
    ],
  );
  assert.deepEqual(
    posts
      .filter((post) => post.date.toISOString() === "2020-06-04T05:00:00.000Z")
      .map((post) => post.title),
    [
      "Building a GraphQL interface to Amazon QLDB with AWS AppSync: Part 2",
      "Building a GraphQL interface to Amazon QLDB with AWS AppSync: Part 1",
    ],
  );
});

test("total limits validate before querying and larger limits use native batches", async () => {
  resetQueries(importedPosts);
  for (const limit of [
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    await assert.rejects(getPublicPosts({ limit }), /positive safe integer/);
  }
  assert.equal(calls.length, 0);
  assert.equal((await getPublicPosts({ limit: 105 })).posts.length, 105);
  assert.deepEqual(
    calls.map((call) => call.limit),
    [100, 5],
  );
  resetQueries(importedPosts.slice(0, 2));
  assert.equal((await getPublicPosts({ limit: 5 })).posts.length, 2);
  assert.equal(calls.length, 1);
  resetQueries([]);
  assert.deepEqual((await getPublicPosts({ limit: 5 })).posts, []);
  assert.equal(calls.length, 1);
  queryError = new Error("query failed");
  await assert.rejects(getPublicPosts({ limit: 5 }), /query failed/);
});

// Read-only checks against an unchanged local archive import:
// EMDASH_PUBLIC_TEST_URL=http://localhost:4321 pnpm test
// The snapshot keeps archive contracts independent of retired import tooling.
const target = process.env.EMDASH_PUBLIC_TEST_URL;

test(
  "public post listings, feeds, sitemap, and anonymous fallbacks match the archive fixture",
  { skip: !target },
  async (t) => {
    const origin = new URL(target!);
    assert.ok(["http:", "https:"].includes(origin.protocol));
    assert.ok(["localhost", "127.0.0.1"].includes(origin.hostname));
    assert.equal(origin.username, "");
    assert.equal(origin.password, "");
    assert.ok(origin.pathname === "/" || origin.pathname === "");
    assert.equal(origin.search, "");
    assert.equal(origin.hash, "");

    const published = archive.filter((entry) => entry.status === "published");
    assert.equal(published.length, 112);
    assert.equal(archive.filter((entry) => entry.status === "draft").length, 1);
    const publicPosts = publicArchive.map((entry) => ({
      title: entry.title,
      date: new Date(entry.date),
      href: entry.href,
      path: entry.path,
      slug: entry.slug,
    }));
    const localPosts = publicPosts.filter((entry) => entry.path);
    const externalPosts = publicPosts.filter((entry) => !entry.path);
    const draft = archive.find((entry) => entry.status === "draft")!;

    const get = async (path: string) => {
      const response = await fetch(new URL(path, origin), {
        redirect: "manual",
      });
      const body = await response.text();
      return { response, body };
    };
    const normalizeHref = (href: string) => {
      const url = new URL(href, origin);
      const local = [origin.origin, "https://blog.iamjkahn.com"].includes(
        url.origin,
      );
      return local && url.pathname.startsWith("/posts/")
        ? url.pathname
        : url.href;
    };
    const titleHrefPairs = (html: string) =>
      [...html.matchAll(/<article\b[\s\S]*?<\/article>/g)].map((match) => {
        const article = match[0];
        const href = article.match(/<a\b[^>]*href="([^"]+)"/)?.[1];
        const title = article
          .match(/<a\b[^>]*href="[^"]+"[^>]*>([\s\S]*?)<\/a>/)?.[1]
          ?.replace(/<[^>]*>/g, "")
          .trim();
        const date = article.match(/datetime="([^"]+)"/)?.[1];
        return { href, title, date };
      });

    await t.test(
      "/posts lists every published source entry, never the draft",
      async () => {
        const { response, body } = await get("/posts");
        assert.equal(response.status, 200);
        const entries = titleHrefPairs(body);
        assert.equal(entries.length, 112);
        assert.deepEqual(
          entries.map((entry) => normalizeHref(entry.href!)),
          publicPosts.map((entry) =>
            entry.path ? entry.path : new URL(entry.href).href,
          ),
        );
        assert.equal(body.includes(draft.title), false);
      },
    );

    await t.test(
      "homepage and RSS expose the latest five and ten in publication-date order",
      async () => {
        const expected = publicPosts.slice(0, 5);
        const home = await get("/");
        assert.equal(home.response.status, 200);
        const homeEntries = titleHrefPairs(home.body);
        assert.equal(homeEntries.length, 5);
        assert.deepEqual(
          homeEntries.map((entry) => normalizeHref(entry.href!)),
          expected.map((entry) =>
            entry.path ? entry.path : new URL(entry.href).href,
          ),
        );
        assert.deepEqual(
          homeEntries.map((entry) => entry.date),
          expected.map((entry) => entry.date.toISOString()),
        );

        const feed = await get("/feed.xml");
        assert.equal(feed.response.status, 200);
        const parsedFeed = new XMLParser().parse(feed.body);
        const items = parsedFeed.rss.channel.item as Array<{
          title: string;
          link: string;
          pubDate: string;
        }>;
        assert.equal(items.length, 10);
        assert.deepEqual(
          items.map((item) => normalizeHref(item.link)),
          publicPosts
            .slice(0, 10)
            .map((entry) =>
              entry.path ? entry.path : new URL(entry.href).href,
            ),
        );
        assert.deepEqual(
          items.map((item) => new Date(item.pubDate).getTime()),
          publicPosts.slice(0, 10).map((entry) => entry.date.getTime()),
        );
      },
    );

    await t.test(
      "post sitemap contains exactly historical local routes",
      async () => {
        const sitemap = await get("/sitemap-posts.xml");
        assert.equal(sitemap.response.status, 200);
        const parsed = new XMLParser().parse(sitemap.body);
        const urls = parsed.urlset.url as Array<{ loc: string }>;
        assert.equal(urls.length, 97);
        assert.deepEqual(
          urls.map((entry) => new URL(entry.loc).pathname).sort(),
          localPosts.map((entry) => entry.path!).sort(),
        );
        assert.equal(
          urls.some((entry) =>
            externalPosts.some(
              (post) => entry.loc === new URL(post.href, origin).href,
            ),
          ),
          false,
        );
        assert.equal(
          urls.some((entry) =>
            new URL(entry.loc).pathname.includes(draft.slug),
          ),
          false,
        );
      },
    );

    await t.test(
      "anonymous entry fallback redirects published posts but hides drafts and external posts",
      async () => {
        const local = localPosts[0]!;
        const publishedFallback = await get(`/posts/${local.slug}`);
        assert.equal(publishedFallback.response.status, 302);
        assert.equal(
          publishedFallback.response.headers.get("location"),
          local.path,
        );
        assert.match(
          publishedFallback.response.headers.get("cache-control") ?? "",
          /no-store/,
        );
        assert.match(
          publishedFallback.response.headers.get("x-robots-tag") ?? "",
          /noindex/,
        );
        assert.equal(publishedFallback.body, "");

        for (const path of [`/posts/${draft.slug}`, draft.path!]) {
          for (const query of ["", "?_preview=invalid-token"]) {
            const rejected = await get(path + query);
            assert.equal(rejected.response.status, 404);
            assert.equal(rejected.body.includes(draft.title), false);
          }
        }

        const invalidPublicToken = await get(
          `/posts/${local.slug}?_preview=invalid-token`,
        );
        assert.equal(invalidPublicToken.response.status, 302);
        assert.equal(
          invalidPublicToken.response.headers.get("location"),
          local.path,
        );

        const external = externalPosts[0]!;
        const externalFallback = await get(`/posts/${external.slug}`);
        assert.equal(externalFallback.response.status, 404);
        assert.doesNotMatch(externalFallback.body, /token|invalidtoken/i);
      },
    );
  },
);
