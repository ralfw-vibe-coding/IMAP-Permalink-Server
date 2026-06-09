import { LogOut, ShieldCheck, User } from 'lucide-react'
import { Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/use-auth'
import { Button } from '../ui/button'

export function AppShell() {
  const navigate = useNavigate()
  const { logout, session } = useAuth()
  const displayName =
    session?.user?.email || session?.user?.name || session?.user?.id || 'Unbekannter Nutzer'

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(242,117,86,0.18),_transparent_24%),linear-gradient(180deg,_#f8f5ef_0%,_#efe7da_100%)] text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-[32px] border border-white/70 bg-white/85 shadow-[0_30px_120px_-60px_rgba(15,23,42,0.65)] backdrop-blur">
          <header className="flex flex-col gap-4 border-b border-slate-200/80 bg-slate-950 px-6 py-5 text-white sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-orange-500/15 text-orange-300 ring-1 ring-orange-400/30">
                <ShieldCheck className="size-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Permalinks</p>
                <h1 className="font-serif text-2xl text-white">Mail Thread Vault</h1>
              </div>
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Button className="max-w-full break-all" variant="outline" size="sm">
                <User className="size-4 shrink-0" />
                {displayName}
              </Button>
              <Button
                className="text-slate-200 hover:bg-white/10 hover:text-white"
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await logout()
                  navigate('/login')
                }}
              >
                <LogOut className="size-4" />
                Logout
              </Button>
            </div>
          </header>

          <main className="bg-[linear-gradient(180deg,_rgba(255,255,255,0.84)_0%,_rgba(248,250,252,0.92)_100%)]">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
