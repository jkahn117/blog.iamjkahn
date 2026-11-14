import type { CacheHint } from "emdash";

import type { Post } from "../../emdash-env";

export function getPostDate(
  post: Pick<Post, "publishedAt" | "createdAt" | "status">,
): Date {
  const date =
    post.publishedAt ?? (post.status === "draft" ? post.createdAt : null);
  if (!date || Number.isNaN(date.getTime())) {
    throw new Error("Post has no valid publication date.");
  }
  return date;
}

export function getPostPath(post: Post): string | null {
  if (post.legacy_route) {
    return /^\d{4}\/(0[1-9]|1[0-2])\/[a-z0-9][a-z0-9-]*$/.test(
      post.legacy_route,
    )
      ? `/posts/${post.legacy_route}`
      : null;
  }
  if (!post.slug || !/^[a-z0-9][a-z0-9-]*$/.test(post.slug)) return null;
  const date = getPostDate(post);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `/posts/${date.getUTCFullYear()}/${month}/${post.slug}`;
}

export function toPublicPost(post: Post) {
  if (post.status !== "published") return null;
  const path = getPostPath(post);
  let href = path;
  if (post.redirect_link) {
    const external = new URL(post.redirect_link);
    if (!["https:", "http:"].includes(external.protocol)) {
      throw new Error("Post external URL must use HTTP or HTTPS.");
    }
    href = external.href;
  }
  if (!href) return null;
  return {
    title: post.title,
    excerpt: post.excerpt,
    date: getPostDate(post),
    updatedAt: post.updatedAt,
    href,
    path: post.redirect_link ? null : path,
  };
}

export async function getPublicPosts({ limit }: { limit?: number } = {}) {
  if (limit !== undefined && (!Number.isSafeInteger(limit) || limit <= 0)) {
    throw new RangeError("Post limit must be a positive safe integer.");
  }
  const { getEmDashCollection } = await import("emdash");
  const posts: NonNullable<ReturnType<typeof toPublicPost>>[] = [];
  const tags = new Set<string>();
  let lastModified: Date | undefined;
  let cursor: string | undefined;
  do {
    const result = await getEmDashCollection<"posts", Post>("posts", {
      status: "published",
      limit: Math.min(100, limit === undefined ? 100 : limit - posts.length),
      cursor,
      orderBy: { published_at: "desc" },
    });
    if (result.error) throw result.error;
    for (const entry of result.entries) {
      const post = toPublicPost(entry.data);
      if (post) posts.push(post);
    }
    for (const tag of result.cacheHint.tags ?? []) tags.add(tag);
    const modified = result.cacheHint.lastModified;
    if (modified && (!lastModified || modified > lastModified)) {
      lastModified = modified;
    }
    cursor = result.nextCursor;
  } while (cursor && (limit === undefined || posts.length < limit));
  const cacheHint: CacheHint = { tags: [...tags], lastModified };
  return { posts, cacheHint };
}
