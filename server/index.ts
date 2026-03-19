import 'dotenv/config'
import cors from '@fastify/cors'
import Fastify from 'fastify'
import { getAuthenticatedUserId, getBearerToken } from './auth.js'
import { decryptSecret, encryptSecret } from './crypto.js'
import { createDatabaseClient } from './database.js'
import { serverEnv } from './env.js'
import { loadInboxThreads } from './imap.js'

const app = Fastify({ logger: true })

await app.register(cors, {
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
})

app.get('/api/health', async () => ({ ok: true }))

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

try {
  await app.listen({ port: serverEnv.port, host: '::' })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
