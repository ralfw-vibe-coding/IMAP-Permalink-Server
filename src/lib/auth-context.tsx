import { useEffect, useState, type ReactNode } from 'react'
import { AuthContext } from './auth-context-definition'
import {
  ApiError,
  loadAuthSession,
  logoutAuthSession,
  requestLoginOtp,
  saveProfile,
  verifyLoginOtp,
} from './neon-api'
import type { AuthSessionRecord } from './types'

const storageKey = 'imap-permalink-auth-token'

function readStoredToken() {
  return window.localStorage.getItem(storageKey)
}

function storeToken(token: string) {
  window.localStorage.setItem(storageKey, token)
}

function clearStoredToken() {
  window.localStorage.removeItem(storageKey)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSessionRecord | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refreshSession = async () => {
    setIsLoading(true)

    const token = readStoredToken()

    if (!token) {
      setSession(null)
      setIsLoading(false)
      return
    }

    try {
      const data = await loadAuthSession(token)
      setSession(data)
      setError(null)
    } catch (sessionError) {
      if (sessionError instanceof ApiError && [401, 403].includes(sessionError.status)) {
        clearStoredToken()
      }
      setSession(null)
      setError(null)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void refreshSession()
  }, [])

  const getSessionToken = (sessionPayload: AuthSessionRecord | null) => {
    const token = sessionPayload?.session?.token

    if (!token) {
      throw new Error('Session-Token fehlt. Bitte erneut einloggen.')
    }

    return token
  }

  const ensureProfile = async (fullName?: string | null) => {
    const fallbackName =
      fullName?.trim() || session?.user?.name || session?.user?.email?.split('@')[0] || 'User'

    await saveProfile(fallbackName, getSessionToken(session))
  }

  const requestOtp = async ({ email, fullName }: { email: string; fullName?: string }) => {
    setIsLoading(true)
    setError(null)

    try {
      await requestLoginOtp({ email, fullName })
      return true
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Login-Code konnte nicht versendet werden.')
      return false
    } finally {
      setIsLoading(false)
    }
  }

  const verifyOtp = async ({ email, otp }: { email: string; otp: string }) => {
    setIsLoading(true)
    setError(null)

    try {
      const data = await verifyLoginOtp({ email, otp })
      storeToken(data.session.token)
      setSession(data)
      await saveProfile(data.user.name, data.session.token)
      return true
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : 'Login-Code konnte nicht verifiziert werden.')
      return false
    } finally {
      setIsLoading(false)
    }
  }

  const logout = async () => {
    setIsLoading(true)

    try {
      const token = readStoredToken()

      if (token) {
        await logoutAuthSession(token).catch(() => undefined)
      }

      clearStoredToken()
      setSession(null)
      setError(null)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthContext.Provider
      value={{
        isLoading,
        session,
        error,
        requestOtp,
        verifyOtp,
        logout,
        refreshSession,
        ensureProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
