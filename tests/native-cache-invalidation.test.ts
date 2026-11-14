import assert from "node:assert/strict";
import test from "node:test";

import { createContext } from "astro/middleware";
import {
  DELETE,
  PUT,
} from "emdash/internal/routes/api/content/_collection_/_id_";
import { POST as publish } from "emdash/internal/routes/api/content/_collection_/_id_/publish";
import { POST as unpublish } from "emdash/internal/routes/api/content/_collection_/_id_/unpublish";

import { AstroCache } from "../node_modules/astro/dist/core/cache/runtime/cache.js";

// Exercise the installed write endpoints with in-memory runtime handlers and
// an injected editor identity. No database or Cloudflare purge is used here;
// authentication and persistence are not tested.
await test("native live writes invalidate the collection and resolved entry, draft saves do not", async () => {
  const invalidations: string[][] = [];
  const writes: string[] = [];
  let status = "draft";
  let liveContentChanged = false;
  const cache = new AstroCache({
    name: "test",
    async invalidate(options) {
      assert.ok(Array.isArray(options.tags));
      invalidations.push(options.tags);
    },
  });
  const emdash = {
    async handleContentGet() {
      return {
        success: true,
        data: { item: { id: "entry-fixture", authorId: "editor", status } },
      };
    },
    async handleContentPublish() {
      writes.push("publish");
      status = "published";
      return { success: true };
    },
    async handleContentUpdate() {
      writes.push(liveContentChanged ? "live edit" : "draft save");
      return { success: true, liveContentChanged };
    },
    async handleContentUnpublish() {
      writes.push("unpublish");
      status = "draft";
      return { success: true };
    },
    async handleContentDelete() {
      writes.push("delete");
      return { success: true };
    },
  };
  function context(method: string) {
    const request = new Request(
      "https://fixture.invalid/_emdash/api/content/posts/current-slug?overrideLock=true",
      {
        method,
        ...(method !== "DELETE" && {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ overrideLock: true }),
        }),
      },
    );
    const ctx = createContext({
      request,
      params: { collection: "posts", id: "current-slug" },
      defaultLocale: "en",
    });
    Object.assign(ctx.locals, { emdash, user: { id: "editor", role: 50 } });
    return Object.assign(ctx, { cache });
  }

  const draftSave = await PUT(context("PUT"));
  assert.ok(draftSave instanceof Response);
  assert.equal(draftSave.status, 200);
  assert.deepEqual(invalidations, []);

  for (const action of ["publish", "live edit", "unpublish", "delete"]) {
    liveContentChanged = true;
    const response = await (action === "publish"
      ? publish(context("POST"))
      : action === "live edit"
        ? PUT(context("PUT"))
        : action === "unpublish"
          ? unpublish(context("POST"))
          : DELETE(context("DELETE")));
    assert.ok(response instanceof Response);
    assert.equal(response.status, 200, action);
    assert.deepEqual(invalidations.at(-1), ["posts", "entry-fixture"], action);
  }
  assert.deepEqual(writes, [
    "draft save",
    "publish",
    "live edit",
    "unpublish",
    "delete",
  ]);
  assert.equal(invalidations.length, 4);
});
