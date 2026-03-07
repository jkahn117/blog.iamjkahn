import rss from '@astrojs/rss'
import { getCollection } from 'astro:content'
import type { APIContext } from 'astro'

export const prerender = true

export async function GET(context: APIContext) {
  const allPosts = await getCollection('blog', ({ data }) => data.publish !== false)
  const posts = allPosts
    .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf())
    .slice(0, 5)

  return rss({
    title: 'iamjkahn',
    description: 'Random musings of a solutions architect, speaker, technology guy, dad',
    site: context.site!,
    items: posts.map((post) => {
      const [year, month, , ...rest] = post.id.replace(/\.md$/, '').split('-')
      const slug = rest.join('-')
      const link = post.data.redirect_link ?? `${context.site}posts/${year}/${month}/${slug}`

      return {
        title: post.data.title,
        pubDate: post.data.date,
        description: post.data.summary,
        link,
      }
    }),
    customData: '<language>en-us</language>',
  })
}
