import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'
import cloudflare from '@astrojs/cloudflare'
import react from '@astrojs/react'
import sitemap from '@astrojs/sitemap'

function reactDomEdgeAlias() {
  return {
    name: 'react-dom-server-edge',
    apply: 'build' as const,
    config: () => ({
      resolve: {
        alias: { 'react-dom/server': 'react-dom/server.edge' },
      },
    }),
  }
}

export default defineConfig({
  site: 'https://blog.iamjkahn.com',
  output: 'server',
  adapter: cloudflare({
    imageService: 'compile',
    routes: {
      extend: {
        exclude: [{ pattern: '/sitemap-index.xml' }, { pattern: '/sitemap-*.xml' }],
      },
    },
  }),
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss(), reactDomEdgeAlias()],
  },
  redirects: {
    '/archive': '/posts',
  },
})
