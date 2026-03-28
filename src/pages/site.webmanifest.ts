import type { APIRoute } from 'astro'
import { getChannelMeta } from '../lib/data'

export const GET: APIRoute = async () => {
  const channel = getChannelMeta()
  const siteName = channel.title || 'NeuralDeep'

  const manifest = {
    name: siteName,
    short_name: siteName,
    description: channel.description || '',
    start_url: '/',
    display: 'standalone',
    theme_color: '#f4f1ec',
    background_color: '#f4f1ec',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable',
      },
    ],
  }

  return new Response(JSON.stringify(manifest, null, 2), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
    },
  })
}
