export interface UserProfile {
  id: string
  email: string
  fullName: string
}

export interface ProfileRecord {
  id: string
  full_name: string
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
