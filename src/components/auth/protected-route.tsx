import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../lib/use-auth'

interface ProtectedRouteProps {
  children: ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isLoading, session } = useAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,_#f8f5ef_0%,_#efe7da_100%)] px-6">
        <div className="rounded-[28px] border border-white/70 bg-white/90 px-6 py-5 text-sm text-slate-600 shadow-[0_24px_90px_-60px_rgba(15,23,42,0.65)]">
          Sitzung wird geladen...
        </div>
      </div>
    )
  }

  if (!session?.user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
