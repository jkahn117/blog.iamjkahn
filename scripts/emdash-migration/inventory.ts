import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import matter from "gray-matter";

import { getPostSlug } from "../../src/lib/getPostSlug.ts";
import { migrationConfig } from "./config.ts";
import {
  collectMarkdownAssetReferences,
  markdownToPortableText,
} from "./portable-text.ts";
import type {
  Frontmatter,
  ImportPayload,
  MigrationIssue,
  MigrationPlan,
  PlannedPost,
} from "./types.ts";
import { frontmatterSchema } from "./validation.ts";

export function buildMigrationPlan(
  rootDirectory = process.cwd(),
  options: { only?: string[]; target?: string } = {},
): MigrationPlan {
  const tracked = trackedPostFiles(rootDirectory);
  for (const requested of options.only ?? []) {
    if (!tracked.includes(requested))
      throw new Error(`Selected file is not a tracked blog post: ${requested}`);
  }
  const files = options.only?.length
    ? tracked.filter((file) => options.only!.includes(file))
    : tracked;
  const posts = files.map((sourcePath) =>
    inventoryPost(rootDirectory, sourcePath),
  );
  const issues = validateInventory(posts);
  const allIssues = [...posts.flatMap((post) => post.issues), ...issues];

  const summary = {
    total: posts.length,
    localArticles: posts.filter((post) => !post.externalUrl).length,
    externalLinks: posts.filter((post) => post.externalUrl).length,
    drafts: posts.filter((post) => post.payload.status === "draft").length,
    published: posts.filter((post) => post.payload.status === "published")
      .length,
    warnings: allIssues.filter((issue) => issue.severity === "warning").length,
    errors: allIssues.filter((issue) => issue.severity === "error").length,
  };

  const digest = sha256(
    stableStringify({
      version: 1,
      target: options.target ?? null,
      summary,
      posts,
      issues,
    }),
  );

  return {
    version: 1,
    target: options.target ?? null,
    digest: `sha256:${digest}`,
    summary,
    posts,
    issues,
  };
}

export function trackedPostFiles(rootDirectory = process.cwd()): string[] {
  const output = execFileSync("git", ["ls-files", "src/content/blog/*.md"], {
    cwd: rootDirectory,
    encoding: "utf8",
  });
  return output.trim().split("\n").filter(Boolean).sort();
}

export function inventoryPost(
  rootDirectory: string,
  sourcePath: string,
): PlannedPost {
  const absolutePath = path.join(rootDirectory, sourcePath);
  const raw = readFileSync(absolutePath, "utf8");
  const parsed = matter(raw);
  const issues: MigrationIssue[] = [];
  const validated = frontmatterSchema.safeParse(parsed.data);
  if (!validated.success) {
    for (const issue of validated.error.issues) {
      issues.push({
        severity: "error",
        code: "INVALID_FRONTMATTER",
        message: `${issue.path.join(".")}: ${issue.message}`,
        sourcePath,
      });
    }
  }
  const frontmatter: Frontmatter = validated.success
    ? validated.data
    : {
        title:
          typeof parsed.data.title === "string"
            ? parsed.data.title
            : sourcePath,
        date: new Date(NaN),
      };
  if (
    !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])-.+\.md$/.test(
      path.basename(sourcePath),
    )
  ) {
    issues.push({
      severity: "error",
      code: "INVALID_FILENAME",
      message: "Filename must use YYYY-MM-DD-slug.md.",
      sourcePath,
    });
  }
  const postId = path.basename(sourcePath, ".md");
  const route = getPostSlug(postId);
  const slug = postId.split("-").slice(3).join("-");
  const conversion = frontmatter.redirect_link
    ? { blocks: [], issues: [] }
    : markdownToPortableText(parsed.content.trim(), sourcePath);
  issues.push(...conversion.issues);

  const tags = normalizeTags(frontmatter.tags, sourcePath, issues);
  const bylineSlug = frontmatter.author
    ? migrationConfig.authorBylineSlugs[frontmatter.author]
    : migrationConfig.defaultBylineSlug;
  if (!bylineSlug) {
    issues.push({
      severity: "error",
      code: "UNKNOWN_AUTHOR",
      message: `No byline mapping exists for author '${frontmatter.author}'.`,
      sourcePath,
    });
  }

  const assetReferences = collectMarkdownAssetReferences(parsed.content);
  const missingAssets = assetReferences.filter(
    (reference) => !assetExists(rootDirectory, absolutePath, reference),
  );
  for (const reference of missingAssets) {
    issues.push({
      severity: "warning",
      code: "MISSING_ASSET",
      message: `Referenced local asset was not found: ${reference}`,
      sourcePath,
    });
  }

  if (frontmatter.redirect_link && parsed.content.trim()) {
    issues.push({
      severity: "warning",
      code: "EXTERNAL_BODY_IGNORED",
      message:
        "External-link entry has body content; the importer will not create a local article body.",
      sourcePath,
    });
  }

  const sourceHash = sha256(raw);
  const historicalDate = normalizeDate(frontmatter.date);
  const baseData: Record<string, unknown> = {
    [migrationConfig.fields.title]: frontmatter.title,
    [migrationConfig.fields.content]: conversion.blocks,
    [migrationConfig.fields.summary]: frontmatter.summary ?? null,
    [migrationConfig.fields.legacyRoute]: route,
    [migrationConfig.fields.externalUrl]: frontmatter.redirect_link ?? null,
    [migrationConfig.fields.historicalDate]: historicalDate,
    [migrationConfig.fields.sourcePath]: sourcePath,
    [migrationConfig.fields.sourceHash]: sourceHash,
  };
  const payloadWithoutHash: ImportPayload = {
    slug,
    status: frontmatter.publish === false ? "draft" : "published",
    publishedAt: frontmatter.publish === false ? null : historicalDate,
    data: baseData,
    bylineSlug: bylineSlug ?? "",
    tagSlugs: tags.map((tag) => tag.slug).sort(),
  };
  const payloadHash = hashImportPayload(payloadWithoutHash);
  const payload: ImportPayload = {
    ...payloadWithoutHash,
    data: {
      ...baseData,
      [migrationConfig.fields.payloadHash]: payloadHash,
    },
  };

  return {
    sourcePath,
    sourceHash,
    payloadHash,
    route,
    title: frontmatter.title,
    externalUrl: frontmatter.redirect_link ?? null,
    assetReferences,
    missingAssets,
    issues,
    payload,
  };
}

export function hashImportPayload(payload: ImportPayload): string {
  return sha256(
    stableStringify({
      ...payload,
      data: Object.fromEntries(
        Object.entries(payload.data).filter(
          ([key]) => key !== migrationConfig.fields.payloadHash,
        ),
      ),
    }),
  );
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortValue(nested)]),
    );
  }
  return value;
}

function validateInventory(posts: PlannedPost[]): MigrationIssue[] {
  const issues: MigrationIssue[] = [];
  const routes = new Map<string, string>();
  const sources = new Map<string, string>();
  const slugs = new Set<string>();

  for (const post of posts) {
    const priorRoute = routes.get(post.route);
    if (priorRoute) {
      issues.push({
        severity: "error",
        code: "DUPLICATE_ROUTE",
        message: `Route ${post.route} is shared by ${priorRoute} and ${post.sourcePath}.`,
      });
    }
    routes.set(post.route, post.sourcePath);
    if (slugs.has(post.payload.slug))
      issues.push({
        severity: "error",
        code: "DUPLICATE_SLUG",
        message: `Destination slug is shared by multiple source files: ${post.payload.slug}`,
      });
    slugs.add(post.payload.slug);

    const priorSource = sources.get(post.sourcePath);
    if (priorSource) {
      issues.push({
        severity: "error",
        code: "DUPLICATE_SOURCE",
        message: `Source path appears more than once: ${post.sourcePath}.`,
      });
    }
    sources.set(post.sourcePath, post.sourcePath);
  }

  return issues;
}

function normalizeTags(
  value: Frontmatter["tags"],
  sourcePath: string,
  issues: MigrationIssue[],
): Array<{ label: string; slug: string }> {
  const values = value == null ? [] : Array.isArray(value) ? value : [value];
  const normalized = values
    .filter(
      (tag): tag is string => typeof tag === "string" && tag.trim().length > 0,
    )
    .map((label) => ({ label: label.trim(), slug: slugify(label) }));

  if (normalized.some((tag) => !tag.slug)) {
    issues.push({
      severity: "error",
      code: "INVALID_TAG",
      message: "A tag could not be converted to a non-empty slug.",
      sourcePath,
    });
  }

  return [...new Map(normalized.map((tag) => [tag.slug, tag])).values()];
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeDate(date: Date): string | null {
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function assetExists(
  rootDirectory: string,
  markdownPath: string,
  reference: string,
): boolean {
  if (/^(?:https?:)?\/\//.test(reference) || reference.startsWith("data:"))
    return true;
  const clean = reference.split(/[?#]/, 1)[0]!;
  const candidates = clean.startsWith("/")
    ? [path.join(rootDirectory, "public", clean)]
    : [
        path.resolve(path.dirname(markdownPath), clean),
        path.join(rootDirectory, "public", clean),
      ];
  return candidates.some(existsSync);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
