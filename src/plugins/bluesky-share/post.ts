import { lexicons, type AppBskyFeedPost } from "@atproto/api";

import type { Post } from "../../../emdash-env.ts";
import { toPublicPost } from "../../lib/posts.ts";

export const SITE_ORIGIN = "https://blog.iamjkahn.com";
const encoder = new TextEncoder();
const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });

function shorten(text: string, graphemes: number, bytes: number): string {
  let result = "";
  let count = 0;
  for (const { segment } of segmenter.segment(text)) {
    if (++count > graphemes || encoder.encode(result + segment).length > bytes)
      break;
    result += segment;
  }
  return result;
}

/** Convert the host's saved content shape, not unsaved editor fields. */
export function announcement(
  content: Record<string, unknown>,
  createdAt: string,
): AppBskyFeedPost.Record {
  const data = content.data;
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("INVALID_POST");
  const fields = data as Record<string, unknown>;
  if (
    typeof fields.title !== "string" ||
    !fields.title.trim() ||
    (fields.excerpt != null && typeof fields.excerpt !== "string") ||
    (fields.legacy_route != null && typeof fields.legacy_route !== "string") ||
    (fields.redirect_link != null &&
      typeof fields.redirect_link !== "string") ||
    typeof content.publishedAt !== "string" ||
    (content.slug !== null && typeof content.slug !== "string")
  )
    throw new Error("INVALID_POST");
  const post: Post = {
    id: String(content.id),
    slug: content.slug as string | null,
    status: "published",
    title: fields.title,
    excerpt: fields.excerpt as string | undefined,
    legacy_route: fields.legacy_route as string | undefined,
    redirect_link: fields.redirect_link as string | undefined,
    publishedAt: new Date(content.publishedAt),
    createdAt: new Date(String(content.createdAt)),
    updatedAt: new Date(String(content.updatedAt)),
  };
  const publicPost = toPublicPost(post);
  if (!publicPost) throw new Error("INVALID_DESTINATION");
  const destination = new URL(publicPost.href, SITE_ORIGIN);
  if (
    !["https:", "http:"].includes(destination.protocol) ||
    destination.username ||
    destination.password
  ) {
    throw new Error("INVALID_DESTINATION");
  }
  const url = destination.href;
  const intro = "Check out my new post: ";
  const title = shorten(
    fields.title.trim(),
    300 - intro.length,
    3000 - encoder.encode(intro).length,
  );
  let text = intro + title;
  const excerpt = publicPost.excerpt?.trim();
  if (excerpt) {
    const prefix = `${text}\n\n`;
    const remaining = 300 - [...segmenter.segment(prefix)].length;
    const bytes = 3000 - encoder.encode(prefix).length;
    if (remaining > 1 && bytes > 3) {
      let summary = shorten(excerpt, remaining, bytes);
      if (summary !== excerpt)
        summary = shorten(excerpt, remaining - 1, bytes - 3).trimEnd() + "…";
      text = prefix + summary;
    }
  }
  const record: AppBskyFeedPost.Record = {
    $type: "app.bsky.feed.post",
    text,
    createdAt,
    embed: {
      $type: "app.bsky.embed.external",
      external: {
        uri: url,
        title: shorten(fields.title, 300, 3000),
        description: shorten(publicPost.excerpt ?? "", 1000, 10000),
      },
    },
  };
  // The installed lexicon limits text to 300 graphemes and 3000 UTF-8 bytes.
  lexicons.assertValidRecord("app.bsky.feed.post", record);
  return record;
}
