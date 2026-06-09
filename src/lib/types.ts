export interface UserProfile {
  id: string
  email: string
  fullName: string
}

export interface AuthSessionRecord {
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

export interface ProfileRecord {
  id: string
  email: string
  full_name: string
  last_otp_at: string | null
  created_at: string
  updated_at: string
}

export interface MailboxRecord {
  id: string
  user_id?: string
  label: string
  host: string
  port: number
  secure: boolean
  username: string
  folder: string
  lastVerifiedAt?: string | null
  last_verified_at?: string | null
  created_at?: string
  updated_at?: string
}

export interface InboxThreadRecord {
  id: string
  subject: string
  from: string
  date: string
  snippet: string
  messageCount?: number
}

export interface PermalinkRecord {
  id: string
  mailbox_id: string
  thread_id: string
  token: string
  subject: string
  from_label: string
  email_date: string
  snippet: string
  has_pin: boolean
  expires_at: string | null
  created_at: string
}

export type ImapJobStatus = 'pending' | 'processing' | 'completed' | 'failed'
export type ImapJobType = 'load_threads' | 'create_permalink'

export interface ImapJobRecord<T = unknown> {
  id: string
  user_id: string
  mailbox_id: string | null
  type: ImapJobType
  status: ImapJobStatus
  payload: unknown
  result: T | null
  error: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface LoadThreadsJobResult {
  threads: InboxThreadRecord[]
}

export interface CreatePermalinkJobResult {
  permalink: PermalinkRecord
}

export interface PublicPermalinkRecord {
  locked: boolean
  subject: string
  from_label: string
  email_date: string
  expires_at: string | null
  has_pin?: boolean
  snippet?: string
  thread?: {
    root: {
      id: string
      subject: string
      from: string
      to: string
      date: string
      snippet: string
      body: string
    }
    messages: Array<{
      id: string
      subject: string
      from: string
      to: string
      date: string
      snippet: string
      body: string
    }>
  }
}

export interface AuthFormValues {
  email: string
  password: string
  fullName?: string
}

export interface MailboxFormValues {
  label: string
  host: string
  port: string
  username: string
  password: string
  folder: string
  secure: boolean
}
