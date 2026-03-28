/**
 * Crosspost new posts to Odnoklassniki (OK / Max).
 * Uses OK API method mediatopic.post.
 *
 * Env: OK_ACCESS_TOKEN, OK_GROUP_ID, OK_APP_KEY, OK_APP_SECRET
 */

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const NEW_POSTS_FILE = resolve(__dirname, '..', '..', 'data', 'new-posts.json')
const POSTED_FILE = resolve(__dirname, '..', '..', 'data', 'posted.json')

const OK_ACCESS_TOKEN = process.env.OK_ACCESS_TOKEN
const OK_GROUP_ID = process.env.OK_GROUP_ID
const OK_APP_KEY = process.env.OK_APP_KEY
const OK_APP_SECRET = process.env.OK_APP_SECRET

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

function signRequest(params: Record<string, string>, sessionSecretKey: string): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('')
  return createHash('md5')
    .update(sorted + sessionSecretKey)
    .digest('hex')
}

async function postToOK(message: string): Promise<boolean> {
  if (!OK_ACCESS_TOKEN || !OK_GROUP_ID || !OK_APP_KEY || !OK_APP_SECRET) {
    console.log('OK: skipped (missing env vars)')
    return false
  }

  const sessionSecretKey = createHash('md5')
    .update(OK_ACCESS_TOKEN + OK_APP_SECRET)
    .digest('hex')

  const attachment = JSON.stringify({
    media: [
      {
        type: 'text',
        text: message,
      },
    ],
  })

  const params: Record<string, string> = {
    method: 'mediatopic.post',
    gid: OK_GROUP_ID,
    type: 'GROUP_THEME',
    attachment,
    application_key: OK_APP_KEY,
    format: 'json',
  }

  params.sig = signRequest(params, sessionSecretKey)
  params.access_token = OK_ACCESS_TOKEN

  const urlParams = new URLSearchParams(params)
  const res = await fetch(`https://api.ok.ru/fb.do?${urlParams.toString()}`)
  const data = await res.json()

  if (data.error_code) {
    console.error('OK error:', data)
    return false
  }

  console.log('OK: posted successfully')
  return true
}

async function main() {
  if (!existsSync(NEW_POSTS_FILE)) {
    console.log('OK: no new posts file')
    return
  }

  const newPosts: Post[] = JSON.parse(readFileSync(NEW_POSTS_FILE, 'utf-8'))
  if (newPosts.length === 0) {
    console.log('OK: no new posts')
    return
  }

  const posted = loadPosted()

  for (const post of newPosts) {
    if (posted[post.id]?.ok) continue

    const text = stripHtml(post.content)
    const tags = post.tags.map((t) => `#${t}`).join(' ')
    const message = `${text}${tags ? `\n\n${tags}` : ''}`

    const ok = await postToOK(message.slice(0, 10000))
    if (ok) {
      posted[post.id] = { ...posted[post.id], ok: true }
      savePosted(posted)
    }

    await new Promise((r) => setTimeout(r, 1000))
  }
}

main().catch((err) => {
  console.error('OK crosspost failed:', err)
  process.exit(1)
})
