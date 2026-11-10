import assert from "node:assert/strict";
import test from "node:test";

// Run against the local site after importing the five documented samples:
// EMDASH_RENDER_TEST_URL=http://localhost:4321 pnpm test:migration
// This suite only reads rendered pages and assets; it never writes CMS data.
const target = process.env.EMDASH_RENDER_TEST_URL;
const samples = [
  {
    route: "2007/10/finallya-working-lcds-development-environment",
    title: "Finally...A Working LCDS Development Environment!",
    date: "2007-11-01T00:48:36.000Z",
    images: 0,
    codeBlocks: 0,
  },
  {
    route: "2007/11/building-a-livecycle-data-service-application",
    title:
      "Building a LiveCycle Data Service Application with Spring and Hibernate",
    date: "2007-11-09T01:40:59.000Z",
    images: 4,
    codeBlocks: 6,
  },
  {
    route: "2008/04/embedding-flash-in-flex",
    title: "Embedding Flash in Flex",
    date: "2008-04-10T00:30:47.000Z",
    images: 2,
    codeBlocks: 2,
  },
  {
    route: "2016/07/inspecting-node-js-traffic-with-charles",
    title: "Inspecting Node.js Traffic with Charles",
    date: "2016-07-18T00:00:00.000Z",
    images: 1,
    codeBlocks: 1,
  },
  {
    route: "2026/03/auto-scaling-cold-starts-and-cost-efficiency",
    title: "Auto-scaling, cold starts, and cost efficiency",
    date: "2026-03-07T05:00:00.000Z",
    images: 10,
    codeBlocks: 0,
  },
];

await test(
  "imported samples render through the existing article route",
  {
    skip: !target,
  },
  async (t) => {
    const origin = new URL(target!);
    assert.ok(["localhost", "127.0.0.1"].includes(origin.hostname));
    assert.ok(["http:", "https:"].includes(origin.protocol));

    for (const sample of samples) {
      await t.test(sample.route, async () => {
        const response = await fetch(new URL(`/posts/${sample.route}`, origin));
        assert.equal(response.status, 200);
        const html = await response.text();
        const article = html.match(
          /<article\b[^>]*>([\s\S]*?)<\/article>/,
        )?.[1];
        assert.ok(article, "existing article layout is present");
        assert.ok(article.includes(sample.title));
        assert.ok(article.includes(`datetime="${sample.date}"`));
        assert.ok(
          html.includes(`https://blog.iamjkahn.com/posts/${sample.route}`),
        );
        assert.equal(
          [...article.matchAll(/<pre\b/g)].length,
          sample.codeBlocks,
        );

        const images = [...article.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)];
        assert.equal(images.length, sample.images);
        for (const image of images) {
          const url = new URL(image[1]!, origin);
          assert.equal(url.origin, origin.origin, "sample images remain local");
          const asset = await fetch(url);
          assert.equal(asset.status, 200, image[1]);
          assert.match(asset.headers.get("Content-Type") ?? "", /^image\//);
          await asset.arrayBuffer();
        }

        if (sample.route.startsWith("2026/03/")) {
          for (let index = 1; index <= 5; index++) {
            assert.ok(article.includes(`href="#fn-${index}"`));
            assert.ok(article.includes(`id="fn-${index}"`));
          }
          assert.ok(article.includes('width="250"'));
          assert.ok(article.includes("float-right ml-4"));
        }
      });
    }

    await t.test(
      "unknown and wrong historical paths have no article page",
      async () => {
        for (const route of [
          "2026/03/nonexistent-migration-sample",
          "2007/11/finallya-working-lcds-development-environment",
          "2026/04/auto-scaling-cold-starts-and-cost-efficiency",
        ]) {
          const response = await fetch(new URL(`/posts/${route}`, origin));
          assert.equal(response.status, 404, route);
          await response.arrayBuffer();
        }
      },
    );
  },
);
