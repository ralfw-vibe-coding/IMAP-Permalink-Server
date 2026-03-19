import { ImapFlow } from 'imapflow'

export interface MailThreadListItem {
  id: string
  subject: string
  from: string
  date: string
  snippet: string
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
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeSnippet(text?: string, html?: string) {
  const source = text?.trim() || htmlToSnippet(html ?? '')
  return source.slice(0, 220)
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
        const from = message.envelope?.from?.[0]
        const fromDisplay =
          from?.name ||
          from?.address ||
          'Unbekannter Absender'

        const textMatch = source.match(/\n\n([\s\S]*)$/)
        const body = textMatch?.[1] ?? ''

        messages.push({
          id: String(message.uid),
          subject: message.envelope?.subject || '(Ohne Betreff)',
          from: fromDisplay,
          date: (message.envelope?.date || new Date()).toISOString(),
          snippet: normalizeSnippet(body),
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
