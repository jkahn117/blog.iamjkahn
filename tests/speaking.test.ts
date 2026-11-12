import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { speakingSnapshot } from "../src/lib/speaking-snapshot.ts";
import {
  loadSpeakingPage,
  readSpeakingPage,
  speakingGroups,
} from "../src/lib/speaking.ts";

function pageFixture(overrides: Record<string, unknown> = {}) {
  return {
    ...structuredClone(speakingSnapshot),
    slug: "speaking",
    status: "published",
    ...overrides,
  };
}

test("Speaking snapshot preserves all original content and ordering", () => {
  assert.equal(
    createHash("sha256").update(JSON.stringify(speakingSnapshot)).digest("hex"),
    "33432fa3cb2e558f3989015451de7a43b2ea1022fd2c2af57dafcea8342c6fc7",
  );
  assert.deepEqual(
    speakingGroups.map(({ id, title }) => [
      title,
      speakingSnapshot.talks.filter((talk) => talk.group === id).length,
    ]),
    [
      ["Conferences", 6],
      ["Meet Ups", 1],
      ["Webinars", 4],
    ],
  );
  assert.deepEqual(readSpeakingPage(pageFixture(), false), speakingSnapshot);
});

test("Speaking proposal retains the exact snapshot as a draft, with native previews", () => {
  const doc = readFileSync(
    new URL("../docs/speaking-cms.md", import.meta.url),
    "utf8",
  );
  const proposal = JSON.parse(doc.match(/```json\n([\s\S]*?)\n```/)![1]!);
  assert.deepEqual(proposal.content.speaking[0].data, speakingSnapshot);
  assert.equal(proposal.content.speaking[0].status, "draft");
  assert.equal(proposal.content.speaking[0].slug, "speaking");
  assert.equal(proposal.collections[0].urlPattern, "/speaking");
  assert.deepEqual(proposal.collections[0].supports, [
    "drafts",
    "revisions",
    "preview",
  ]);
});

test("Speaking CMS boundary excludes unpublished entries without verified preview", () => {
  for (const status of ["draft", "pending", "scheduled", "trash"]) {
    assert.equal(readSpeakingPage(pageFixture({ status }), false), null);
  }
  assert.equal(readSpeakingPage(null, false), null);
  assert.equal(
    readSpeakingPage(pageFixture({ slug: "another-page" }), true),
    null,
  );
  const draft = pageFixture({ status: "draft", title: "Unpublished heading" });
  assert.equal(readSpeakingPage(draft, true)?.title, "Unpublished heading");
});

test("Speaking native repeater preserves edits, grouping, and author order", () => {
  const first = {
    group: "webinars",
    title: "Edited title",
    description: "Edited description",
    event: "Edited event",
    href: "https://example.com/watch?part=2&mode=full#video",
    cta: "Read transcript",
  };
  const second = { ...first, title: "Second talk" };
  const data = pageFixture({
    title: "Edited heading",
    intro: "Edited introduction",
    talks: [second, first],
  });
  assert.deepEqual(readSpeakingPage(data, false), {
    title: "Edited heading",
    intro: "Edited introduction",
    talks: [second, first],
  });
  assert.deepEqual(
    readSpeakingPage(pageFixture({ talks: [] }), false)?.talks,
    [],
  );
});

test("Speaking CMS boundary rejects unsafe external destinations", () => {
  for (const href of [
    "javascript:alert(1)",
    "data:text/html,unsafe",
    "ftp://example.com/file",
    "//example.com/video",
    "https:example.com/video",
    "https:/example.com/video",
    "/video",
    "not a URL",
    "https://user:pass@example.com/",
    " https://example.com/",
    "https://example.com/\n",
    "https://example.com/a\tb",
    "https://example.com/a b",
    "",
  ]) {
    const talks = [{ ...speakingSnapshot.talks[0], href }];
    assert.throws(
      () => readSpeakingPage(pageFixture({ talks }), false),
      Error,
      href,
    );
  }
  const href = "http://example.com/watch?a=1&b=2";
  assert.equal(
    readSpeakingPage(
      pageFixture({ talks: [{ ...speakingSnapshot.talks[0], href }] }),
      false,
    )?.talks[0]?.href,
    href,
  );
});

test("Speaking CMS boundary rejects malformed fields instead of losing cards", () => {
  for (const overrides of [
    { title: "" },
    { intro: 42 },
    { talks: null },
    { talks: [null] },
    { talks: [{}] },
  ]) {
    assert.throws(() => readSpeakingPage(pageFixture(overrides), false));
  }
  for (const overrides of [
    { group: "unknown" },
    { title: " " },
    { event: null },
    { description: [] },
    { cta: "" },
  ]) {
    assert.throws(() =>
      readSpeakingPage(
        pageFixture({
          talks: [{ ...speakingSnapshot.talks[0], ...overrides }],
        }),
        false,
      ),
    );
  }
});

test("Speaking query uses only matching native preview context and forwards cache hints", async () => {
  for (const preview of [
    undefined,
    { collection: "posts", id: "other-draft" },
    { collection: "speaking", id: "speaking-db-id" },
  ]) {
    const isPreview = preview?.collection === "speaking";
    const result = await loadSpeakingPage(async (collection, id) => {
      assert.equal(collection, "speaking");
      assert.equal(id, isPreview ? "speaking-db-id" : "speaking");
      return {
        entry: {
          data: pageFixture({ status: isPreview ? "draft" : "published" }),
        },
        isPreview,
        cacheHint: { tags: ["speaking"], lastModified: new Date("2026-01-01") },
      };
    }, preview);
    assert.deepEqual(result.page, speakingSnapshot);
    assert.equal(result.isPreview, isPreview);
    assert.deepEqual(result.cacheHint.tags, ["speaking"]);
    assert.equal(
      result.cacheHint.lastModified?.toISOString(),
      "2026-01-01T00:00:00.000Z",
    );
  }
});

test("Speaking query never treats a preview context alone as draft authorization", async () => {
  const result = await loadSpeakingPage(
    async () => ({
      entry: { data: pageFixture({ status: "draft" }) },
      isPreview: false,
      cacheHint: {},
    }),
    { collection: "speaking", id: "mismatched-token" },
  );
  assert.equal(result.page, null);
});

test("Speaking query returns missing content and propagates failures without snapshot fallback", async () => {
  const error = new Error("missing");
  error.name = "LiveEntryNotFoundError";
  const missing = await loadSpeakingPage(async () => ({
    entry: null,
    error,
    isPreview: false,
    cacheHint: {},
  }));
  assert.equal(missing.page, null);
  await assert.rejects(
    () =>
      loadSpeakingPage(async () => ({
        entry: null,
        error: new Error("database unavailable"),
        isPreview: false,
        cacheHint: {},
      })),
    /database unavailable/,
  );
  await assert.rejects(
    () =>
      loadSpeakingPage(async () => ({
        entry: { data: pageFixture({ talks: "invalid" }) },
        isPreview: false,
        cacheHint: {},
      })),
    /repeater array/,
  );
});
