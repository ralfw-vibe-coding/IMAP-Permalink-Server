import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { useAuth } from '../lib/use-auth'

export function AuthPage() {
  const navigate = useNavigate()
  const { error, requestOtp, session, verifyOtp } = useAuth()
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [isSendingCode, setIsSendingCode] = useState(false)
  const [isVerifyingCode, setIsVerifyingCode] = useState(false)
  const [hasSentCode, setHasSentCode] = useState(false)

  if (session?.user) {
    return <Navigate to="/app" replace />
  }

  const normalizedEmail = email.trim()

  const handleSendCode = async () => {
    if (!normalizedEmail) {
      setLocalError('Bitte eine E-Mail-Adresse eingeben.')
      return
    }

    setLocalError(null)
    setIsSendingCode(true)

    try {
      const success = await requestOtp({ email: normalizedEmail })

      if (success) {
        setHasSentCode(true)
      }
    } finally {
      setIsSendingCode(false)
    }
  }

  const handleLogin = async () => {
    if (!normalizedEmail) {
      setLocalError('Bitte eine E-Mail-Adresse eingeben.')
      return
    }

    if (!otp.trim()) {
      setLocalError('Bitte den Login-Code eingeben.')
      return
    }

    setLocalError(null)
    setIsVerifyingCode(true)

    try {
      const success = await verifyOtp({
        email: normalizedEmail,
        otp: otp.trim(),
      })

      if (success) {
        navigate('/app')
        return
      }

      setLocalError('Der Code ist nicht korrekt oder abgelaufen.')
    } finally {
      setIsVerifyingCode(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,_#f8f5ef_0%,_#efe7da_100%)] px-4">
      <Card className="w-full max-w-md border-white/80 bg-white/95 shadow-[0_40px_120px_-60px_rgba(15,23,42,0.65)]">
        <CardHeader className="space-y-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-orange-100 text-orange-700">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <CardTitle>Login</CardTitle>
            <CardDescription>E-Mail eingeben, Code erhalten und einloggen.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault()
              void handleLogin()
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="email">E-Mail</Label>
              <Input
                autoComplete="email"
                id="email"
                name="email"
                onChange={(event) => {
                  setEmail(event.target.value)
                  setOtp('')
                  setHasSentCode(false)
                }}
                placeholder="du@example.com"
                type="email"
                value={email}
              />
            </div>

            <Button
              className="w-full"
              disabled={isSendingCode || isVerifyingCode}
              onClick={() => {
                void handleSendCode()
              }}
              size="lg"
              type="button"
              variant="outline"
            >
              {isSendingCode ? 'Code wird gesendet ...' : 'Code per E-Mail senden'}
            </Button>

            <div className="space-y-2">
              <Label htmlFor="otp">Login-Code</Label>
              <Input
                autoComplete="off"
                id="otp"
                inputMode="text"
                name="loginCode"
                onChange={(event) => setOtp(event.target.value)}
                placeholder="Code"
                value={otp}
              />
              {hasSentCode ? (
                <p className="text-sm text-slate-500">Code gesendet an {normalizedEmail}.</p>
              ) : null}
            </div>

            {localError || error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {localError || error}
              </div>
            ) : null}

            <Button className="w-full" disabled={isSendingCode || isVerifyingCode} size="lg" type="submit">
              {isVerifyingCode ? 'Code wird geprueft ...' : 'Einloggen'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
