export type PortableTextSpan = {
  _type: "span";
  _key: string;
  text: string;
  marks?: string[];
};

export type PortableTextMarkDef = {
  _type: string;
  _key: string;
  [key: string]: unknown;
};

export type PortableTextBlock = Record<string, unknown> & {
  _type: string;
  _key: string;
};

export type MigrationIssue = {
  severity: "warning" | "error";
  code: string;
  message: string;
  sourcePath?: string;
};

export type Frontmatter = {
  title: string;
  date: Date;
  author?: string;
  summary?: string;
  redirect_link?: string;
  publish?: boolean;
  tags?: string | string[] | null;
};

export type ImportPayload = {
  slug: string;
  status: "draft" | "published";
  publishedAt: string | null;
  data: Record<string, unknown>;
  bylineSlug: string;
  tagSlugs: string[];
};

export type PlannedPost = {
  sourcePath: string;
  sourceHash: string;
  payloadHash: string;
  route: string;
  title: string;
  externalUrl: string | null;
  assetReferences: string[];
  missingAssets: string[];
  issues: MigrationIssue[];
  payload: ImportPayload;
};

export type MigrationPlan = {
  version: 1;
  target: string | null;
  digest: string;
  summary: {
    total: number;
    localArticles: number;
    externalLinks: number;
    drafts: number;
    published: number;
    warnings: number;
    errors: number;
  };
  posts: PlannedPost[];
  issues: MigrationIssue[];
};

export type DestinationEntry = {
  id: string;
  slug: string | null;
  status: string;
  data: Record<string, unknown>;
  publishedAt: string | null;
  draftRevisionId: string | null;
  _rev?: string;
};

export type PendingWrite = {
  entryId: string;
  revision: string;
  sourceHash: string;
  payloadHash: string;
};

export type ImportOperation =
  | { action: "resume"; post: PlannedPost; entry: DestinationEntry }
  | { action: "create"; post: PlannedPost }
  | {
      action: "skip";
      post: PlannedPost;
      entry: DestinationEntry;
      reason: string;
    }
  | { action: "update"; post: PlannedPost; entry: DestinationEntry }
  | {
      action: "conflict";
      post: PlannedPost;
      entry: DestinationEntry;
      reason: string;
    };

export type ImportReceiptItem = {
  sourcePath: string;
  action: ImportOperation["action"] | "failed";
  entryId?: string;
  message: string;
};

export type ImportReceipt = {
  version: 1;
  target: string;
  planDigest: string;
  startedAt: string;
  completedAt: string;
  items: ImportReceiptItem[];
};
