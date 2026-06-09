import 'dotenv/config'
import { createHash, randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import cors from '@fastify/cors'
import Fastify from 'fastify'
import type { FastifyReply } from 'fastify'
import {
  getAuthenticatedUserId,
  getBearerToken,
  getSessionFromToken,
  requestOtp,
  revokeSession,
  verifyOtp,
} from './auth.js'
import { decryptSecret, encryptSecret } from './crypto.js'
import { queryOne, queryRows } from './database.js'
import { serverEnv } from './env.js'
import { createImapJob, loadImapJob, startImapJob } from './imap-jobs.js'
import { loadInboxThreads, loadThreadDetail } from './imap.js'
import { readThreadSnapshot, serializeThreadSnapshot } from './permalink-snapshot.js'

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
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
})

app.get('/api/health', async () => ({ ok: true }))

app.post('/api/auth/request-otp', async (request, reply) => {
  const body = request.body as { email?: string; fullName?: string } | undefined

  try {
    await requestOtp(String(body?.email ?? ''), body?.fullName)
    return { data: { success: true } }
  } catch (error) {
    request.log.error(error)
    return reply.code(400).send({
      error: error instanceof Error ? error.message : 'OTP konnte nicht angefordert werden.',
    })
  }
})

app.post('/api/auth/verify-otp', async (request, reply) => {
  const body = request.body as { email?: string; otp?: string } | undefined

  try {
    const session = await verifyOtp(String(body?.email ?? ''), String(body?.otp ?? ''))
    return { data: session }
  } catch (error) {
    request.log.error(error)
    return reply.code(400).send({
      error: error instanceof Error ? error.message : 'OTP konnte nicht verifiziert werden.',
    })
  }
})

app.get('/api/auth/session', async (request, reply) => {
  const token = getBearerToken(request, reply)
  if (!token) return

  try {
    const user = await getSessionFromToken(token)

    if (!user) {
      return reply.code(401).send({ error: 'Session ist abgelaufen.' })
    }

    return {
      data: {
        session: {
          token,
          expires_at: user.expires_at,
        },
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      },
    }
  } catch (error) {
    request.log.error(error)
    return reply.code(500).send({ error: 'Session konnte nicht geladen werden.' })
  }
})

app.post('/api/auth/logout', async (request, reply) => {
  const token = getBearerToken(request, reply)
  if (!token) return

  await revokeSession(token)
  return { data: { success: true } }
})

app.get('/api/permalinks/:token', async (request, reply) => {
  try {
    const params = request.params as { token: string }
    const pin = String((request.query as { pin?: string } | undefined)?.pin ?? '').trim()
    const permalink = await queryOne<{
      mailbox_id: string
      thread_id: string
      subject: string
      from_label: string
      to_label: string
      email_date: string
      snippet: string
      body: string
      has_pin: boolean
      pin_hash: string | null
      expires_at: string | null
    }>(
      `select
        p.mailbox_id,
        p.thread_id,
        p.subject,
        p.from_label,
        p.to_label,
        p.email_date,
        p.snippet,
        p.body,
        p.has_pin,
        p.pin_hash,
        p.expires_at
      from public.permalinks p
      where p.token = $1
      limit 1`,
      [params.token],
    )

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

    if (!permalink.body) {
      return reply.code(410).send({
        error:
          'Dieser Permalink enthaelt noch keinen gespeicherten Snapshot. Bitte den Link neu erzeugen.',
      })
    }

    const thread = readThreadSnapshot({
      threadId: permalink.thread_id,
      subject: permalink.subject,
      fromLabel: permalink.from_label,
      toLabel: permalink.to_label,
      emailDate: permalink.email_date,
      snippet: permalink.snippet,
      body: permalink.body,
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

  const userId = await getAuthenticatedUserId(token)
  if (!userId) {
    return reply.code(401).send({ error: 'Token enthaelt keine Benutzer-ID.' })
  }

  try {
    const result = await queryOne<{
      id: string
      email: string
      full_name: string
      last_otp_at: string | null
      created_at: string
      updated_at: string
    }>(
      'select id, email, full_name, last_otp_at, created_at, updated_at from public.profiles where id = $1 limit 1',
      [userId],
    )

    return { data: result }
  } catch (error) {
    request.log.error(error)
    return reply.code(500).send({ error: error instanceof Error ? error.message : 'Profil konnte nicht geladen werden.' })
  }
})

app.put('/api/profile', async (request, reply) => {
  const token = getBearerToken(request, reply)
  if (!token) return

  const userId = await getAuthenticatedUserId(token)
  if (!userId) {
    return reply.code(401).send({ error: 'Token enthaelt keine Benutzer-ID.' })
  }

  const body = request.body as { fullName?: string } | undefined
  const fullName = body?.fullName?.trim()

  if (!fullName) {
    return reply.code(400).send({ error: 'fullName ist erforderlich.' })
  }

  try {
    const result = await queryOne<{
      id: string
      email: string
      full_name: string
      last_otp_at: string | null
      created_at: string
      updated_at: string
    }>(
      `insert into public.profiles (id, full_name)
       values ($1, $2)
       on conflict (id) do update set
         full_name = excluded.full_name,
         updated_at = now()
       returning id, email, full_name, last_otp_at, created_at, updated_at`,
      [userId, fullName],
    )

    return { data: result }
  } catch (error) {
    request.log.error(error)
    return reply.code(500).send({ error: error instanceof Error ? error.message : 'Profil konnte nicht gespeichert werden.' })
  }
})

app.get('/api/mailboxes', async (request, reply) => {
  const token = getBearerToken(request, reply)
  if (!token) return

  const userId = await getAuthenticatedUserId(token)
  if (!userId) {
    return reply.code(401).send({ error: 'Session ist abgelaufen.' })
  }

  try {
    const result = await queryRows<{
      id: string
      user_id: string
      label: string
      host: string
      port: number
      secure: boolean
      username: string
      folder: string
      last_verified_at: string | null
      created_at: string
      updated_at: string
    }>(
      `select id, user_id, label, host, port, secure, username, folder, last_verified_at, created_at, updated_at
       from public.mailboxes
       where user_id = $1
       order by created_at desc`,
      [userId],
    )

    return { data: result }
  } catch (error) {
    request.log.error(error)
    return reply.code(500).send({ error: error instanceof Error ? error.message : 'Mailboxes konnten nicht geladen werden.' })
  }
})

app.get('/api/mailboxes/:mailboxId/permalinks', async (request, reply) => {
  const token = getBearerToken(request, reply)
  if (!token) return

  const userId = await getAuthenticatedUserId(token)
  if (!userId) {
    return reply.code(401).send({ error: 'Token enthaelt keine Benutzer-ID.' })
  }

  const params = request.params as { mailboxId: string }
  try {
    const result = await queryRows<{
      id: string
      mailbox_id: string
      thread_id: string
      token: string
      subject: string
      from_label: string
      email_date: string
      snippet: string
      has_pin: boolean
      expires_at: string | null
      created_at: string
    }>(
      `select id, mailbox_id, thread_id, token, subject, from_label, email_date, snippet, has_pin, expires_at, created_at
       from public.permalinks
       where mailbox_id = $1 and user_id = $2
       order by created_at desc`,
      [params.mailboxId, userId],
    )

    return { data: result }
  } catch (error) {
    request.log.error(error)
    return reply.code(500).send({ error: error instanceof Error ? error.message : 'Permalinks konnten nicht geladen werden.' })
  }
})

app.get('/api/imap-jobs/:jobId', async (request, reply) => {
  const token = getBearerToken(request, reply)
  if (!token) return

  const userId = await getAuthenticatedUserId(token)
  if (!userId) {
    return reply.code(401).send({ error: 'Token enthaelt keine Benutzer-ID.' })
  }

  const params = request.params as { jobId: string }

  try {
    const job = await loadImapJob(params.jobId, userId)

    if (!job) {
      return reply.code(404).send({ error: 'IMAP-Job nicht gefunden.' })
    }

    return { data: job }
  } catch (error) {
    request.log.error(error)
    return reply.code(500).send({
      error: error instanceof Error ? error.message : 'IMAP-Job konnte nicht geladen werden.',
    })
  }
})

app.delete('/api/mailboxes/:mailboxId/permalinks/:permalinkId', async (request, reply) => {
  const token = getBearerToken(request, reply)
  if (!token) return

  const userId = await getAuthenticatedUserId(token)
  if (!userId) {
    return reply.code(401).send({ error: 'Token enthaelt keine Benutzer-ID.' })
  }

  const params = request.params as { mailboxId: string; permalinkId: string }
  try {
    const result = await queryOne<{ id: string }>(
      `delete from public.permalinks
       where id = $1 and mailbox_id = $2 and user_id = $3
       returning id`,
      [params.permalinkId, params.mailboxId, userId],
    )

    if (!result) {
      return reply.code(404).send({ error: 'Permalink nicht gefunden.' })
    }

    return { data: { success: true } }
  } catch (error) {
    request.log.error(error)
    return reply.code(500).send({ error: error instanceof Error ? error.message : 'Permalink konnte nicht geloescht werden.' })
  }
})

app.put('/api/mailboxes/:mailboxId/permalinks/:permalinkId', async (request, reply) => {
  const token = getBearerToken(request, reply)
  if (!token) return

  const userId = await getAuthenticatedUserId(token)
  if (!userId) {
    return reply.code(401).send({ error: 'Token enthaelt keine Benutzer-ID.' })
  }

  const params = request.params as { mailboxId: string; permalinkId: string }
  const body = request.body as { pin?: string; expiresAt?: string | null } | undefined
  const pin = body?.pin?.trim() ?? ''
  const pinAction = body?.pin === undefined || pin === '••••' ? 'keep' : pin ? 'set' : 'clear'
  const expiresAt = body?.expiresAt?.trim() || null

  if (pinAction === 'set' && !/^\d{4}$/.test(pin)) {
    return reply.code(400).send({ error: 'PIN muss genau 4 Ziffern haben.' })
  }

  try {
    const result = await queryOne<{
      id: string
      mailbox_id: string
      thread_id: string
      token: string
      subject: string
      from_label: string
      email_date: string
      snippet: string
      has_pin: boolean
      expires_at: string | null
      created_at: string
    }>(
      `update public.permalinks
       set has_pin = case when $4 = 'set' then true when $4 = 'clear' then false else has_pin end,
         pin_hash = case when $4 = 'set' then $5 when $4 = 'clear' then null else pin_hash end,
         expires_at = $6
       where id = $1 and mailbox_id = $2 and user_id = $3
       returning id, mailbox_id, thread_id, token, subject, from_label, email_date, snippet, has_pin, expires_at, created_at`,
      [
        params.permalinkId,
        params.mailboxId,
        userId,
        pinAction,
        pinAction === 'set' ? createHash('sha256').update(pin).digest('hex') : null,
        expiresAt ? new Date(expiresAt).toISOString() : null,
      ],
    )

    if (!result) {
      return reply.code(404).send({ error: 'Permalink nicht gefunden.' })
    }

    return { data: result }
  } catch (error) {
    request.log.error(error)
    return reply.code(500).send({ error: error instanceof Error ? error.message : 'Permalink konnte nicht gespeichert werden.' })
  }
})

app.post('/api/mailboxes/:mailboxId/threads/jobs', async (request, reply) => {
  const token = getBearerToken(request, reply)
  if (!token) return

  const userId = await getAuthenticatedUserId(token)
  if (!userId) {
    return reply.code(401).send({ error: 'Token enthaelt keine Benutzer-ID.' })
  }

  const params = request.params as { mailboxId: string }

  try {
    const mailbox = await queryOne<{ id: string }>(
      `select id
       from public.mailboxes
       where id = $1 and user_id = $2
       limit 1`,
      [params.mailboxId, userId],
    )

    if (!mailbox) {
      return reply.code(404).send({ error: 'Mailbox nicht gefunden.' })
    }

    const job = await createImapJob({
      userId,
      mailboxId: params.mailboxId,
      type: 'load_threads',
      payload: { mailboxId: params.mailboxId },
    })

    startImapJob(job.id)

    return reply.code(202).send({ data: job })
  } catch (error) {
    request.log.error(error)
    return reply.code(500).send({
      error: error instanceof Error ? error.message : 'Thread-Ladejob konnte nicht gestartet werden.',
    })
  }
})

app.get('/api/mailboxes/:mailboxId/threads', async (request, reply) => {
  try {
    const token = getBearerToken(request, reply)
    if (!token) return

    const userId = await getAuthenticatedUserId(token)
    if (!userId) {
      return reply.code(401).send({ error: 'Token enthaelt keine Benutzer-ID.' })
    }

    const params = request.params as { mailboxId: string }
    const mailbox = await queryOne<{
      id: string
      user_id: string
      label: string
      host: string
      port: number
      secure: boolean
      username: string
      encrypted_password: string
      folder: string
      last_verified_at: string | null
      created_at: string
      updated_at: string
    }>(
      `select id, user_id, label, host, port, secure, username, encrypted_password, folder, last_verified_at, created_at, updated_at
       from public.mailboxes
       where id = $1 and user_id = $2
       limit 1`,
      [params.mailboxId, userId],
    )

    if (!mailbox) {
      return reply.code(404).send({ error: 'Mailbox nicht gefunden.' })
    }

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

app.post('/api/mailboxes/:mailboxId/permalink-jobs', async (request, reply) => {
  try {
    const token = getBearerToken(request, reply)
    if (!token) return

    const userId = await getAuthenticatedUserId(token)
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

    const mailbox = await queryOne<{ id: string }>(
      `select id
       from public.mailboxes
       where id = $1 and user_id = $2
       limit 1`,
      [params.mailboxId, userId],
    )

    if (!mailbox) {
      return reply.code(404).send({ error: 'Mailbox nicht gefunden.' })
    }

    const job = await createImapJob({
      userId,
      mailboxId: params.mailboxId,
      type: 'create_permalink',
      payload: {
        mailboxId: params.mailboxId,
        threadId,
        subject,
        from,
        date,
        snippet,
        pin,
        expiresAt,
      },
    })

    startImapJob(job.id)

    return reply.code(202).send({ data: job })
  } catch (error) {
    request.log.error(error)
    return reply.code(500).send({
      error: error instanceof Error ? error.message : 'Permalink-Job konnte nicht gestartet werden.',
    })
  }
})

app.post('/api/mailboxes', async (request, reply) => {
  try {
    const token = getBearerToken(request, reply)
    if (!token) return

    const userId = await getAuthenticatedUserId(token)
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

    const result = await queryOne<{
      id: string
      user_id: string
      label: string
      host: string
      port: number
      secure: boolean
      username: string
      folder: string
      last_verified_at: string | null
      created_at: string
      updated_at: string
    }>(
      `insert into public.mailboxes (user_id, label, host, port, secure, username, encrypted_password, folder)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id, user_id, label, host, port, secure, username, folder, last_verified_at, created_at, updated_at`,
      [userId, label, host, port, secure, username, encryptSecret(password, serverEnv.cryptoSecret), folder],
    )

    return reply.code(201).send({ data: result })
  } catch (error) {
    request.log.error(error)
    return reply.code(500).send({
      error: error instanceof Error ? error.message : 'Unbekannter Serverfehler bei /api/mailboxes',
    })
  }
})

app.put('/api/mailboxes/:mailboxId', async (request, reply) => {
  try {
    const token = getBearerToken(request, reply)
    if (!token) return

    const userId = await getAuthenticatedUserId(token)
    if (!userId) {
      return reply.code(401).send({ error: 'Token enthaelt keine Benutzer-ID.' })
    }

    const params = request.params as { mailboxId: string }
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
    const password = body?.password?.trim() ?? ''
    const folder = body?.folder?.trim() || 'INBOX'
    const port = Number(body?.port ?? 993)
    const secure = body?.secure ?? true

    if (!label || !host || !username || Number.isNaN(port)) {
      return reply.code(400).send({ error: 'Mailbox-Daten sind unvollstaendig.' })
    }

    const result = await queryOne<{
      id: string
      user_id: string
      label: string
      host: string
      port: number
      secure: boolean
      username: string
      folder: string
      last_verified_at: string | null
      created_at: string
      updated_at: string
    }>(
      password
        ? `update public.mailboxes
           set label = $3,
             host = $4,
             port = $5,
             secure = $6,
             username = $7,
             encrypted_password = $8,
             folder = $9,
             updated_at = now()
           where id = $1 and user_id = $2
           returning id, user_id, label, host, port, secure, username, folder, last_verified_at, created_at, updated_at`
        : `update public.mailboxes
           set label = $3,
             host = $4,
             port = $5,
             secure = $6,
             username = $7,
             folder = $8,
             updated_at = now()
           where id = $1 and user_id = $2
           returning id, user_id, label, host, port, secure, username, folder, last_verified_at, created_at, updated_at`,
      password
        ? [
            params.mailboxId,
            userId,
            label,
            host,
            port,
            secure,
            username,
            encryptSecret(password, serverEnv.cryptoSecret),
            folder,
          ]
        : [params.mailboxId, userId, label, host, port, secure, username, folder],
    )

    if (!result) {
      return reply.code(404).send({ error: 'Mailbox nicht gefunden.' })
    }

    return { data: result }
  } catch (error) {
    request.log.error(error)
    return reply.code(500).send({
      error: error instanceof Error ? error.message : 'Mailbox konnte nicht gespeichert werden.',
    })
  }
})

app.delete('/api/mailboxes/:mailboxId', async (request, reply) => {
  try {
    const token = getBearerToken(request, reply)
    if (!token) return

    const userId = await getAuthenticatedUserId(token)
    if (!userId) {
      return reply.code(401).send({ error: 'Token enthaelt keine Benutzer-ID.' })
    }

    const params = request.params as { mailboxId: string }
    const result = await queryOne<{ id: string }>(
      `delete from public.mailboxes
       where id = $1 and user_id = $2
       returning id`,
      [params.mailboxId, userId],
    )

    if (!result) {
      return reply.code(404).send({ error: 'Mailbox nicht gefunden.' })
    }

    return { data: { success: true } }
  } catch (error) {
    request.log.error(error)
    return reply.code(500).send({
      error: error instanceof Error ? error.message : 'Mailbox konnte nicht geloescht werden.',
    })
  }
})

app.post('/api/mailboxes/:mailboxId/permalinks', async (request, reply) => {
  try {
    const token = getBearerToken(request, reply)
    if (!token) return

    const userId = await getAuthenticatedUserId(token)
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

    const mailbox = await queryOne<{
      id: string
      host: string
      port: number
      secure: boolean
      username: string
      encrypted_password: string
      folder: string
    }>(
      `select id, host, port, secure, username, encrypted_password, folder
       from public.mailboxes
       where id = $1 and user_id = $2
       limit 1`,
      [params.mailboxId, userId],
    )

    if (!mailbox) {
      return reply.code(404).send({ error: 'Mailbox nicht gefunden.' })
    }

    const threadDetail = await loadThreadDetail({
      host: mailbox.host,
      port: mailbox.port,
      secure: mailbox.secure,
      username: mailbox.username,
      password: decryptSecret(mailbox.encrypted_password, serverEnv.cryptoSecret),
      folder: mailbox.folder,
      threadId,
    })

    const snapshotMessage = threadDetail.root
    const snapshotBody = serializeThreadSnapshot(threadDetail.messages)

    const result = await queryOne<{
      id: string
      mailbox_id: string
      thread_id: string
      token: string
      subject: string
      from_label: string
      email_date: string
      snippet: string
      has_pin: boolean
      expires_at: string | null
      created_at: string
    }>(
      `insert into public.permalinks (
         user_id, mailbox_id, thread_id, token, subject, from_label, to_label, email_date, snippet, body, has_pin, pin_hash, expires_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       returning id, mailbox_id, thread_id, token, subject, from_label, email_date, snippet, has_pin, expires_at, created_at`,
      [
        userId,
        params.mailboxId,
        threadId,
        randomBytes(16).toString('hex'),
        snapshotMessage.subject || subject,
        snapshotMessage.from || from,
        snapshotMessage.to || '',
        new Date(snapshotMessage.date || date).toISOString(),
        snapshotMessage.snippet || snippet,
        snapshotBody,
        Boolean(pin),
        pin ? createHash('sha256').update(pin).digest('hex') : null,
        expiresAt ? new Date(expiresAt).toISOString() : null,
      ],
    )

    return reply.code(201).send({ data: result })
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
