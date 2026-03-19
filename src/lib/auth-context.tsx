import { useEffect, useState, type ReactNode } from 'react'
import { AuthContext } from './auth-context-definition'
import { saveProfile } from './neon-api'
import { getNeonAuth } from './neon-auth'
type SessionPayload = Awaited<ReturnType<ReturnType<typeof getNeonAuth>['getSession']>>['data']

function getBetterAuthClient() {
  return getNeonAuth() as unknown as {
    getSession: typeof getNeonAuth extends () => infer T
      ? T extends { getSession: infer G }
        ? G
        : never
      : never
    signIn: {
      email: (input: { email: string; password: string }) => Promise<{
        data?: SessionPayload | null
        error?: { message?: string | null } | null
      }>
    }
    signUp: {
      email: (input: { email: string; password: string; name: string }) => Promise<{
        data?: SessionPayload | null
        error?: { message?: string | null } | null
      }>
    }
    signOut: () => Promise<unknown>
  }
}

async function loadSession() {
  const result = await getBetterAuthClient().getSession()

  if (result.error) {
    throw new Error(result.error.message || 'Session konnte nicht geladen werden.')
  }

  return result.data ?? null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionPayload | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refreshSession = async () => {
    setIsLoading(true)

    try {
      const data = await loadSession()
      setSession(data)
      setError(null)
    } catch (sessionError) {
      setSession(null)
      setError(
        sessionError instanceof Error ? sessionError.message : 'Session konnte nicht geladen werden.',
      )
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void refreshSession()
  }, [])

  const getSessionToken = (sessionPayload: SessionPayload | null) => {
    const token = sessionPayload?.session?.token

    if (!token) {
      throw new Error('Session-Token fehlt. Bitte erneut einloggen.')
    }

    return token
  }

  const ensureProfile = async (fullName?: string | null) => {
    const fallbackName =
      fullName?.trim() || session?.user?.name || session?.user?.email?.split('@')[0] || 'Neon User'

    await saveProfile(fallbackName, getSessionToken(session))
  }

  const login = async ({ email, password }: { email: string; password: string }) => {
    setIsLoading(true)

    try {
      const result = await getBetterAuthClient().signIn.email({
        email,
        password,
      })

      if (result.error) {
        setError(result.error.message || 'Login fehlgeschlagen.')
        return false
      }

      setSession(result.data ?? null)
      setError(null)
      await saveProfile(
        result.data?.user?.name || email.split('@')[0] || 'Neon User',
        getSessionToken(result.data ?? null),
      )
      return true
    } finally {
      setIsLoading(false)
    }
  }

  const signup = async ({
    email,
    password,
    name,
  }: {
    email: string
    password: string
    name: string
  }) => {
    setIsLoading(true)

    try {
      const result = await getBetterAuthClient().signUp.email({
        email,
        password,
        name,
      })

      if (result.error) {
        setError(result.error.message || 'Registrierung fehlgeschlagen.')
        return { ok: false }
      }

      setSession(result.data ?? null)
      setError(null)

      if (!result.data?.session?.token) {
        return { ok: true, needsLogin: true }
      }

      await saveProfile(name, getSessionToken(result.data ?? null))
      return { ok: true }
    } finally {
      setIsLoading(false)
    }
  }

  const logout = async () => {
    setIsLoading(true)

    try {
      await getBetterAuthClient().signOut()
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
        login,
        signup,
        logout,
        refreshSession,
        ensureProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
