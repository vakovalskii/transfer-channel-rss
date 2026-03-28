/**
 * Data layer for SSG mode.
 * Reads posts and channel info from data/ JSON files
 * instead of fetching from Telegram in real-time.
 */

import type { ChannelInfo, Post } from '../types'
import fs from 'node:fs'
import path from 'node:path'
import { cwd } from 'node:process'

const DATA_DIR = path.resolve(cwd(), 'data')

let _posts: Post[] | null = null
let _channel: Omit<ChannelInfo, 'posts'> | null = null

function loadPosts(): Post[] {
  if (_posts)
    return _posts
  const file = path.join(DATA_DIR, 'posts.json')
  if (!fs.existsSync(file))
    return []
  _posts = JSON.parse(fs.readFileSync(file, 'utf-8'))
  return _posts!
}

function loadChannelMeta(): Omit<ChannelInfo, 'posts'> {
  if (_channel)
    return _channel
  const file = path.join(DATA_DIR, 'channel.json')
  if (!fs.existsSync(file)) {
    return { posts: [], title: '', description: '', descriptionHTML: null, avatar: undefined }
  }
  const raw = JSON.parse(fs.readFileSync(file, 'utf-8'))
  _channel = raw
  return _channel!
}

export function getChannelData(params: { before?: string, after?: string, q?: string } = {}): ChannelInfo {
  const { before, after, q } = params
  const meta = loadChannelMeta()
  let posts = loadPosts()

  // Search/tag filter
  if (q) {
    const query = q.toLowerCase()
    posts = posts.filter(
      p =>
        p.text.toLowerCase().includes(query)
        || p.tags.some(t => `#${t}`.toLowerCase() === query || t.toLowerCase() === query),
    )
  }

  // Cursor-based pagination
  const PAGE_SIZE = 20
  if (before) {
    const idx = posts.findIndex(p => p.id === before)
    if (idx !== -1) {
      posts = posts.slice(idx + 1, idx + 1 + PAGE_SIZE)
    }
  }
  else if (after) {
    const idx = posts.findIndex(p => p.id === after)
    if (idx !== -1) {
      const start = Math.max(0, idx - PAGE_SIZE)
      posts = posts.slice(start, idx)
    }
  }
  else {
    posts = posts.slice(0, PAGE_SIZE)
  }

  return {
    ...meta,
    posts,
  } as ChannelInfo
}

export function getPost(id: string): Post | undefined {
  const posts = loadPosts()
  return posts.find(p => p.id === id)
}

export function getAllPosts(): Post[] {
  return loadPosts()
}

export function getAllPostIds(): string[] {
  return loadPosts().map(p => p.id)
}

export function getAllTags(): string[] {
  const tags = new Set<string>()
  for (const post of loadPosts()) {
    for (const tag of post.tags) {
      tags.add(tag)
    }
  }
  return Array.from(tags)
}

export function getChannelMeta() {
  return loadChannelMeta()
}
