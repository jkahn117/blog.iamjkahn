import type { BlockResponse } from "@emdash-cms/blocks/server";
import type { PluginRoute } from "emdash";

import { deliveries, isActive, recover, reshare } from "./delivery.ts";

type HistoryState = { unresolved: boolean; cursor?: string };
type Interaction = HistoryState & { sourceId?: string; reshareRkey?: string };

function interaction(input: unknown): Interaction | null {
  if (!input || typeof input !== "object" || !("type" in input)) return null;
  if (input.type === "page_load" && "page" in input && input.page === "/status")
    return { unresolved: false };
  if (
    input.type !== "block_action" ||
    !("action_id" in input) ||
    !["send", "history", "reshare"].includes(String(input.action_id)) ||
    !("value" in input)
  )
    return null;
  // Retain the existing source-ID-only recovery interaction.
  const value =
    typeof input.value === "string"
      ? { sourceId: input.value, unresolved: false }
      : input.value;
  if (
    !value ||
    typeof value !== "object" ||
    !("unresolved" in value) ||
    typeof value.unresolved !== "boolean"
  )
    return null;
  const cursor = "cursor" in value ? value.cursor : undefined;
  if (
    cursor !== undefined &&
    (typeof cursor !== "string" || !cursor || cursor.length > 4096)
  )
    return null;
  const state: HistoryState = { unresolved: value.unresolved, cursor };
  if (input.action_id === "history") return state;
  if (
    !("sourceId" in value) ||
    typeof value.sourceId !== "string" ||
    !value.sourceId ||
    value.sourceId.length > 200
  )
    return null;
  if (input.action_id === "reshare") {
    if (
      !("rkey" in value) ||
      typeof value.rkey !== "string" ||
      !value.rkey ||
      value.rkey.length > 200
    )
      return null;
    return { ...state, sourceId: value.sourceId, reshareRkey: value.rkey };
  }
  return { ...state, sourceId: value.sourceId };
}

// Native routes and the host's Block Kit page renderer share this production
// dispatcher. No browser bundle or public Astro route is needed.
export const admin: PluginRoute = {
  permission: "plugins:manage",
  methods: ["POST"],
  request: { body: "json" },
  handler: async (ctx): Promise<BlockResponse> => {
    const parsed = interaction(ctx.input);
    if (!parsed) {
      return {
        blocks: [
          {
            type: "banner",
            variant: "error",
            title: "Invalid announcement action.",
          },
        ],
      };
    }
    let message: string | undefined;
    if (parsed.sourceId) {
      try {
        message = parsed.reshareRkey
          ? await reshare(parsed.sourceId, parsed.reshareRkey, ctx)
          : await recover(parsed.sourceId, ctx);
      } catch {
        ctx.log.error(
          "Bluesky recovery or storage failed; inspect delivery status before retrying.",
        );
        message =
          "Recovery interrupted. Refresh the status before trying again.";
      }
    }
    const state: HistoryState = {
      unresolved: parsed.unresolved,
      cursor: parsed.cursor,
    };
    const page = await deliveries(ctx).query({
      ...(state.unresolved
        ? {
            where: {
              status: { in: ["pending", "skipped", "failed", "uncertain"] },
            },
          }
        : {}),
      // Native storage adds the record ID as a stable tie-breaker.
      orderBy: { createdAt: "desc" },
      limit: 25,
      cursor: state.cursor,
    });
    return {
      ...(message ? { toast: { type: "info" as const, message } } : {}),
      blocks: [
        { type: "header", text: "Bluesky announcements" },
        {
          type: "context",
          text: "No automatic retries. Send uses the original announcement. Re-share requires deleting the previous Bluesky post and uses the current published content and featured image. Active attempts stay locked for one minute; refresh to check their status.",
        },
        {
          type: "context",
          text: state.unresolved
            ? "Showing unresolved announcements."
            : "Showing full history.",
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              action_id: "history",
              label: "Full history",
              value: { unresolved: false },
              style: state.unresolved ? "secondary" : "primary",
            },
            {
              type: "button",
              action_id: "history",
              label: "Unresolved",
              value: { unresolved: true },
              style: state.unresolved ? "primary" : "secondary",
            },
            {
              type: "button",
              action_id: "history",
              label: "Refresh",
              value: state,
            },
          ],
        },
        {
          type: "table",
          columns: [
            { key: "title", label: "Post" },
            { key: "status", label: "Status", format: "badge" },
            { key: "code", label: "Detail" },
            {
              key: "createdAt",
              label: "First publication",
              format: "relative_time",
            },
            {
              key: "updatedAt",
              label: "Last updated",
              format: "relative_time",
            },
            { key: "link", label: "Bluesky / recovery", format: "element" },
            { key: "reshare", label: "Deleted post", format: "element" },
          ],
          rows: page.items.map(({ data }) => ({
            title: data.title,
            status: data.status,
            code: data.code ?? "",
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            ...(data.status === "shared" && data.uri && data.accountDid
              ? {
                  reshare: {
                    type: "button",
                    label: "Re-share",
                    action_id: "reshare",
                    value: {
                      ...state,
                      sourceId: data.sourceId,
                      rkey: data.rkey,
                    },
                    confirm: {
                      title: "Re-share deleted Bluesky post?",
                      text: "Only continue if you deleted the previous post. Bluesky will be checked before sending a new announcement using the current published content and featured image.",
                      confirm: "Check and re-share",
                      deny: "Cancel",
                    },
                  },
                  link: {
                    type: "link",
                    label: "View post",
                    target: {
                      kind: "external",
                      url: `https://bsky.app/profile/${encodeURIComponent(data.accountDid)}/post/${encodeURIComponent(data.rkey)}`,
                    },
                  },
                }
              : data.status !== "shared" && !isActive(data)
                ? {
                    link: {
                      type: "button",
                      label:
                        data.status === "pending" || data.status === "uncertain"
                          ? "Recover"
                          : "Send",
                      action_id: "send",
                      value: { ...state, sourceId: data.sourceId },
                    },
                  }
                : {}),
          })),
          page_action_id: "read_only",
          empty_text:
            "No announcements on this page. Use Full history or Unresolved to return to the newest records.",
        },
        {
          type: "actions",
          elements: [
            ...(state.cursor
              ? [
                  {
                    type: "button" as const,
                    action_id: "history",
                    label: "Newest",
                    value: { unresolved: state.unresolved },
                  },
                ]
              : []),
            ...(page.hasMore && page.cursor
              ? [
                  {
                    type: "button" as const,
                    action_id: "history",
                    label: "Older",
                    value: { ...state, cursor: page.cursor },
                  },
                ]
              : []),
          ],
        },
      ],
    };
  },
};
