import { ImapFlow } from 'imapflow'

export interface MailThreadListItem {
  id: string
  subject: string
  from: string
  date: string
  snippet: string
  messageCount: number
  folders: string[]
  messages: MailThreadListMessage[]
}

export interface MailThreadListMessage {
  id: string
  folder: string
  subject: string
  from: string
  to: string
  date: string
  snippet: string
}

export interface MailFolderListItem {
  path: string
  name: string
  specialUse: string | null
  isStandard: boolean
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
  folders?: string[]
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

function encodeThreadId(messages: Array<{ folder: string; uid: number }>) {
  return `thread:${messages
    .sort((a, b) => a.folder.localeCompare(b.folder) || a.uid - b.uid)
    .map((entry) => `${encodeURIComponent(entry.folder)}:${entry.uid}`)
    .join(',')}`
}

function decodeThreadId(threadId: string, fallbackFolder: string) {
  if (!threadId.startsWith('thread:')) {
    return [Number(threadId)]
      .filter((uid) => Number.isFinite(uid))
      .map((uid) => ({ folder: fallbackFolder, uid }))
  }

  return threadId
    .slice('thread:'.length)
    .split(',')
    .map((entry) => {
      const separatorIndex = entry.lastIndexOf(':')

      if (separatorIndex === -1) {
        const uid = Number(entry)
        return Number.isFinite(uid) ? { folder: fallbackFolder, uid } : null
      }

      const folder = decodeURIComponent(entry.slice(0, separatorIndex))
      const uid = Number(entry.slice(separatorIndex + 1))
      return folder && Number.isFinite(uid) ? { folder, uid } : null
    })
    .filter((entry): entry is { folder: string; uid: number } => Boolean(entry))
}

interface ParsedInboxMessage extends MailThreadMessage {
  folder: string
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

const standardSpecialUses = new Set(['\\Inbox', '\\Sent', '\\Drafts', '\\Trash', '\\Junk', '\\Archive'])
const standardFolderNames = new Set([
  'inbox',
  'sent',
  'sent messages',
  'sent mail',
  'drafts',
  'trash',
  'deleted messages',
  'junk',
  'spam',
  'archive',
  'all mail',
])

function isStandardFolder(folder: { path: string; name: string; specialUse?: string | null }) {
  return Boolean(folder.specialUse && standardSpecialUses.has(folder.specialUse)) ||
    standardFolderNames.has(folder.path.toLowerCase()) ||
    standardFolderNames.has(folder.name.toLowerCase())
}

function uniqueFolders(folders: string[]) {
  const seen = new Set<string>()

  return folders
    .map((folder) => folder.trim())
    .filter((folder) => {
      const key = folder.toLowerCase()

      if (!folder || seen.has(key)) {
        return false
      }

      seen.add(key)
      return true
    })
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

export async function listMailboxFolders({
  host,
  port,
  secure,
  username,
  password,
  folder,
}: LoadInboxThreadsInput): Promise<MailFolderListItem[]> {
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
    const folders = await client.list()
    const hasConfiguredFolder = folders.some((entry) => entry.path.toLowerCase() === folder.toLowerCase())
    const mappedFolders = folders
      .filter((entry) => !entry.flags.has('\\Noselect'))
      .map((entry) => ({
        path: entry.path,
        name: entry.name || entry.path,
        specialUse: entry.specialUse ?? null,
        isStandard: isStandardFolder(entry),
      }))

    if (!hasConfiguredFolder) {
      mappedFolders.push({
        path: folder,
        name: folder,
        specialUse: folder.toLowerCase() === 'inbox' ? '\\Inbox' : null,
        isStandard: isStandardFolder({ path: folder, name: folder, specialUse: null }),
      })
    }

    return mappedFolders.sort((a, b) => {
      if (a.path.toLowerCase() === 'inbox') return -1
      if (b.path.toLowerCase() === 'inbox') return 1
      if (a.isStandard !== b.isStandard) return a.isStandard ? -1 : 1
      return a.path.localeCompare(b.path)
    })
  } finally {
    await client.logout().catch(() => undefined)
  }
}

export async function loadInboxThreads({
  host,
  port,
  secure,
  username,
  password,
  folder,
  folders,
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
    const messages: ParsedInboxMessage[] = []
    const targetFolders = uniqueFolders(folders && folders.length > 0 ? folders : [folder])

    for (const targetFolder of targetFolders) {
      const mailboxLock = await client.getMailboxLock(targetFolder)

      try {
      const existingMessages = client.mailbox ? client.mailbox.exists : 0

      if (existingMessages === 0) {
        continue
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
          id: `${targetFolder}:${uid}`,
          folder: targetFolder,
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
      } finally {
        mailboxLock.release()
      }
    }

    return groupMessagesIntoThreads(messages)
      .map((group) => {
        const latestMessage = group.messages[group.messages.length - 1]
        const foldersInThread = uniqueFolders(group.messages.map((message) => message.folder))

        return {
          id: encodeThreadId(group.messages.map((message) => ({ folder: message.folder, uid: message.uid }))),
          subject: latestMessage.subject,
          from: latestMessage.from,
          date: latestMessage.date,
          snippet: latestMessage.snippet,
          messageCount: group.messages.length,
          folders: foldersInThread,
          messages: group.messages.map((message) => ({
            id: message.id,
            folder: message.folder,
            subject: message.subject,
            from: message.from,
            to: message.to,
            date: message.date,
            snippet: message.snippet,
          })),
        }
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1))
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
    const messages: MailThreadMessage[] = []

    for (const { folder: messageFolder, uid } of decodeThreadId(threadId, folder)) {
      const mailboxLock = await client.getMailboxLock(messageFolder)

      try {
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
          id: `${messageFolder}:${message.uid}`,
          subject,
          from: formatAddressList(message.envelope?.from),
          to: formatAddressList(message.envelope?.to),
          date: (message.envelope?.date || new Date()).toISOString(),
          snippet: normalizeSnippet(body, html),
          body,
        })
      } finally {
        mailboxLock.release()
      }
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
    await client.logout().catch(() => undefined)
  }
}
