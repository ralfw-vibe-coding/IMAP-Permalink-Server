import type { InboxThreadRecord, MailboxRecord, ProfileRecord } from './types'

const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:8787' : '')

function getAuthHeaders(token: string | null | undefined) {
  if (!token) {
    throw new Error('Kein Session-Token verfuegbar. Bitte erneut einloggen.')
  }

  return {
    'content-type': 'application/json',
    authorization: `Bearer ${token}`,
  }
}

async function apiFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const headers = getAuthHeaders(token)
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...headers,
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

export function loadMailboxThreads(mailboxId: string, token: string) {
  return apiFetch<InboxThreadRecord[]>(`/api/mailboxes/${mailboxId}/threads`, token)
}
