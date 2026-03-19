import { ImapFlow } from 'imapflow'

export interface MailThreadListItem {
  id: string
  subject: string
  from: string
  date: string
  snippet: string
}

export interface MailThreadDetail {
  id: string
  subject: string
  from: string
  to: string
  date: string
  snippet: string
  body: string
}

interface LoadInboxThreadsInput {
  host: string
  port: number
  secure: boolean
  username: string
  password: string
  folder: string
  limit?: number
}

function htmlToSnippet(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeSnippet(text?: string, html?: string) {
  const source = text?.trim() || htmlToSnippet(html ?? '')
  return source.slice(0, 220)
}

function splitHeadersAndBody(source: string) {
  const match = source.match(/\r?\n\r?\n/)

  if (!match || match.index === undefined) {
    return { headerText: source, bodyText: '' }
  }

  const splitIndex = match.index
  return {
    headerText: source.slice(0, splitIndex),
    bodyText: source.slice(splitIndex + match[0].length),
  }
}

function parseHeaders(headerText: string) {
  const headers = new Map<string, string>()
  const lines = headerText.replace(/\r\n/g, '\n').split('\n')
  let currentName = ''
  let currentValue = ''

  for (const line of lines) {
    if (/^\s/.test(line) && currentName) {
      currentValue += ` ${line.trim()}`
      continue
    }

    if (currentName) {
      headers.set(currentName.toLowerCase(), currentValue.trim())
    }

    const separatorIndex = line.indexOf(':')
    if (separatorIndex === -1) {
      currentName = ''
      currentValue = ''
      continue
    }

    currentName = line.slice(0, separatorIndex)
    currentValue = line.slice(separatorIndex + 1).trim()
  }

  if (currentName) {
    headers.set(currentName.toLowerCase(), currentValue.trim())
  }

  return headers
}

function parseContentType(value: string | undefined) {
  const fallback = { mimeType: 'text/plain', params: new Map<string, string>() }
  if (!value) return fallback

  const [mimeType, ...parts] = value.split(';')
  const params = new Map<string, string>()

  for (const part of parts) {
    const [rawKey, rawValue] = part.split('=')
    if (!rawKey || !rawValue) continue
    params.set(rawKey.trim().toLowerCase(), rawValue.trim().replace(/^"|"$/g, ''))
  }

  return {
    mimeType: mimeType.trim().toLowerCase(),
    params,
  }
}

function decodeQuotedPrintable(value: string) {
  const normalized = value.replace(/=\r?\n/g, '')
  const bytes: number[] = []

  for (let index = 0; index < normalized.length; index += 1) {
    if (
      normalized[index] === '=' &&
      /[0-9A-Fa-f]{2}/.test(normalized.slice(index + 1, index + 3))
    ) {
      bytes.push(Number.parseInt(normalized.slice(index + 1, index + 3), 16))
      index += 2
      continue
    }

    bytes.push(normalized.charCodeAt(index))
  }

  return Buffer.from(bytes).toString('utf8')
}

function decodeBody(bodyText: string, transferEncoding: string | undefined) {
  const normalizedEncoding = transferEncoding?.toLowerCase() ?? ''

  if (normalizedEncoding.includes('base64')) {
    return Buffer.from(bodyText.replace(/\s+/g, ''), 'base64').toString('utf8')
  }

  if (normalizedEncoding.includes('quoted-printable')) {
    return decodeQuotedPrintable(bodyText)
  }

  return bodyText.replace(/\r\n/g, '\n')
}

function parseMimeBody(source: string): { text: string; html: string } {
  const { headerText, bodyText } = splitHeadersAndBody(source)
  const headers = parseHeaders(headerText)
  const contentType = parseContentType(headers.get('content-type'))
  const transferEncoding = headers.get('content-transfer-encoding')

  if (contentType.mimeType.startsWith('multipart/')) {
    const boundary = contentType.params.get('boundary')
    if (!boundary) {
      return { text: bodyText.trim(), html: '' }
    }

    const boundaryMarker = `--${boundary}`
    const sections = bodyText
      .split(boundaryMarker)
      .map((section) => section.trim())
      .filter((section) => section && section !== '--')

    let text = ''
    let html = ''

    for (const section of sections) {
      const cleanedSection = section.replace(/--$/, '').trim()
      const parsedPart = parseMimeBody(cleanedSection)

      if (!text && parsedPart.text) {
        text = parsedPart.text
      }

      if (!html && parsedPart.html) {
        html = parsedPart.html
      }
    }

    return { text, html }
  }

  const decodedBody = decodeBody(bodyText, transferEncoding).trim()

  if (contentType.mimeType === 'text/html') {
    return { text: '', html: decodedBody }
  }

  return { text: decodedBody, html: '' }
}

function formatAddressList(addresses: Array<{ name?: string | null; address?: string | null }> | null | undefined) {
  if (!addresses || addresses.length === 0) {
    return 'Unbekannt'
  }

  return addresses
    .map((entry) => entry.name || entry.address || 'Unbekannt')
    .join(', ')
}

export async function loadInboxThreads({
  host,
  port,
  secure,
  username,
  password,
  folder,
  limit = 20,
}: LoadInboxThreadsInput): Promise<MailThreadListItem[]> {
  const client = new ImapFlow({
    host,
    port,
    secure,
    auth: {
      user: username,
      pass: password,
    },
  })

  try {
    await client.connect()
    const mailboxLock = await client.getMailboxLock(folder)

    try {
      const existingMessages = client.mailbox ? client.mailbox.exists : 0
      const sequence = `${Math.max(existingMessages - limit + 1, 1)}:*`
      const messages: MailThreadListItem[] = []

      for await (const message of client.fetch(sequence, {
        uid: true,
        envelope: true,
        bodyStructure: true,
        source: true,
      })) {
        const source = message.source?.toString('utf8') ?? ''
        const { text, html } = parseMimeBody(source)

        messages.push({
          id: String(message.uid),
          subject: message.envelope?.subject || '(Ohne Betreff)',
          from: formatAddressList(message.envelope?.from),
          date: (message.envelope?.date || new Date()).toISOString(),
          snippet: normalizeSnippet(text, html),
        })
      }

      return messages.sort((a, b) => (a.date < b.date ? 1 : -1))
    } finally {
      mailboxLock.release()
    }
  } finally {
    await client.logout().catch(() => undefined)
  }
}

interface LoadThreadDetailInput extends LoadInboxThreadsInput {
  threadId: string
}

export async function loadThreadDetail({
  host,
  port,
  secure,
  username,
  password,
  folder,
  threadId,
}: LoadThreadDetailInput): Promise<MailThreadDetail> {
  const client = new ImapFlow({
    host,
    port,
    secure,
    auth: {
      user: username,
      pass: password,
    },
  })

  try {
    await client.connect()
    const mailboxLock = await client.getMailboxLock(folder)

    try {
      const message = await client.fetchOne(Number(threadId), {
        uid: true,
        envelope: true,
        source: true,
      }, { uid: true })

      if (!message) {
        throw new Error('Verlinkte Mail konnte im IMAP-Postfach nicht gefunden werden.')
      }

      const source = message.source?.toString('utf8') ?? ''
      const { text, html } = parseMimeBody(source)
      const body = text || htmlToSnippet(html)

      return {
        id: String(message.uid),
        subject: message.envelope?.subject || '(Ohne Betreff)',
        from: formatAddressList(message.envelope?.from),
        to: formatAddressList(message.envelope?.to),
        date: (message.envelope?.date || new Date()).toISOString(),
        snippet: normalizeSnippet(text, html),
        body,
      }

    } finally {
      mailboxLock.release()
    }
  } finally {
    await client.logout().catch(() => undefined)
  }
}
