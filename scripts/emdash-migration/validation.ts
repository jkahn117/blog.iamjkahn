import { z } from "zod";

export const frontmatterSchema = z.object({
  title: z.string().trim().min(1),
  date: z.union([z.date(), z.string(), z.number()]).pipe(z.coerce.date()),
  author: z.string().trim().min(1).optional(),
  summary: z.string().optional(),
  redirect_link: z.url({ protocol: /^https?$/ }).optional(),
  publish: z.boolean().optional(),
  tags: z.union([z.string(), z.array(z.string())]).nullish(),
});

export const destinationEntrySchema = z.object({
  id: z.string().min(1),
  slug: z.string().nullable(),
  status: z.string(),
  data: z.record(z.string(), z.unknown()),
  publishedAt: z.string().nullable(),
  draftRevisionId: z.string().nullable(),
  _rev: z.string().optional(),
  bylines: z
    .array(
      z.object({
        roleLabel: z.string().nullish(),
        byline: z.object({
          id: z.string(),
          slug: z.string(),
          displayName: z.string(),
        }),
      }),
    )
    .optional(),
});

const bylineSchema = z.object({
  id: z.string(),
  slug: z.string(),
  displayName: z.string(),
});
const termSchema = z.object({
  id: z.string(),
  slug: z.string(),
  label: z.string(),
});

export function validateApiData(apiPath: string, value: unknown): unknown {
  const pathname = apiPath.split("?", 1)[0]!;
  if (pathname === "/auth/me")
    return z.object({ role: z.number().int() }).parse(value);
  if (pathname.startsWith("/schema/collections/"))
    return z
      .object({
        item: z.object({
          slug: z.string(),
          supports: z.array(z.string()),
          fields: z.array(
            z.object({
              slug: z.string(),
              type: z.string(),
              unique: z.boolean().optional(),
            }),
          ),
        }),
      })
      .parse(value);
  if (pathname === "/admin/bylines")
    return z
      .object({
        items: z.array(bylineSchema),
        nextCursor: z.string().optional(),
      })
      .parse(value);
  if (pathname === "/admin/plugins")
    return z
      .object({
        items: z.array(z.object({ id: z.string(), enabled: z.boolean() })),
      })
      .parse(value);
  if (pathname === "/taxonomies")
    return z
      .object({ taxonomies: z.array(z.object({ name: z.string() })) })
      .parse(value);
  if (pathname.endsWith("/terms") || pathname.includes("/terms/"))
    return z
      .object({
        terms: z.array(termSchema),
        unresolved: z.array(z.unknown()).optional(),
      })
      .parse(value);
  if (pathname.endsWith("/compare"))
    return z
      .object({
        hasChanges: z.boolean(),
        draft: z.record(z.string(), z.unknown()).nullable(),
      })
      .parse(value);
  if (pathname.startsWith("/content/") && value && typeof value === "object") {
    if ("items" in value)
      return z
        .object({
          items: z.array(destinationEntrySchema),
          nextCursor: z.string().optional(),
        })
        .parse(value);
    if ("item" in value)
      return z
        .object({ item: destinationEntrySchema, _rev: z.string().optional() })
        .parse(value);
  }
  return value;
}

export function normalizeTarget(target: string): string {
  const url = new URL(target);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error(
      "Target must be an origin URL without credentials, path, query, or fragment.",
    );
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error("Remote targets must use HTTPS.");
  }
  return url.origin;
}
