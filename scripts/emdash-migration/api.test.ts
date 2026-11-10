import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import { migrationConfig } from "./config.ts";
import { EmDashMigrationApi } from "./emdash-api.ts";
import { buildMigrationPlan, hashImportPayload } from "./inventory.ts";
import type { DestinationEntry, PendingWrite, PlannedPost } from "./types.ts";
import { normalizeTarget } from "./validation.ts";

type FixtureEntry = DestinationEntry & {
  bylines: Array<{ byline: { id: string; slug: string; displayName: string } }>;
};

function fixture(t: TestContext) {
  const entries: FixtureEntry[] = [];
  const tags = new Map<string, string[]>();
  const requests: Array<{
    method: string;
    path: string;
    body: Record<string, unknown>;
  }> = [];
  let failPublish = false;
  let enabledPlugin = false;
  let revision = 0;
  const byline = {
    id: "byline-1",
    slug: "josh-kahn",
    displayName: "Josh Kahn",
  };
  const fields = Object.values(migrationConfig.fields).map((slug) => ({
    slug,
    unique: ["migration_source_path", "legacy_route"].includes(slug),
    type:
      slug === "content"
        ? "portableText"
        : slug === "excerpt"
          ? "text"
          : "string",
  }));

  t.mock.method(globalThis, "fetch", async (request: Request) => {
    const url = new URL(request.url);
    const apiPath = url.pathname.replace("/_emdash/api", "");
    const body = request.body
      ? ((await request.json()) as Record<string, unknown>)
      : {};
    requests.push({ method: request.method, path: apiPath, body });
    assert.equal(request.headers.get("authorization"), "Bearer fixture-secret");
    if (request.method !== "GET") {
      assert.equal(request.headers.get("x-emdash-request"), "1");
      assert.equal(request.headers.get("origin"), "https://fixture.example");
    }
    const success = (data: unknown) => Response.json({ success: true, data });
    const conflict = () =>
      Response.json(
        {
          success: false,
          error: {
            code: "VERSION_CONFLICT",
            message: "fixture-secret must never be logged",
          },
        },
        { status: 409 },
      );
    if (apiPath === "/auth/me") return success({ role: 50 });
    if (apiPath === "/schema/collections/posts")
      return success({
        item: { slug: "posts", supports: ["drafts", "revisions"], fields },
      });
    if (apiPath === "/admin/plugins")
      return success({
        items: enabledPlugin ? [{ id: "announcements", enabled: true }] : [],
      });
    if (apiPath === "/admin/bylines") return success({ items: [byline] });
    if (apiPath === "/taxonomies")
      return success({ taxonomies: [{ name: "tag" }] });
    if (apiPath === "/taxonomies/tag/terms") return success({ terms: [] });
    if (apiPath === "/content/posts" && request.method === "GET")
      return success({ items: entries });
    if (apiPath === "/content/posts" && request.method === "POST") {
      const entry: FixtureEntry = {
        id: `entry-${entries.length + 1}`,
        slug: body.slug as string,
        status: "draft",
        data: structuredClone(body.data as Record<string, unknown>),
        publishedAt: null,
        draftRevisionId: null,
        _rev: `r${++revision}`,
        bylines: [{ byline }],
      };
      entries.push(entry);
      tags.set(
        entry.id,
        (body.taxonomies as Record<string, string[]>).tag ?? [],
      );
      return success({ item: entry, _rev: entry._rev });
    }
    const entry = entries.find((candidate) =>
      apiPath.startsWith(`/content/posts/${candidate.id}`),
    );
    if (!entry)
      throw new Error(
        `Unexpected fixture request: ${request.method} ${apiPath}`,
      );
    if (apiPath.endsWith("/terms/tag"))
      return success({
        terms: (tags.get(entry.id) ?? []).map((slug) => ({
          id: slug,
          slug,
          label: slug,
        })),
      });
    if (request.method === "GET")
      return success({ item: entry, _rev: entry._rev });
    if (body._rev !== entry._rev) return conflict();
    if (apiPath.endsWith("/publish")) {
      if (failPublish)
        return Response.json(
          { error: { code: "TEMPORARY_FAILURE" } },
          { status: 503 },
        );
      entry.status = "published";
      entry.publishedAt = body.publishedAt as string;
      entry.draftRevisionId = null;
    } else if (apiPath.endsWith("/unpublish")) {
      entry.status = "draft";
    } else if (request.method === "PUT") {
      entry.data = structuredClone(body.data as Record<string, unknown>);
      entry.slug = body.slug as string;
      if (body.status === "draft") entry.status = "draft";
      tags.set(
        entry.id,
        (body.taxonomies as Record<string, string[]>).tag ?? [],
      );
    }
    entry._rev = `r${++revision}`;
    return success({ item: entry, _rev: entry._rev });
  });

  return {
    entries,
    requests,
    api: new EmDashMigrationApi("https://fixture.example", "fixture-secret"),
    failPublish: (value: boolean) => {
      failPublish = value;
    },
    enabledPlugin: () => {
      enabledPlugin = true;
    },
  };
}

function samplePost(): PlannedPost {
  return buildMigrationPlan(process.cwd(), {
    only: ["src/content/blog/2026-02-15-a-new-framework-a-new-home.md"],
  }).posts[0]!;
}

function changedPost(post: PlannedPost): PlannedPost {
  const changed = structuredClone(post);
  changed.sourceHash = "changed-source-hash";
  changed.payload.data.migration_source_hash = changed.sourceHash;
  changed.payload.data.title = "Changed source title";
  changed.payloadHash = hashImportPayload(changed.payload);
  changed.payload.data.migration_payload_hash = changed.payloadHash;
  return changed;
}

test("preflight and operation planning issue only GET requests", async (t) => {
  const { api, requests } = fixture(t);
  const post = samplePost();
  assert.deepEqual(await api.preflight([post]), []);
  assert.equal((await api.planOperations([post]))[0]?.action, "create");
  assert.equal(
    requests.every((request) => request.method === "GET"),
    true,
  );
});

test("enabled plugins block preflight", async (t) => {
  const f = fixture(t);
  f.enabledPlugin();
  assert.equal(
    (await f.api.preflight([samplePost()])).some(
      (issue) => issue.code === "ENABLED_PLUGIN",
    ),
    true,
  );
});

test("create, historical publish, unchanged rerun, safe update, and CMS conflict", async (t) => {
  const f = fixture(t);
  const post = samplePost();
  await f.api.execute({ action: "create", post });
  assert.equal(f.entries.length, 1);
  assert.equal(f.entries[0]?.publishedAt, post.payload.publishedAt);
  assert.equal((await f.api.planOperations([post]))[0]?.action, "skip");
  const changed = changedPost(post);
  const update = (await f.api.planOperations([changed]))[0]!;
  assert.equal(update.action, "update");
  await f.api.execute(update);
  assert.equal(f.entries[0]?.data.title, "Changed source title");
  f.entries[0]!.data.title = "CMS edit";
  assert.equal((await f.api.planOperations([changed]))[0]?.action, "skip");
  const changedAgain = changedPost(changed);
  changedAgain.sourceHash = "third-source-hash";
  changedAgain.payload.data.migration_source_hash = changedAgain.sourceHash;
  assert.equal(
    (await f.api.planOperations([changedAgain]))[0]?.action,
    "conflict",
  );
});

test("a concurrent edit after planning is rejected using the original revision", async (t) => {
  const f = fixture(t);
  const post = samplePost();
  await f.api.execute({ action: "create", post });
  const operation = (await f.api.planOperations([changedPost(post)]))[0]!;
  f.entries[0]!._rev = "editor-revision";
  await assert.rejects(f.api.execute(operation), (error: Error) => {
    assert.equal(error.message.includes("fixture-secret"), false);
    return error.message.includes("VERSION_CONFLICT");
  });
});

test("interrupted publication resumes with its checkpoint and never duplicates", async (t) => {
  const f = fixture(t);
  const post = samplePost();
  const pending: Record<string, PendingWrite> = {};
  f.failPublish(true);
  await assert.rejects(
    f.api.execute({ action: "create", post }, async (checkpoint) => {
      pending[post.sourcePath] = checkpoint;
    }),
  );
  assert.equal(f.entries.length, 1);
  f.failPublish(false);
  const operation = (await f.api.planOperations([post], pending))[0]!;
  assert.equal(operation.action, "resume");
  await f.api.execute(operation);
  assert.equal(f.entries.length, 1);
  assert.equal(f.entries[0]?.status, "published");
});

test("draft sources remain private", async (t) => {
  const f = fixture(t);
  const post = samplePost();
  post.payload.status = "draft";
  post.payload.publishedAt = null;
  post.payloadHash = hashImportPayload(post.payload);
  post.payload.data.migration_payload_hash = post.payloadHash;
  await f.api.execute({ action: "create", post });
  assert.equal(f.entries[0]?.status, "draft");
  assert.equal(
    f.requests.some((request) => request.path.endsWith("/publish")),
    false,
  );
});

test("duplicate identities and unrelated slug collisions are conflicts", async (t) => {
  const f = fixture(t);
  const post = samplePost();
  await f.api.execute({ action: "create", post });
  f.entries.push({ ...f.entries[0]!, id: "duplicate" });
  assert.equal((await f.api.planOperations([post]))[0]?.action, "conflict");
  for (const entry of f.entries) delete entry.data.migration_source_path;
  assert.equal((await f.api.planOperations([post]))[0]?.action, "conflict");
});

test("target validation and token requirements fail before network access", () => {
  assert.throws(() => normalizeTarget("https://user:secret@example.com"));
  assert.throws(() => normalizeTarget("http://example.com"));
  assert.throws(() => normalizeTarget("https://example.com/path"));
  assert.throws(
    () => new EmDashMigrationApi("http://localhost:4321", ""),
    /EMDASH_TOKEN/,
  );
});
