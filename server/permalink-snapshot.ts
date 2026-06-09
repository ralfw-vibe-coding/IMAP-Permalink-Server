export interface PermalinkSnapshotMessage {
  id: string
  subject: string
  from: string
  to: string
  date: string
  snippet: string
  body: string
}

interface StoredThreadSnapshot {
  type: 'imap-permalink-thread-snapshot'
  version: 1
  messages: PermalinkSnapshotMessage[]
}

export function serializeThreadSnapshot(messages: PermalinkSnapshotMessage[]) {
  return JSON.stringify({
    type: 'imap-permalink-thread-snapshot',
    version: 1,
    messages,
  } satisfies StoredThreadSnapshot)
}

export function readThreadSnapshot(input: {
  threadId: string
  subject: string
  fromLabel: string
  toLabel: string
  emailDate: string
  snippet: string
  body: string
}) {
  try {
    const parsed = JSON.parse(input.body) as Partial<StoredThreadSnapshot>

    if (
      parsed.type === 'imap-permalink-thread-snapshot' &&
      parsed.version === 1 &&
      Array.isArray(parsed.messages) &&
      parsed.messages.length > 0
    ) {
      const messages = parsed.messages
        .filter((message): message is PermalinkSnapshotMessage => {
          return Boolean(
            message &&
              typeof message.id === 'string' &&
              typeof message.subject === 'string' &&
              typeof message.from === 'string' &&
              typeof message.to === 'string' &&
              typeof message.date === 'string' &&
              typeof message.snippet === 'string' &&
              typeof message.body === 'string',
          )
        })
        .sort((a, b) => (a.date > b.date ? 1 : -1))

      if (messages.length > 0) {
        return {
          root: messages[messages.length - 1],
          messages,
        }
      }
    }
  } catch {
    // Legacy permalinks stored a single plain-text body.
  }

  const message: PermalinkSnapshotMessage = {
    id: input.threadId,
    subject: input.subject,
    from: input.fromLabel,
    to: input.toLabel || 'Unbekannt',
    date: input.emailDate,
    snippet: input.snippet,
    body: input.body,
  }

  return {
    root: message,
    messages: [message],
  }
}
