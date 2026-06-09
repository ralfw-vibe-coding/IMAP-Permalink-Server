import type {
  InboxThreadRecord,
  AuthSessionRecord,
  CreatePermalinkJobResult,
  ImapJobRecord,
  LoadThreadsJobResult,
  MailboxRecord,
  PermalinkRecord,
  ProfileRecord,
  PublicPermalinkRecord,
} from './types'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || ''

function getAuthHeaders(token: string | null | undefined) {
  if (!token) {
    throw new Error('Kein Session-Token verfuegbar. Bitte erneut einloggen.')
  }

  return {
    authorization: `Bearer ${token}`,
  }
}

async function apiFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const headers = getAuthHeaders(token)
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  })

  const rawText = await response.text()
  const payload = (
    rawText
      ? (() => {
          try {
            return JSON.parse(rawText)
          } catch {
            return {}
          }
        })()
      : {}
  ) as {
    data?: T
    error?: string
  }

  if (!response.ok) {
    throw new Error(payload.error || rawText || `API-Fehler bei ${path}`)
  }

  return payload.data as T
}

export function loadProfile(token: string) {
  return apiFetch<ProfileRecord | null>('/api/profile', token)
}

export async function requestLoginOtp(input: { email: string; fullName?: string }) {
  const response = await fetch(`${apiBaseUrl}/api/auth/request-otp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  const payload = (await response.json().catch(() => ({}))) as { error?: string }

  if (!response.ok) {
    throw new Error(payload.error || 'Login-Code konnte nicht versendet werden.')
  }
}

export async function verifyLoginOtp(input: { email: string; otp: string }) {
  const response = await fetch(`${apiBaseUrl}/api/auth/verify-otp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  const payload = (await response.json().catch(() => ({}))) as {
    data?: AuthSessionRecord
    error?: string
  }

  if (!response.ok || !payload.data) {
    throw new Error(payload.error || 'Login-Code konnte nicht verifiziert werden.')
  }

  return payload.data
}

export function loadAuthSession(token: string) {
  return apiFetch<AuthSessionRecord>('/api/auth/session', token)
}

export function logoutAuthSession(token: string) {
  return apiFetch<{ success: true }>('/api/auth/logout', token, { method: 'POST' })
}

export function saveProfile(fullName: string, token: string) {
  return apiFetch<ProfileRecord>('/api/profile', token, {
    method: 'PUT',
    body: JSON.stringify({ fullName }),
  })
}

export function loadMailboxes(token: string) {
  return apiFetch<MailboxRecord[]>('/api/mailboxes', token)
}

export function createMailbox(input: {
  label: string
  host: string
  port: number
  username: string
  password: string
  folder: string
  secure: boolean
}, token: string) {
  return apiFetch<MailboxRecord>('/api/mailboxes', token, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateMailbox(mailboxId: string, input: {
  label: string
  host: string
  port: number
  username: string
  password?: string
  folder: string
  secure: boolean
}, token: string) {
  return apiFetch<MailboxRecord>(`/api/mailboxes/${mailboxId}`, token, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function deleteMailbox(mailboxId: string, token: string) {
  return apiFetch<{ success: true }>(`/api/mailboxes/${mailboxId}`, token, {
    method: 'DELETE',
  })
}

export function loadMailboxThreads(mailboxId: string, token: string) {
  return apiFetch<InboxThreadRecord[]>(`/api/mailboxes/${mailboxId}/threads`, token)
}

export function startLoadMailboxThreadsJob(mailboxId: string, token: string) {
  return apiFetch<ImapJobRecord<LoadThreadsJobResult>>(
    `/api/mailboxes/${mailboxId}/threads/jobs`,
    token,
    { method: 'POST' },
  )
}

export function loadMailboxPermalinks(mailboxId: string, token: string) {
  return apiFetch<PermalinkRecord[]>(`/api/mailboxes/${mailboxId}/permalinks`, token)
}

export function createPermalink(
  mailboxId: string,
  input: {
    threadId: string
    subject: string
    from: string
    date: string
    snippet: string
    pin?: string
    expiresAt?: string | null
  },
  token: string,
) {
  return apiFetch<PermalinkRecord>(`/api/mailboxes/${mailboxId}/permalinks`, token, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function startCreatePermalinkJob(
  mailboxId: string,
  input: {
    threadId: string
    subject: string
    from: string
    date: string
    snippet: string
    pin?: string
    expiresAt?: string | null
  },
  token: string,
) {
  return apiFetch<ImapJobRecord<CreatePermalinkJobResult>>(
    `/api/mailboxes/${mailboxId}/permalink-jobs`,
    token,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  )
}

export function loadImapJob<T>(jobId: string, token: string) {
  return apiFetch<ImapJobRecord<T>>(`/api/imap-jobs/${jobId}`, token)
}

export function deletePermalink(mailboxId: string, permalinkId: string, token: string) {
  return apiFetch<{ success: true }>(`/api/mailboxes/${mailboxId}/permalinks/${permalinkId}`, token, {
    method: 'DELETE',
  })
}

export function updatePermalink(
  mailboxId: string,
  permalinkId: string,
  input: {
    pin?: string
    expiresAt?: string | null
  },
  token: string,
) {
  return apiFetch<PermalinkRecord>(`/api/mailboxes/${mailboxId}/permalinks/${permalinkId}`, token, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export async function loadPublicPermalink(token: string, pin?: string) {
  const query = pin ? `?pin=${encodeURIComponent(pin)}` : ''
  const response = await fetch(`${apiBaseUrl}/api/permalinks/${token}${query}`)
  const rawText = await response.text()
  const payload = (
    rawText
      ? (() => {
          try {
            return JSON.parse(rawText)
          } catch {
            return {}
          }
        })()
      : {}
  ) as { data?: PublicPermalinkRecord; error?: string }

  if (!response.ok) {
    throw new Error(payload.error || rawText || 'Permalink konnte nicht geladen werden.')
  }

  return payload.data as PublicPermalinkRecord
}
