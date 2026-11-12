import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import sharp from "sharp";

export const acceptedGaps = [
  "/assets/images/2020-09-08/apigw_apikeysource_setting.png",
  "/assets/images/2020-09-08/jwt_creation.png",
];

type JsonObject = Record<string, unknown>;
export interface HistoricalPost {
  sourcePath: string;
  payload: JsonObject & { status: string; data: JsonObject };
}
export interface MediaRecord {
  id: string;
  storageKey: string;
  status: "ready" | "pending" | "failed";
  contentHash: string | null;
}
export interface LocalImage {
  source: string;
  sha256: string;
  contentHash: string;
  bytes: number;
  width?: number;
  height?: number;
  format: string;
}
type NodePath = (string | number)[];
interface Reference {
  path: NodePath;
  kind: "native" | "html";
  source: string;
  mediaId?: string;
  start?: number;
  end?: number;
  quote?: string;
  problem?: string;
}

const object = (value: unknown): value is JsonObject =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const hash = (algorithm: string, bytes: string | Buffer) =>
  createHash(algorithm).update(bytes).digest("hex");
export const fingerprint = (value: unknown) =>
  `sha256:${hash("sha256", JSON.stringify(value))}`;

export function readPosts(value: unknown): HistoricalPost[] {
  if (!object(value) || !Array.isArray(value.posts)) {
    throw new Error("Expected historical plan { posts: [...] }");
  }
  const seen = new Set<string>();
  return value.posts.map((post) => {
    if (
      !object(post) ||
      typeof post.sourcePath !== "string" ||
      !object(post.payload) ||
      typeof post.payload.status !== "string" ||
      !object(post.payload.data) ||
      !Array.isArray(post.payload.data.content)
    ) {
      throw new Error(
        "Each post needs sourcePath, payload.status and payload.data.content",
      );
    }
    if (seen.has(post.sourcePath))
      throw new Error(`Duplicate post: ${post.sourcePath}`);
    seen.add(post.sourcePath);
    return post as unknown as HistoricalPost;
  });
}

export function readMedia(value: unknown): MediaRecord[] {
  if (!Array.isArray(value))
    throw new Error("Expected a flat media snapshot array");
  const seen = new Set<string>();
  return value.map((item) => {
    if (
      !object(item) ||
      typeof item.id !== "string" ||
      !item.id ||
      typeof item.storageKey !== "string" ||
      !item.storageKey ||
      !["ready", "pending", "failed"].includes(String(item.status)) ||
      !(
        item.contentHash === null ||
        (typeof item.contentHash === "string" &&
          /^sha1:[a-f0-9]{40}$/.test(item.contentHash))
      )
    )
      throw new Error("Invalid EmDash media snapshot record");
    if (seen.has(item.id)) throw new Error(`Duplicate media id: ${item.id}`);
    seen.add(item.id);
    return item as unknown as MediaRecord;
  });
}

export async function inventoryLocalImages(
  publicDirectory: string,
): Promise<LocalImage[]> {
  const images: LocalImage[] = [];
  async function visit(relative: string) {
    const entries = await readdir(join(publicDirectory, relative), {
      withFileTypes: true,
    });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const file = join(relative, entry.name);
      if (entry.isDirectory()) await visit(file);
      // Never follow symlinks outside the supplied public tree.
      else if (
        entry.isFile() &&
        /\.(png|jpe?g|gif|webp|svg|avif|tiff?)$/i.test(entry.name)
      ) {
        const bytes = await readFile(join(publicDirectory, file));
        const metadata = await sharp(bytes).metadata();
        images.push({
          source: `/${file.split("\\").join("/")}`,
          sha256: hash("sha256", bytes),
          // EmDash 1.4 computeContentHash uses prefixed SHA-1, not SHA-256.
          contentHash: `sha1:${hash("sha1", bytes)}`,
          bytes: bytes.length,
          width: metadata.width,
          height: metadata.height,
          format: metadata.format,
        });
      }
    }
  }
  await visit("");
  return images;
}

// Tokenize only image-bearing tags, retaining source offsets instead of reserializing
// HTML. Comments and raw-text elements must not turn into image references.
function htmlReferences(html: string, path: NodePath): Reference[] {
  const references: Reference[] = [];
  const tags =
    /<!--[\s\S]*?-->|<(script|style|textarea)\b[^>]*>[\s\S]*?<\/\1\s*>|<[^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>/gi;
  for (const token of html.matchAll(tags)) {
    const tag = token[0];
    if (!/^<(img|source)\b/i.test(tag)) continue;
    const attrs = [
      ...tag.matchAll(
        /([^\s=<>/'"]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g,
      ),
    ];
    const sources = attrs.filter((attr) => /^(src|srcset)$/i.test(attr[1]!));
    for (const attr of sources) {
      const raw = attr[2] ?? attr[3] ?? attr[4]!;
      const quote =
        attr[2] !== undefined ? '"' : attr[3] !== undefined ? "'" : "";
      const start =
        token.index! +
        attr.index! +
        attr[0].indexOf("=") +
        1 +
        attr[0].slice(attr[0].indexOf("=") + 1).search(/\S/) +
        quote.length;
      references.push({
        path,
        kind: "html",
        source: raw,
        start,
        end: start + raw.length,
        quote,
        problem:
          sources.length !== 1 || attr[1]!.toLowerCase() === "srcset"
            ? "Responsive or duplicate image sources require manual review"
            : raw.includes("&") || !quote
              ? "Encoded or unquoted image source requires manual review"
              : undefined,
      });
    }
    if (!sources.length && /^<img\b/i.test(tag)) {
      references.push({
        path,
        kind: "html",
        source: "",
        problem: "Image tag has no source",
      });
    }
  }
  return references;
}

export function imageReferences(payload: unknown): Reference[] {
  const references: Reference[] = [];
  function visit(value: unknown, path: NodePath) {
    if (Array.isArray(value))
      value.forEach((item, index) => visit(item, [...path, index]));
    else if (object(value)) {
      if (
        value._type === "image" ||
        (object(value.asset) && path.includes("images"))
      ) {
        const asset = object(value.asset) ? value.asset : {};
        const ref = typeof asset._ref === "string" ? asset._ref : "";
        const mediaId = ref && !/^(?:https?:|\/)/.test(ref) ? ref : undefined;
        references.push({
          path,
          kind: "native",
          source: String(asset.url ?? ref),
          mediaId,
        });
      } else if (
        value._type === "htmlBlock" &&
        typeof value.html === "string"
      ) {
        references.push(...htmlReferences(value.html, [...path, "html"]));
      } else {
        for (const [key, item] of Object.entries(value))
          visit(item, [...path, key]);
      }
    }
  }
  visit(payload, []);
  return references;
}

function localPath(source: string): string | null {
  if (!source.startsWith("/") || source.startsWith("//")) return null;
  try {
    const path = decodeURIComponent(source.split(/[?#]/, 1)[0]!);
    if (
      path.split("/").some((part) => part === "." || part === "..") ||
      path.includes("\\")
    )
      return null;
    return path;
  } catch {
    return null;
  }
}

export function createMediaPlan(
  posts: HistoricalPost[],
  assets: LocalImage[],
  mediaSnapshot?: MediaRecord[],
) {
  const media = mediaSnapshot ?? [];
  const postPlans = posts.map((post) => {
    const references = imageReferences(post.payload).map((reference) => {
      const path = localPath(reference.source);
      const managed =
        reference.mediaId ||
        reference.source.startsWith("/_emdash/api/media/file/");
      const asset = path
        ? assets.find((item) => item.source === path)
        : undefined;
      let classification: string;
      let problem = reference.problem;
      if (problem) classification = "unresolved";
      else if (managed) classification = "managed";
      else if (path && acceptedGaps.includes(path))
        classification = "accepted-gap";
      else if (asset) classification = "recovered-local";
      else if (/^(https?:)?\/\//.test(reference.source))
        classification = "remote";
      else classification = "unresolved";
      const candidates =
        classification === "recovered-local"
          ? media.filter((item) => item.contentHash === asset!.contentHash)
          : [];
      const matches = candidates.filter((item) => item.status === "ready");
      if (matches.length > 1)
        problem = "Multiple ready media records have identical content hashes";
      if (candidates.some((item) => item.status !== "ready")) {
        problem =
          "Matching pending or failed media requires reconciliation before upload or reuse";
      }
      const match = !problem && matches.length === 1 ? matches[0] : undefined;
      return {
        ...reference,
        classification,
        problem,
        sha256: asset?.sha256,
        mappingKey:
          classification === "recovered-local"
            ? `sha256:${asset!.sha256}`
            : undefined,
        action:
          problem || classification === "unresolved"
            ? "review"
            : classification === "recovered-local"
              ? match
                ? "reuse"
                : "upload-after-approval"
              : "retain",
        proposedMedia: match
          ? {
              id: match.id,
              url: `/_emdash/api/media/file/${encodeURIComponent(match.storageKey)}`,
            }
          : undefined,
        proposedChange:
          classification === "recovered-local" && !problem
            ? {
                operation:
                  reference.kind === "native"
                    ? "replace-asset-ref-and-url"
                    : "replace-src-only",
                mappingKey: `sha256:${asset!.sha256}`,
                preserveOtherAttributes: true,
              }
            : undefined,
        candidatePaths:
          classification === "unresolved"
            ? assets
                .filter(
                  (item) =>
                    basename(item.source) ===
                    basename(path ?? reference.source),
                )
                .map((item) => item.source)
            : [],
      };
    });
    return {
      sourcePath: post.sourcePath,
      status: post.payload.status,
      beforeHash: fingerprint(post.payload),
      references,
    };
  });
  const references = postPlans.flatMap((post) => post.references);
  const mappings = [
    ...new Set(
      references.filter((ref) => ref.mappingKey).map((ref) => ref.mappingKey!),
    ),
  ]
    .sort()
    .map((mappingKey) => {
      const uses = references.filter((ref) => ref.mappingKey === mappingKey);
      const asset = assets.find(
        (item) => `sha256:${item.sha256}` === mappingKey,
      )!;
      return {
        mappingKey,
        ...asset,
        sources: [...new Set(uses.map((ref) => ref.source))].sort(),
        referenceCount: uses.length,
        action: uses[0]!.action,
        proposedMedia: uses[0]!.proposedMedia,
      };
    });
  const plan = {
    version: 1,
    mode: "read-only",
    approvalRequired: true,
    inputs: {
      postsHash: fingerprint(posts),
      assetsHash: fingerprint(assets),
      mediaHash: fingerprint(media),
      mediaSnapshotSupplied: mediaSnapshot !== undefined,
    },
    summary: {
      posts: posts.length,
      references: references.length,
      classifications: Object.fromEntries(
        [
          "managed",
          "recovered-local",
          "remote",
          "accepted-gap",
          "unresolved",
        ].map((name) => [
          name,
          references.filter((ref) => ref.classification === name).length,
        ]),
      ),
      uniqueLocalImages: mappings.length,
      reviewRequired: references.filter(
        (ref) => ref.problem || ref.classification === "unresolved",
      ).length,
    },
    mappings,
    duplicates: mappings
      .filter(
        (item) =>
          item.referenceCount > 1 ||
          assets.filter((asset) => asset.sha256 === item.sha256).length > 1,
      )
      .map((item) => ({
        mappingKey: item.mappingKey,
        referenceCount: item.referenceCount,
        paths: assets
          .filter((asset) => asset.sha256 === item.sha256)
          .map((asset) => asset.source),
      })),
    posts: postPlans,
  };
  return { ...plan, planHash: fingerprint(plan) };
}

export interface ManagedTarget {
  id: string;
  url: string;
}

// Pure proposal only: the hash is a planning-time guard, NOT a database CAS.
// A future writer must enforce concurrency atomically at the CMS write seam.
export function proposePostReferences(
  payload: HistoricalPost["payload"],
  expectedHash: string,
  mappings: ReadonlyMap<string, ManagedTarget>,
) {
  if (fingerprint(payload) !== expectedHash)
    throw new Error(
      "Post changed since inventory; replan instead of overwriting edits",
    );
  const proposed = structuredClone(payload);
  const changes: { path: NodePath; source: string; target: ManagedTarget }[] =
    [];
  const references = imageReferences(payload);
  // Work backwards so replacing a URL cannot invalidate earlier HTML offsets.
  for (const ref of references.reverse()) {
    const target = mappings.get(ref.source);
    if (
      !target ||
      ref.mediaId ||
      ref.source.startsWith("/_emdash/api/media/file/")
    )
      continue;
    if (ref.problem) throw new Error(ref.problem);
    if (acceptedGaps.includes(localPath(ref.source) ?? ""))
      throw new Error("Accepted gaps must remain unchanged");
    if (
      !target.id ||
      !/^\/_emdash\/api\/media\/file\/[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(
        target.url,
      )
    ) {
      throw new Error(
        "Expected a managed EmDash media id and internal file URL",
      );
    }
    let parent: unknown = proposed;
    for (const key of ref.path.slice(0, -1))
      parent = (parent as Record<string | number, unknown>)[key];
    const key = ref.path.at(-1)!;
    const container = parent as Record<string | number, unknown>;
    if (ref.kind === "native") {
      const block = container[key] as JsonObject;
      block.asset = {
        ...(object(block.asset) ? block.asset : {}),
        _ref: target.id,
        url: target.url,
      };
    } else {
      const html = container[key] as string;
      container[key] =
        html.slice(0, ref.start!) + target.url + html.slice(ref.end!);
    }
    changes.push({ path: ref.path, source: ref.source, target });
  }
  return {
    proposed,
    receipt: {
      beforeHash: expectedHash,
      afterHash: fingerprint(proposed),
      changes: changes.reverse(),
      writesPerformed: false,
    },
  };
}

export async function main(args: string[]) {
  if (
    args.length < 2 ||
    args.length > 3 ||
    args.some((arg) => arg.startsWith("--"))
  ) {
    throw new Error(
      "Usage: node scripts/managed-media.ts HISTORICAL_PLAN.json PUBLIC_DIRECTORY [MEDIA_SNAPSHOT.json]",
    );
  }
  const posts = readPosts(
    JSON.parse(await readFile(resolve(args[0]!), "utf8")),
  );
  const assets = await inventoryLocalImages(resolve(args[1]!));
  const media = args[2]
    ? readMedia(JSON.parse(await readFile(resolve(args[2]), "utf8")))
    : undefined;
  console.log(JSON.stringify(createMediaPlan(posts, assets, media), null, 2));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main(process.argv.slice(2));
}
