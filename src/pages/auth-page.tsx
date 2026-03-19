import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/use-auth'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'

interface AuthPageProps {
  mode: 'login' | 'signup'
}

export function AuthPage({ mode }: AuthPageProps) {
  const navigate = useNavigate()
  const isSignup = mode === 'signup'
  const { error, isLoading, login, session, signup } = useAuth()
  const [localError, setLocalError] = useState<string | null>(null)

  if (session?.user) {
    return <Navigate to="/app" replace />
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,_#f8f5ef_0%,_#efe7da_100%)] px-4">
      <Card className="w-full max-w-md border-white/80 bg-white/95 shadow-[0_40px_120px_-60px_rgba(15,23,42,0.65)]">
        <CardHeader className="space-y-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-orange-100 text-orange-700">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <CardTitle>{isSignup ? 'Signup' : 'Login'}</CardTitle>
            <CardDescription>
              {isSignup ? 'Neues Konto anlegen.' : 'Mit bestehendem Konto anmelden.'}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
              <form
                className="space-y-5"
                onSubmit={async (event) => {
                  event.preventDefault()
                  const formData = new FormData(event.currentTarget)
                  const email = String(formData.get('email') ?? '')
                  const password = String(formData.get('password') ?? '')
                  const confirmPassword = String(formData.get('confirmPassword') ?? '')
                  const fullName = String(formData.get('fullName') ?? '')
                  const signupName = fullName || email.split('@')[0] || 'Neon User'

                  setLocalError(null)

                  if (isSignup && password !== confirmPassword) {
                    setLocalError('Die beiden Passwoerter stimmen nicht ueberein.')
                    return
                  }

                  if (isSignup) {
                    const result = await signup({
                        email,
                        password,
                        name: signupName,
                      })

                    if (result.ok && result.needsLogin) {
                      navigate('/login')
                      return
                    }

                    if (result.ok) {
                      navigate('/app')
                      return
                    }
                  } else {
                    const success = await login({
                      email,
                      password,
                    })

                    if (success) {
                      navigate('/app')
                      return
                    }
                  }

                  if (!isSignup) {
                    setLocalError('Authentifizierung fehlgeschlagen. Bitte Eingaben und Neon-Konfiguration pruefen.')
                    return
                  }

                  setLocalError(
                    'Registrierung abgeschlossen, aber noch ohne Session. Bitte jetzt einloggen.',
                  )
                }}
              >
                {isSignup ? (
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Name</Label>
                    <Input id="fullName" name="fullName" placeholder="Ralf Weidenbach" />
                  </div>
                ) : null}

                <div className="space-y-2">
                  <Label htmlFor="email">E-Mail</Label>
                  <Input id="email" name="email" type="email" placeholder="du@example.com" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Passwort</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder={isSignup ? 'Mindestens 8 Zeichen' : 'Dein Passwort'}
                  />
                </div>

                {isSignup ? (
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Passwort wiederholen</Label>
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      placeholder="Passwort erneut eingeben"
                    />
                  </div>
                ) : null}

                {localError || error ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {localError || error}
                  </div>
                ) : null}

                <Button className="w-full" size="lg" type="submit" disabled={isLoading}>
                  {isSignup ? 'Konto erstellen' : 'Einloggen'}
                </Button>
              </form>

              <p className="mt-6 text-sm text-slate-600">
                {isSignup ? 'Schon registriert?' : 'Noch kein Konto?'}{' '}
                <Link
                  className="font-medium text-slate-950 underline decoration-orange-300 underline-offset-4"
                  to={isSignup ? '/login' : '/signup'}
                >
                  {isSignup ? 'Zum Login' : 'Jetzt registrieren'}
                </Link>
              </p>
        </CardContent>
      </Card>
    </div>
  )
}
