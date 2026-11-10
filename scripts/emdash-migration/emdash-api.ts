import {
  createTransport,
  csrfInterceptor,
  tokenInterceptor,
  type Interceptor,
} from "emdash/client";
import { z } from "zod";

import { migrationConfig } from "./config.ts";
import { hashImportPayload } from "./inventory.ts";
import type {
  DestinationEntry,
  ImportOperation,
  ImportPayload,
  MigrationIssue,
  PlannedPost,
  PendingWrite,
} from "./types.ts";
import {
  destinationEntrySchema,
  normalizeTarget,
  validateApiData,
} from "./validation.ts";

type ApiEnvelope<T> = { success: true; data: T };
type Collection = {
  slug: string;
  fields: Array<{ slug: string; type: string; unique?: boolean }>;
  supports: string[];
};
type Byline = { id: string; slug: string; displayName: string };
type Term = { id: string; slug: string; label: string };
type DestinationEntryWithCredits = DestinationEntry & {
  bylines?: Array<{ byline: Byline; roleLabel?: string | null }>;
};

export class EmDashApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export class EmDashMigrationApi {
  private readonly baseUrl: string;
  private readonly transport: ReturnType<typeof createTransport>;

  constructor(target: string, token = process.env.EMDASH_TOKEN) {
    this.baseUrl = normalizeTarget(target);
    const interceptors: Interceptor[] = [csrfInterceptor()];
    if (!token)
      throw new Error(
        "EMDASH_TOKEN is required, including for local preflight. The importer never creates a development session implicitly.",
      );
    interceptors.push(tokenInterceptor(token));
    this.transport = createTransport({ interceptors });
  }

  async preflight(posts: PlannedPost[]): Promise<MigrationIssue[]> {
    const issues: MigrationIssue[] = [];
    const identity = await this.request<{ role: number }>("GET", "/auth/me");
    if (![40, 50].includes(identity.role)) {
      throw new Error(
        "Importer requires an EmDash editor or administrator so drafts are visible and historical dates can be preserved.",
      );
    }
    const collection = await this.request<{ item: Collection }>(
      "GET",
      `/schema/collections/${migrationConfig.collection}?includeFields=true`,
    ).then((result) => result.item);
    for (const support of ["drafts", "revisions"]) {
      if (!collection.supports.includes(support)) {
        issues.push({
          severity: "error",
          code: "MISSING_COLLECTION_SUPPORT",
          message: `Posts must support ${support}.`,
        });
      }
    }
    const plugins = await this.request<{
      items: Array<{ id: string; enabled: boolean }>;
    }>("GET", "/admin/plugins");
    for (const plugin of plugins.items) {
      if (plugin.enabled)
        issues.push({
          severity: "error",
          code: "ENABLED_PLUGIN",
          message: `Disable plugin '${plugin.id}' before importing. Enabled plugins may send announcements or mutate content.`,
        });
    }
    const fieldTypes = new Map(
      collection.fields.map((field) => [field.slug, field.type]),
    );
    const expectedFields = new Map<string, string[]>([
      [migrationConfig.fields.title, ["string"]],
      [migrationConfig.fields.content, ["portableText"]],
      [migrationConfig.fields.summary, ["text", "string"]],
      [migrationConfig.fields.legacyRoute, ["string"]],
      [migrationConfig.fields.externalUrl, ["url", "string"]],
      [migrationConfig.fields.historicalDate, ["datetime", "string"]],
      [migrationConfig.fields.sourcePath, ["string"]],
      [migrationConfig.fields.sourceHash, ["string"]],
      [migrationConfig.fields.payloadHash, ["string"]],
    ]);

    for (const [field, acceptedTypes] of expectedFields) {
      const actualType = fieldTypes.get(field);
      if (!actualType) {
        issues.push({
          severity: "error",
          code: "MISSING_DESTINATION_FIELD",
          message: `Collection '${migrationConfig.collection}' is missing field '${field}'.`,
        });
      } else if (!acceptedTypes.includes(actualType)) {
        issues.push({
          severity: "error",
          code: "INVALID_DESTINATION_FIELD",
          message: `Field '${field}' has type '${actualType}', expected ${acceptedTypes.join(" or ")}.`,
        });
      }
    }

    for (const field of [
      migrationConfig.fields.sourcePath,
      migrationConfig.fields.legacyRoute,
    ]) {
      if (
        !collection.fields.find((candidate) => candidate.slug === field)?.unique
      )
        issues.push({
          severity: "error",
          code: "MISSING_UNIQUE_CONSTRAINT",
          message: `Field '${field}' must be unique to protect against concurrent imports.`,
        });
    }
    const bylines = await this.listBylines();
    const availableBylines = new Set(bylines.map((byline) => byline.slug));
    for (const slug of new Set(posts.map((post) => post.payload.bylineSlug))) {
      if (!availableBylines.has(slug)) {
        issues.push({
          severity: "error",
          code: "MISSING_BYLINE",
          message: `Destination byline '${slug}' does not exist.`,
        });
      }
    }

    const requiredTags = new Set(
      posts.flatMap((post) => post.payload.tagSlugs),
    );
    if (posts.length > 0) {
      const taxonomies = await this.request<{
        taxonomies: Array<{ name: string }>;
      }>("GET", "/taxonomies");
      if (
        !taxonomies.taxonomies.some(
          (taxonomy) => taxonomy.name === migrationConfig.taxonomy,
        )
      ) {
        issues.push({
          severity: "error",
          code: "MISSING_TAXONOMY",
          message: `Destination taxonomy '${migrationConfig.taxonomy}' does not exist.`,
        });
      } else {
        const terms = await this.listTerms();
        const availableTerms = new Set(terms.map((term) => term.slug));
        for (const slug of requiredTags) {
          if (!availableTerms.has(slug)) {
            issues.push({
              severity: "error",
              code: "MISSING_TERM",
              message: `Destination tag term '${slug}' does not exist.`,
            });
          }
        }
      }
    }

    return issues;
  }

  async planOperations(
    posts: PlannedPost[],
    pending: Record<string, PendingWrite> = {},
  ): Promise<ImportOperation[]> {
    const entries = await this.listEntries();
    const entriesBySource = new Map<string, DestinationEntryWithCredits[]>();
    for (const entry of entries) {
      const source = entry.data[migrationConfig.fields.sourcePath];
      if (typeof source !== "string") continue;
      entriesBySource.set(source, [
        ...(entriesBySource.get(source) ?? []),
        entry,
      ]);
    }

    const operations: ImportOperation[] = [];
    for (const post of posts) {
      const matches = entriesBySource.get(post.sourcePath) ?? [];
      if (matches.length === 0) {
        const collision = entries.find(
          (entry) =>
            entry.slug === post.payload.slug ||
            entry.data[migrationConfig.fields.legacyRoute] === post.route,
        );
        if (collision)
          operations.push({
            action: "conflict",
            post,
            entry: collision,
            reason:
              "An existing entry already uses the destination slug or route.",
          });
        else operations.push({ action: "create", post });
        continue;
      }
      if (matches.length > 1) {
        operations.push({
          action: "conflict",
          post,
          entry: matches[0]!,
          reason: `Multiple destination entries claim source '${post.sourcePath}'.`,
        });
        continue;
      }

      const listedEntry = matches[0]!;
      const entry = await this.getEntry(listedEntry.id);
      const checkpoint = pending[post.sourcePath];
      if (
        checkpoint &&
        checkpoint.entryId === entry.id &&
        checkpoint.revision === entry._rev &&
        checkpoint.sourceHash === post.sourceHash &&
        checkpoint.payloadHash === post.payloadHash
      ) {
        operations.push({ action: "resume", post, entry });
        continue;
      }
      if (entry.draftRevisionId && post.payload.status === "published") {
        operations.push({
          action: "conflict",
          post,
          entry,
          reason:
            "A pending draft has no matching publication checkpoint. It will not be published or overwritten.",
        });
        continue;
      }
      const storedSourceHash = entry.data[migrationConfig.fields.sourceHash];
      if (
        storedSourceHash === post.sourceHash &&
        entry.publishedAt === null &&
        post.payload.status === "published"
      ) {
        operations.push({
          action: "conflict",
          post,
          entry,
          reason:
            "An incomplete publication has no matching checkpoint. Inspect it before retrying.",
        });
        continue;
      }
      if (
        storedSourceHash === post.sourceHash &&
        entry.data[migrationConfig.fields.payloadHash] === post.payloadHash
      ) {
        operations.push({
          action: "skip",
          post,
          entry,
          reason: "Source hash is unchanged.",
        });
        continue;
      }
      if (entry.draftRevisionId) {
        operations.push({
          action: "conflict",
          post,
          entry,
          reason: "The destination has a pending draft revision.",
        });
        continue;
      }

      if (entry.bylines?.length !== 1 || entry.bylines[0]?.roleLabel) {
        operations.push({
          action: "conflict",
          post,
          entry,
          reason:
            "Destination byline credits differ from the imported credits.",
        });
        continue;
      }
      if (!["draft", "published"].includes(entry.status)) {
        operations.push({
          action: "conflict",
          post,
          entry,
          reason: "Destination publication state changed outside the importer.",
        });
        continue;
      }
      const storedPayloadHash = entry.data[migrationConfig.fields.payloadHash];
      const currentPayload = await this.payloadFromEntry(entry);
      const currentPayloadHash = hashImportPayload(currentPayload);
      if (
        typeof storedPayloadHash !== "string" ||
        storedPayloadHash !== currentPayloadHash
      ) {
        operations.push({
          action: "conflict",
          post,
          entry,
          reason:
            "The destination no longer matches the last imported payload.",
        });
        continue;
      }

      operations.push({ action: "update", post, entry });
    }

    return operations;
  }

  async execute(
    operation: ImportOperation,
    checkpoint: (pending: PendingWrite) => Promise<void> = async () => {},
  ): Promise<{ entryId?: string; message: string }> {
    if (operation.action === "skip" || operation.action === "conflict") {
      return { entryId: operation.entry.id, message: operation.reason };
    }
    let entry: DestinationEntry;
    if (operation.action === "resume") {
      entry = operation.entry;
    } else {
      entry =
        operation.action === "create"
          ? await this.createEntry(operation.post)
          : await this.updateEntry(operation.post, operation.entry);
      if (!entry._rev)
        throw new Error(
          "Destination did not return a revision token after writing.",
        );
      await checkpoint({
        entryId: entry.id,
        revision: entry._rev,
        sourceHash: operation.post.sourceHash,
        payloadHash: operation.post.payloadHash,
      });
    }
    await this.finishPublication(operation.post, entry);
    const reconciled = await this.getEntry(entry.id);
    const actualPayload = await this.payloadFromEntry(reconciled);
    if (hashImportPayload(actualPayload) !== operation.post.payloadHash) {
      throw new Error(
        `Reconciliation failed for ${operation.post.sourcePath}; inspect the destination before retrying.`,
      );
    }
    return {
      entryId: entry.id,
      message: `${operation.action} completed and reconciled.`,
    };
  }

  private async createEntry(post: PlannedPost): Promise<DestinationEntry> {
    const bylineId = await this.bylineId(post.payload.bylineSlug);
    const created = await this.request<{
      item: DestinationEntry;
      _rev?: string;
    }>("POST", `/content/${migrationConfig.collection}`, {
      data: post.payload.data,
      slug: post.payload.slug,
      ...(post.payload.status === "draft" ? { status: "draft" } : {}),
      bylines: [{ bylineId }],
      taxonomies: { [migrationConfig.taxonomy]: post.payload.tagSlugs },
      createdAt:
        (post.payload.data[migrationConfig.fields.historicalDate] as
          | string
          | undefined) ?? undefined,
    }).then((result) => ({ ...result.item, _rev: result._rev }));
    return created;
  }

  private async updateEntry(
    post: PlannedPost,
    existing: DestinationEntry,
  ): Promise<DestinationEntry> {
    if (!existing._rev)
      throw new Error(
        "Destination did not return a revision token; refusing a blind update.",
      );
    const bylineId = await this.bylineId(post.payload.bylineSlug);
    const updated = await this.request<{
      item: DestinationEntry;
      _rev?: string;
    }>("PUT", `/content/${migrationConfig.collection}/${existing.id}`, {
      data: post.payload.data,
      slug: post.payload.slug,
      _rev: existing._rev,
      bylines: [{ bylineId }],
      taxonomies: { [migrationConfig.taxonomy]: post.payload.tagSlugs },
      ...(post.payload.status === "draft" ? { status: "draft" } : {}),
    }).then((result) => ({ ...result.item, _rev: result._rev }));

    return updated;
  }

  private async finishPublication(
    post: PlannedPost,
    entry: DestinationEntry,
  ): Promise<void> {
    if (!entry._rev) throw new Error("Missing revision token for publication.");
    if (post.payload.status === "published") {
      await this.request(
        "POST",
        `/content/${migrationConfig.collection}/${entry.id}/publish`,
        {
          _rev: entry._rev,
          publishedAt: post.payload.publishedAt,
        },
      );
    } else if (entry.status !== "draft") {
      await this.request(
        "POST",
        `/content/${migrationConfig.collection}/${entry.id}/unpublish`,
        { _rev: entry._rev },
      );
    }
  }

  private async payloadFromEntry(
    entry: DestinationEntryWithCredits,
  ): Promise<ImportPayload> {
    const terms = await this.entryTerms(entry.id);
    const bylineSlug = entry.bylines?.[0]?.byline.slug ?? "";
    return {
      slug: entry.slug ?? "",
      status: entry.status === "published" ? "published" : "draft",
      publishedAt: entry.status === "published" ? entry.publishedAt : null,
      data: Object.fromEntries(
        Object.values(migrationConfig.fields).map((field) => [
          field,
          entry.data[field] ?? null,
        ]),
      ),
      bylineSlug,
      tagSlugs: terms.map((term) => term.slug).sort(),
    };
  }

  private async listEntries(): Promise<DestinationEntryWithCredits[]> {
    const entries: DestinationEntryWithCredits[] = [];
    let cursor: string | undefined;
    do {
      const params = new URLSearchParams({ status: "all", limit: "100" });
      if (cursor) params.set("cursor", cursor);
      const page = await this.request<{
        items: DestinationEntryWithCredits[];
        nextCursor?: string;
      }>("GET", `/content/${migrationConfig.collection}?${params}`);
      entries.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);
    return entries;
  }

  private async getEntry(id: string): Promise<DestinationEntryWithCredits> {
    const result = await this.request<{
      item: DestinationEntryWithCredits;
      _rev?: string;
    }>("GET", `/content/${migrationConfig.collection}/${id}`);
    const entry = destinationEntrySchema.parse({
      ...result.item,
      _rev: result._rev,
    });
    if (entry.draftRevisionId) {
      const comparison = await this.request<{
        hasChanges: boolean;
        draft: Record<string, unknown> | null;
      }>("GET", `/content/${migrationConfig.collection}/${id}/compare`);
      if (comparison.draft) entry.data = comparison.draft;
    }
    return entry;
  }

  private async listBylines(): Promise<Byline[]> {
    const bylines: Byline[] = [];
    let cursor: string | undefined;
    do {
      const params = new URLSearchParams({ limit: "100" });
      if (cursor) params.set("cursor", cursor);
      const result = await this.request<{
        items: Byline[];
        nextCursor?: string;
      }>("GET", `/admin/bylines?${params}`);
      bylines.push(...result.items);
      cursor = result.nextCursor;
    } while (cursor);
    return bylines;
  }

  private async bylineId(slug: string): Promise<string> {
    const byline = (await this.listBylines()).find(
      (candidate) => candidate.slug === slug,
    );
    if (!byline)
      throw new Error(`Destination byline '${slug}' does not exist.`);
    return byline.id;
  }

  private async listTerms(): Promise<Term[]> {
    const result = await this.request<{ terms: Term[] }>(
      "GET",
      `/taxonomies/${migrationConfig.taxonomy}/terms?limit=100&includeCounts=false`,
    );
    return result.terms;
  }

  private async entryTerms(id: string): Promise<Term[]> {
    const result = await this.request<{ terms: Term[] }>(
      "GET",
      `/content/${migrationConfig.collection}/${id}/terms/${migrationConfig.taxonomy}`,
    );
    const unresolved = (result as { unresolved?: unknown[] }).unresolved;
    if (unresolved?.length)
      throw new Error(
        `Destination entry ${id} has unresolved tag assignments.`,
      );
    return result.terms;
  }

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const headers = new Headers({ Accept: "application/json" });
    let requestBody: string | undefined;
    if (body !== undefined) {
      headers.set("Content-Type", "application/json");
      requestBody = JSON.stringify(body);
    }
    const response = await this.transport.fetch(
      new Request(`${this.baseUrl}/_emdash/api${path}`, {
        method,
        headers,
        body: requestBody,
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      }),
    );
    if (!response.ok) {
      let code = "UNKNOWN_ERROR";
      let message = `HTTP ${response.status}`;
      try {
        const json = (await response.json()) as {
          error?: { code?: string; message?: string };
        };
        code = json.error?.code ?? code;
        message = `Request failed (${code}, HTTP ${response.status}).`;
      } catch {
        message = response.statusText || message;
      }
      throw new EmDashApiError(response.status, code, message);
    }

    const json = z
      .object({ success: z.literal(true), data: z.unknown() })
      .parse(await response.json()) as ApiEnvelope<T>;
    return validateApiData(path, json.data) as T;
  }
}
