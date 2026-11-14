import { definePlugin } from "emdash";

export function createPlugin() {
  return definePlugin({
    id: "migration-fields",
    version: "1.0.0",
  });
}
