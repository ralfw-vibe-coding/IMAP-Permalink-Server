import 'dotenv/config'
import { createHash, randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import cors from '@fastify/cors'
import Fastify from 'fastify'
import type { FastifyReply } from 'fastify'
import { getAuthenticatedUserId, getBearerToken } from './auth.js'
import { decryptSecret, encryptSecret } from './crypto.js'
import { createDatabaseClient, createPublicDatabaseClient } from './database.js'
import { serverEnv } from './env.js'
import { loadInboxThreads, loadThreadDetail } from './imap.js'

const app = Fastify({ logger: true })
const serverFilePath = fileURLToPath(import.meta.url)
const distDir = resolve(serverFilePath, '../../dist')
const distIndexPath = resolve(distDir, 'index.html')

const assetMimeTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

async function sendStaticFile(reply: FastifyReply, filePath: string) {
  const content = await readFile(filePath)
  const mimeType = assetMimeTypes[extname(filePath)] || 'application/octet-stream'
  return reply.type(mimeType).send(content)
}

await app.register(cors, {
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
})

app.get('/api/health', async () => ({ ok: true }))

app.get('/api/permalinks/:token', async (request, reply) => {
  try {
    const params = request.params as { token: string }
    const pin = String((request.query as { pin?: string } | undefined)?.pin ?? '').trim()
    const db = createPublicDatabaseClient()
    const permalinkResult = await db.rpc('get_permalink_access', {
      permalink_token: params.token,
    })

    if (permalinkResult.error) {
      request.log.error(permalinkResult.error)
      return reply.code(500).send({ error: permalinkResult.error.message })
    }

    const permalink = Array.isArray(permalinkResult.data)
      ? permalinkResult.data[0]
      : permalinkResult.data

    if (!permalink) {
      return reply.code(404).send({ error: 'Permalink wurde nicht gefunden.' })
    }

    if (permalink.expires_at && new Date(permalink.expires_at) <= new Date()) {
      return reply.code(410).send({ error: 'Dieser Permalink ist abgelaufen.' })
    }

    if (permalink.has_pin) {
      if (!pin) {
        return {
          data: {
            locked: true,
            subject: permalink.subject,
            from_label: permalink.from_label,
            email_date: permalink.email_date,
            expires_at: permalink.expires_at,
          },
        }
      }

      const pinHash = createHash('sha256').update(pin).digest('hex')
      if (pinHash !== permalink.pin_hash) {
        return reply.code(401).send({ error: 'PIN ist ungueltig.' })
      }
    }

    const thread = await loadThreadDetail({
      host: permalink.host,
      port: permalink.port,
      secure: permalink.secure,
      username: permalink.username,
      password: decryptSecret(permalink.encrypted_password, serverEnv.cryptoSecret),
      folder: permalink.folder,
      threadId: permalink.thread_id,
    })

    return {
      data: {
        locked: false,
        subject: permalink.subject,
        from_label: permalink.from_label,
        email_date: permalink.email_date,
        expires_at: permalink.expires_at,
        has_pin: permalink.has_pin,
        snippet: permalink.snippet,
        thread,
      },
    }
  } catch (error) {
    request.log.error(error)
    return reply.code(500).send({
      error: error instanceof Error ? error.message : 'Unbekannter Serverfehler bei /api/permalinks/:token',
    })
  }
})

app.get('/api/profile', async (request, reply) => {
  const token = getBearerToken(request, reply)
  if (!token) return

  const userId = getAuthenticatedUserId(token)
  if (!userId) {
    return reply.code(401).send({ error: 'Token enthaelt keine Benutzer-ID.' })
  }

  const db = createDatabaseClient(token)
  const result = await db.from('profiles').select('id, full_name, created_at, updated_at').eq('id', userId).maybeSingle()

  if (result.error) {
    request.log.error(result.error)
    return reply.code(500).send({ error: result.error.message })
  }

  return { data: result.data }
})

app.put('/api/profile', async (request, reply) => {
  const token = getBearerToken(request, reply)
  if (!token) return

  const userId = getAuthenticatedUserId(token)
  if (!userId) {
    return reply.code(401).send({ error: 'Token enthaelt keine Benutzer-ID.' })
  }

  const body = request.body as { fullName?: string } | undefined
  const fullName = body?.fullName?.trim()

  if (!fullName) {
    return reply.code(400).send({ error: 'fullName ist erforderlich.' })
  }

  const db = createDatabaseClient(token)
  const result = await db
    .from('profiles')
    .upsert(
      {
        id: userId,
        full_name: fullName,
      },
      { onConflict: 'id' },
    )
    .select('id, full_name, created_at, updated_at')
    .single()

  if (result.error) {
    request.log.error(result.error)
    return reply.code(500).send({ error: result.error.message })
  }

  return { data: result.data }
})

app.get('/api/mailboxes', async (request, reply) => {
  const token = getBearerToken(request, reply)
  if (!token) return

  const db = createDatabaseClient(token)
  const result = await db
    .from('mailboxes')
    .select('id, user_id, label, host, port, secure, username, folder, last_verified_at, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (result.error) {
    request.log.error(result.error)
    return reply.code(500).send({ error: result.error.message })
  }

  return { data: result.data ?? [] }
})

app.get('/api/mailboxes/:mailboxId/permalinks', async (request, reply) => {
  const token = getBearerToken(request, reply)
  if (!token) return

  const userId = getAuthenticatedUserId(token)
  if (!userId) {
    return reply.code(401).send({ error: 'Token enthaelt keine Benutzer-ID.' })
  }

  const params = request.params as { mailboxId: string }
  const db = createDatabaseClient(token)
  const result = await db
    .from('permalinks')
    .select(
      'id, mailbox_id, thread_id, token, subject, from_label, email_date, snippet, has_pin, expires_at, created_at',
    )
    .eq('mailbox_id', params.mailboxId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (result.error) {
    request.log.error(result.error)
    return reply.code(500).send({ error: result.error.message })
  }

  return { data: result.data ?? [] }
})

app.get('/api/mailboxes/:mailboxId/threads', async (request, reply) => {
  try {
    const token = getBearerToken(request, reply)
    if (!token) return

    const userId = getAuthenticatedUserId(token)
    if (!userId) {
      return reply.code(401).send({ error: 'Token enthaelt keine Benutzer-ID.' })
    }

    const params = request.params as { mailboxId: string }
    const db = createDatabaseClient(token)
    const mailboxResult = await db
      .from('mailboxes')
      .select(
        'id, user_id, label, host, port, secure, username, encrypted_password, folder, last_verified_at, created_at, updated_at',
      )
      .eq('id', params.mailboxId)
      .eq('user_id', userId)
      .single()

    if (mailboxResult.error) {
      request.log.error(mailboxResult.error)
      return reply.code(500).send({ error: mailboxResult.error.message })
    }

    if (!mailboxResult.data) {
      return reply.code(404).send({ error: 'Mailbox nicht gefunden.' })
    }

    const mailbox = mailboxResult.data
    const threads = await loadInboxThreads({
      host: mailbox.host,
      port: mailbox.port,
      secure: mailbox.secure,
      username: mailbox.username,
      password: decryptSecret(mailbox.encrypted_password, serverEnv.cryptoSecret),
      folder: mailbox.folder,
    })

    return { data: threads }
  } catch (error) {
    request.log.error(error)
    return reply.code(500).send({
      error: error instanceof Error ? error.message : 'Unbekannter Serverfehler bei /threads',
    })
  }
})

app.post('/api/mailboxes', async (request, reply) => {
  try {
    const token = getBearerToken(request, reply)
    if (!token) return

    const userId = getAuthenticatedUserId(token)
    if (!userId) {
      return reply.code(401).send({ error: 'Token enthaelt keine Benutzer-ID.' })
    }

    const body = request.body as
      | {
          label?: string
          host?: string
          port?: number
          username?: string
          password?: string
          folder?: string
          secure?: boolean
        }
      | undefined

    const label = body?.label?.trim()
    const host = body?.host?.trim()
    const username = body?.username?.trim()
    const password = body?.password ?? ''
    const folder = body?.folder?.trim() || 'INBOX'
    const port = Number(body?.port ?? 993)
    const secure = body?.secure ?? true

    if (!label || !host || !username || !password || Number.isNaN(port)) {
      return reply.code(400).send({ error: 'Mailbox-Daten sind unvollstaendig.' })
    }

    const db = createDatabaseClient(token)
    const result = await db
      .from('mailboxes')
      .insert({
        user_id: userId,
        label,
        host,
        port,
        secure,
        username,
        encrypted_password: encryptSecret(password, serverEnv.cryptoSecret),
        folder,
      })
      .select('id, user_id, label, host, port, secure, username, folder, last_verified_at, created_at, updated_at')
      .single()

    if (result.error) {
      request.log.error(result.error)
      return reply.code(500).send({ error: result.error.message })
    }

    return reply.code(201).send({ data: result.data })
  } catch (error) {
    request.log.error(error)
    return reply.code(500).send({
      error: error instanceof Error ? error.message : 'Unbekannter Serverfehler bei /api/mailboxes',
    })
  }
})

app.post('/api/mailboxes/:mailboxId/permalinks', async (request, reply) => {
  try {
    const token = getBearerToken(request, reply)
    if (!token) return

    const userId = getAuthenticatedUserId(token)
    if (!userId) {
      return reply.code(401).send({ error: 'Token enthaelt keine Benutzer-ID.' })
    }

    const params = request.params as { mailboxId: string }
    const body = request.body as
      | {
          threadId?: string
          subject?: string
          from?: string
          date?: string
          snippet?: string
          pin?: string
          expiresAt?: string | null
        }
      | undefined

    const threadId = body?.threadId?.trim()
    const subject = body?.subject?.trim()
    const from = body?.from?.trim()
    const date = body?.date?.trim()
    const snippet = body?.snippet?.trim() ?? ''
    const pin = body?.pin?.trim() ?? ''
    const expiresAt = body?.expiresAt?.trim() || null

    if (!threadId || !subject || !from || !date) {
      return reply.code(400).send({ error: 'Permalink-Daten sind unvollstaendig.' })
    }

    if (pin && !/^\d{4}$/.test(pin)) {
      return reply.code(400).send({ error: 'PIN muss genau 4 Ziffern haben.' })
    }

    const db = createDatabaseClient(token)
    const mailboxResult = await db
      .from('mailboxes')
      .select('id')
      .eq('id', params.mailboxId)
      .eq('user_id', userId)
      .maybeSingle()

    if (mailboxResult.error) {
      request.log.error(mailboxResult.error)
      return reply.code(500).send({ error: mailboxResult.error.message })
    }

    if (!mailboxResult.data) {
      return reply.code(404).send({ error: 'Mailbox nicht gefunden.' })
    }

    const result = await db
      .from('permalinks')
      .insert({
        user_id: userId,
        mailbox_id: params.mailboxId,
        thread_id: threadId,
        token: randomBytes(16).toString('hex'),
        subject,
        from_label: from,
        email_date: new Date(date).toISOString(),
        snippet,
        has_pin: Boolean(pin),
        pin_hash: pin ? createHash('sha256').update(pin).digest('hex') : null,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      })
      .select(
        'id, mailbox_id, thread_id, token, subject, from_label, email_date, snippet, has_pin, expires_at, created_at',
      )
      .single()

    if (result.error) {
      request.log.error(result.error)
      return reply.code(500).send({ error: result.error.message })
    }

    return reply.code(201).send({ data: result.data })
  } catch (error) {
    request.log.error(error)
    return reply.code(500).send({
      error: error instanceof Error ? error.message : 'Unbekannter Serverfehler bei /permalinks',
    })
  }
})

app.get('/assets/*', async (request, reply) => {
  const assetPath = String(request.url || '').replace(/^\/+/, '')
  const absolutePath = resolve(distDir, assetPath)

  if (!absolutePath.startsWith(distDir)) {
    return reply.code(403).send('Forbidden')
  }

  try {
    return await sendStaticFile(reply, absolutePath)
  } catch {
    return reply.code(404).send('Not found')
  }
})

app.get('/favicon.ico', async (_request, reply) => {
  try {
    return await sendStaticFile(reply, resolve(distDir, 'favicon.ico'))
  } catch {
    return reply.code(404).send('Not found')
  }
})

app.setNotFoundHandler(async (request, reply) => {
  if (request.url.startsWith('/api/')) {
    return reply.code(404).send({ error: 'Not found' })
  }

  try {
    return await sendStaticFile(reply, distIndexPath)
  } catch (error) {
    request.log.error(error)
    return reply.code(500).send('Frontend build not found. Run npm run build first.')
  }
})

try {
  await app.listen({ port: serverEnv.port, host: '::' })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
