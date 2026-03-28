/**
 * Crosspost new posts to VKontakte group wall.
 * Uses VK API method wall.post.
 *
 * Env: VK_TOKEN, VK_GROUP_ID
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const NEW_POSTS_FILE = resolve(__dirname, '..', '..', 'data', 'new-posts.json')
const POSTED_FILE = resolve(__dirname, '..', '..', 'data', 'posted.json')

const VK_TOKEN = process.env.VK_TOKEN
const VK_GROUP_ID = process.env.VK_GROUP_ID

interface Post {
  id: string
  title: string
  text: string
  content: string
  datetime: string
  tags: string[]
}

interface PostedTracker {
  [postId: string]: { vk?: boolean; dzen?: boolean; ok?: boolean; email?: boolean }
}

function loadPosted(): PostedTracker {
  if (!existsSync(POSTED_FILE)) return {}
  try {
    return JSON.parse(readFileSync(POSTED_FILE, 'utf-8'))
  } catch {
    return {}
  }
}

function savePosted(posted: PostedTracker) {
  writeFileSync(POSTED_FILE, JSON.stringify(posted, null, 2))
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

async function postToVK(message: string): Promise<boolean> {
  if (!VK_TOKEN || !VK_GROUP_ID) {
    console.log('VK: skipped (no VK_TOKEN or VK_GROUP_ID)')
    return false
  }

  const params = new URLSearchParams({
    owner_id: `-${VK_GROUP_ID}`,
    from_group: '1',
    message,
    access_token: VK_TOKEN,
    v: '5.199',
  })

  const res = await fetch('https://api.vk.com/method/wall.post', {
    method: 'POST',
    body: params,
  })

  const data = await res.json()
  if (data.error) {
    console.error('VK error:', data.error)
    return false
  }

  console.log('VK: posted, post_id:', data.response?.post_id)
  return true
}

async function main() {
  if (!existsSync(NEW_POSTS_FILE)) {
    console.log('VK: no new posts file')
    return
  }

  const newPosts: Post[] = JSON.parse(readFileSync(NEW_POSTS_FILE, 'utf-8'))
  if (newPosts.length === 0) {
    console.log('VK: no new posts')
    return
  }

  const posted = loadPosted()

  for (const post of newPosts) {
    if (posted[post.id]?.vk) {
      console.log(`VK: post ${post.id} already posted, skipping`)
      continue
    }

    const text = stripHtml(post.content)
    const tags = post.tags.map((t) => `#${t}`).join(' ')
    const message = `${text}${tags ? `\n\n${tags}` : ''}`

    const ok = await postToVK(message.slice(0, 10000))
    if (ok) {
      posted[post.id] = { ...posted[post.id], vk: true }
      savePosted(posted)
    }

    // Rate limit: 1 request per second
    await new Promise((r) => setTimeout(r, 1000))
  }
}

main().catch((err) => {
  console.error('VK crosspost failed:', err)
  process.exit(1)
})
