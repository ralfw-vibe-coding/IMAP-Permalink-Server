import { ImapFlow } from 'imapflow'

export interface MailThreadListItem {
  id: string
  subject: string
  from: string
  date: string
  snippet: string
  messageCount: number
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

export interface MailThreadMessage {
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

function htmlToText(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
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
    .map((entry) => {
      const name = entry.name?.trim()
      const address = entry.address?.trim()

      if (name && address) {
        return `${name} <${address}>`
      }

      return name || address || 'Unbekannt'
    })
    .join(', ')
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, codePoint) => {
      const parsed = Number.parseInt(codePoint, 10)
      return Number.isNaN(parsed) ? _ : String.fromCodePoint(parsed)
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, codePoint) => {
      const parsed = Number.parseInt(codePoint, 16)
      return Number.isNaN(parsed) ? _ : String.fromCodePoint(parsed)
    })
}

function normalizeForComparison(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeSubject(value: string) {
  return normalizeForComparison(value.replace(/^\s*((re|aw|fw|fwd):\s*)+/i, ''))
}

function extractMessageIds(value: string | undefined) {
  if (!value) return []

  const bracketedIds = value.match(/<[^>]+>/g) ?? []

  if (bracketedIds.length > 0) {
    return bracketedIds.map((entry) => entry.toLowerCase())
  }

  return value
    .split(/\s+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
}

function parseTopLevelHeaders(source: string) {
  return parseHeaders(splitHeadersAndBody(source).headerText)
}

function encodeThreadId(uids: number[]) {
  return `thread:${uids.sort((a, b) => a - b).join(',')}`
}

function decodeThreadId(threadId: string) {
  if (!threadId.startsWith('thread:')) {
    return [Number(threadId)].filter((uid) => Number.isFinite(uid))
  }

  return threadId
    .slice('thread:'.length)
    .split(',')
    .map((entry) => Number(entry))
    .filter((uid) => Number.isFinite(uid))
}

interface ParsedInboxMessage extends MailThreadMessage {
  uid: number
  messageId: string | null
  inReplyToIds: string[]
  referenceIds: string[]
  subjectKey: string
}

interface ThreadGroup {
  messages: ParsedInboxMessage[]
  keys: Set<string>
}

function groupMessagesIntoThreads(messages: ParsedInboxMessage[]) {
  const groups: ThreadGroup[] = []

  for (const message of messages.sort((a, b) => (a.date > b.date ? 1 : -1))) {
    const headerKeys = [
      message.messageId,
      ...message.inReplyToIds,
      ...message.referenceIds,
    ].filter((key): key is string => Boolean(key))
    const groupKeys = headerKeys.length > 0 ? headerKeys : [`subject:${message.subjectKey}`]
    const matchingGroups = groups.filter((group) => groupKeys.some((key) => group.keys.has(key)))

    if (matchingGroups.length === 0) {
      groups.push({
        messages: [message],
        keys: new Set(groupKeys),
      })
      continue
    }

    const [targetGroup, ...groupsToMerge] = matchingGroups
    targetGroup.messages.push(message)
    groupKeys.forEach((key) => targetGroup.keys.add(key))

    for (const group of groupsToMerge) {
      group.messages.forEach((entry) => targetGroup.messages.push(entry))
      group.keys.forEach((key) => targetGroup.keys.add(key))
      groups.splice(groups.indexOf(group), 1)
    }
  }

  return groups.map((group) => ({
    ...group,
    messages: group.messages.sort((a, b) => (a.date > b.date ? 1 : -1)),
  }))
}

function cleanBodyText(value: string, subject?: string) {
  return postProcessBodyText(
    value
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/\u2060/g, '')
    .trim(),
    subject,
  )
}

function postProcessBodyText(value: string, subject?: string) {
  const normalizedSubject = subject ? normalizeForComparison(subject) : ''
  const lines = decodeHtmlEntities(value)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(bild anzeigen|view in browser|open in browser|caption:)/i.test(line))
    .filter((line) => !/^<?https?:\/\/\S{80,}>?$/i.test(line))
    .filter((line) => !/^https?:\/\/\S{120,}$/i.test(line))
    .filter((line) => !/^<https?:\/\/\S+>$/i.test(line))
    .filter((line) => (line.match(/&#\d+;/g)?.length ?? 0) < 3)
    .filter((line) => {
      if (!normalizedSubject) return true
      return !normalizeForComparison(line).startsWith(normalizedSubject)
    })

  return lines.join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
}

export async function loadInboxThreads({
  host,
  port,
  secure,
  username,
  password,
  folder,
  limit = 100,
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
      const messages: ParsedInboxMessage[] = []

      if (existingMessages === 0) {
        return []
      }

      const sequence = `${Math.max(existingMessages - limit + 1, 1)}:*`

      for await (const message of client.fetch(sequence, {
        uid: true,
        envelope: true,
        bodyStructure: true,
        source: true,
      })) {
        const source = message.source?.toString('utf8') ?? ''
        const headers = parseTopLevelHeaders(source)
        const { text, html } = parseMimeBody(source)
        const subject = message.envelope?.subject || '(Ohne Betreff)'
        const cleanedText = cleanBodyText(
          html ? htmlToText(html) : text,
          subject,
        )
        const uid = Number(message.uid)

        messages.push({
          id: String(uid),
          uid,
          subject,
          from: formatAddressList(message.envelope?.from),
          to: formatAddressList(message.envelope?.to),
          date: (message.envelope?.date || new Date()).toISOString(),
          snippet: normalizeSnippet(cleanedText, html),
          body: cleanedText,
          messageId: extractMessageIds(headers.get('message-id'))[0] ?? null,
          inReplyToIds: extractMessageIds(headers.get('in-reply-to')),
          referenceIds: extractMessageIds(headers.get('references')),
          subjectKey: normalizeSubject(subject),
        })
      }

      return groupMessagesIntoThreads(messages)
        .map((group) => {
          const latestMessage = group.messages[group.messages.length - 1]

          return {
            id: encodeThreadId(group.messages.map((message) => message.uid)),
            subject: latestMessage.subject,
            from: latestMessage.from,
            date: latestMessage.date,
            snippet: latestMessage.snippet,
            messageCount: group.messages.length,
          }
        })
        .sort((a, b) => (a.date < b.date ? 1 : -1))
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
}: LoadThreadDetailInput): Promise<{ root: MailThreadDetail; messages: MailThreadMessage[] }> {
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
      const messages: MailThreadMessage[] = []

      for (const uid of decodeThreadId(threadId)) {
        const message = await client.fetchOne(
          uid,
          {
            uid: true,
            envelope: true,
            source: true,
          },
          { uid: true },
        )

        if (!message) {
          continue
        }

        const source = message.source?.toString('utf8') ?? ''
        const { text, html } = parseMimeBody(source)
        const subject = message.envelope?.subject || '(Ohne Betreff)'
        const body = cleanBodyText(html ? htmlToText(html) : text, subject)

        messages.push({
          id: String(message.uid),
          subject,
          from: formatAddressList(message.envelope?.from),
          to: formatAddressList(message.envelope?.to),
          date: (message.envelope?.date || new Date()).toISOString(),
          snippet: normalizeSnippet(body, html),
          body,
        })
      }

      if (messages.length === 0) {
        throw new Error('Verlinkte Mail konnte im IMAP-Postfach nicht gefunden werden.')
      }

      messages.sort((a, b) => (a.date > b.date ? 1 : -1))
      const root = messages[messages.length - 1]

      return {
        root,
        messages,
      }
    } finally {
      mailboxLock.release()
    }
  } finally {
    await client.logout().catch(() => undefined)
  }
}
