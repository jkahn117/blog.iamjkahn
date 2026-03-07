import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    author: z.string().optional(),
    summary: z.string().optional(),
    redirect_link: z.string().url().optional(),
    publish: z.boolean().optional(),
    // Legacy Blogger fields - kept optional, ignored in templates
    layout: z.string().optional(),
    tags: z.union([z.string(), z.array(z.string())]).nullish(),
    modified_time: z.string().optional(),
    blogger_id: z.string().optional(),
    blogger_orig_url: z.string().optional(),
  }),
})

export const collections = { blog }
