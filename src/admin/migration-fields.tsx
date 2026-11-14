const migrationFields = [
  ["legacy_route", "Legacy route"],
  ["legacy_published_at", "Legacy publication date"],
  ["migration_source_path", "Source path"],
  ["migration_source_hash", "Source hash"],
  ["migration_payload_hash", "Payload hash"],
] as const;

interface MigrationPanelContext {
  entry: { data: Record<string, unknown> };
}

function hasMigrationData({ entry }: MigrationPanelContext) {
  return migrationFields.some(([name]) => {
    const value = entry.data[name];
    return typeof value === "string" && value.length > 0;
  });
}

function MigrationDetails({ entry }: MigrationPanelContext) {
  if (!hasMigrationData({ entry })) return null;

  return (
    <details className="text-sm">
      <summary className="cursor-pointer">Show legacy values</summary>
      <dl className="mt-3 space-y-3">
        {migrationFields.map(([name, label]) => {
          const value = entry.data[name];
          return (
            <div key={name}>
              <dt className="font-medium">{label}</dt>
              <dd className="text-kumo-subtle mt-1 font-mono text-xs break-all whitespace-pre-wrap">
                {typeof value === "string" && value.length > 0
                  ? value
                  : "Not set"}
              </dd>
            </div>
          );
        })}
      </dl>
    </details>
  );
}

function HiddenMigrationField() {
  return null;
}

export const fields = {
  hidden: HiddenMigrationField,
};

export const contentEditorPanels = [
  {
    id: "migration-details",
    title: "Migration details",
    collections: ["posts"],
    component: MigrationDetails,
    isVisible: hasMigrationData,
  },
];
