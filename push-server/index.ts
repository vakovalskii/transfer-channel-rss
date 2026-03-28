/**
 * Minimal Push Subscription API server.
 * Designed for SourceCraft Serverless Containers.
 *
 * Endpoints:
 *   POST /api/subscribe    — save a Web Push subscription
 *   POST /api/unsubscribe  — remove a subscription
 *   GET  /api/subscriptions — list all subscriptions (auth required)
 *   GET  /api/health        — healthcheck
 */

import { createServer } from 'node:http'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SUBS_FILE = resolve(__dirname, 'subscriptions.json')
const PORT = Number(process.env.PORT) || 3001
const API_SECRET = process.env.API_SECRET || ''

interface PushSubscription {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

function loadSubscriptions(): PushSubscription[] {
  if (!existsSync(SUBS_FILE)) return []
  try {
    return JSON.parse(readFileSync(SUBS_FILE, 'utf-8'))
  } catch {
    return []
  }
}

function saveSubscriptions(subs: PushSubscription[]): void {
  writeFileSync(SUBS_FILE, JSON.stringify(subs, null, 2))
}

function cors(res: import('node:http').ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

function json(res: import('node:http').ServerResponse, data: unknown, status = 200) {
  cors(res)
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

async function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString()
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`)

  // CORS preflight
  if (req.method === 'OPTIONS') {
    cors(res)
    res.writeHead(204)
    res.end()
    return
  }

  // Health check
  if (url.pathname === '/api/health') {
    return json(res, { status: 'ok', subscriptions: loadSubscriptions().length })
  }

  // Subscribe
  if (url.pathname === '/api/subscribe' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req)) as PushSubscription
      if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
        return json(res, { error: 'Invalid subscription' }, 400)
      }

      const subs = loadSubscriptions()
      const exists = subs.some((s) => s.endpoint === body.endpoint)
      if (!exists) {
        subs.push(body)
        saveSubscriptions(subs)
      }

      return json(res, { ok: true, total: subs.length })
    } catch {
      return json(res, { error: 'Invalid JSON' }, 400)
    }
  }

  // Unsubscribe
  if (url.pathname === '/api/unsubscribe' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req))
      const subs = loadSubscriptions().filter((s) => s.endpoint !== body.endpoint)
      saveSubscriptions(subs)
      return json(res, { ok: true, total: subs.length })
    } catch {
      return json(res, { error: 'Invalid JSON' }, 400)
    }
  }

  // List subscriptions (protected)
  if (url.pathname === '/api/subscriptions' && req.method === 'GET') {
    const auth = req.headers.authorization?.replace('Bearer ', '')
    if (!API_SECRET || auth !== API_SECRET) {
      return json(res, { error: 'Unauthorized' }, 401)
    }
    return json(res, loadSubscriptions())
  }

  json(res, { error: 'Not found' }, 404)
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Push server listening on port ${PORT}`)
})
