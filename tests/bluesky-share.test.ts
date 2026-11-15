import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { lexicons } from "@atproto/api";
import { TID } from "@atproto/common-web";
import {
  validateBlockResponse,
  type BlockResponse,
  type ButtonElement,
} from "@emdash-cms/blocks/server";
import { ContentRepository, OptionsRepository, UserRepository } from "emdash";
import { createDialect } from "emdash/db/sqlite";

import {
  ACCOUNT_KEY,
  BOUNDARY_KEY,
  CREATE_URL,
  GET_URL,
  SESSION_URL,
  type Delivery,
} from "../src/plugins/bluesky-share/delivery.ts";
import { createPlugin } from "../src/plugins/bluesky-share/index.ts";

// @emdash-cms/plugin-test 0.2.12 imports cloudflare:test and only accepts a
// sandbox bundle in Vitest/workerd. This small native integration uses its
// installed production runtime/route/deferred boundaries instead. No fake CMS.
// Supply only Astro virtual modules; unknown virtual APIs must still fail.
registerHooks({
  resolve(specifier, context, nextResolve) {
    const modules: Record<string, string> = {
      "cloudflare:workers": "export const env = process.env;",
      "virtual:emdash/config": "export default {};",
      "virtual:emdash/wait-until": "export const waitUntil = undefined;",
      "virtual:emdash/env": "export const env = undefined;",
      "virtual:emdash/object-cache":
        "export const createObjectCacheBackend = null;",
    };
    if (specifier in modules)
      return {
        url: `data:text/javascript,${encodeURIComponent(modules[specifier])}`,
        shortCircuit: true,
      };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    // Vite normally supplies this object. Keep production semantics and leave
    // the installed runtime code, publication and storage implementations intact.
    if (
      url.includes("/emdash/dist/") &&
      url.endsWith(".mjs") &&
      result.source
    ) {
      const source =
        typeof result.source === "string"
          ? result.source
          : new TextDecoder().decode(result.source);
      return {
        ...result,
        source: `import.meta.env = { DEV: false, PROD: true, BASE_URL: "/" };\n${source}`,
      };
    }
    return result;
  },
});
const {
  EmDashRuntime,
  dispatchPluginApiRequest,
  handlePluginSettingsUpdate,
  waitForDeferredTasks,
} = await import("emdash/internal/plugin-test-runtime");
const plugin = createPlugin();
const DID = "did:plc:abcdefghijklmnopqrstuvwx";
const OTHER_DID = "did:plc:zyxwvutsrqponmlkjihgfedc";
const PASSWORD = "fixture-only-app-password";
const TOKEN = "fixture-only-access-token";

type CapturedRequest = {
  url: string;
  body: Record<string, unknown>;
  headers: Headers;
};
type NetworkReply = (request: CapturedRequest) => Response | Promise<Response>;

async function nativeHost() {
  const dir = await mkdtemp(join(tmpdir(), "bluesky-native-"));
  const priorKey = process.env.EMDASH_ENCRYPTION_KEY;
  process.env.EMDASH_ENCRYPTION_KEY = `emdash_enc_v1_${randomBytes(32).toString("base64url")}`;
  const priorHandle = process.env.PUBLIC_BLUESKY_HANDLE;
  const priorPassword = process.env.BLUESKY_APP_PASSWORD;
  process.env.PUBLIC_BLUESKY_HANDLE = "fixture.bsky.social";
  process.env.BLUESKY_APP_PASSWORD = PASSWORD;
  const requests: CapturedRequest[] = [];
  const logs: unknown[][] = [];
  let sessionDid = DID;
  let sessionReply: NetworkReply = () =>
    Response.json({ did: sessionDid, accessJwt: TOKEN });
  let createReply: NetworkReply = ({ body }) =>
    Response.json({
      uri: `at://${body.repo}/app.bsky.feed.post/${body.rkey}`,
      cid: "fixture-cid",
    });
  let getReply: NetworkReply = () =>
    Response.json({ error: "RecordNotFound" }, { status: 400 });
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const originalWarn = console.warn;
  console.error = (...args: unknown[]) => {
    logs.push(args);
  };
  console.warn = (...args: unknown[]) => {
    logs.push(args);
  };
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    // The native HTTP bridge performs production DoH SSRF checks before fetch.
    if (
      url.origin === "https://cloudflare-dns.com" &&
      url.pathname === "/dns-query" &&
      url.searchParams.get("name") === "bsky.social"
    ) {
      assert.equal(request.headers.has("Authorization"), false);
      return Response.json({
        Status: 0,
        Answer: [{ type: 1, data: "93.184.216.34" }],
      });
    }
    const captured = {
      url: request.url,
      body:
        request.method === "GET"
          ? Object.fromEntries(url.searchParams)
          : (JSON.parse(await request.text()) as Record<string, unknown>),
      headers: request.headers,
    };
    requests.push(captured);
    if (request.url === SESSION_URL) return sessionReply(captured);
    if (request.url === CREATE_URL) return createReply(captured);
    if (url.origin + url.pathname === GET_URL) return getReply(captured);
    throw new Error("Unexpected outbound request blocked by test");
  };
  const deps = {
    config: {
      database: {
        entrypoint: `fixture-${crypto.randomUUID()}`,
        type: "sqlite" as const,
        config: { url: join(dir, "cms.sqlite") },
      },
    },
    plugins: [] as ReturnType<typeof createPlugin>[],
    createDialect,
    createStorage: null,
    createScheduler: null,
    createSandboxRunner: null,
    sandboxEnabled: false,
    sandboxedPluginEntries: [],
    siteInfo: { url: "https://blog.iamjkahn.com", locale: "en" },
  };
  let currentTime = new Date();
  const timedDeps = { ...deps, now: () => currentTime };
  let runtime = await EmDashRuntime.create(timedDeps);
  for (const slug of ["posts", "pages"]) {
    await runtime.schemaRegistry.createCollection({
      slug,
      label: slug,
      supports: ["revisions"],
      editLocking: false,
    });
    for (const field of [
      "title",
      "excerpt",
      "legacy_route",
      "redirect_link",
      "legacy_published_at",
    ]) {
      await runtime.schemaRegistry.createField(slug, {
        slug: field,
        label: field,
        type: "text",
      });
    }
  }
  const admin = await new UserRepository(runtime.db).create({
    email: "admin@example.test",
    role: "admin",
  });
  const subscriber = await new UserRepository(runtime.db).create({
    email: "subscriber@example.test",
    role: "subscriber",
  });
  async function fixture(
    data: Record<string, unknown> = {},
    options: {
      collection?: string;
      status?: string;
      publishedAt?: string;
    } = {},
  ) {
    return new ContentRepository(runtime.db).create({
      type: options.collection ?? "posts",
      slug: `fixture-${crypto.randomUUID()}`,
      status: options.status ?? "draft",
      data: { title: "Fixture post", excerpt: "A fixture excerpt", ...data },
      ...(options.publishedAt ? { publishedAt: options.publishedAt } : {}),
    });
  }
  async function restart() {
    await waitForDeferredTasks();
    await runtime.shutdown();
    runtime = await EmDashRuntime.create({
      ...timedDeps,
      plugins: deps.plugins,
    });
  }
  return {
    get runtime() {
      return runtime;
    },
    requests,
    logs,
    admin,
    subscriber,
    fixture,
    set time(value: Date) {
      currentTime = value;
    },
    set did(value: string) {
      sessionDid = value;
    },
    set createReply(value: NetworkReply) {
      createReply = value;
    },
    set sessionReply(value: NetworkReply) {
      sessionReply = value;
    },
    set getReply(value: NetworkReply) {
      getReply = value;
    },
    async start() {
      deps.plugins = [plugin];
      await restart();
    },
    restart,
    async settings(values: Record<string, unknown> = {}) {
      const result = await handlePluginSettingsUpdate(
        runtime.db,
        plugin.id,
        plugin.admin.settingsSchema!,
        {
          enabled: true,
          ...values,
        },
      );
      assert.equal(result.success, true, JSON.stringify(result));
      return result;
    },
    async publish(id: string, collection = "posts") {
      const result = await runtime.handleContentPublish(collection, id);
      assert.equal(result.success, true, JSON.stringify(result));
      await waitForDeferredTasks();
      return result;
    },
    async record(id: string): Promise<Delivery | null> {
      const row = await runtime.db
        .selectFrom("_plugin_storage")
        .select("data")
        .where("plugin_id", "=", plugin.id)
        .where("collection", "=", "deliveries")
        .where("id", "=", id)
        .executeTakeFirst();
      return row ? (JSON.parse(row.data) as Delivery) : null;
    },
    async boundary() {
      return new OptionsRepository(runtime.db).get(
        `plugin:${plugin.id}:${BOUNDARY_KEY}`,
      );
    },
    async route(
      options: {
        user?: typeof admin;
        csrf?: boolean;
        method?: string;
        input?: unknown;
      } = {},
    ) {
      return dispatchPluginApiRequest({
        runtime,
        pluginId: plugin.id,
        path: "/admin",
        user: options.user,
        request: new Request(
          "https://blog.iamjkahn.com/_emdash/api/plugins/bluesky-share/admin",
          {
            method: options.method ?? "POST",
            headers: {
              "Content-Type": "application/json",
              ...(options.csrf ? { "X-EmDash-Request": "1" } : {}),
            },
            ...(options.method === "GET"
              ? {}
              : {
                  body: JSON.stringify(
                    options.input ?? { type: "page_load", page: "/status" },
                  ),
                }),
          },
        ),
      });
    },
    async dispose() {
      await waitForDeferredTasks();
      await runtime.shutdown();
      await runtime.db.destroy();
      globalThis.fetch = originalFetch;
      console.error = originalError;
      console.warn = originalWarn;
      if (priorKey === undefined)
        Reflect.deleteProperty(process.env, "EMDASH_ENCRYPTION_KEY");
      else process.env.EMDASH_ENCRYPTION_KEY = priorKey;
      if (priorHandle === undefined)
        Reflect.deleteProperty(process.env, "PUBLIC_BLUESKY_HANDLE");
      else process.env.PUBLIC_BLUESKY_HANDLE = priorHandle;
      if (priorPassword === undefined)
        Reflect.deleteProperty(process.env, "BLUESKY_APP_PASSWORD");
      else process.env.BLUESKY_APP_PASSWORD = priorPassword;
      await rm(dir, { recursive: true, force: true });
    },
  };
}

test("real native publication persists a shared announcement and authenticates its admin route", async (t) => {
  const host = await nativeHost();
  t.after(() => host.dispose());
  await host.start();
  await host.settings();
  const post = await host.fixture();
  await host.publish(post.id);
  const record = await host.record(post.id);
  assert.equal(
    record?.status,
    "shared",
    JSON.stringify({ record, logs: host.logs }),
  );
  assert.equal(host.requests.length, 2);
  assert.equal((await host.route()).status, 401);
  const response = await host.route({ user: host.admin, csrf: true });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { data: BlockResponse };
  assert.match(JSON.stringify(body), /View post/);
  assert.equal(validateBlockResponse(body.data, {}).valid, true);
});

test("native admin finds and recovers older unresolved announcements beyond the newest unfiltered page", async (t) => {
  const host = await nativeHost();
  t.after(() => host.dispose());
  await host.start();
  for (let i = 0; i < 27; i++) {
    const post = await host.fixture({ title: `Older unresolved ${i}` });
    await host.publish(post.id);
  }
  await host.settings();
  for (let i = 0; i < 25; i++) {
    const post = await host.fixture({ title: `Newer shared ${i}` });
    await host.publish(post.id);
  }
  const history = {
    type: "block_action",
    action_id: "history",
    value: { unresolved: true },
  };
  assert.equal((await host.route({ input: history })).status, 401);
  assert.equal(
    (await host.route({ user: host.subscriber, csrf: true, input: history }))
      .status,
    403,
  );
  assert.equal(
    (await host.route({ user: host.admin, input: history })).status,
    403,
  );

  async function page(action?: ButtonElement) {
    const response = await host.route({
      user: host.admin,
      csrf: true,
      ...(action
        ? {
            input: {
              type: "block_action",
              action_id: action.action_id,
              value: action.value,
            },
          }
        : {}),
    });
    assert.equal(response.status, 200);
    const body = ((await response.json()) as { data: BlockResponse }).data;
    assert.equal(validateBlockResponse(body, {}).valid, true);
    for (const secret of [PASSWORD, TOKEN])
      assert.equal(JSON.stringify(body).includes(secret), false);
    const table = body.blocks.find((block) => block.type === "table");
    assert.ok(table?.type === "table");
    const buttons = body.blocks
      .flatMap((block) => (block.type === "actions" ? block.elements : []))
      .filter((element): element is ButtonElement => element.type === "button");
    return { rows: table.rows, buttons };
  }
  const first = await page();
  assert.equal(first.rows.length, 25);
  assert.ok(first.rows.every((row) => row.status === "shared"));
  const unresolved = await page(
    first.buttons.find((button) => button.label === "Unresolved")!,
  );
  assert.equal(unresolved.rows.length, 25);
  assert.ok(unresolved.rows.every((row) => row.status === "skipped"));
  const older = await page(
    unresolved.buttons.find((button) => button.label === "Older")!,
  );
  assert.equal(older.rows.length, 2);
  const send = older.rows[0].link as ButtonElement;
  const sourceId = (send.value as { sourceId: string }).sourceId;
  const before = await host.record(sourceId);
  const recovered = await page(send);
  assert.equal(recovered.rows.length, 1);
  assert.ok(recovered.rows.every((row) => row.title !== older.rows[0].title));
  assert.equal((await host.record(sourceId))?.status, "shared");
  assert.equal((await host.record(sourceId))?.rkey, before?.rkey);
  assert.equal(
    host.requests.filter((request) => request.url === CREATE_URL).length,
    26,
  );

  let full = await page(
    recovered.buttons.find((button) => button.label === "Full history")!,
  );
  const rows = [...full.rows];
  while (full.buttons.some((button) => button.label === "Older")) {
    full = await page(full.buttons.find((button) => button.label === "Older")!);
    rows.push(...full.rows);
  }
  assert.equal(rows.length, 52);
  assert.equal(new Set(rows.map((row) => row.title)).size, 52);
  const shared = rows.find((row) => row.title === older.rows[0].title);
  assert.ok(shared);
  assert.equal(shared.status, "shared");
  assert.equal((shared.link as { type: string }).type, "link");
});

test("drafts, previews, excluded collections and editorial changes never create repeat announcements", async (t) => {
  const host = await nativeHost();
  t.after(() => host.dispose());
  await host.start();
  await host.settings();
  const created = await host.runtime.handleContentCreate("posts", {
    slug: "new-post",
    data: { title: "Draft title" },
    status: "draft",
  });
  assert.ok(created.success && created.data);
  const id = created.data.item.id;
  assert.equal(
    (
      await host.runtime.handleContentUpdate("posts", id, {
        data: { title: "Updated draft" },
      })
    ).success,
    true,
  );
  await host.runtime.handleContentGet("posts", id);
  await waitForDeferredTasks();
  assert.equal(await host.record(id), null);
  assert.equal(host.requests.length, 0);
  const page = await host.fixture({}, { collection: "pages" });
  await host.publish(page.id, "pages");
  assert.equal(await host.record(page.id), null);
  await host.publish(id);
  const original = await host.record(id);
  assert.equal(original?.status, "shared");
  const item = await new ContentRepository(host.runtime.db).findById(
    "posts",
    id,
  );
  assert.ok(item?.publishedAt);
  const publishedAt = item.publishedAt;
  assert.equal(
    (
      await host.runtime.handleContentUpdate("posts", id, {
        data: { title: "Revised article" },
        slug: "renamed-post",
      })
    ).success,
    true,
  );
  await host.publish(id);
  assert.equal(
    (await host.runtime.handleContentUnpublish("posts", id)).success,
    true,
  );
  assert.equal(
    (await new ContentRepository(host.runtime.db).findById("posts", id))
      ?.publishedAt,
    publishedAt,
  );
  await host.publish(id);
  await host.restart();
  await host.publish(id);
  assert.equal(
    (await host.runtime.handleContentDelete("posts", id)).success,
    true,
  );
  await waitForDeferredTasks();
  assert.deepEqual(await host.record(id), original);
  assert.equal(host.requests.filter((r) => r.url === CREATE_URL).length, 1);
});

test("the enablement snapshot excludes old published identities, including unpublished and date-edited history", async (t) => {
  const host = await nativeHost();
  t.after(() => host.dispose());
  const old = await host.fixture(
    {},
    { status: "published", publishedAt: "2020-02-03T00:00:00.000Z" },
  );
  const unpublished = await host.fixture(
    {},
    { status: "draft", publishedAt: "2021-01-01T00:00:00.000Z" },
  );
  const futureDated = await host.fixture(
    {},
    { status: "published", publishedAt: "2090-01-01T00:00:00.000Z" },
  );
  const oldDraft = await host.fixture();
  await host.start();
  await host.settings();
  const boundary = await host.boundary();
  assert.ok(boundary);
  assert.equal(
    (
      await host.runtime.handleContentUpdate("posts", old.id, {
        publishedAt: "2091-01-01T00:00:00.000Z",
        slug: "changed-history",
      })
    ).success,
    true,
  );
  for (const item of [old, unpublished, futureDated])
    await host.publish(item.id);
  assert.equal(host.requests.length, 0);
  await host.runtime.setPluginStatus(plugin.id, "inactive");
  await host.runtime.setPluginStatus(plugin.id, "active");
  await host.restart();
  assert.deepEqual(await host.boundary(), boundary);
  await host.publish(oldDraft.id);
  assert.equal((await host.record(oldDraft.id))?.status, "shared");
  const imported = await host.fixture({
    legacy_published_at: "2007-11-01T00:48:36.000Z",
  });
  await host.publish(imported.id);
  assert.equal(await host.record(imported.id), null);
  for (const item of [old, unpublished, futureDated])
    assert.equal(await host.record(item.id), null);
  assert.equal(host.requests.filter((r) => r.url === CREATE_URL).length, 1);
});

test("scheduled content is announced only by the native due-publication action", async (t) => {
  const host = await nativeHost();
  t.after(() => host.dispose());
  await host.start();
  await host.settings();
  const post = await host.fixture();
  const scheduledAt = new Date(Date.now() + 60000).toISOString();
  assert.equal(
    (await host.runtime.handleContentSchedule("posts", post.id, scheduledAt))
      .success,
    true,
  );
  await waitForDeferredTasks();
  assert.equal(await host.record(post.id), null);
  assert.deepEqual(host.requests, []);
  host.time = new Date(Date.parse(scheduledAt) + 1000);
  const result = await host.runtime.runScheduledTasksWithStats();
  await waitForDeferredTasks();
  assert.equal(
    result.published.some((item) => item.id === post.id),
    true,
  );
  assert.equal((await host.record(post.id))?.status, "shared");
});

test("announcements reuse native and preserved legacy URLs, external destinations, Unicode facets and bounded presentation text", async (t) => {
  const host = await nativeHost();
  t.after(() => host.dispose());
  await host.start();
  await host.settings();
  const cases = [
    { data: {}, destination: null },
    {
      data: { legacy_route: "2020/02/fixture-post" },
      destination: "https://blog.iamjkahn.com/posts/2020/02/fixture-post",
    },
    {
      data: {
        redirect_link: "https://example.com/story?x=1",
        title: "Café 🧑🏽‍💻 日本語",
      },
      destination: "https://example.com/story?x=1",
    },
    {
      data: { title: "🧑🏽‍💻é日本語".repeat(400), excerpt: "An excerpt 🧑🏽‍💻" },
      destination: null,
    },
  ];
  for (const { data, destination } of cases) {
    const post = await host.fixture(data);
    await host.publish(post.id);
    const delivery = await host.record(post.id);
    assert.equal(delivery?.status, "shared");
    assert.ok(delivery?.payload);
    const outgoing = host.requests.at(-1)!;
    assert.equal(outgoing.url, CREATE_URL);
    assert.equal(outgoing.headers.get("Authorization"), `Bearer ${TOKEN}`);
    assert.deepEqual(outgoing.body.record, delivery.payload);
    assert.equal(outgoing.body.rkey, delivery.rkey);
    assert.equal(TID.is(delivery.rkey), true);
    const payload = delivery.payload;
    lexicons.assertValidRecord("app.bsky.feed.post", payload);
    const facet = payload.facets![0];
    const feature = facet.features[0];
    assert.ok("uri" in feature);
    const url = feature.uri;
    assert.equal(
      new TextDecoder().decode(
        new TextEncoder()
          .encode(payload.text)
          .slice(facet.index.byteStart, facet.index.byteEnd),
      ),
      url,
    );
    if (destination) assert.equal(url, destination);
    else
      assert.match(
        String(url),
        /^https:\/\/blog\.iamjkahn\.com\/posts\/\d{4}\/\d{2}\/fixture-/,
      );
    assert.equal(payload.embed?.$type, "app.bsky.embed.external");
    assert.equal(
      (payload.embed as { external: { uri: string; description: string } })
        .external.uri,
      url,
    );
    assert.equal(
      (payload.embed as { external: { description: string } }).external
        .description,
      data.excerpt ?? "A fixture excerpt",
    );
  }
});

test("invalid or overlong destinations remain unsent without following article URLs", async (t) => {
  const host = await nativeHost();
  t.after(() => host.dispose());
  await host.start();
  await host.settings();
  for (const data of [
    { redirect_link: "javascript:alert(1)" },
    { redirect_link: "https://user:password@example.com/article" },
    { redirect_link: "not a URL" },
    { redirect_link: `https://example.com/${"x".repeat(400)}` },
    { legacy_route: "2020/13/invalid" },
  ]) {
    const post = await host.fixture(data);
    await host.publish(post.id);
    assert.equal((await host.record(post.id))?.status, "skipped");
    assert.equal((await host.record(post.id))?.code, "invalid_announcement");
  }
  assert.deepEqual(host.requests, []);
  const corrected = await host.fixture({ redirect_link: "not a URL" });
  await host.publish(corrected.id);
  await host.runtime.handleContentUpdate("posts", corrected.id, {
    data: { redirect_link: "https://example.com/corrected" },
  });
  await host.publish(corrected.id);
  await host.route({
    user: host.admin,
    csrf: true,
    input: { type: "block_action", action_id: "send", value: corrected.id },
  });
  assert.equal((await host.record(corrected.id))?.status, "shared");
});

test("Worker credentials stay out of settings and missing bindings fail closed", async (t) => {
  const host = await nativeHost();
  t.after(() => host.dispose());
  await host.start();
  await host.settings();
  Reflect.deleteProperty(process.env, "BLUESKY_APP_PASSWORD");
  const absent = await host.fixture();
  await host.publish(absent.id);
  assert.equal((await host.record(absent.id))?.code, "credentials_unavailable");
  process.env.BLUESKY_APP_PASSWORD = PASSWORD;
  Reflect.deleteProperty(process.env, "PUBLIC_BLUESKY_HANDLE");
  const noHandle = await host.fixture();
  await host.publish(noHandle.id);
  assert.equal(
    (await host.record(noHandle.id))?.code,
    "credentials_unavailable",
  );
  process.env.PUBLIC_BLUESKY_HANDLE = "fixture.bsky.social";
  await host.settings({ enabled: false });
  const disabled = await host.fixture();
  await host.publish(disabled.id);
  assert.equal((await host.record(disabled.id))?.code, "delivery_disabled");
  const saved = await host.settings();
  assert.equal(JSON.stringify(saved).includes(PASSWORD), false);
  assert.deepEqual(Object.keys(plugin.admin.settingsSchema!), [
    "enabled",
    "identifier",
    "appPassword",
  ]);
  assert.equal(
    await new OptionsRepository(host.runtime.db).get(
      `plugin:${plugin.id}:settings:appPassword`,
    ),
    null,
  );
  assert.equal(JSON.stringify(host.logs).includes(PASSWORD), false);
  await host.publish(absent.id);
  assert.equal(
    host.requests.length,
    0,
    "configuration does not trigger an automatic retry",
  );
  const key = process.env.EMDASH_ENCRYPTION_KEY;
  Reflect.deleteProperty(process.env, "EMDASH_ENCRYPTION_KEY");
  const fresh = await host.fixture();
  await host.publish(fresh.id);
  assert.equal((await host.record(fresh.id))?.status, "shared");
  assert.equal(host.requests[0].body.identifier, "fixture.bsky.social");
  assert.equal(host.requests[0].body.password, PASSWORD);
  process.env.EMDASH_ENCRYPTION_KEY = key;
  await host.settings({
    identifier: "override.bsky.social",
    appPassword: "fixture-override-password",
  });
  const overridden = await host.fixture();
  await host.publish(overridden.id);
  assert.equal((await host.record(overridden.id))?.status, "shared");
  const session = host.requests
    .filter((request) => request.url === SESSION_URL)
    .at(-1)!;
  assert.equal(session.body.identifier, "override.bsky.social");
  assert.equal(session.body.password, "fixture-override-password");
  const stored = await new OptionsRepository(host.runtime.db).get(
    `plugin:${plugin.id}:settings:appPassword`,
  );
  assert.equal(
    JSON.stringify(stored).includes("fixture-override-password"),
    false,
  );
});

test("overlapping real publication and duplicate initial events share one atomic claim", async (t) => {
  const host = await nativeHost();
  t.after(() => host.dispose());
  await host.start();
  await host.settings();
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<Response>();
  host.createReply = async () => {
    entered.resolve();
    return release.promise;
  };
  const post = await host.fixture();
  const result = await host.runtime.handleContentPublish("posts", post.id);
  assert.equal(
    result.success,
    true,
    "publication finishes while delivery is still blocked",
  );
  await entered.promise;
  const pending = await host.record(post.id);
  assert.equal(pending?.status, "pending");
  assert.equal(pending?.phase, "creating");
  assert.equal(pending?.accountDid, DID);
  assert.ok(pending?.payload);
  const item = await new ContentRepository(host.runtime.db).findById(
    "posts",
    post.id,
  );
  assert.ok(item);
  await Promise.all([
    host.runtime.hooks.runContentAfterPublish({ ...item }, "posts"),
    host.runtime.hooks.runContentAfterPublish({ ...item }, "posts"),
    host.runtime.handleContentPublish("posts", post.id),
  ]);
  await host.route({
    user: host.admin,
    csrf: true,
    input: { type: "block_action", action_id: "send", value: post.id },
  });
  const status = await host.route({ user: host.admin, csrf: true });
  assert.match(await status.text(), /pending/);
  assert.equal(host.requests.filter((r) => r.url === CREATE_URL).length, 1);
  release.resolve(
    Response.json({
      uri: `at://${DID}/app.bsky.feed.post/${pending.rkey}`,
      cid: "fixture-cid",
    }),
  );
  await waitForDeferredTasks();
  assert.equal((await host.record(post.id))?.status, "shared");
});

test("an accepted create with a lost response stays uncertain with frozen identity and payload across restart", async (t) => {
  const host = await nativeHost();
  t.after(() => host.dispose());
  await host.start();
  await host.settings();
  const remote = new Map<string, unknown>();
  host.createReply = ({ body }) => {
    remote.set(
      `at://${body.repo}/app.bsky.feed.post/${body.rkey}`,
      body.record,
    );
    throw new Error(`Lost response, unsafe vendor text ${PASSWORD} ${TOKEN}`);
  };
  const post = await host.fixture();
  await host.publish(post.id);
  const record = await host.record(post.id);
  assert.equal(record?.status, "uncertain");
  assert.equal(record?.code, "create_outcome_unknown");
  assert.equal(record?.uri, null);
  assert.ok(record?.payload);
  assert.deepEqual(
    remote.get(`at://${DID}/app.bsky.feed.post/${record.rkey}`),
    record.payload,
  );
  await host.restart();
  assert.deepEqual(await host.record(post.id), record);
  await host.runtime.handleContentUpdate("posts", post.id, {
    data: { title: "Changed after uncertain send" },
  });
  await host.publish(post.id);
  assert.deepEqual(await host.record(post.id), record);
  assert.equal(host.requests.filter((r) => r.url === CREATE_URL).length, 1);
  const input = { type: "block_action", action_id: "send", value: post.id };
  await host.settings({ enabled: false });
  await host.route({ user: host.admin, csrf: true, input });
  assert.equal((await host.record(post.id))?.status, "uncertain");
  assert.equal((await host.record(post.id))?.code, "delivery_disabled");
  await host.settings();
  host.getReply = () =>
    Response.json({ error: "Unavailable" }, { status: 503 });
  await host.route({ user: host.admin, csrf: true, input });
  assert.equal((await host.record(post.id))?.status, "uncertain");
  host.did = OTHER_DID;
  await host.route({ user: host.admin, csrf: true, input });
  assert.equal((await host.record(post.id))?.code, "account_changed");
  host.did = DID;
  await host.runtime.handleContentUnpublish("posts", post.id);
  host.getReply = ({ body }) => {
    const uri = `at://${body.repo}/app.bsky.feed.post/${body.rkey}`;
    return Response.json({ uri, value: remote.get(uri) });
  };
  const recovered = await host.route({ user: host.admin, csrf: true, input });
  assert.equal(
    validateBlockResponse(
      ((await recovered.json()) as { data: BlockResponse }).data,
      {},
    ).valid,
    true,
  );
  const shared = await host.record(post.id);
  assert.equal(shared?.status, "shared");
  assert.equal(shared?.rkey, record.rkey);
  assert.equal(shared?.accountDid, record.accountDid);
  assert.deepEqual(shared?.payload, record.payload);
  assert.notEqual(shared?.attemptId, record.attemptId);
  await host.route({ user: host.admin, csrf: true, input });
  assert.equal(host.requests.filter((r) => r.url === CREATE_URL).length, 1);
  const serialized = JSON.stringify({
    record: shared,
    logs: host.logs,
    admin: await (await host.route({ user: host.admin, csrf: true })).json(),
  });
  for (const secret of [PASSWORD, TOKEN])
    assert.equal(serialized.includes(secret), false);
});

test("manual Send recovers skipped records, serializes clicks and rechecks publication", async (t) => {
  const host = await nativeHost();
  t.after(() => host.dispose());
  await host.start();
  const post = await host.fixture();
  const unpublished = await host.fixture();
  await host.publish(post.id);
  await host.publish(unpublished.id);
  const original = await host.record(post.id);
  assert.equal(original?.status, "skipped");
  await host.settings();
  await host.runtime.handleContentUnpublish("posts", unpublished.id);
  await host.route({
    user: host.admin,
    csrf: true,
    input: { type: "block_action", action_id: "send", value: unpublished.id },
  });
  assert.equal(
    (await host.record(unpublished.id))?.code,
    "source_not_published",
  );
  assert.equal(host.requests.filter((r) => r.url === CREATE_URL).length, 0);

  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<Response>();
  host.createReply = async () => {
    entered.resolve();
    return release.promise;
  };
  const input = { type: "block_action", action_id: "send", value: post.id };
  const first = host.route({ user: host.admin, csrf: true, input });
  await entered.promise;
  await host.route({ user: host.admin, csrf: true, input });
  assert.equal(host.requests.filter((r) => r.url === CREATE_URL).length, 1);
  release.resolve(
    Response.json({
      uri: `at://${DID}/app.bsky.feed.post/${original!.rkey}`,
      cid: "fixture-cid",
    }),
  );
  assert.equal((await first).status, 200);
  const shared = await host.record(post.id);
  assert.equal(shared?.status, "shared");
  assert.equal(shared?.rkey, original?.rkey);
  assert.deepEqual(shared?.payload, original?.payload);
});

test("definite rejection, server failures, mismatched success and account changes have safe durable outcomes", async (t) => {
  const host = await nativeHost();
  t.after(() => host.dispose());
  await host.start();
  await host.settings();
  for (const [reply, expected] of [
    [
      () =>
        Response.json(
          { error: "InvalidRequest", message: PASSWORD },
          { status: 400 },
        ),
      "failed",
    ],
    [
      () =>
        Response.json(
          { error: "InternalServerError", message: TOKEN },
          { status: 500 },
        ),
      "uncertain",
    ],
    [
      () => Response.json({ error: "RecordAlreadyExists" }, { status: 400 }),
      "uncertain",
    ],
    [
      () =>
        Response.json({
          uri: `at://${DID}/app.bsky.feed.post/different`,
          cid: "fixture-cid",
        }),
      "uncertain",
    ],
  ] as const) {
    host.createReply = reply;
    const post = await host.fixture();
    await host.publish(post.id);
    assert.equal((await host.record(post.id))?.status, expected);
    await host.publish(post.id);
  }
  const creates = host.requests.filter((r) => r.url === CREATE_URL).length;
  host.did = OTHER_DID;
  const changed = await host.fixture();
  await host.publish(changed.id);
  assert.equal((await host.record(changed.id))?.code, "account_changed");
  assert.equal(
    host.requests.filter((r) => r.url === CREATE_URL).length,
    creates,
  );
  assert.deepEqual(
    await new OptionsRepository(host.runtime.db).get(
      `plugin:${plugin.id}:${ACCOUNT_KEY}`,
    ),
    { did: DID },
  );
  const rows = await host.runtime.db
    .selectFrom("_plugin_storage")
    .select("data")
    .where("plugin_id", "=", plugin.id)
    .execute();
  for (const secret of [PASSWORD, TOKEN])
    assert.equal(
      JSON.stringify({ rows, logs: host.logs }).includes(secret),
      false,
    );
});

test("only the active attempt finalizes; stale pending recovery reconciles after restart", async (t) => {
  const host = await nativeHost();
  t.after(() => host.dispose());
  await host.start();
  await host.settings();
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<Response>();
  host.createReply = async () => {
    entered.resolve();
    return release.promise;
  };
  const post = await host.fixture();
  assert.equal(
    (await host.runtime.handleContentPublish("posts", post.id)).success,
    true,
  );
  await entered.promise;
  const active = await host.record(post.id);
  assert.ok(active);
  const fenced = { ...active, attemptId: "new-owner-fixture" };
  // A future recovery claim can fence a late native hook without trusting its
  // local state. Establish that durable state through the real database.
  await host.runtime.db
    .updateTable("_plugin_storage")
    .set({ data: JSON.stringify(fenced) })
    .where("plugin_id", "=", plugin.id)
    .where("collection", "=", "deliveries")
    .where("id", "=", post.id)
    .execute();
  release.resolve(
    Response.json({
      uri: `at://${DID}/app.bsky.feed.post/${active.rkey}`,
      cid: "fixture-cid",
    }),
  );
  await waitForDeferredTasks();
  assert.deepEqual(await host.record(post.id), fenced);
  assert.match(JSON.stringify(host.logs), /lost its claim/);
  await host.restart();
  await host.publish(post.id);
  assert.deepEqual(await host.record(post.id), fenced);
  assert.equal(host.requests.filter((r) => r.url === CREATE_URL).length, 1);
  // Only expiration permits a recovery claim. The default mock lookup explicitly
  // reports RecordNotFound, so the same identity can be created again safely.
  await host.runtime.db
    .updateTable("_plugin_storage")
    .set({
      data: JSON.stringify({
        ...fenced,
        updatedAt: "2000-01-01T00:00:00.000Z",
      }),
    })
    .where("plugin_id", "=", plugin.id)
    .where("collection", "=", "deliveries")
    .where("id", "=", post.id)
    .execute();
  host.createReply = ({ body }) =>
    Response.json({
      uri: `at://${body.repo}/app.bsky.feed.post/${body.rkey}`,
      cid: "fixture-cid",
    });
  await host.route({
    user: host.admin,
    csrf: true,
    input: { type: "block_action", action_id: "send", value: post.id },
  });
  const recovered = await host.record(post.id);
  assert.equal(recovered?.status, "shared");
  assert.equal(recovered?.rkey, active.rkey);
  assert.deepEqual(recovered?.payload, active.payload);
  assert.notEqual(recovered?.attemptId, fenced.attemptId);
  assert.equal(
    host.requests.filter((r) => r.url.startsWith(GET_URL)).length,
    1,
  );
});

test("native recovery routes enforce permission, CSRF, methods and action validation", async (t) => {
  const host = await nativeHost();
  t.after(() => host.dispose());
  await host.start();
  const post = await host.fixture();
  await host.publish(post.id);
  const before = await host.record(post.id);
  const input = { type: "block_action", action_id: "send", value: post.id };
  assert.equal((await host.route({ input })).status, 401);
  assert.equal(
    (await host.route({ user: host.subscriber, csrf: true, input })).status,
    403,
  );
  assert.equal((await host.route({ user: host.admin, input })).status, 403);
  assert.deepEqual(await host.record(post.id), before);
  assert.equal(
    (await host.route({ user: host.admin, csrf: true, method: "GET" })).status,
    405,
  );
  const response = await host.route({ user: host.admin, csrf: true });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  const body = (await response.json()) as { data: BlockResponse };
  assert.equal(validateBlockResponse(body.data, {}).valid, true);
  assert.match(JSON.stringify(body), /action_id.*send/i);
  const action = await host.route({
    user: host.admin,
    csrf: true,
    input: { type: "block_action", action_id: "send" },
  });
  assert.match(await action.text(), /Invalid announcement action/);
  assert.deepEqual(host.requests, []);
});

test("authentication errors and untrusted session destinations never receive a repository write", async (t) => {
  const host = await nativeHost();
  t.after(() => host.dispose());
  await host.start();
  await host.settings();
  for (const reply of [
    () =>
      Response.json(
        { error: "AuthenticationRequired", message: PASSWORD },
        { status: 401 },
      ),
    () => {
      throw new Error(`Unsafe authentication failure ${PASSWORD}`);
    },
    () => Response.json({ did: DID }),
    () => Response.json({ did: "https://evil.example", accessJwt: TOKEN }),
    () =>
      new Response(null, {
        status: 302,
        headers: { Location: "https://evil.example/auth" },
      }),
  ]) {
    host.sessionReply = reply;
    const post = await host.fixture();
    await host.publish(post.id);
    assert.equal((await host.record(post.id))?.status, "failed");
  }
  assert.equal(
    host.requests.some((request) => request.url === CREATE_URL),
    false,
  );
  host.sessionReply = () =>
    Response.json({
      did: DID,
      accessJwt: TOKEN,
      didDoc: { service: [{ serviceEndpoint: "https://evil.example" }] },
    });
  const post = await host.fixture();
  await host.publish(post.id);
  assert.equal((await host.record(post.id))?.status, "shared");
  assert.equal(
    host.requests.every((request) =>
      [SESSION_URL, CREATE_URL].includes(request.url),
    ),
    true,
  );
  for (const secret of [PASSWORD, TOKEN])
    assert.equal(JSON.stringify(host.logs).includes(secret), false);
});

test("a failed initial storage write leaves publication intact and reports the unrecoverable event gap", async (t) => {
  const host = await nativeHost();
  t.after(() => host.dispose());
  await host.start();
  await host.settings();
  const post = await host.fixture();
  // Break only this temporary fixture's delivery table, not editorial storage.
  await host.runtime.db.schema
    .alterTable("_plugin_storage")
    .renameTo("_fixture_storage_unavailable")
    .execute();
  try {
    await host.publish(post.id);
    assert.equal(
      (await new ContentRepository(host.runtime.db).findById("posts", post.id))
        ?.status,
      "published",
    );
    assert.equal(host.requests.length, 0);
    assert.match(JSON.stringify(host.logs), /hook or storage failed/);
  } finally {
    await host.runtime.db.schema
      .alterTable("_fixture_storage_unavailable")
      .renameTo("_plugin_storage")
      .execute();
  }
  assert.equal(
    await host.record(post.id),
    null,
    "publication and delivery are not a transaction",
  );
});
