import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { queryOne } from './database.js'
import { serverEnv } from './env.js'

const otpTtlMinutes = 10
const sessionTtlDays = 28
const maxOtpAttempts = 5

export interface AuthSession {
  session: {
    token: string
    expires_at: string
  }
  user: {
    id: string
    email: string
    name: string
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function hashValue(value: string) {
  return createHmac('sha256', serverEnv.authSessionSecret).update(value).digest('hex')
}

function createOtp() {
  return String(randomBytes(4).readUInt32BE() % 1_000_000).padStart(6, '0')
}

function constantTimeEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return timingSafeEqual(leftBuffer, rightBuffer)
}

function isSecretOtp(otp: string) {
  if (!serverEnv.authSecretOtp) {
    return false
  }

  return constantTimeEquals(otp, serverEnv.authSecretOtp)
}

async function sendOtpEmail(email: string, otp: string) {
  if (!serverEnv.resendApiKey || !serverEnv.authFromEmail) {
    throw new Error('RESEND_API_KEY und AUTH_FROM_EMAIL muessen fuer OTP-Versand gesetzt sein.')
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${serverEnv.resendApiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: serverEnv.authFromEmail,
      to: email,
      subject: 'Dein Login-Code',
      text: `Dein Login-Code lautet: ${otp}\n\nDer Code ist ${otpTtlMinutes} Minuten gueltig.`,
    }),
  })

  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(message || 'OTP-Email konnte nicht versendet werden.')
  }
}

export async function requestOtp(emailInput: string, fullNameInput?: string | null) {
  const email = normalizeEmail(emailInput)
  const fullName = fullNameInput?.trim() || email.split('@')[0] || 'User'

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Bitte eine gueltige E-Mail-Adresse eingeben.')
  }

  const otp = createOtp()

  await queryOne(
    `insert into public.auth_otps (email, full_name, otp_hash, expires_at)
     values ($1, $2, $3, now() + ($4 || ' minutes')::interval)`,
    [email, fullName, hashValue(otp), otpTtlMinutes],
  )

  await sendOtpEmail(email, otp)
}

async function createSessionForEmail(email: string, fullNameInput?: string | null): Promise<AuthSession> {
  const fullName = fullNameInput?.trim() || email.split('@')[0] || 'User'
  const user = await queryOne<{
    id: string
    email: string
    full_name: string
  }>(
    `insert into public.auth_users (email, full_name)
     values ($1, $2)
     on conflict (email) do update set
       full_name = coalesce(nullif(excluded.full_name, ''), public.auth_users.full_name),
       updated_at = now()
     returning id::text, email, full_name`,
    [email, fullName],
  )

  if (!user) {
    throw new Error('Benutzer konnte nicht angelegt werden.')
  }

  await queryOne(
    `insert into public.profiles (id, email, full_name, last_otp_at)
     values ($1, $2, $3, now())
     on conflict (id) do update set
       email = excluded.email,
       full_name = excluded.full_name,
       last_otp_at = now(),
       updated_at = now()`,
    [user.id, user.email, user.full_name],
  )

  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + sessionTtlDays * 24 * 60 * 60 * 1000).toISOString()
  await queryOne(
    `insert into public.auth_sessions (user_id, token_hash, expires_at)
     values ($1, $2, $3)`,
    [user.id, hashValue(token), expiresAt],
  )

  return {
    session: {
      token,
      expires_at: expiresAt,
    },
    user: {
      id: user.id,
      email: user.email,
      name: user.full_name,
    },
  }
}

export async function verifyOtp(emailInput: string, otpInput: string): Promise<AuthSession> {
  const email = normalizeEmail(emailInput)
  const otp = otpInput.trim()

  if (isSecretOtp(otp)) {
    return createSessionForEmail(email)
  }

  if (!/^\d{6}$/.test(otp)) {
    throw new Error('Der Code muss 6 Ziffern haben oder dem geheimen OTP entsprechen.')
  }

  const otpRecord = await queryOne<{
    id: string
    full_name: string | null
    otp_hash: string
    attempts: number
    expires_at: string
    consumed_at: string | null
  }>(
    `select id, full_name, otp_hash, attempts, expires_at, consumed_at
     from public.auth_otps
     where email = $1 and consumed_at is null
     order by created_at desc
     limit 1`,
    [email],
  )

  if (!otpRecord || new Date(otpRecord.expires_at) <= new Date()) {
    throw new Error('Der Code ist ungueltig oder abgelaufen.')
  }

  if (otpRecord.attempts >= maxOtpAttempts) {
    throw new Error('Zu viele Versuche. Bitte einen neuen Code anfordern.')
  }

  const matches = constantTimeEquals(hashValue(otp), otpRecord.otp_hash)

  if (!matches) {
    await queryOne('update public.auth_otps set attempts = attempts + 1 where id = $1', [otpRecord.id])
    throw new Error('Der Code ist ungueltig oder abgelaufen.')
  }

  await queryOne('update public.auth_otps set consumed_at = now() where id = $1', [otpRecord.id])

  return createSessionForEmail(email, otpRecord.full_name)
}

export function getBearerToken(request: FastifyRequest, reply: FastifyReply) {
  const authorization = request.headers.authorization

  if (!authorization?.startsWith('Bearer ')) {
    void reply.code(401).send({ error: 'Bearer-Token fehlt.' })
    return null
  }

  return authorization.slice('Bearer '.length)
}

export async function getAuthenticatedUserId(token: string) {
  const session = await queryOne<{ user_id: string }>(
    `select user_id
     from public.auth_sessions
     where token_hash = $1 and revoked_at is null and expires_at > now()
     limit 1`,
    [hashValue(token)],
  )

  return session?.user_id ?? null
}

export async function getSessionFromToken(token: string) {
  return queryOne<AuthSession['user'] & { expires_at: string }>(
    `select u.id::text, u.email, u.full_name as name, s.expires_at
     from public.auth_sessions s
     join public.auth_users u on u.id::text = s.user_id
     where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now()
     limit 1`,
    [hashValue(token)],
  )
}

export async function revokeSession(token: string) {
  await queryOne(
    `update public.auth_sessions
     set revoked_at = now()
     where token_hash = $1 and revoked_at is null`,
    [hashValue(token)],
  )
}
