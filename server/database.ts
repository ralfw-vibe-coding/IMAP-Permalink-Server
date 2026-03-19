import { NeonPostgrestClient, fetchWithToken } from '@neondatabase/postgrest-js'
import { serverEnv } from './env.js'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          full_name: string
        }
        Update: {
          full_name?: string
          updated_at?: string
        }
      }
      mailboxes: {
        Row: {
          id: string
          user_id: string
          label: string
          host: string
          port: number
          secure: boolean
          username: string
          encrypted_password: string
          folder: string
          last_verified_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          label: string
          host: string
          port: number
          secure: boolean
          username: string
          encrypted_password: string
          folder: string
          last_verified_at?: string | null
        }
        Update: {
          label?: string
          host?: string
          port?: number
          secure?: boolean
          username?: string
          encrypted_password?: string
          folder?: string
          last_verified_at?: string | null
          updated_at?: string
        }
      }
    }
  }
}

export function createDatabaseClient(token: string) {
  return new NeonPostgrestClient<Database>({
    dataApiUrl: serverEnv.neonDataApiUrl,
    options: {
      global: {
        fetch: fetchWithToken(async () => token),
      },
    },
  })
}
