import { createContext } from 'react'
import type { getNeonAuth } from './neon-auth'

type SessionPayload = Awaited<ReturnType<ReturnType<typeof getNeonAuth>['getSession']>>['data']

export interface AuthContextValue {
  isLoading: boolean
  session: SessionPayload | null
  error: string | null
  login: (params: { email: string; password: string }) => Promise<boolean>
  signup: (params: {
    email: string
    password: string
    name: string
  }) => Promise<{ ok: boolean; needsLogin?: boolean }>
  logout: () => Promise<void>
  refreshSession: () => Promise<void>
  ensureProfile: (fullName?: string | null) => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
