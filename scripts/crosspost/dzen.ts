/**
 * Crosspost new posts to Yandex Dzen.
 * Uses Dzen Publisher API.
 *
 * Env: DZEN_TOKEN
 *
 * Note: Dzen Publisher API access requires approval.
 * This is a placeholder that will need the actual API endpoint
 * once access is granted.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const NEW_POSTS_FILE = resolve(__dirname, '..', '..', 'data', 'new-posts.json')
const POSTED_FILE = resolve(__dirname, '..', '..', 'data', 'posted.json')

const DZEN_TOKEN = process.env.DZEN_TOKEN

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

async function postToDzen(title: string, content: string): Promise<boolean> {
  if (!DZEN_TOKEN) {
    console.log('Dzen: skipped (no DZEN_TOKEN)')
    return false
  }

  // Dzen Publisher API - publication endpoint
  // Documentation: https://dzen.ru/help/ru/website/publishing-api
  const res = await fetch('https://dzen.ru/api/v1/publisher/publication', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${DZEN_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: title.slice(0, 120),
      content: {
        type: 'article',
        text: content,
      },
      status: 'published',
    }),
  })

  if (!res.ok) {
    console.error('Dzen error:', res.status, await res.text())
    return false
  }

  console.log('Dzen: posted successfully')
  return true
}

async function main() {
  if (!existsSync(NEW_POSTS_FILE)) {
    console.log('Dzen: no new posts file')
    return
  }

  const newPosts: Post[] = JSON.parse(readFileSync(NEW_POSTS_FILE, 'utf-8'))
  if (newPosts.length === 0) {
    console.log('Dzen: no new posts')
    return
  }

  const posted = loadPosted()

  for (const post of newPosts) {
    if (posted[post.id]?.dzen) continue

    const text = stripHtml(post.content)
    const title = post.title || text.slice(0, 100)

    const ok = await postToDzen(title, text)
    if (ok) {
      posted[post.id] = { ...posted[post.id], dzen: true }
      savePosted(posted)
    }

    await new Promise((r) => setTimeout(r, 1000))
  }
}

main().catch((err) => {
  console.error('Dzen crosspost failed:', err)
  process.exit(1)
})
