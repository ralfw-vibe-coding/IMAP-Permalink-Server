import { createContext } from 'react'
import type { AuthSessionRecord } from './types'

export interface AuthContextValue {
  isLoading: boolean
  session: AuthSessionRecord | null
  error: string | null
  requestOtp: (params: { email: string; fullName?: string }) => Promise<boolean>
  verifyOtp: (params: { email: string; otp: string }) => Promise<boolean>
  logout: () => Promise<void>
  refreshSession: () => Promise<void>
  ensureProfile: (fullName?: string | null) => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
