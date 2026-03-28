/**
 * Send email notifications about new posts.
 * Uses SMTP (Yandex or Mail.ru).
 *
 * Env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 *
 * Note: Uses raw SMTP via node:net/tls for zero dependencies.
 * For production, consider using nodemailer.
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createConnection } from 'node:net'
import { connect as tlsConnect } from 'node:tls'

const __dirname = dirname(fileURLToPath(import.meta.url))
const NEW_POSTS_FILE = resolve(__dirname, '..', '..', 'data', 'new-posts.json')
const SUBSCRIBERS_FILE = resolve(__dirname, '..', '..', 'data', 'subscribers-email.json')

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.yandex.ru'
const SMTP_PORT = Number(process.env.SMTP_PORT) || 465
const SMTP_USER = process.env.SMTP_USER
const SMTP_PASS = process.env.SMTP_PASS
const SITE_URL = process.env.SITE_URL || 'https://neuraldeep.sourcecraft.site'

interface Post {
  id: string
  title: string
  text: string
  content: string
  datetime: string
  tags: string[]
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}

function smtpCommand(socket: import('node:tls').TLSSocket, cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    socket.write(cmd + '\r\n')
    socket.once('data', (data) => resolve(data.toString()))
    socket.once('error', reject)
  })
}

async function sendEmail(to: string, subject: string, htmlBody: string, textBody: string): Promise<boolean> {
  if (!SMTP_USER || !SMTP_PASS) {
    console.log('Email: skipped (no SMTP credentials)')
    return false
  }

  return new Promise((resolve) => {
    const socket = tlsConnect(SMTP_PORT, SMTP_HOST, {}, async () => {
      try {
        await new Promise<string>((r) => socket.once('data', (d) => r(d.toString()))) // greeting

        await smtpCommand(socket, `EHLO localhost`)
        await smtpCommand(socket, `AUTH LOGIN`)
        await smtpCommand(socket, Buffer.from(SMTP_USER).toString('base64'))
        await smtpCommand(socket, Buffer.from(SMTP_PASS).toString('base64'))
        await smtpCommand(socket, `MAIL FROM:<${SMTP_USER}>`)
        await smtpCommand(socket, `RCPT TO:<${to}>`)
        await smtpCommand(socket, `DATA`)

        const boundary = `boundary-${Date.now()}`
        const message = [
          `From: NeuralDeep <${SMTP_USER}>`,
          `To: ${to}`,
          `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
          `MIME-Version: 1.0`,
          `Content-Type: multipart/alternative; boundary="${boundary}"`,
          ``,
          `--${boundary}`,
          `Content-Type: text/plain; charset=UTF-8`,
          ``,
          textBody,
          ``,
          `--${boundary}`,
          `Content-Type: text/html; charset=UTF-8`,
          ``,
          htmlBody,
          ``,
          `--${boundary}--`,
        ].join('\r\n')

        await smtpCommand(socket, message + '\r\n.')
        await smtpCommand(socket, 'QUIT')
        socket.end()
        resolve(true)
      } catch (err) {
        console.error('SMTP error:', err)
        socket.end()
        resolve(false)
      }
    })

    socket.on('error', () => resolve(false))
  })
}

async function main() {
  if (!existsSync(NEW_POSTS_FILE)) {
    console.log('Email: no new posts file')
    return
  }

  const newPosts: Post[] = JSON.parse(readFileSync(NEW_POSTS_FILE, 'utf-8'))
  if (newPosts.length === 0) {
    console.log('Email: no new posts')
    return
  }

  let subscribers: string[] = []
  if (existsSync(SUBSCRIBERS_FILE)) {
    subscribers = JSON.parse(readFileSync(SUBSCRIBERS_FILE, 'utf-8'))
  }

  if (subscribers.length === 0) {
    console.log('Email: no subscribers')
    return
  }

  for (const post of newPosts) {
    const title = post.title || stripHtml(post.content).slice(0, 80)
    const subject = `New: ${title}`
    const postUrl = `${SITE_URL}/posts/${post.id}`

    const htmlBody = `
      <div style="max-width:600px;margin:0 auto;font-family:sans-serif;">
        <h2>${title}</h2>
        <div>${post.content}</div>
        <p><a href="${postUrl}">Read on site</a></p>
        <hr/>
        <small>NeuralDeep Channel</small>
      </div>
    `
    const textBody = `${title}\n\n${stripHtml(post.content)}\n\n${postUrl}`

    for (const email of subscribers) {
      const ok = await sendEmail(email, subject, htmlBody, textBody)
      console.log(`Email to ${email}: ${ok ? 'sent' : 'failed'}`)
      await new Promise((r) => setTimeout(r, 500))
    }
  }
}

main().catch((err) => {
  console.error('Email notification failed:', err)
  process.exit(1)
})
