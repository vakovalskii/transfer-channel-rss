/**
 * Send Web Push notifications for new posts.
 * Fetches subscriptions from the push server, sends notification to each.
 *
 * Env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, PUSH_SERVER_URL, API_SECRET
 *
 * Requires: web-push (npm install web-push)
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const NEW_POSTS_FILE = resolve(__dirname, '..', 'data', 'new-posts.json')

const PUSH_SERVER_URL = process.env.PUSH_SERVER_URL
const API_SECRET = process.env.API_SECRET
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:admin@neuraldeep.ru'
const SITE_URL = process.env.SITE_URL || 'https://neuraldeep.sourcecraft.site'

interface Post {
  id: string
  title: string
  text: string
}

interface PushSubscription {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

async function main() {
  if (!PUSH_SERVER_URL || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.log('Push: skipped (missing PUSH_SERVER_URL or VAPID keys)')
    return
  }

  if (!existsSync(NEW_POSTS_FILE)) {
    console.log('Push: no new posts file')
    return
  }

  const newPosts: Post[] = JSON.parse(readFileSync(NEW_POSTS_FILE, 'utf-8'))
  if (newPosts.length === 0) {
    console.log('Push: no new posts')
    return
  }

  // Dynamic import web-push (may not be installed in all environments)
  let webpush: typeof import('web-push')
  try {
    webpush = await import('web-push')
  } catch {
    console.log('Push: web-push not installed, skipping')
    return
  }

  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

  // Fetch subscriptions from push server
  const res = await fetch(`${PUSH_SERVER_URL}/api/subscriptions`, {
    headers: { Authorization: `Bearer ${API_SECRET}` },
  })

  if (!res.ok) {
    console.error('Push: failed to fetch subscriptions:', res.status)
    return
  }

  const subscriptions: PushSubscription[] = await res.json()
  console.log(`Push: ${subscriptions.length} subscribers, ${newPosts.length} new posts`)

  for (const post of newPosts) {
    const title = post.title || post.text.slice(0, 80)
    const payload = JSON.stringify({
      title: `NeuralDeep: ${title}`,
      body: post.text.slice(0, 200),
      url: `${SITE_URL}/posts/${post.id}`,
    })

    let sent = 0
    let failed = 0

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(sub, payload)
        sent++
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Subscription expired, could clean up
          console.log(`Push: expired subscription ${sub.endpoint.slice(0, 50)}...`)
        }
        failed++
      }
    }

    console.log(`Push: post ${post.id} — sent: ${sent}, failed: ${failed}`)
  }
}

main().catch((err) => {
  console.error('Push notification failed:', err)
  process.exit(1)
})
