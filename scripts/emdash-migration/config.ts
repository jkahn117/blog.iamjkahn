export const migrationConfig = {
  collection: "posts",
  taxonomy: "tag",
  defaultBylineSlug: "josh-kahn",
  authorBylineSlugs: {
    Josh: "josh-kahn",
    jkahn: "josh-kahn",
  } as Record<string, string>,
  fields: {
    title: "title",
    content: "content",
    summary: "excerpt",
    legacyRoute: "legacy_route",
    externalUrl: "redirect_link",
    historicalDate: "legacy_published_at",
    sourcePath: "migration_source_path",
    sourceHash: "migration_source_hash",
    payloadHash: "migration_payload_hash",
  },
} as const;

export type MigrationConfig = typeof migrationConfig;
