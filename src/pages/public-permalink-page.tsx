import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { LoaderCircle, LockKeyhole } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { loadPublicPermalink } from '../lib/neon-api'
import type { PublicPermalinkRecord } from '../lib/types'
import { useAuth } from '../lib/use-auth'

function formatDate(value: string) {
  return new Date(value).toLocaleString('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function PublicPermalinkPage() {
  const { session } = useAuth()
  const { token } = useParams<{ token: string }>()
  const [pin, setPin] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [permalink, setPermalink] = useState<PublicPermalinkRecord | null>(null)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)

  const sessionToken = session?.session?.token ?? null

  const load = useCallback(async (nextPin?: string) => {
    if (!token) {
      setError('Permalink-Token fehlt.')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const result = await loadPublicPermalink(token, sessionToken, nextPin)
      setPermalink(result)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Permalink konnte nicht geladen werden.')
    } finally {
      setHasLoadedOnce(true)
      setIsLoading(false)
    }
  }, [sessionToken, token])

  useEffect(() => {
    void load()
  }, [load])

  const isLocked = permalink?.locked === true

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Permalink</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Mail Thread Vault</h1>
        </div>

        <Card className="border-slate-200/80 shadow-none">
          <CardHeader>
            <CardTitle>{permalink?.subject ?? (isLoading || !hasLoadedOnce ? 'Permalink wird geladen' : 'Mailansicht')}</CardTitle>
            <CardDescription>
              {permalink?.email_date ? `${permalink.from_label} · ${formatDate(permalink.email_date)}` : 'Live aus dem IMAP-Postfach geladen'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading && !permalink ? (
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                <LoaderCircle className="size-4 animate-spin" />
                Permalink wird geladen...
              </div>
            ) : null}

            {permalink?.expires_at ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Gueltig bis {formatDate(permalink.expires_at)}
              </div>
            ) : null}

            {isLocked ? (
              <form
                className="space-y-4 rounded-[24px] border border-slate-200 bg-white px-4 py-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  void load(pin)
                }}
              >
                <div className="flex items-center gap-3 text-slate-700">
                  <LockKeyhole className="size-4" />
                  <p className="text-sm">Dieser Permalink ist mit einer PIN geschuetzt.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="public-pin">PIN</Label>
                  <Input
                    id="public-pin"
                    maxLength={4}
                    onChange={(event) => setPin(event.target.value)}
                    placeholder="4 Ziffern"
                    type="password"
                    value={pin}
                  />
                </div>

                <Button disabled={isLoading} type="submit">
                  {isLoading ? <LoaderCircle className="size-4 animate-spin" /> : null}
                  Freischalten
                </Button>
              </form>
            ) : null}

            {!isLocked && permalink?.thread ? (
              <div className="space-y-4">
                <div className="rounded-[24px] border border-slate-200 bg-white px-5 py-5">
                  <div className="space-y-2 border-b border-slate-200 pb-4">
                    <div className="text-sm text-slate-600">
                      <span className="font-medium text-slate-950">From:</span> {permalink.thread.from}
                    </div>
                    <div className="text-sm text-slate-600">
                      <span className="font-medium text-slate-950">To:</span> {permalink.thread.to}
                    </div>
                    <div className="text-sm text-slate-600">
                      <span className="font-medium text-slate-950">Date:</span> {formatDate(permalink.thread.date)}
                    </div>
                  </div>
                  <div className="mt-5 whitespace-pre-wrap break-words text-sm leading-7 text-slate-800">
                    {permalink.thread.body || permalink.thread.snippet}
                  </div>
                </div>
              </div>
            ) : null}

            {error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
