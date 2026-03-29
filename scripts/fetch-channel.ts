/**
 * Standalone Telegram channel parser.
 * Fetches posts from t.me/s/CHANNEL, parses with cheerio,
 * saves to data/posts.json and data/channel.json.
 *
 * Usage: npx tsx scripts/fetch-channel.ts
 */

import * as cheerio from 'cheerio'
import type { AnyNode, Cheerio, CheerioAPI } from 'cheerio'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import flourite from 'flourite'
import prism from 'prismjs'

// Load prism languages
import 'prismjs-components-importer/cjs/prism-javascript'
import 'prismjs-components-importer/cjs/prism-typescript'
import 'prismjs-components-importer/cjs/prism-python'
import 'prismjs-components-importer/cjs/prism-go'
import 'prismjs-components-importer/cjs/prism-rust'
import 'prismjs-components-importer/cjs/prism-json'
import 'prismjs-components-importer/cjs/prism-yaml'
import 'prismjs-components-importer/cjs/prism-markdown'
import 'prismjs-components-importer/cjs/prism-docker'
import 'prismjs-components-importer/cjs/prism-sql'
import 'prismjs-components-importer/cjs/prism-markup'
import 'prismjs-components-importer/cjs/prism-css'
import 'prismjs-components-importer/cjs/prism-java'
import 'prismjs-components-importer/cjs/prism-cpp'
import 'prismjs-components-importer/cjs/prism-csharp'
import 'prismjs-components-importer/cjs/prism-php'
import 'prismjs-components-importer/cjs/prism-ruby'
import 'prismjs-components-importer/cjs/prism-kotlin'
import 'prismjs-components-importer/cjs/prism-dart'
import 'prismjs-components-importer/cjs/prism-lua'

// --- Types ---

interface Reaction {
  emoji: string
  emojiId?: string
  emojiImage?: string
  count: string
  isPaid: boolean
}

interface Post {
  id: string
  title: string
  type: 'text' | 'service'
  datetime: string
  tags: string[]
  text: string
  content: string
  reactions: Reaction[]
}

interface ChannelInfo {
  title: string
  description: string
  descriptionHTML: string | null
  avatar: string | undefined
}

// --- Config ---

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = resolve(__dirname, '..', 'data')
const POSTS_FILE = resolve(DATA_DIR, 'posts.json')
const CHANNEL_FILE = resolve(DATA_DIR, 'channel.json')
const CHANNELS_FILE = resolve(DATA_DIR, 'channels.json')
const NEW_POSTS_FILE = resolve(DATA_DIR, 'new-posts.json')

let CHANNEL = process.env.CHANNEL || 'neuraldeep'
const HOST = process.env.TELEGRAM_HOST || 't.me'
const STATIC_PROXY = ''

// --- Regexes (from original) ---

const STYLE_URL_REGEX = /url\(["'](.*?)["']/i
const STYLE_DIMENSION_REGEX = {
  width: /width:\s*(\d+(?:\.\d+)?)px/i,
  height: /height:\s*(\d+(?:\.\d+)?)px/i,
} as const
const STYLE_PADDING_TOP_REGEX = /padding-top:\s*(\d+(?:\.\d+)?)%/i
const SYNTHETIC_IMAGE_DIMENSION = 1000
const TITLE_PREVIEW_REGEX = /^.*?(?=[。\n]|http\S)/g
const CONTENT_URL_REGEX = /(url\(["'])((https?:)?\/\/)/g

// --- Helper functions (from src/lib/telegram/index.ts) ---

function normalizeEmoji(emoji: string): string {
  const emojiMap: Record<string, string> = {
    '\u2764': '\u2764\uFE0F',
    '\u263A': '\u263A\uFE0F',
    '\u2639': '\u2639\uFE0F',
    '\u2665': '\u2764\uFE0F',
  }
  return emojiMap[emoji] ?? emoji
}

function getCustomEmojiImage(emojiId: string | undefined, staticProxy = ''): string | null {
  if (!emojiId) return null
  const imageUrl = `https://t.me/i/emoji/${emojiId}.webp`
  return `${staticProxy}${imageUrl}`
}

function isNonEmptyString(value: string | null | undefined): value is string {
  return Boolean(value)
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function getImageLoading(index: number): 'eager' | 'lazy' {
  return index > 15 ? 'lazy' : 'eager'
}

function getStyleDimension(style: string | undefined, property: 'width' | 'height'): number | null {
  const value = style?.match(STYLE_DIMENSION_REGEX[property])?.[1]
  return value ? Math.round(Number(value)) : null
}

function getStylePaddingTop(style: string | undefined): number | null {
  const value = style?.match(STYLE_PADDING_TOP_REGEX)?.[1]
  return value ? Number(value) : null
}

function inferImageDimensions(
  $: CheerioAPI,
  node: AnyNode,
  fallback = { width: SYNTHETIC_IMAGE_DIMENSION, height: SYNTHETIC_IMAGE_DIMENSION },
): { width: number; height: number } {
  const element = $(node)
  const styles = [
    element.attr('style'),
    element.find('.tgme_widget_message_photo').first().attr('style'),
    element.find('i').attr('style'),
    element.parent().attr('style'),
  ]

  let width: number | null = null
  let height: number | null = null
  let paddingTop: number | null = null

  for (const style of styles) {
    if (width === null) width = getStyleDimension(style, 'width')
    if (height === null) height = getStyleDimension(style, 'height')
    if (paddingTop === null) paddingTop = getStylePaddingTop(style)
    if (width && height) return { width, height }
  }

  if (paddingTop !== null) {
    const syntheticWidth = width ?? fallback.width
    return {
      width: syntheticWidth,
      height: Math.max(1, Math.round((syntheticWidth * paddingTop) / 100)),
    }
  }

  return fallback
}

// --- Content extraction functions ---

type MessageSelection = Cheerio<AnyNode>

async function hydrateTgEmoji($: CheerioAPI, content: MessageSelection): Promise<void> {
  for (const emojiNode of content.find('tg-emoji').toArray()) {
    const emojiId = $(emojiNode).attr('emoji-id')
    const imageUrl = getCustomEmojiImage(emojiId, STATIC_PROXY)
    if (imageUrl) {
      $(emojiNode).replaceWith(
        `<img class="tg-emoji" src="${imageUrl}" alt="" loading="lazy" width="20" height="20" />`,
      )
    }
  }
}

function getImages($: CheerioAPI, message: MessageSelection, id: string, index: number, title: string): string {
  const fragments: string[] = []
  const loading = getImageLoading(index)
  const safeTitle = escapeHtmlAttribute(title || 'Image from post')
  const safePreviewLabel = escapeHtmlAttribute(title ? `Open image preview: ${title}` : 'Open image preview')
  const safeCloseLabel = 'Close image preview'

  for (const [photoIndex, photoNode] of message.find('.tgme_widget_message_photo_wrap').toArray().entries()) {
    const imageUrl = $(photoNode).attr('style')?.match(STYLE_URL_REGEX)?.[1]
    if (!imageUrl) continue

    const popoverId = `modal-${id}-${photoIndex}`
    const { width, height } = inferImageDimensions($, photoNode)
    fragments.push(`
      <button type="button" class="image-preview-button image-preview-wrap" popovertarget="${popoverId}" popovertargetaction="show" aria-label="${safePreviewLabel}">
        <img src="${STATIC_PROXY}${imageUrl}" alt="${safeTitle}" width="${width}" height="${height}" loading="${loading}" />
      </button>
      <div class="modal" id="${popoverId}" popover aria-label="Image preview">
        <button type="button" class="modal__backdrop" popovertarget="${popoverId}" popovertargetaction="hide" aria-label="${safeCloseLabel}"></button>
        <button type="button" class="modal__close" popovertarget="${popoverId}" popovertargetaction="hide" aria-label="${safeCloseLabel}">&times;</button>
        <div class="modal__surface">
          <img class="modal-img" src="${STATIC_PROXY}${imageUrl}" alt="${safeTitle}" width="${width}" height="${height}" loading="lazy" />
        </div>
      </div>
    `)
  }

  if (!fragments.length) return ''
  const layoutClass = fragments.length % 2 === 0 ? 'image-list-even' : 'image-list-odd'
  return `<div class="image-list-container ${layoutClass}">${fragments.join('')}</div>`
}

function getVideo($: CheerioAPI, message: MessageSelection, index: number): string {
  const video = message.find('.tgme_widget_message_video_wrap video')
  const videoSrc = video.attr('src')
  if (videoSrc) video.attr('src', STATIC_PROXY + videoSrc)
  video.attr('controls', '').attr('preload', index > 15 ? 'metadata' : 'auto').attr('playsinline', '')

  const roundVideo = message.find('.tgme_widget_message_roundvideo_wrap video')
  const roundVideoSrc = roundVideo.attr('src')
  if (roundVideoSrc) roundVideo.attr('src', STATIC_PROXY + roundVideoSrc)
  roundVideo.attr('controls', '').attr('preload', index > 15 ? 'metadata' : 'auto').attr('playsinline', '')

  return $.html(video) + $.html(roundVideo)
}

function getAudio($: CheerioAPI, message: MessageSelection): string {
  const audio = message.find('.tgme_widget_message_voice')
  const audioSrc = audio.attr('src')
  if (audioSrc) audio.attr('src', STATIC_PROXY + audioSrc)
  audio.attr('controls', '')
  return $.html(audio)
}

function getLinkPreview($: CheerioAPI, message: MessageSelection, index: number): string {
  const link = message.find('.tgme_widget_message_link_preview')
  const title = message.find('.link_preview_title').text() || message.find('.link_preview_site_name').text()
  const description = message.find('.link_preview_description').text()
  const loading = getImageLoading(index)
  const safeTitle = escapeHtmlAttribute(title || 'Link preview image')

  link.attr('target', '_blank').attr('rel', 'noopener').attr('title', description)

  const image = message.find('.link_preview_image')
  const previewUrl = image.attr('style')?.match(STYLE_URL_REGEX)?.[1]
  const imageSrc = previewUrl ? STATIC_PROXY + previewUrl : ''

  image.replaceWith(
    `<img class="link_preview_image" alt="${safeTitle}" src="${imageSrc}" width="1200" height="630" loading="${loading}" />`,
  )

  return $.html(link)
}

function getReply($: CheerioAPI, message: MessageSelection): string {
  const reply = message.find('.tgme_widget_message_reply')
  reply.wrapInner('<small></small>').wrapInner('<blockquote></blockquote>')

  const href = reply.attr('href')
  if (href) {
    const replyUrl = new URL(href, 'https://t.me')
    reply.attr('href', replyUrl.pathname.replace(new RegExp(`/${CHANNEL}/`, 'i'), '/posts/'))
  }

  return $.html(reply)
}

function getImageStickers($: CheerioAPI, message: MessageSelection, index: number): string {
  const fragments: string[] = []
  const loading = getImageLoading(index)
  for (const imageNode of message.find('.tgme_widget_message_sticker').toArray()) {
    const imageSrc = $(imageNode).attr('data-webp')
    fragments.push(
      `<img class="sticker" src="${imageSrc ? STATIC_PROXY + imageSrc : ''}" style="width: 256px;" alt="Sticker" width="256" height="256" loading="${loading}" />`,
    )
  }
  return fragments.join('')
}

function getVideoStickers($: CheerioAPI, message: MessageSelection, index: number): string {
  const fragments: string[] = []
  const loading = getImageLoading(index)
  for (const videoNode of message.find('.js-videosticker_video').toArray()) {
    const videoSrc = $(videoNode).attr('src')
    const imageSrc = $(videoNode).find('img').attr('src')
    fragments.push(`
    <div style="background-image: none; width: 256px;">
      <video src="${videoSrc ? STATIC_PROXY + videoSrc : ''}" width="256" height="256" aria-label="Video sticker" preload muted autoplay loop playsinline disablepictureinpicture>
        <img class="sticker" src="${imageSrc ? STATIC_PROXY + imageSrc : ''}" alt="Video sticker" width="256" height="256" loading="${loading}" />
      </video>
    </div>
    `)
  }
  return fragments.join('')
}

function getReactions($: CheerioAPI, message: MessageSelection): Reaction[] {
  const reactions: Reaction[] = []
  for (const reactionNode of message.find('.tgme_widget_message_reactions .tgme_reaction').toArray()) {
    const reaction = $(reactionNode)
    const isPaid = reaction.hasClass('tgme_reaction_paid')
    let emoji = ''
    let emojiId: string | undefined
    let emojiImage: string | undefined

    const standardEmoji = reaction.find('.emoji b')
    if (standardEmoji.length) emoji = normalizeEmoji(standardEmoji.text().trim())

    const tgEmoji = reaction.find('tg-emoji')
    if (tgEmoji.length && !emoji) {
      emojiId = tgEmoji.attr('emoji-id')
      const customEmojiImage = getCustomEmojiImage(emojiId, STATIC_PROXY)
      if (customEmojiImage) emojiImage = customEmojiImage
    }

    if (isPaid && !emoji && !emojiImage) emoji = '\u2B50'

    const clone = reaction.clone()
    clone.find('.emoji, tg-emoji, i').remove()
    const count = clone.text().trim()

    if (count) {
      reactions.push({ emoji, emojiId, emojiImage, count, isPaid })
    }
  }
  return reactions
}

async function modifyHTMLContent($: CheerioAPI, content: MessageSelection, index: number): Promise<MessageSelection> {
  await hydrateTgEmoji($, content)
  content.find('.emoji').removeAttr('style')

  for (const linkNode of content.find('a').toArray()) {
    const link = $(linkNode)
    link.attr('title', link.text()).removeAttr('onclick')
  }

  for (const [blockquoteIndex, blockquoteNode] of content.find('blockquote[expandable]').toArray().entries()) {
    const innerHTML = $(blockquoteNode).html() ?? ''
    const expandId = `expand-${index}-${blockquoteIndex}`
    const expandContentId = `${expandId}-content`
    const expandable = `<div class="tg-expandable">
      <input type="checkbox" id="${expandId}" class="tg-expandable__checkbox" aria-label="Expand hidden content" aria-controls="${expandContentId}">
      <div id="${expandContentId}" class="tg-expandable__content">${innerHTML}</div>
      <label for="${expandId}" class="tg-expandable__toggle"><span class="sr-only">Expand hidden content</span></label>
    </div>`
    $(blockquoteNode).replaceWith(expandable)
  }

  for (const [spoilerIndex, spoilerNode] of content.find('tg-spoiler').toArray().entries()) {
    const spoiler = $(spoilerNode)
    const spoilerId = `spoiler-${index}-${spoilerIndex}`
    const spoilerInput = `<input type="checkbox" aria-label="Reveal spoiler" aria-controls="${spoilerId}" />`
    spoiler.attr('id', spoilerId).wrap('<label class="spoiler-button"></label>').before(spoilerInput)
  }

  for (const preNode of content.find('pre').toArray()) {
    try {
      const pre = $(preNode)
      pre.find('br').replaceWith('\n')
      const code = pre.text()
      const language = flourite(code, { shiki: true, noUnknown: true }).language || 'text'
      if (prism.languages[language]) {
        const highlightedCode = prism.highlight(code, prism.languages[language], language)
        pre.html(`<code class="language-${language}">${highlightedCode}</code>`)
      }
    } catch (error) {
      console.error('Prism highlight error:', error)
    }
  }

  return content
}

async function extractPost($: CheerioAPI, item: AnyNode | null, index: number): Promise<Post> {
  const message = item ? $(item).find('.tgme_widget_message') : $('.tgme_widget_message')
  const hasReplyText = message.find('.js-message_reply_text').length > 0
  const content = await modifyHTMLContent(
    $,
    message.find(hasReplyText ? '.tgme_widget_message_text.js-message_text' : '.tgme_widget_message_text'),
    index,
  )
  const contentText = content.text()
  const title = contentText.match(TITLE_PREVIEW_REGEX)?.[0] ?? contentText
  const id = message.attr('data-post')?.replace(new RegExp(`${CHANNEL}/`, 'i'), '') ?? ''
  const tags: string[] = []

  for (const tagNode of content.find('a[href^="?q="]').toArray()) {
    const tagLink = $(tagNode)
    const tagText = tagLink.text()
    tagLink.attr('href', `/search/${encodeURIComponent(tagText)}`)
    const normalizedTag = tagText.replace('#', '')
    if (normalizedTag) tags.push(normalizedTag)
  }

  const contentHtml = [
    getReply($, message),
    getImages($, message, id, index, title),
    getVideo($, message, index),
    getAudio($, message),
    content.html(),
    getImageStickers($, message, index),
    getVideoStickers($, message, index),
    message.find('.tgme_widget_message_poll').html(),
    $.html(message.find('.tgme_widget_message_document_wrap')),
    $.html(message.find('.tgme_widget_message_video_player.not_supported')),
    $.html(message.find('.tgme_widget_message_location_wrap')),
    getLinkPreview($, message, index),
  ]
    .filter(isNonEmptyString)
    .join('')
    .replace(CONTENT_URL_REGEX, (_match, prefix: string, protocol: string) => {
      const normalizedProtocol = protocol === '//' ? 'https://' : protocol
      return `${prefix}${STATIC_PROXY}${normalizedProtocol}`
    })

  return {
    id,
    title,
    type: message.attr('class')?.includes('service_message') ? 'service' : 'text',
    datetime: message.find('.tgme_widget_message_date time').attr('datetime') ?? '',
    tags,
    text: contentText,
    content: contentHtml,
    reactions: getReactions($, message),
  }
}

// --- Main fetch logic ---

async function fetchPage(before?: string): Promise<{ posts: Post[]; channel: ChannelInfo; hasMore: boolean }> {
  const url = `https://${HOST}/s/${CHANNEL}${before ? `?before=${before}` : ''}`
  console.log(`Fetching: ${url}`)

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; BroadcastChannel/1.0)',
      Accept: 'text/html',
    },
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const html = await response.text()
  const $ = cheerio.load(html, {}, false)

  const postNodes = $('.tgme_channel_history .tgme_widget_message_wrap').toArray()
  const posts = (
    await Promise.all(postNodes.map((item, index) => extractPost($, item, index)))
  )
    .reverse()
    .filter((post) => post.type === 'text' && Boolean(post.id) && Boolean(post.content))

  const channelInfo: ChannelInfo = {
    title: $('.tgme_channel_info_header_title').text(),
    description: $('.tgme_channel_info_description').text(),
    descriptionHTML: $('.tgme_channel_info_description').html(),
    avatar: $('.tgme_page_photo_image img').attr('src'),
  }

  const hasMore = postNodes.length > 0
  return { posts, channel: channelInfo, hasMore }
}

async function fetchChannelPosts(channelName: string, maxPages: number): Promise<{ posts: Post[], channel: ChannelInfo }> {
  CHANNEL = channelName
  let allFetchedPosts: Post[] = []
  let channelInfo: ChannelInfo = { title: '', description: '', descriptionHTML: null, avatar: undefined }
  let cursor: string | undefined

  for (let page = 0; page < maxPages; page++) {
    const result = await fetchPage(cursor)
    if (page === 0) channelInfo = result.channel
    allFetchedPosts = [...allFetchedPosts, ...result.posts]

    if (!result.hasMore || result.posts.length === 0) break
    const oldestId = result.posts[result.posts.length - 1]?.id
    if (!oldestId || oldestId === cursor) break
    cursor = oldestId
  }

  // Tag each post with channel info
  const channelTitle = channelInfo.title || channelName
  allFetchedPosts = allFetchedPosts.map(p => ({
    ...p,
    id: `${channelName}/${p.id}`,
    channel: channelName,
    channelTitle,
  }))

  return { posts: allFetchedPosts, channel: channelInfo }
}

async function main() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
  }

  // Load channels list
  let channels: string[] = []
  if (existsSync(CHANNELS_FILE)) {
    channels = JSON.parse(readFileSync(CHANNELS_FILE, 'utf-8'))
  }
  if (channels.length === 0) {
    channels = [process.env.CHANNEL || 'neuraldeep']
  }

  console.log(`Channels to fetch: ${channels.join(', ')}`)

  // Load existing posts
  let existingPosts: Post[] = []
  if (existsSync(POSTS_FILE)) {
    try {
      existingPosts = JSON.parse(readFileSync(POSTS_FILE, 'utf-8'))
    } catch {
      console.warn('Could not parse existing posts.json, starting fresh')
    }
  }

  const existingIds = new Set(existingPosts.map(p => p.id))
  console.log(`Existing posts: ${existingPosts.length}`)

  const MAX_PAGES = Number(process.env.MAX_PAGES) || 3
  let allFetchedPosts: Post[] = []
  const channelsMeta: Record<string, ChannelInfo> = {}

  // Fetch all channels
  for (const ch of channels) {
    try {
      console.log(`\n--- Fetching @${ch} ---`)
      const { posts, channel: meta } = await fetchChannelPosts(ch, MAX_PAGES)
      allFetchedPosts = [...allFetchedPosts, ...posts]
      channelsMeta[ch] = meta
      console.log(`  ${posts.length} posts from @${ch} (${meta.title})`)
    } catch (err) {
      console.error(`  Failed to fetch @${ch}:`, err)
    }
  }

  console.log(`\nTotal fetched: ${allFetchedPosts.length} posts from ${channels.length} channels`)

  // Find new posts
  const newPosts = allFetchedPosts.filter(p => !existingIds.has(p.id))
  console.log(`New posts: ${newPosts.length}`)

  if (newPosts.length === 0 && existingPosts.length > 0) {
    console.log('No new posts, data is up to date.')
    writeFileSync(CHANNEL_FILE, JSON.stringify(channelsMeta, null, 2))
    writeFileSync(NEW_POSTS_FILE, JSON.stringify([], null, 2))
    return
  }

  // Merge + sort by datetime descending
  const allPosts = [...allFetchedPosts, ...existingPosts]
    .sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime())

  // Deduplicate by composite id (channel/postId)
  const seen = new Set<string>()
  const dedupedPosts = allPosts.filter(p => {
    if (seen.has(p.id)) return false
    seen.add(p.id)
    return true
  })

  writeFileSync(POSTS_FILE, JSON.stringify(dedupedPosts, null, 2))
  writeFileSync(CHANNEL_FILE, JSON.stringify(channelsMeta, null, 2))
  writeFileSync(NEW_POSTS_FILE, JSON.stringify(newPosts, null, 2))

  console.log(`Total posts saved: ${dedupedPosts.length}`)
  console.log(`Channels: ${Object.keys(channelsMeta).join(', ')}`)
}

main().catch((err) => {
  console.error('Fetch failed:', err)
  process.exit(1)
})
