import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { computeContentHash } from "emdash";
import sharp from "sharp";

import {
  acceptedGaps,
  createMediaPlan,
  fingerprint,
  imageReferences,
  inventoryLocalImages,
  proposePostReferences,
  readMedia,
  readPosts,
  type HistoricalPost,
  type LocalImage,
} from "../scripts/managed-media.ts";

const image = "/assets/images/example.png";
const target = { id: "media-1", url: "/_emdash/api/media/file/media-1.png" };
const asset: LocalImage = {
  source: image,
  sha256: "a".repeat(64),
  contentHash: `sha1:${"b".repeat(40)}`,
  bytes: 100,
  width: 40,
  height: 20,
  format: "png",
};
function post(content: unknown[], status = "draft"): HistoricalPost {
  return {
    sourcePath: "archive/example.md",
    payload: {
      status,
      slug: "example",
      publishedAt: null,
      updatedAt: "2026-01-01",
      data: { title: "Example", legacy_route: "2026/01/example", content },
    },
  };
}
function native(source = image) {
  return {
    _type: "image",
    _key: "native",
    asset: { url: source },
    alt: "Keep alt",
    width: 40,
    height: 20,
    caption: "Caption",
    alignment: "right",
    displayWidth: 25,
    link: { href: "https://example.com" },
  };
}

await test("managed-media inventories native, gallery, HTML, remote and accepted-gap references", () => {
  const fixture = post([
    native(),
    native(acceptedGaps[0]),
    native(acceptedGaps[1]),
    native("https://example.com/remote.png"),
    { ...native(), asset: { _ref: "existing", url: target.url } },
    { _type: "gallery", images: [{ asset: { url: image }, alt: "Gallery" }] },
    {
      _type: "htmlBlock",
      html: `<figure><img src='${image}' alt='HTML'><figcaption>Keep</figcaption></figure>`,
    },
    {
      _type: "htmlBlock",
      html: `<!-- <img src="/comment.png"> --><script>"<img src='/script.png'>"</script><textarea><img src='/text.png'></textarea>`,
    },
  ]);
  const plan = createMediaPlan([fixture], [asset]);
  assert.deepEqual(plan.summary.classifications, {
    managed: 1,
    "recovered-local": 3,
    remote: 1,
    "accepted-gap": 2,
    unresolved: 0,
  });
  assert.equal(plan.summary.references, 7);
  assert.equal(plan.mappings.length, 1);
  assert.equal(plan.mappings[0]!.referenceCount, 3);
  assert.equal(plan.mappings[0]!.action, "upload-after-approval");
  assert.equal(plan.duplicates.length, 1);
  const alias = "/images/alias.png";
  const duplicateBytes = createMediaPlan(
    [post([native(), native(alias)])],
    [asset, { ...asset, source: alias }],
  );
  assert.equal(duplicateBytes.mappings.length, 1);
  assert.deepEqual(duplicateBytes.duplicates[0]!.paths, [image, alias]);
  assert.equal(plan.approvalRequired, true);
  assert.deepEqual(
    createMediaPlan([fixture], [asset]),
    plan,
    "deterministic rerun",
  );
});

await test("managed-media reuses only an unambiguous ready record with EmDash's prefixed SHA-1", () => {
  const fixture = post([native()]);
  const record = {
    id: target.id,
    storageKey: "media-1.png",
    status: "ready" as const,
    contentHash: asset.contentHash,
  };
  const plan = createMediaPlan([fixture], [asset], [record]);
  assert.equal(plan.mappings[0]!.action, "reuse");
  assert.deepEqual(plan.mappings[0]!.proposedMedia, target);
  const ambiguous = createMediaPlan(
    [fixture],
    [asset],
    [record, { ...record, id: "duplicate" }],
  );
  assert.equal(ambiguous.summary.reviewRequired, 1);
  assert.equal(ambiguous.mappings[0]!.action, "review");
  assert.equal(ambiguous.mappings[0]!.proposedMedia, undefined);
  for (const status of ["pending", "failed"] as const) {
    const blocked = createMediaPlan(
      [fixture],
      [asset],
      [{ ...record, status }],
    );
    assert.equal(blocked.mappings[0]!.action, "review");
    assert.equal(blocked.summary.reviewRequired, 1);
  }
  assert.equal(
    createMediaPlan([fixture], [asset], []).inputs.mediaSnapshotSupplied,
    true,
  );
});

await test("managed-media reports unresolved and ambiguous basename candidates without guessing", () => {
  const plan = createMediaPlan(
    [post([native("/missing/example.png"), native("/unknown.png")])],
    [
      asset,
      { ...asset, source: "/images/example.png", sha256: "c".repeat(64) },
    ],
  );
  assert.equal(plan.summary.reviewRequired, 2);
  assert.equal(plan.posts[0]!.references[1]!.action, "review");
  assert.deepEqual(plan.posts[0]!.references[0]!.candidatePaths, [
    image,
    "/images/example.png",
  ]);
  assert.equal(plan.mappings.length, 0);
});

await test("managed-media proposals preserve native metadata, HTML bytes outside src, and publication state", () => {
  const html = `<figure class="float-right"><a href="https://example.com/full.png"><img width="250" height="125" src = '${image}' alt="a &amp; b" style="float:right"></a><figcaption>Caption</figcaption></figure>`;
  const fixture = post([
    native(),
    { _type: "htmlBlock", _key: "html", html, isolated: false },
  ]);
  const before = structuredClone(fixture.payload);
  const expected = structuredClone(before);
  const blocks = expected.data.content as ReturnType<typeof native>[];
  Object.assign(blocks[0]!.asset, { _ref: target.id, url: target.url });
  (expected.data.content as { html?: string }[])[1]!.html = html.replace(
    image,
    target.url,
  );
  const result = proposePostReferences(
    fixture.payload,
    fingerprint(fixture.payload),
    new Map([[image, target]]),
  );
  assert.deepEqual(result.proposed, expected);
  assert.deepEqual(fixture.payload, before, "no input mutation");
  assert.equal(result.receipt.writesPerformed, false);
  assert.equal(result.receipt.changes.length, 2);
  assert.equal(result.proposed.status, "draft");
  const rerun = proposePostReferences(
    result.proposed,
    result.receipt.afterHash,
    new Map([[image, target]]),
  );
  assert.deepEqual(rerun.proposed, result.proposed);
  assert.deepEqual(rerun.receipt.changes, []);
  assert.equal(
    createMediaPlan([{ ...fixture, payload: result.proposed }], [asset]).summary
      .classifications.managed,
    2,
  );
});

await test("managed-media replaces multiple HTML sources from right to left", () => {
  const fixture = post(
    [{ _type: "htmlBlock", html: `<img src="${image}"><img src='${image}'>` }],
    "published",
  );
  const result = proposePostReferences(
    fixture.payload,
    fingerprint(fixture.payload),
    new Map([[image, target]]),
  );
  assert.deepEqual(result.proposed.data.content, [
    {
      _type: "htmlBlock",
      html: `<img src="${target.url}"><img src='${target.url}'>`,
    },
  ]);
  assert.equal(result.proposed.status, "published");
});

await test("managed-media refuses stale snapshots, unsafe targets, accepted gaps and unsupported HTML", () => {
  const fixture = post([native()]);
  assert.throws(
    () =>
      proposePostReferences(
        { ...fixture.payload, status: "published" },
        fingerprint(fixture.payload),
        new Map([[image, target]]),
      ),
    /Post changed/,
  );
  assert.throws(
    () =>
      proposePostReferences(
        fixture.payload,
        fingerprint(fixture.payload),
        new Map([[image, { id: "x", url: '" onerror="bad' }]]),
      ),
    /managed EmDash/,
  );
  for (const url of [
    "/_emdash/api/media/file/..",
    "/_emdash/api/media/file/%2fetc",
  ]) {
    assert.throws(
      () =>
        proposePostReferences(
          fixture.payload,
          fingerprint(fixture.payload),
          new Map([[image, { id: "x", url }]]),
        ),
      /managed EmDash/,
    );
  }
  const gap = post([native(acceptedGaps[0])]);
  assert.throws(
    () =>
      proposePostReferences(
        gap.payload,
        fingerprint(gap.payload),
        new Map([[acceptedGaps[0]!, target]]),
      ),
    /Accepted gaps/,
  );
  for (const html of [
    `<img src="${image}" srcset="${image} 1x, /other.png 2x">`,
    `<img src=${image}>`,
    `<img src="/example.png?a=1&amp;b=2">`,
  ]) {
    const fixture = post([{ _type: "htmlBlock", html }]);
    const plan = createMediaPlan([fixture], [asset]);
    assert.ok(plan.summary.reviewRequired > 0);
    const refs = imageReferences(fixture.payload);
    assert.throws(
      () =>
        proposePostReferences(
          fixture.payload,
          fingerprint(fixture.payload),
          new Map(refs.map((ref) => [ref.source, target])),
        ),
      /manual review/,
    );
  }
});

await test("managed-media input validation rejects malformed snapshots and duplicate identities", () => {
  assert.throws(() => readPosts({}), /Expected historical/);
  assert.throws(
    () => readPosts({ posts: [post([]), post([])] }),
    /Duplicate post/,
  );
  assert.throws(() => readMedia([{ id: "missing-fields" }]), /Invalid EmDash/);
  assert.deepEqual(readPosts({ posts: [post([])] }), [post([])]);
  assert.deepEqual(readMedia([]), []);
});

await test("managed-media real CLI reads static bytes and emits a dry run without modifying inputs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "managed-media-"));
  try {
    const publicDirectory = join(directory, "public");
    await mkdir(join(publicDirectory, "assets/images"), { recursive: true });
    const bytes = await sharp({
      create: { width: 40, height: 20, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    await writeFile(join(publicDirectory, image), bytes);
    await symlink(
      join(publicDirectory, "assets/images"),
      join(publicDirectory, "symlink"),
    );
    const assets = await inventoryLocalImages(publicDirectory);
    assert.equal(assets.length, 1, "symlinks are not followed");
    assert.equal(assets[0]!.bytes, bytes.length);
    assert.equal(assets[0]!.width, 40);
    assert.equal(assets[0]!.height, 20);
    assert.equal(
      assets[0]!.contentHash,
      await computeContentHash(bytes),
      "matches installed EmDash deduplication API",
    );
    const planFile = join(directory, "historical.json");
    const original = JSON.stringify({ posts: [post([native()])] });
    await writeFile(planFile, original);
    const output = execFileSync(
      process.execPath,
      ["scripts/managed-media.ts", planFile, publicDirectory],
      { encoding: "utf8" },
    );
    const plan = JSON.parse(output);
    assert.equal(plan.mode, "read-only");
    assert.equal(plan.summary.uniqueLocalImages, 1);
    const mediaFile = join(directory, "media.json");
    const snapshot = JSON.stringify([
      {
        id: target.id,
        storageKey: "media-1.png",
        status: "ready",
        contentHash: assets[0]!.contentHash,
      },
    ]);
    await writeFile(mediaFile, snapshot);
    const reused = JSON.parse(
      execFileSync(
        process.execPath,
        ["scripts/managed-media.ts", planFile, publicDirectory, mediaFile],
        { encoding: "utf8" },
      ),
    );
    assert.equal(reused.mappings[0].action, "reuse");
    assert.equal(
      reused.posts[0].references[0].proposedChange.operation,
      "replace-asset-ref-and-url",
    );
    assert.equal(await readFile(mediaFile, "utf8"), snapshot);
    assert.equal(await readFile(planFile, "utf8"), original);
    assert.deepEqual(await readFile(join(publicDirectory, image)), bytes);
    assert.throws(
      () =>
        execFileSync(
          process.execPath,
          ["scripts/managed-media.ts", "--apply"],
          { stdio: "pipe" },
        ),
      /Command failed/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
