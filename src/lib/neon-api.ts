import type {
  InboxThreadRecord,
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
