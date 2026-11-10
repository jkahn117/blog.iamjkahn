import assert from "node:assert/strict";
import test from "node:test";

import { buildMigrationPlan, hashImportPayload } from "./inventory.ts";
import {
  collectMarkdownAssetReferences,
  markdownToPortableText,
} from "./portable-text.ts";
import type { ImportPayload } from "./types.ts";
import { frontmatterSchema } from "./validation.ts";

test("converts multiline prose, formatting, and links", () => {
  const result = markdownToPortableText(
    "A paragraph that wraps\nonto another source line with **bold** and [a link](https://example.com).",
  );

  assert.equal(result.issues.length, 0);
  assert.equal(result.blocks.length, 1);
  const block = result.blocks[0]!;
  assert.equal(block._type, "block");
  assert.match(JSON.stringify(block), /A paragraph that wraps/);
  assert.match(JSON.stringify(block), /onto another source line/);
  assert.match(JSON.stringify(block), /strong/);
  assert.match(JSON.stringify(block), /https:\/\/example.com/);
});

test("keeps HTML-looking text inside fenced code as code", () => {
  const result = markdownToPortableText(
    '```html\n<img src="search.gif">\n```',
    "code.md",
  );

  assert.deepEqual(result.issues, []);
  assert.equal(result.blocks[0]?._type, "code");
  assert.equal(result.blocks[0]?.code, '<img src="search.gif">');
  assert.equal(result.blocks[0]?.language, "html");
});

test("converts real HTML to an explicit htmlBlock warning", () => {
  const result = markdownToPortableText(
    '<div class="callout">Hello</div>',
    "html.md",
  );

  assert.equal(result.blocks[0]?._type, "htmlBlock");
  assert.equal(result.blocks[0]?.html, '<div class="callout">Hello</div>');
  assert.equal(result.issues[0]?.code, "HTML_BLOCK");
});

test("converts GFM tables to EmDash table blocks", () => {
  const result = markdownToPortableText(
    "| Name | Value |\n| --- | ---: |\n| A | 1 |",
    "table.md",
  );

  assert.equal(result.issues.length, 0);
  assert.equal(result.blocks[0]?._type, "table");
  const rows = result.blocks[0]?.rows as unknown[];
  assert.equal(rows.length, 2);
});

test("preserves footnote references and definitions", () => {
  const result = markdownToPortableText(
    "Text with a note.[^1]\n\n[^1]: Footnote text.",
    "footnote.md",
  );

  assert.match(JSON.stringify(result.blocks), /#fn-1/);
  assert.match(JSON.stringify(result.blocks), /Footnote text/);
  assert.equal(
    result.issues.some((issue) => issue.code === "FOOTNOTE"),
    true,
  );
});

test("asset inventory excludes fenced and inline code examples", () => {
  const markdown =
    '```html\n<img src="search.gif">\n```\n\n`![example](not-an-image.png)`\n\n![Real](/images/real.png)\n\n<img src="/images/html.png">';
  assert.deepEqual(collectMarkdownAssetReferences(markdown), [
    "/images/html.png",
    "/images/real.png",
  ]);
});

test("images embedded in prose remain image blocks", () => {
  const result = markdownToPortableText("Before ![Alt](/image.png) after.");
  assert.deepEqual(
    result.blocks.map((block) => block._type),
    ["block", "image", "block"],
  );
  assert.equal(result.issues.length, 0);
});

test("ordered lists retain their starting number and list identity", () => {
  const result = markdownToPortableText("3. Three\n4. Four");
  assert.equal(result.blocks[0]?.listStart, 3);
  assert.equal(result.blocks[1]?.listStart, 3);
  assert.equal(result.blocks[0]?.listId, result.blocks[1]?.listId);
});

test("complex lists preserve their structure in explicit HTML", () => {
  const result = markdownToPortableText(
    "- Item\n\n  > Quoted text\n\n- Second item",
  );
  assert.equal(result.blocks[0]?._type, "htmlBlock");
  assert.match(String(result.blocks[0]?.html), /<blockquote>/);
  assert.match(String(result.blocks[0]?.html), /<ul>/);
});

test("HTML wrappers spanning Markdown are kept together", () => {
  const result = markdownToPortableText(
    '<div class="callout">\n\n**Important**\n\n</div>',
  );
  assert.equal(result.blocks.length, 1);
  assert.equal(result.blocks[0]?._type, "htmlBlock");
  assert.match(String(result.blocks[0]?.html), /<strong>Important<\/strong>/);
  assert.match(String(result.blocks[0]?.html), /<\/div>/);
});

test("validation rejects string publication flags and malformed tags or dates", () => {
  const base = { title: "Post", date: "2026-01-01" };
  assert.equal(
    frontmatterSchema.safeParse({ ...base, publish: "false" }).success,
    false,
  );
  assert.equal(
    frontmatterSchema.safeParse({ ...base, tags: [17] }).success,
    false,
  );
  assert.equal(
    frontmatterSchema.safeParse({ ...base, date: "not-a-date" }).success,
    false,
  );
});

test("plans are bound to the selected target", () => {
  const only = ["src/content/blog/2026-02-15-a-new-framework-a-new-home.md"];
  const offline = buildMigrationPlan(process.cwd(), { only });
  const local = buildMigrationPlan(process.cwd(), {
    only,
    target: "http://localhost:4321",
  });
  assert.notEqual(offline.digest, local.digest);
  assert.throws(
    () => buildMigrationPlan(process.cwd(), { only: ["untracked-draft.md"] }),
    /not a tracked/,
  );
});

test("payload hashes ignore the stored payload hash field", () => {
  const payload: ImportPayload = {
    slug: "post",
    status: "published",
    publishedAt: "2026-01-01T00:00:00.000Z",
    data: {
      title: "Post",
      migration_payload_hash: "old-value",
    },
    bylineSlug: "josh-kahn",
    tagSlugs: ["test"],
  };
  const changedOnlyStoredHash = {
    ...payload,
    data: { ...payload.data, migration_payload_hash: "new-value" },
  };

  assert.equal(
    hashImportPayload(payload),
    hashImportPayload(changedOnlyStoredHash),
  );
});

test("builds a deterministic plan for the tracked corpus", () => {
  const first = buildMigrationPlan();
  const second = buildMigrationPlan();

  assert.equal(first.digest, second.digest);
  assert.equal(first.summary.total, 113);
  assert.equal(first.summary.externalLinks, 15);
  assert.equal(first.summary.drafts, 1);
  assert.equal(first.summary.errors, 0);
  assert.equal(
    first.posts.some(
      (post) =>
        post.sourcePath.endsWith(
          "gatekeeper-worker-for-governed-tenant-ai.md",
        ) && post.payload.status === "draft",
    ),
    true,
  );
});
