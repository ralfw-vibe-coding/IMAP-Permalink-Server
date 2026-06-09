import { createHash, randomBytes } from 'node:crypto'
import { decryptSecret } from './crypto.js'
import { queryOne } from './database.js'
import { serverEnv } from './env.js'
import { loadInboxThreads, loadThreadDetail } from './imap.js'
import { serializeThreadSnapshot } from './permalink-snapshot.js'

export type ImapJobType = 'load_threads' | 'create_permalink'
export type ImapJobStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface ImapJobRecord {
  id: string
  user_id: string
  mailbox_id: string | null
  type: ImapJobType
  status: ImapJobStatus
  payload: unknown
  result: unknown
  error: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

interface MailboxSecretRecord {
  id: string
  host: string
  port: number
  secure: boolean
  username: string
  encrypted_password: string
  folder: string
}

interface LoadThreadsPayload {
  mailboxId: string
}

interface CreatePermalinkPayload {
  mailboxId: string
  threadId: string
  subject: string
  from: string
  date: string
  snippet: string
  pin: string
  expiresAt: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function readPayload<T extends Record<string, unknown>>(value: unknown): T {
  if (!isRecord(value)) {
    throw new Error('Job-Payload ist ungueltig.')
  }

  return value as T
}

export async function createImapJob(input: {
  userId: string
  mailboxId: string
  type: ImapJobType
  payload: Record<string, unknown>
}) {
  const job = await queryOne<ImapJobRecord>(
    `insert into public.imap_jobs (user_id, mailbox_id, type, payload)
     values ($1, $2, $3, $4::jsonb)
     returning id, user_id, mailbox_id, type, status, payload, result, error, created_at, updated_at, completed_at`,
    [input.userId, input.mailboxId, input.type, JSON.stringify(input.payload)],
  )

  if (!job) {
    throw new Error('IMAP-Job konnte nicht angelegt werden.')
  }

  return job
}

export function startImapJob(jobId: string) {
  void runImapJob(jobId).catch(() => undefined)
}

export async function loadImapJob(jobId: string, userId: string) {
  return queryOne<ImapJobRecord>(
    `select id, user_id, mailbox_id, type, status, payload, result, error, created_at, updated_at, completed_at
     from public.imap_jobs
     where id = $1 and user_id = $2
     limit 1`,
    [jobId, userId],
  )
}

async function loadMailbox(mailboxId: string, userId: string) {
  return queryOne<MailboxSecretRecord>(
    `select id, host, port, secure, username, encrypted_password, folder
     from public.mailboxes
     where id = $1 and user_id = $2
     limit 1`,
    [mailboxId, userId],
  )
}

async function markJobProcessing(jobId: string) {
  return queryOne<ImapJobRecord>(
    `update public.imap_jobs
     set status = 'processing', updated_at = now()
     where id = $1 and status = 'pending'
     returning id, user_id, mailbox_id, type, status, payload, result, error, created_at, updated_at, completed_at`,
    [jobId],
  )
}

async function markJobCompleted(jobId: string, result: unknown) {
  await queryOne(
    `update public.imap_jobs
     set status = 'completed', result = $2::jsonb, error = null, updated_at = now(), completed_at = now()
     where id = $1`,
    [jobId, JSON.stringify(result)],
  )
}

async function markJobFailed(jobId: string, error: unknown) {
  await queryOne(
    `update public.imap_jobs
     set status = 'failed', error = $2, updated_at = now(), completed_at = now()
     where id = $1`,
    [jobId, error instanceof Error ? error.message : 'IMAP-Job ist fehlgeschlagen.'],
  )
}

async function processLoadThreadsJob(job: ImapJobRecord) {
  const payload = readPayload<LoadThreadsPayload & Record<string, unknown>>(job.payload)
  const mailbox = await loadMailbox(payload.mailboxId, job.user_id)

  if (!mailbox) {
    throw new Error('Mailbox nicht gefunden.')
  }

  const threads = await loadInboxThreads({
    host: mailbox.host,
    port: mailbox.port,
    secure: mailbox.secure,
    username: mailbox.username,
    password: decryptSecret(mailbox.encrypted_password, serverEnv.cryptoSecret),
    folder: mailbox.folder,
  })

  return { threads }
}

async function processCreatePermalinkJob(job: ImapJobRecord) {
  const payload = readPayload<CreatePermalinkPayload & Record<string, unknown>>(job.payload)
  const mailbox = await loadMailbox(payload.mailboxId, job.user_id)

  if (!mailbox) {
    throw new Error('Mailbox nicht gefunden.')
  }

  const threadDetail = await loadThreadDetail({
    host: mailbox.host,
    port: mailbox.port,
    secure: mailbox.secure,
    username: mailbox.username,
    password: decryptSecret(mailbox.encrypted_password, serverEnv.cryptoSecret),
    folder: mailbox.folder,
    threadId: payload.threadId,
  })

  const snapshotMessage = threadDetail.root
  const snapshotBody = serializeThreadSnapshot(threadDetail.messages)
  const permalink = await queryOne(
    `insert into public.permalinks (
       user_id, mailbox_id, thread_id, token, subject, from_label, to_label, email_date, snippet, body, has_pin, pin_hash, expires_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     returning id, mailbox_id, thread_id, token, subject, from_label, email_date, snippet, has_pin, expires_at, created_at`,
    [
      job.user_id,
      payload.mailboxId,
      payload.threadId,
      randomBytes(16).toString('hex'),
      snapshotMessage.subject || payload.subject,
      snapshotMessage.from || payload.from,
      snapshotMessage.to || '',
      new Date(snapshotMessage.date || payload.date).toISOString(),
      snapshotMessage.snippet || payload.snippet,
      snapshotBody,
      Boolean(payload.pin),
      payload.pin ? createHash('sha256').update(payload.pin).digest('hex') : null,
      payload.expiresAt ? new Date(payload.expiresAt).toISOString() : null,
    ],
  )

  return { permalink }
}

export async function runImapJob(jobId: string) {
  const job = await markJobProcessing(jobId)

  if (!job) {
    return
  }

  try {
    const result =
      job.type === 'load_threads'
        ? await processLoadThreadsJob(job)
        : await processCreatePermalinkJob(job)

    await markJobCompleted(job.id, result)
  } catch (error) {
    await markJobFailed(job.id, error)
  }
}
