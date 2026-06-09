import { createHash } from 'node:crypto'
import { requestOtp, verifyOtp, getSessionFromToken, revokeSession, getAuthenticatedUserId } from '../../server/auth.js'
import { encryptSecret } from '../../server/crypto.js'
import { queryOne, queryRows } from '../../server/database.js'
import { serverEnv } from '../../server/env.js'
import { createImapJob, loadImapJob, startImapJob } from '../../server/imap-jobs.js'

const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    headers: jsonHeaders,
    status,
  })
}

function errorResponse(error: unknown, fallback: string, status = 500) {
  return json({ error: error instanceof Error ? error.message : fallback }, status)
}

async function readJson(request: Request) {
  return (await request.json().catch(() => ({}))) as Record<string, unknown>
}

function getToken(request: Request) {
  const authorization = request.headers.get('authorization')

  if (!authorization?.startsWith('Bearer ')) {
    return null
  }

  return authorization.slice('Bearer '.length)
}

async function requireUserId(request: Request) {
  const token = getToken(request)

  if (!token) {
    return { error: json({ error: 'Bearer-Token fehlt.' }, 401), token: null, userId: null }
  }

  const userId = await getAuthenticatedUserId(token)

  if (!userId) {
    return { error: json({ error: 'Session ist abgelaufen.' }, 401), token, userId: null }
  }

  return { error: null, token, userId }
}

async function kickOffImapBackgroundJob(request: Request, jobId: string) {
  const url = new URL('/.netlify/functions/process-imap-job-background', request.url)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobId }),
    })

    if (!response.ok) {
      startImapJob(jobId)
    }
  } catch {
    startImapJob(jobId)
  }
}

async function handlePublicPermalink(token: string, request: Request) {
  const url = new URL(request.url)
  const pin = String(url.searchParams.get('pin') ?? '').trim()
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
    [token],
  )

  if (!permalink) {
    return json({ error: 'Permalink wurde nicht gefunden.' }, 404)
  }

  if (permalink.expires_at && new Date(permalink.expires_at) <= new Date()) {
    return json({ error: 'Dieser Permalink ist abgelaufen.' }, 410)
  }

  if (permalink.has_pin) {
    if (!pin) {
      return json({
        data: {
          locked: true,
          subject: permalink.subject,
          from_label: permalink.from_label,
          email_date: permalink.email_date,
          expires_at: permalink.expires_at,
        },
      })
    }

    const pinHash = createHash('sha256').update(pin).digest('hex')
    if (pinHash !== permalink.pin_hash) {
      return json({ error: 'PIN ist ungueltig.' }, 401)
    }
  }

  if (!permalink.body) {
    return json({
      error:
        'Dieser Permalink enthaelt noch keinen gespeicherten Snapshot. Bitte den Link neu erzeugen.',
    }, 410)
  }

  const message = {
    id: permalink.thread_id,
    subject: permalink.subject,
    from: permalink.from_label,
    to: permalink.to_label || 'Unbekannt',
    date: permalink.email_date,
    snippet: permalink.snippet,
    body: permalink.body,
  }

  return json({
    data: {
      locked: false,
      subject: permalink.subject,
      from_label: permalink.from_label,
      email_date: permalink.email_date,
      expires_at: permalink.expires_at,
      has_pin: permalink.has_pin,
      snippet: permalink.snippet,
      thread: {
        root: message,
        messages: [message],
      },
    },
  })
}

async function handleRequest(request: Request) {
  const url = new URL(request.url)
  const path = url.pathname
  const parts = path.split('/').filter(Boolean)

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }

  if (path === '/api/health' && request.method === 'GET') {
    return json({ ok: true })
  }

  if (path === '/api/auth/request-otp' && request.method === 'POST') {
    const body = await readJson(request)
    await requestOtp(String(body.email ?? ''), typeof body.fullName === 'string' ? body.fullName : null)
    return json({ data: { success: true } })
  }

  if (path === '/api/auth/verify-otp' && request.method === 'POST') {
    const body = await readJson(request)
    const session = await verifyOtp(String(body.email ?? ''), String(body.otp ?? ''))
    return json({ data: session })
  }

  if (path === '/api/auth/session' && request.method === 'GET') {
    const token = getToken(request)

    if (!token) {
      return json({ error: 'Bearer-Token fehlt.' }, 401)
    }

    const user = await getSessionFromToken(token)

    if (!user) {
      return json({ error: 'Session ist abgelaufen.' }, 401)
    }

    return json({
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
    })
  }

  if (path === '/api/auth/logout' && request.method === 'POST') {
    const token = getToken(request)

    if (!token) {
      return json({ error: 'Bearer-Token fehlt.' }, 401)
    }

    await revokeSession(token)
    return json({ data: { success: true } })
  }

  if (parts[0] === 'api' && parts[1] === 'permalinks' && parts[2] && request.method === 'GET') {
    return handlePublicPermalink(decodeURIComponent(parts[2]), request)
  }

  const auth = await requireUserId(request)
  if (auth.error) return auth.error
  const userId = auth.userId

  if (path === '/api/profile' && request.method === 'GET') {
    const result = await queryOne(
      'select id, email, full_name, last_otp_at, created_at, updated_at from public.profiles where id = $1 limit 1',
      [userId],
    )

    return json({ data: result })
  }

  if (path === '/api/profile' && request.method === 'PUT') {
    const body = await readJson(request)
    const fullName = String(body.fullName ?? '').trim()

    if (!fullName) {
      return json({ error: 'fullName ist erforderlich.' }, 400)
    }

    const result = await queryOne(
      `insert into public.profiles (id, full_name)
       values ($1, $2)
       on conflict (id) do update set
         full_name = excluded.full_name,
         updated_at = now()
       returning id, email, full_name, last_otp_at, created_at, updated_at`,
      [userId, fullName],
    )

    return json({ data: result })
  }

  if (path === '/api/mailboxes' && request.method === 'GET') {
    const result = await queryRows(
      `select id, user_id, label, host, port, secure, username, folder, last_verified_at, created_at, updated_at
       from public.mailboxes
       where user_id = $1
       order by created_at desc`,
      [userId],
    )

    return json({ data: result })
  }

  if (path === '/api/mailboxes' && request.method === 'POST') {
    const body = await readJson(request)
    const label = String(body.label ?? '').trim()
    const host = String(body.host ?? '').trim()
    const username = String(body.username ?? '').trim()
    const password = String(body.password ?? '')
    const folder = String(body.folder ?? 'INBOX').trim() || 'INBOX'
    const port = Number(body.port ?? 993)
    const secure = typeof body.secure === 'boolean' ? body.secure : true

    if (!label || !host || !username || !password || Number.isNaN(port)) {
      return json({ error: 'Mailbox-Daten sind unvollstaendig.' }, 400)
    }

    const result = await queryOne(
      `insert into public.mailboxes (user_id, label, host, port, secure, username, encrypted_password, folder)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id, user_id, label, host, port, secure, username, folder, last_verified_at, created_at, updated_at`,
      [userId, label, host, port, secure, username, encryptSecret(password, serverEnv.cryptoSecret), folder],
    )

    return json({ data: result }, 201)
  }

  if (parts[0] === 'api' && parts[1] === 'imap-jobs' && parts[2] && request.method === 'GET') {
    const job = await loadImapJob(decodeURIComponent(parts[2]), userId)

    if (!job) {
      return json({ error: 'IMAP-Job nicht gefunden.' }, 404)
    }

    return json({ data: job })
  }

  if (parts[0] === 'api' && parts[1] === 'mailboxes' && parts[2]) {
    const mailboxId = decodeURIComponent(parts[2])

    if (parts.length === 3 && request.method === 'PUT') {
      const body = await readJson(request)
      const label = String(body.label ?? '').trim()
      const host = String(body.host ?? '').trim()
      const username = String(body.username ?? '').trim()
      const password = String(body.password ?? '').trim()
      const folder = String(body.folder ?? 'INBOX').trim() || 'INBOX'
      const port = Number(body.port ?? 993)
      const secure = typeof body.secure === 'boolean' ? body.secure : true

      if (!label || !host || !username || Number.isNaN(port)) {
        return json({ error: 'Mailbox-Daten sind unvollstaendig.' }, 400)
      }

      const result = await queryOne(
        password
          ? `update public.mailboxes
             set label = $3, host = $4, port = $5, secure = $6, username = $7,
               encrypted_password = $8, folder = $9, updated_at = now()
             where id = $1 and user_id = $2
             returning id, user_id, label, host, port, secure, username, folder, last_verified_at, created_at, updated_at`
          : `update public.mailboxes
             set label = $3, host = $4, port = $5, secure = $6, username = $7,
               folder = $8, updated_at = now()
             where id = $1 and user_id = $2
             returning id, user_id, label, host, port, secure, username, folder, last_verified_at, created_at, updated_at`,
        password
          ? [mailboxId, userId, label, host, port, secure, username, encryptSecret(password, serverEnv.cryptoSecret), folder]
          : [mailboxId, userId, label, host, port, secure, username, folder],
      )

      if (!result) {
        return json({ error: 'Mailbox nicht gefunden.' }, 404)
      }

      return json({ data: result })
    }

    if (parts.length === 3 && request.method === 'DELETE') {
      const result = await queryOne(
        `delete from public.mailboxes
         where id = $1 and user_id = $2
         returning id`,
        [mailboxId, userId],
      )

      if (!result) {
        return json({ error: 'Mailbox nicht gefunden.' }, 404)
      }

      return json({ data: { success: true } })
    }

    if (parts[3] === 'permalinks' && parts.length === 4 && request.method === 'GET') {
      const result = await queryRows(
        `select id, mailbox_id, thread_id, token, subject, from_label, email_date, snippet, has_pin, expires_at, created_at
         from public.permalinks
         where mailbox_id = $1 and user_id = $2
         order by created_at desc`,
        [mailboxId, userId],
      )

      return json({ data: result })
    }

    if (parts[3] === 'permalinks' && parts[4] && request.method === 'DELETE') {
      const result = await queryOne(
        `delete from public.permalinks
         where id = $1 and mailbox_id = $2 and user_id = $3
         returning id`,
        [decodeURIComponent(parts[4]), mailboxId, userId],
      )

      if (!result) {
        return json({ error: 'Permalink nicht gefunden.' }, 404)
      }

      return json({ data: { success: true } })
    }

    if (parts[3] === 'permalinks' && parts[4] && request.method === 'PUT') {
      const body = await readJson(request)
      const pin = String(body.pin ?? '').trim()
      const pinAction = body.pin === undefined || pin === '••••' ? 'keep' : pin ? 'set' : 'clear'
      const expiresAt = String(body.expiresAt ?? '').trim() || null

      if (pinAction === 'set' && !/^\d{4}$/.test(pin)) {
        return json({ error: 'PIN muss genau 4 Ziffern haben.' }, 400)
      }

      const result = await queryOne(
        `update public.permalinks
         set has_pin = case when $4 = 'set' then true when $4 = 'clear' then false else has_pin end,
           pin_hash = case when $4 = 'set' then $5 when $4 = 'clear' then null else pin_hash end,
           expires_at = $6
         where id = $1 and mailbox_id = $2 and user_id = $3
         returning id, mailbox_id, thread_id, token, subject, from_label, email_date, snippet, has_pin, expires_at, created_at`,
        [
          decodeURIComponent(parts[4]),
          mailboxId,
          userId,
          pinAction,
          pinAction === 'set' ? createHash('sha256').update(pin).digest('hex') : null,
          expiresAt ? new Date(expiresAt).toISOString() : null,
        ],
      )

      if (!result) {
        return json({ error: 'Permalink nicht gefunden.' }, 404)
      }

      return json({ data: result })
    }

    if (parts[3] === 'threads' && parts[4] === 'jobs' && request.method === 'POST') {
      const mailbox = await queryOne(
        `select id from public.mailboxes where id = $1 and user_id = $2 limit 1`,
        [mailboxId, userId],
      )

      if (!mailbox) {
        return json({ error: 'Mailbox nicht gefunden.' }, 404)
      }

      const job = await createImapJob({
        userId,
        mailboxId,
        type: 'load_threads',
        payload: { mailboxId },
      })

      await kickOffImapBackgroundJob(request, job.id)
      return json({ data: job }, 202)
    }

    if (parts[3] === 'permalink-jobs' && request.method === 'POST') {
      const body = await readJson(request)
      const threadId = String(body.threadId ?? '').trim()
      const subject = String(body.subject ?? '').trim()
      const from = String(body.from ?? '').trim()
      const date = String(body.date ?? '').trim()
      const snippet = String(body.snippet ?? '').trim()
      const pin = String(body.pin ?? '').trim()
      const expiresAt = String(body.expiresAt ?? '').trim() || null

      if (!threadId || !subject || !from || !date) {
        return json({ error: 'Permalink-Daten sind unvollstaendig.' }, 400)
      }

      if (pin && !/^\d{4}$/.test(pin)) {
        return json({ error: 'PIN muss genau 4 Ziffern haben.' }, 400)
      }

      const mailbox = await queryOne(
        `select id from public.mailboxes where id = $1 and user_id = $2 limit 1`,
        [mailboxId, userId],
      )

      if (!mailbox) {
        return json({ error: 'Mailbox nicht gefunden.' }, 404)
      }

      const job = await createImapJob({
        userId,
        mailboxId,
        type: 'create_permalink',
        payload: {
          mailboxId,
          threadId,
          subject,
          from,
          date,
          snippet,
          pin,
          expiresAt,
        },
      })

      await kickOffImapBackgroundJob(request, job.id)
      return json({ data: job }, 202)
    }
  }

  return json({ error: 'Not found' }, 404)
}

export default async (request: Request) => {
  try {
    return await handleRequest(request)
  } catch (error) {
    return errorResponse(error, 'Unbekannter Serverfehler')
  }
}

export const config = {
  path: '/api/*',
}
