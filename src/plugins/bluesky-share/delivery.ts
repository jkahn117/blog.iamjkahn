import { AppBskyEmbedExternal } from "@atproto/api";
import { TID } from "@atproto/common-web";
import type { PluginContext, StorageCollection } from "emdash";

import { featuredImageId, uploadFeaturedImage } from "./image.ts";
import { announcement } from "./post.ts";

export type Delivery = {
  version: 1;
  sourceId: string;
  collection: "posts";
  title: string;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
  attemptId: string;
  rkey: string;
  accountDid: string | null;
  payload: ReturnType<typeof announcement> | null;
  featuredImageId?: string;
  replacesRkey?: string;
  status: "pending" | "shared" | "skipped" | "failed" | "uncertain";
  phase: "preparing" | "creating" | "finished";
  code: string | null;
  uri: string | null;
};

type Boundary = { version: 1; enabledAt: string; historicalIds: string[] };
export const BOUNDARY_KEY = "state:enablement";
export const ACCOUNT_KEY = "state:account";
export const SESSION_URL =
  "https://bsky.social/xrpc/com.atproto.server.createSession";
export const CREATE_URL =
  "https://bsky.social/xrpc/com.atproto.repo.createRecord";
export const GET_URL = "https://bsky.social/xrpc/com.atproto.repo.getRecord";
// Longer than the hook deadline and all bounded network calls in one attempt.
const ACTIVE_MS = 60000;

export function isActive(record: Delivery): boolean {
  return (
    record.status === "pending" &&
    Date.now() - Date.parse(record.updatedAt) < ACTIVE_MS
  );
}

// JSON object key ordering is not part of an AT Protocol record's identity.
function sameRecord(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right))
    return (
      left.length === right.length &&
      left.every((value, index) => sameRecord(value, right[index]))
    );
  if (!object(left) || !object(right)) return false;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every(
      (key) => Object.hasOwn(right, key) && sameRecord(left[key], right[key]),
    )
  );
}

export async function recover(
  sourceId: string,
  ctx: PluginContext,
): Promise<string> {
  const store = deliveries(ctx);
  const current = await store.getVersioned(sourceId);
  if (!current)
    return "Announcement not found. Historical posts cannot be backfilled.";
  if (current.value.status === "shared") return "Already shared.";
  if (isActive(current.value))
    return "Delivery is still active. Wait a minute before recovery.";
  const record: Delivery = {
    ...current.value,
    attemptId: crypto.randomUUID(),
    status: "pending",
    phase: "preparing",
    updatedAt: new Date().toISOString(),
  };
  // Formatting failures never reached Bluesky, so corrected source data is safe
  // to prepare now. Once a payload exists, keep it frozen for reconciliation.
  if (record.payload === null && record.accountDid === null) {
    const source = await ctx.content!.get("posts", sourceId);
    if (!source || source.status !== "published")
      return "The source must still be published before sending.";
    try {
      record.payload = announcement({ ...source }, record.createdAt);
      record.featuredImageId = featuredImageId({ ...source });
    } catch {
      return "Correct the announcement's title or destination before sending.";
    }
  }
  const claim = await store.compareAndSet(sourceId, current.revision, record);
  if (!claim.applied)
    return "Another request claimed this announcement. Refresh its status.";
  await sendAttempt(record, claim.revision, ctx);
  return "Recovery finished. See the delivery status below.";
}

export async function reshare(
  sourceId: string,
  expectedRkey: string,
  ctx: PluginContext,
): Promise<string> {
  const store = deliveries(ctx);
  const current = await store.getVersioned(sourceId);
  if (
    !current ||
    current.value.status !== "shared" ||
    current.value.rkey !== expectedRkey
  )
    return "This announcement changed. Refresh before re-sharing.";
  const previous = current.value;
  const source = await ctx.content!.get("posts", sourceId);
  if (!source || source.status !== "published")
    return "The source must still be published before re-sharing.";
  const authentication = await authenticate(ctx);
  if ("code" in authentication)
    return `Cannot re-share: ${authentication.code}. The original delivery is unchanged.`;
  const { session } = authentication;
  const account = await ctx.kv.get<{ did: string }>(ACCOUNT_KEY);
  if (account?.did !== session.did || previous.accountDid !== session.did)
    return "The Bluesky account changed. The original delivery is unchanged.";
  try {
    const { response, remote } = await lookupRecord(
      ctx,
      session,
      previous.rkey,
    );
    if (response.ok)
      return "The previous Bluesky post still exists. Delete it before re-sharing.";
    if (
      response.status !== 400 ||
      !object(remote) ||
      remote.error !== "RecordNotFound"
    )
      return "Could not confirm deletion. The original delivery is unchanged.";
  } catch {
    return "Could not confirm deletion. The original delivery is unchanged.";
  }

  const now = new Date().toISOString();
  let payload: ReturnType<typeof announcement>;
  let imageId: string | undefined;
  try {
    payload = announcement({ ...source }, now);
    imageId = featuredImageId({ ...source });
    if (imageId) {
      const thumb = await uploadFeaturedImage(imageId, session.accessJwt, ctx);
      if (!AppBskyEmbedExternal.isMain(payload.embed))
        throw new Error("INVALID_EMBED");
      payload.embed.external.thumb = thumb;
    }
  } catch {
    return "Could not prepare the current announcement or featured image. The original delivery is unchanged.";
  }
  const record: Delivery = {
    ...previous,
    title:
      object(source.data) && typeof source.data.title === "string"
        ? source.data.title.slice(0, 300)
        : previous.title,
    updatedAt: new Date().toISOString(),
    attemptId: crypto.randomUUID(),
    rkey: TID.nextStr(),
    replacesRkey: previous.rkey,
    payload,
    featuredImageId: imageId,
    status: "pending",
    phase: "preparing",
    code: null,
    uri: null,
  };
  // Claim only after deletion and preparation succeed. The revision and the
  // displayed key fence overlapping clicks, including replays after completion.
  const claim = await store.compareAndSet(sourceId, current.revision, record);
  if (!claim.applied)
    return "Another request changed this announcement. Refresh its status.";
  await sendAttempt(record, claim.revision, ctx, session);
  return "Re-share finished. See the delivery status below.";
}

export function deliveries(ctx: PluginContext): StorageCollection<Delivery> {
  return ctx.storage.deliveries as StorageCollection<Delivery>;
}

/** Native publication preserves publishedAt across unpublish and ordinary republish.
 * Snapshot identities too: publication dates can be explicitly changed by editors.
 * An incomplete initialization enables nothing. Reactivation never moves the boundary.
 */
export async function initialize(ctx: PluginContext): Promise<void> {
  if (await ctx.kv.get(BOUNDARY_KEY)) return;
  const enabledAt = new Date().toISOString();
  const historicalIds: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await ctx.content!.list("posts", { limit: 100, cursor });
    for (const item of page.items) {
      if (item.publishedAt || item.status === "published")
        historicalIds.push(item.id);
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  await ctx.kv.compareAndSet(BOUNDARY_KEY, null, {
    version: 1,
    enabledAt,
    historicalIds,
  } satisfies Boundary);
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function rpc(
  ctx: PluginContext,
  url: string,
  body: unknown,
  accessJwt?: string,
): Promise<Response> {
  return ctx.http!.fetch(url, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(8000),
    headers: {
      "Content-Type": "application/json",
      ...(accessJwt ? { Authorization: `Bearer ${accessJwt}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

export async function afterPublish(
  content: Record<string, unknown>,
  collection: string,
  ctx: PluginContext,
): Promise<void> {
  if (
    collection !== "posts" ||
    content.status !== "published" ||
    typeof content.id !== "string"
  )
    return;
  try {
    const boundary = await ctx.kv.get<Boundary>(BOUNDARY_KEY);
    // No backfill. Legacy import metadata also excludes imports made after installation.
    if (
      !boundary ||
      boundary.historicalIds.includes(content.id) ||
      typeof content.publishedAt !== "string" ||
      !Number.isFinite(Date.parse(content.publishedAt)) ||
      Date.parse(content.publishedAt) < Date.parse(boundary.enabledAt) ||
      (object(content.data) && content.data.legacy_published_at)
    )
      return;
    await deliverInitial(content, ctx);
  } catch {
    // Neither storage failures nor a lost hook are transactional with publication.
    // Never log exception text: host/network errors may contain credentials.
    ctx.log.error(
      "Bluesky announcement hook or storage failed; delivery may require inspection.",
    );
  }
}

async function deliverInitial(
  content: Record<string, unknown>,
  ctx: PluginContext,
): Promise<void> {
  const sourceId = content.id as string;
  const now = new Date().toISOString();
  const store = deliveries(ctx);
  let record: Delivery = {
    version: 1,
    sourceId,
    collection: "posts",
    title:
      object(content.data) && typeof content.data.title === "string"
        ? content.data.title.slice(0, 300)
        : "Untitled post",
    publishedAt: content.publishedAt as string,
    createdAt: now,
    updatedAt: now,
    attemptId: crypto.randomUUID(),
    rkey: TID.nextStr(),
    accountDid: null,
    payload: null,
    status: "pending",
    phase: "preparing",
    code: null,
    uri: null,
  };
  try {
    record.payload = announcement(content, now);
    record.featuredImageId = featuredImageId(content);
  } catch {
    record = {
      ...record,
      status: "skipped",
      phase: "finished",
      code: "invalid_announcement",
      payload: null,
    };
  }
  // This absence-only CAS is the initial claim. No existing state is retryable here.
  const claim = await store.compareAndSet(sourceId, null, record);
  if (!claim.applied || record.status !== "pending") return;
  await sendAttempt(record, claim.revision, ctx);
}

type Session = { did: string; accessJwt: string };
type Authentication =
  | { session: Session }
  | { status: "skipped" | "failed"; code: string };

async function authenticate(ctx: PluginContext): Promise<Authentication> {
  let identifier: unknown;
  let password: unknown;
  try {
    if ((await ctx.settings.get("enabled")) !== true) {
      return { status: "skipped", code: "delivery_disabled" };
    }
    const { env } = await import("cloudflare:workers");
    const configuredHandle = await ctx.settings.get("identifier");
    const configuredPassword = await ctx.settings.get("appPassword");
    identifier =
      typeof configuredHandle === "string" && configuredHandle.trim()
        ? configuredHandle.trim()
        : env.PUBLIC_BLUESKY_HANDLE;
    password =
      typeof configuredPassword === "string" && configuredPassword.trim()
        ? configuredPassword
        : env.BLUESKY_APP_PASSWORD;
    if (
      typeof identifier !== "string" ||
      !identifier.trim() ||
      typeof password !== "string" ||
      !password.trim()
    ) {
      throw new Error("CREDENTIALS_UNAVAILABLE");
    }
  } catch {
    return { status: "skipped", code: "credentials_unavailable" };
  }

  let session: unknown;
  try {
    const response = await rpc(ctx, SESSION_URL, { identifier, password });
    if (!response.ok) {
      return { status: "failed", code: "authentication_rejected" };
    }
    session = await response.json();
    if (
      !object(session) ||
      typeof session.did !== "string" ||
      !/^did:(plc:[a-z2-7]{24}|web:[a-zA-Z0-9._:%-]+)$/.test(session.did) ||
      typeof session.accessJwt !== "string" ||
      !session.accessJwt ||
      /[\r\n]/.test(session.accessJwt)
    ) {
      return { status: "failed", code: "invalid_session" };
    }
  } catch {
    return { status: "failed", code: "authentication_unavailable" };
  }
  // Narrow again across the asynchronous boundary without retaining credentials in state.
  if (
    !object(session) ||
    typeof session.did !== "string" ||
    typeof session.accessJwt !== "string"
  )
    return { status: "failed", code: "invalid_session" };

  return { session: { did: session.did, accessJwt: session.accessJwt } };
}

async function lookupRecord(
  ctx: PluginContext,
  session: Session,
  rkey: string,
) {
  const url = new URL(GET_URL);
  url.search = new URLSearchParams({
    repo: session.did,
    collection: "app.bsky.feed.post",
    rkey,
  }).toString();
  const response = await ctx.http!.fetch(url.href, {
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(8000),
    headers: { Authorization: `Bearer ${session.accessJwt}` },
  });
  const remote: unknown = await response.json();
  return { response, remote };
}

async function sendAttempt(
  record: Delivery,
  revision: string,
  ctx: PluginContext,
  authenticated?: Session,
): Promise<void> {
  const sourceId = record.sourceId;
  const store = deliveries(ctx);
  let unresolved = record.accountDid !== null;
  const finish = async (
    status: Delivery["status"],
    code: string | null,
    uri: string | null = null,
  ) => {
    const result = await store.updateIf(sourceId, {
      where: { status: "pending", attemptId: record.attemptId },
      set: {
        // Configuration and authentication failures cannot resolve a prior write.
        status:
          unresolved && (status === "skipped" || status === "failed")
            ? "uncertain"
            : status,
        code,
        uri,
        phase: "finished",
        updatedAt: new Date().toISOString(),
      },
    });
    if (!result.applied)
      ctx.log.error("Bluesky delivery finalization lost its claim.");
  };

  if (!record.payload) {
    await finish("skipped", "invalid_announcement");
    return;
  }
  const authentication = authenticated
    ? { session: authenticated }
    : await authenticate(ctx);
  if ("code" in authentication) {
    await finish(authentication.status, authentication.code);
    return;
  }
  const { session } = authentication;
  const did = session.did;
  await ctx.kv.compareAndSet(ACCOUNT_KEY, null, { did });
  const account = await ctx.kv.get<{ did: string }>(ACCOUNT_KEY);
  if (
    account?.did !== did ||
    (record.accountDid !== null && record.accountDid !== did)
  ) {
    await finish("failed", "account_changed");
    return;
  }
  const expectedUri = `at://${did}/app.bsky.feed.post/${record.rkey}`;
  // Any attempt already bound to an account may have reached the remote create,
  // including pending attempts interrupted before their completion was persisted.
  if (record.accountDid !== null) {
    try {
      const { response, remote } = await lookupRecord(
        ctx,
        session,
        record.rkey,
      );
      if (response.ok) {
        unresolved = false;
        if (
          object(remote) &&
          remote.uri === expectedUri &&
          sameRecord(remote.value, record.payload)
        )
          await finish("shared", null, expectedUri);
        else await finish("failed", "remote_record_conflict");
        return;
      }
      // Only the PDS's explicit RecordNotFound establishes absence. Never infer
      // absence from a timeout, arbitrary 404, auth failure or malformed body.
      if (
        response.status !== 400 ||
        !object(remote) ||
        remote.error !== "RecordNotFound"
      ) {
        await finish("uncertain", "reconciliation_unavailable");
        return;
      }
      unresolved = false;
    } catch {
      await finish("uncertain", "reconciliation_unavailable");
      return;
    }
  }
  const source = await ctx.content!.get("posts", sourceId);
  if (!source || source.status !== "published") {
    await finish("skipped", "source_not_published");
    return;
  }
  // Only prepare a thumbnail before the first possible create. Reconciliation
  // must retain the exact durable payload, including an already uploaded blob.
  if (record.accountDid === null && record.featuredImageId) {
    try {
      const thumb = await uploadFeaturedImage(
        record.featuredImageId,
        session.accessJwt,
        ctx,
      );
      if (!AppBskyEmbedExternal.isMain(record.payload.embed))
        throw new Error("INVALID_EMBED");
      record = {
        ...record,
        payload: {
          ...record.payload,
          embed: {
            ...record.payload.embed,
            external: { ...record.payload.embed.external, thumb },
          },
        },
      };
    } catch {
      await finish("failed", "featured_image_unavailable");
      return;
    }
  }
  record = {
    ...record,
    accountDid: did,
    phase: "creating",
    updatedAt: new Date().toISOString(),
  };
  const prepared = await store.compareAndSet(sourceId, revision, record);
  if (!prepared.applied) return;
  // Identity and payload are durable before the write. createRecord uses MST
  // add, not put/update: an occupied key is rejected rather than overwritten.
  // Reuse that key even after confirmed absence; a late old create is still safe.
  try {
    const response = await rpc(
      ctx,
      CREATE_URL,
      {
        repo: did,
        collection: "app.bsky.feed.post",
        rkey: record.rkey,
        record: record.payload,
        validate: true,
      },
      session.accessJwt,
    );
    if (!response.ok) {
      // Only explicit pre-write XRPC rejections are definite. A 5xx, duplicate,
      // malformed response or transport failure may follow a committed write.
      let error: unknown;
      try {
        error = await response.json();
      } catch {
        /* Keep unknown outcomes uncertain. */
      }
      const rejected = [
        "InvalidRequest",
        "InvalidToken",
        "ExpiredToken",
        "AuthRequired",
        "AccountTakedown",
        "AccountDeactivated",
        "InvalidSwap",
      ];
      const definite =
        [400, 401, 403].includes(response.status) &&
        object(error) &&
        typeof error.error === "string" &&
        rejected.includes(error.error);
      await finish(
        definite ? "failed" : "uncertain",
        definite ? "create_rejected" : "create_outcome_unknown",
      );
      return;
    }
    const result: unknown = await response.json();
    if (
      !object(result) ||
      result.uri !== expectedUri ||
      typeof result.cid !== "string" ||
      !result.cid
    ) {
      await finish("uncertain", "invalid_create_response");
      return;
    }
    await finish("shared", null, expectedUri);
  } catch {
    await finish("uncertain", "create_outcome_unknown");
  }
}
