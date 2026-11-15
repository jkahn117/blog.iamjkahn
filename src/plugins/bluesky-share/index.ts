import { definePlugin } from "emdash";

import { admin } from "./admin.ts";
import { afterPublish, initialize } from "./delivery.ts";

export function createPlugin() {
  return definePlugin({
    id: "bluesky-share",
    displayName: "Bluesky announcements",
    version: "1.0.0",
    capabilities: ["content:read", "network:request", "media:bytes:read"],
    allowedHosts: ["bsky.social"],
    storage: {
      deliveries: { indexes: ["status", "createdAt", "attemptId"] },
    },
    hooks: {
      "plugin:activate": async (_event, ctx) => {
        await initialize(ctx);
      },
      "content:afterPublish": {
        timeout: 35000,
        errorPolicy: "continue",
        handler: async ({ content, collection }, ctx) => {
          await afterPublish(content, collection, ctx);
        },
      },
    },
    routes: { admin },
    admin: {
      pages: [
        { path: "/status", label: "Bluesky announcements", icon: "send" },
      ],
      settingsSchema: {
        enabled: {
          type: "boolean",
          label: "Enable automatic sharing",
          default: false,
          description: "Enabling does not retry skipped announcements.",
        },
        identifier: {
          type: "string",
          label: "Bluesky handle or DID override",
          description:
            "Optional. Leave blank to use PUBLIC_BLUESKY_HANDLE from the Worker environment. Changing accounts does not reset delivery history.",
        },
        appPassword: {
          type: "secret",
          label: "Bluesky app password override",
          description:
            "Optional. Leave blank to use the existing BLUESKY_APP_PASSWORD Worker secret. Saving an override requires EMDASH_ENCRYPTION_KEY. Never use your main account password.",
        },
      },
    },
  });
}
