/**
 * Data layer for SSG mode.
 * Reads posts from data/posts.json (multi-channel)
 * and channel metadata from data/channel.json.
 */

import type { ChannelInfo, Post } from '../types'
import fs from 'node:fs'
import path from 'node:path'
import { cwd } from 'node:process'

const DATA_DIR = path.resolve(cwd(), 'data')

let _posts: Post[] | null = null
let _channelsMeta: Record<string, { title: string, description: string, descriptionHTML: string | null, avatar: string | undefined }> | null = null

function loadPosts(): Post[] {
  if (_posts)
    return _posts
  const file = path.join(DATA_DIR, 'posts.json')
  if (!fs.existsSync(file))
    return []
  _posts = JSON.parse(fs.readFileSync(file, 'utf-8'))
  return _posts!
}

function loadChannelsMeta() {
  if (_channelsMeta)
    return _channelsMeta
  const file = path.join(DATA_DIR, 'channel.json')
  if (!fs.existsSync(file))
    return {}
  const raw = JSON.parse(fs.readFileSync(file, 'utf-8'))
  // Support both old format (single channel) and new (multi-channel map)
  if (raw.title && !raw.posts) {
    // Old single-channel format
    _channelsMeta = { default: raw }
  }
  else if (Array.isArray(raw)) {
    _channelsMeta = {}
  }
  else {
    _channelsMeta = raw
  }
  return _channelsMeta!
}

function getPrimaryChannel() {
  const meta = loadChannelsMeta()
  const keys = Object.keys(meta)
  return keys.length > 0 ? meta[keys[0]] : { title: '', description: '', descriptionHTML: null, avatar: undefined }
}

export function getChannelData(params: { before?: string, after?: string, q?: string, channel?: string } = {}): ChannelInfo {
  const { before, after, q, channel: filterChannel } = params
  const primary = getPrimaryChannel()
  let posts = loadPosts()

  // Filter by channel
  if (filterChannel) {
    posts = posts.filter(p => p.channel === filterChannel)
  }

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
    ...primary,
    posts,
  } as ChannelInfo
}

export function getPost(id: string): Post | undefined {
  return loadPosts().find(p => p.id === id)
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

export function getAllChannels(): { name: string, title: string, postCount: number }[] {
  const meta = loadChannelsMeta()
  const posts = loadPosts()
  const counts: Record<string, number> = {}
  for (const p of posts) {
    const ch = p.channel || 'unknown'
    counts[ch] = (counts[ch] || 0) + 1
  }
  return Object.entries(meta).map(([name, m]) => ({
    name,
    title: m.title || name,
    postCount: counts[name] || 0,
  })).sort((a, b) => b.postCount - a.postCount)
}

export function getChannelMeta() {
  return getPrimaryChannel()
}

export function getDigestTitle(): string {
  const channels = getAllChannels()
  if (channels.length <= 1)
    return channels[0]?.title || 'Channel'
  return `Digest: ${channels.length} channels`
}
