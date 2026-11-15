import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { getSiteSettingsWithCacheHint } from "emdash";

import { getPublicPosts } from "@/lib/posts";

export const prerender = false;

export async function GET(context: APIContext) {
  const [
    { posts, cacheHint },
    { data: settings, cacheHint: settingsCacheHint },
  ] = await Promise.all([
    getPublicPosts({ limit: 10 }),
    getSiteSettingsWithCacheHint(),
  ]);
  if (context.cache?.enabled) {
    context.cache.set(cacheHint);
    context.cache.set(settingsCacheHint);
  }

  return rss({
    title: settings.title,
    description: settings.tagline ?? "",
    site: context.site!,
    items: posts.map((post) => ({
      title: post.title,
      pubDate: post.date,
      description: post.excerpt,
      link: new URL(post.href, context.site).href,
    })),
    customData: "<language>en-us</language>",
  });
}
