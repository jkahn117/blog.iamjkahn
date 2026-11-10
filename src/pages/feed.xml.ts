import rss from "@astrojs/rss";
import type { APIContext } from "astro";

import { getPublicPosts } from "@/lib/posts";

export const prerender = false;

export async function GET(context: APIContext) {
  const { posts, cacheHint } = await getPublicPosts();
  if (context.cache?.enabled) context.cache.set(cacheHint);

  return rss({
    title: "iamjkahn",
    description:
      "Random musings of a solutions architect, speaker, technology guy, dad",
    site: context.site!,
    items: posts.slice(0, 20).map((post) => ({
      title: post.title,
      pubDate: post.date,
      description: post.excerpt,
      link: new URL(post.href, context.site).href,
    })),
    customData: "<language>en-us</language>",
  });
}
