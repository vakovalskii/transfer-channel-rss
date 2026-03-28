import type { APIRoute } from 'astro'
import { getChannelData } from '../lib/data'

export const GET: APIRoute = async (context) => {
  const SITE_URL = import.meta.env.BASE_URL ?? '/'
  const tag = context.url.searchParams.get('tag')
  const channel = getChannelData({
    q: tag ? `#${tag}` : '',
  })
  const posts = channel.posts ?? []
  const requestUrl = new URL(context.request.url)

  requestUrl.pathname = SITE_URL
  requestUrl.search = ''

  return Response.json({
    version: 'https://jsonfeed.org/version/1.1',
    title: `${tag ? `${tag} | ` : ''}${channel.title}`,
    description: channel.description,
    home_page_url: requestUrl.toString(),
    items: posts.map(item => ({
      url: `${requestUrl.toString()}posts/${item.id}`,
      title: item.title,
      date_published: new Date(item.datetime),
      tags: item.tags,
      content_html: item.content,
    })),
  })
}
