import { useEffect, useMemo, useState } from 'react'
import {
  ChevronRight,
  Copy,
  ExternalLink,
  Link as LinkIcon,
  LoaderCircle,
  X,
  Plus,
  Server,
} from 'lucide-react'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import {
  createMailbox,
  createPermalink,
  loadMailboxes,
  loadMailboxPermalinks,
  loadMailboxThreads,
  loadProfile,
} from '../lib/neon-api'
import type { InboxThreadRecord, MailboxRecord, PermalinkRecord } from '../lib/types'
import { useAuth } from '../lib/use-auth'

function formatDate(value: string) {
  return new Date(value).toLocaleString('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function getPermalinkUrl(token: string) {
  if (typeof window === 'undefined') {
    return `/p/${token}`
  }

  return `${window.location.origin}/p/${token}`
}

export function DashboardPage() {
  const { ensureProfile, session } = useAuth()
  const [mailboxes, setMailboxes] = useState<MailboxRecord[]>([])
  const [selectedMailboxId, setSelectedMailboxId] = useState<string | null>(null)
  const [threads, setThreads] = useState<InboxThreadRecord[]>([])
  const [permalinks, setPermalinks] = useState<PermalinkRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingThreads, setIsLoadingThreads] = useState(false)
  const [isLoadingPermalinks, setIsLoadingPermalinks] = useState(false)
  const [isSavingMailbox, setIsSavingMailbox] = useState(false)
  const [isSavingPermalink, setIsSavingPermalink] = useState(false)
  const [mailboxError, setMailboxError] = useState<string | null>(null)
  const [permalinkError, setPermalinkError] = useState<string | null>(null)
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [isMailboxOverlayOpen, setIsMailboxOverlayOpen] = useState(false)
  const [isPermalinkOverlayOpen, setIsPermalinkOverlayOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'inbox' | 'permalinks'>('inbox')
  const [selectedThread, setSelectedThread] = useState<InboxThreadRecord | null>(null)
  const [successToast, setSuccessToast] = useState<string | null>(null)

  const sessionToken = session?.session?.token ?? null

  useEffect(() => {
    const run = async () => {
      if (!sessionToken) {
        setGeneralError('Session-Token fehlt. Bitte erneut einloggen.')
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      setGeneralError(null)

      try {
        await ensureProfile(session?.user?.name)
        const [loadedProfile, loadedMailboxes] = await Promise.all([
          loadProfile(sessionToken),
          loadMailboxes(sessionToken),
        ])
        void loadedProfile
        setMailboxes(loadedMailboxes)
        setSelectedMailboxId((current) => current || loadedMailboxes[0]?.id || null)
      } catch (error) {
        setGeneralError(error instanceof Error ? error.message : 'Daten konnten nicht geladen werden.')
      } finally {
        setIsLoading(false)
      }
    }

    void run()
  }, [ensureProfile, session?.user?.name, sessionToken])

  const selectedMailbox = useMemo(
    () => mailboxes.find((mailbox) => mailbox.id === selectedMailboxId) ?? null,
    [mailboxes, selectedMailboxId],
  )

  useEffect(() => {
    const run = async () => {
      if (!selectedMailboxId || !sessionToken) {
        setThreads([])
        return
      }

      setIsLoadingThreads(true)

      try {
        const loadedThreads = await loadMailboxThreads(selectedMailboxId, sessionToken)
        setThreads(loadedThreads)
      } catch (error) {
        setGeneralError(error instanceof Error ? error.message : 'INBOX konnte nicht geladen werden.')
      } finally {
        setIsLoadingThreads(false)
      }
    }

    void run()
  }, [selectedMailboxId, sessionToken])

  const copyPermalinkToClipboard = async (token: string) => {
    await navigator.clipboard.writeText(getPermalinkUrl(token))
  }

  useEffect(() => {
    if (!successToast) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setSuccessToast(null)
    }, 2200)

    return () => window.clearTimeout(timeoutId)
  }, [successToast])

  useEffect(() => {
    const run = async () => {
      if (!selectedMailboxId || !sessionToken) {
        setPermalinks([])
        return
      }

      setIsLoadingPermalinks(true)

      try {
        const loadedPermalinks = await loadMailboxPermalinks(selectedMailboxId, sessionToken)
        setPermalinks(loadedPermalinks)
      } catch (error) {
        setGeneralError(
          error instanceof Error ? error.message : 'Permalinks konnten nicht geladen werden.',
        )
      } finally {
        setIsLoadingPermalinks(false)
      }
    }

    void run()
  }, [selectedMailboxId, sessionToken])

  return (
    <>
      <div className="px-6 py-6 sm:px-8">
        <div className="border-b border-slate-200 pb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
            Deine IMAP-Server und Permalinks
          </h1>
        </div>

        {generalError ? (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {generalError}
          </div>
        ) : null}

        <div className="mt-6 grid gap-6 xl:grid-cols-[300px_1fr]">
          <Card className="border-slate-200/80 shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-xl">IMAP-Server</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button className="w-full" onClick={() => setIsMailboxOverlayOpen(true)}>
                <Plus className="size-4" />
                IMAP-Server eintragen
              </Button>

              {isLoading ? (
                <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <LoaderCircle className="size-4 animate-spin" />
                  Server werden geladen...
                </div>
              ) : null}

              {!isLoading && mailboxes.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-600">
                  Noch kein IMAP-Server eingetragen.
                </div>
              ) : null}

              {mailboxes.map((mailbox) => {
                const isSelected = mailbox.id === selectedMailboxId

                return (
                  <button
                    key={mailbox.id}
                    className={[
                      'w-full rounded-[24px] border px-4 py-4 text-left transition',
                      isSelected
                        ? 'border-slate-950 bg-slate-950 text-white'
                        : 'border-slate-200 bg-white text-slate-950 hover:border-slate-300 hover:bg-slate-50',
                    ].join(' ')}
                    onClick={() => setSelectedMailboxId(mailbox.id)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{mailbox.label}</p>
                        <p className={isSelected ? 'mt-1 text-sm text-slate-300' : 'mt-1 text-sm text-slate-500'}>
                          {mailbox.username}
                        </p>
                        <p className={isSelected ? 'mt-1 text-xs text-slate-400' : 'mt-1 text-xs text-slate-400'}>
                          {mailbox.host}:{mailbox.port}
                        </p>
                      </div>
                      <ChevronRight className={isSelected ? 'size-4 text-white' : 'size-4 text-slate-400'} />
                    </div>
                  </button>
                )
              })}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-100 p-1">
              <button
                className={[
                  'rounded-xl px-4 py-2 text-sm font-medium transition',
                  activeTab === 'inbox'
                    ? 'bg-white text-slate-950 shadow-sm'
                    : 'text-slate-600 hover:text-slate-950',
                ].join(' ')}
                onClick={() => setActiveTab('inbox')}
                type="button"
              >
                Inbox
              </button>
              <button
                className={[
                  'rounded-xl px-4 py-2 text-sm font-medium transition',
                  activeTab === 'permalinks'
                    ? 'bg-white text-slate-950 shadow-sm'
                    : 'text-slate-600 hover:text-slate-950',
                ].join(' ')}
                onClick={() => setActiveTab('permalinks')}
                type="button"
              >
                Permalinks
              </button>
            </div>

            {activeTab === 'permalinks' ? (
              <Card className="border-slate-200/80 shadow-none">
                <CardHeader>
                  <CardTitle className="text-xl">Permalinks</CardTitle>
                  <CardDescription>
                    {selectedMailbox
                      ? `Bereits eingerichtete Permalinks fuer ${selectedMailbox.label}.`
                      : 'Waehle links einen IMAP-Server aus.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {selectedMailbox && isLoadingPermalinks ? (
                    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                      <LoaderCircle className="size-4 animate-spin" />
                      Permalinks werden geladen...
                    </div>
                  ) : null}

                  {selectedMailbox && !isLoadingPermalinks && permalinks.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-600">
                      Noch keine Permalinks fuer diesen Server.
                    </div>
                  ) : null}

                  {!selectedMailbox ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-600">
                      Bitte zuerst links einen IMAP-Server auswaehlen.
                    </div>
                  ) : null}

                  {permalinks.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-4 rounded-[24px] border border-slate-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="text-xs text-slate-400">
                          from {item.from_label} to {selectedMailbox?.username ?? 'dein Postfach'}
                        </p>
                        <p className="font-medium text-slate-950">{item.subject}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Badge
                            className="min-h-8"
                            variant={!item.expires_at || new Date(item.expires_at) > new Date() ? 'success' : 'danger'}
                          >
                            {!item.expires_at || new Date(item.expires_at) > new Date() ? 'active' : 'expired'}
                          </Badge>
                          {item.has_pin ? (
                            <Badge className="min-h-8" variant="warn">
                              PIN
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-1 text-sm text-slate-600">
                          {item.from_label} · {formatDate(item.email_date)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          aria-label="Permalink kopieren"
                          className="size-9 p-0"
                          onClick={() => {
                            void copyPermalinkToClipboard(item.token)
                          }}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <Copy className="size-4" />
                        </Button>
                        <a
                          aria-label="Permalink oeffnen"
                          className="inline-flex size-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-950 transition hover:border-slate-300 hover:bg-slate-50"
                          href={getPermalinkUrl(item.token)}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <ExternalLink className="size-4" />
                        </a>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : (
              <Card className="border-slate-200/80 shadow-none">
                <CardHeader>
                  <CardTitle className="text-xl">Threads in der INBOX</CardTitle>
                  <CardDescription>
                    Hier waehlt man einen Thread aus und legt dafuer in einem Overlay einen neuen Permalink an.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {!selectedMailbox ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-600">
                      Bitte zuerst links einen IMAP-Server auswaehlen.
                    </div>
                  ) : null}

                  {selectedMailbox && isLoadingThreads ? (
                    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                      <LoaderCircle className="size-4 animate-spin" />
                      INBOX wird geladen...
                    </div>
                  ) : null}

                  {selectedMailbox && !isLoadingThreads && threads.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-600">
                      Noch keine Thread-Liste fuer diesen Server.
                    </div>
                  ) : null}

                  {threads.map((thread) => (
                    <div
                      key={thread.id}
                      className="flex flex-col gap-4 rounded-[24px] border border-slate-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="text-xs text-slate-400">
                          from {thread.from} to {selectedMailbox?.username ?? 'dein Postfach'}
                        </p>
                        <p className="font-medium text-slate-950">{thread.subject}</p>
                        <p className="mt-1 text-sm text-slate-600">
                          {thread.from} · {formatDate(thread.date)}
                        </p>
                        <p className="mt-2 text-sm text-slate-500">{thread.snippet}</p>
                      </div>
                      <Button
                        onClick={() => {
                          setSelectedThread(thread)
                          setPermalinkError(null)
                          setIsPermalinkOverlayOpen(true)
                        }}
                        variant="outline"
                      >
                        <LinkIcon className="size-4" />
                        Permalink anlegen
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {isMailboxOverlayOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <Card className="w-full max-w-xl border-white/80 bg-white shadow-[0_40px_120px_-50px_rgba(15,23,42,0.7)]">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Neuen IMAP-Server eintragen</CardTitle>
                <CardDescription>Nur die wirklich noetigen Angaben, der Rest bleibt schlank.</CardDescription>
              </div>
              <Button
                aria-label="Overlay schliessen"
                className="size-9 p-0"
                onClick={() => setIsMailboxOverlayOpen(false)}
                size="sm"
                variant="ghost"
              >
                <X className="size-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-4"
                onSubmit={async (event) => {
                  event.preventDefault()

                  if (!sessionToken) {
                    setMailboxError('Session-Token fehlt. Bitte erneut einloggen.')
                    return
                  }

                  setIsSavingMailbox(true)
                  setMailboxError(null)

                  const formData = new FormData(event.currentTarget)

                  try {
                    const createdMailbox = await createMailbox(
                      {
                        label: String(formData.get('label') ?? ''),
                        host: String(formData.get('host') ?? ''),
                        port: Number(formData.get('port') ?? 993),
                        username: String(formData.get('username') ?? ''),
                        password: String(formData.get('imapPassword') ?? ''),
                        folder: String(formData.get('folder') ?? 'INBOX'),
                        secure: true,
                      },
                      sessionToken,
                    )

                    setMailboxes((current) => [createdMailbox, ...current])
                    setSelectedMailboxId(createdMailbox.id)
                    setIsMailboxOverlayOpen(false)
                    event.currentTarget.reset()
                  } catch (error) {
                    setMailboxError(
                      error instanceof Error ? error.message : 'IMAP-Server konnte nicht gespeichert werden.',
                    )
                  } finally {
                    setIsSavingMailbox(false)
                  }
                }}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="mailbox-label">Bezeichnung</Label>
                    <Input id="mailbox-label" name="label" placeholder="ralfw.de" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mailbox-folder">Ordner</Label>
                    <Input id="mailbox-folder" defaultValue="INBOX" name="folder" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mailbox-host">IMAP Host</Label>
                  <Input id="mailbox-host" name="host" placeholder="mail.example.com" />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="mailbox-port">Port</Label>
                    <Input id="mailbox-port" defaultValue="993" name="port" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mailbox-username">Benutzername</Label>
                    <Input id="mailbox-username" name="username" placeholder="info@example.com" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mailbox-password">IMAP Passwort</Label>
                  <Input id="mailbox-password" name="imapPassword" type="password" />
                </div>

                {mailboxError ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {mailboxError}
                  </div>
                ) : null}

                <div className="flex justify-end gap-3 pt-2">
                  <Button onClick={() => setIsMailboxOverlayOpen(false)} type="button" variant="ghost">
                    Abbrechen
                  </Button>
                  <Button disabled={isSavingMailbox} type="submit">
                    {isSavingMailbox ? <LoaderCircle className="size-4 animate-spin" /> : <Server className="size-4" />}
                    Speichern
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {isPermalinkOverlayOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <Card className="w-full max-w-lg border-white/80 bg-white shadow-[0_40px_120px_-50px_rgba(15,23,42,0.7)]">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Neuen Permalink anlegen</CardTitle>
                <CardDescription>
                  {selectedThread ? selectedThread.subject : 'PIN und Ablaufdatum sind optional.'}
                </CardDescription>
              </div>
              <Button
                aria-label="Overlay schliessen"
                className="size-9 p-0"
                onClick={() => setIsPermalinkOverlayOpen(false)}
                size="sm"
                variant="ghost"
              >
                <X className="size-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-4"
                onSubmit={async (event) => {
                  event.preventDefault()

                  if (!sessionToken || !selectedMailboxId || !selectedThread) {
                    setPermalinkError('Thread oder Session fehlt.')
                    return
                  }

                  const formData = new FormData(event.currentTarget)
                  const pin = String(formData.get('pin') ?? '').trim()
                  const expiresAt = String(formData.get('expiresAt') ?? '').trim()

                  setIsSavingPermalink(true)
                  setPermalinkError(null)

                  try {
                    const createdPermalink = await createPermalink(
                      selectedMailboxId,
                      {
                        threadId: selectedThread.id,
                        subject: selectedThread.subject,
                        from: selectedThread.from,
                        date: selectedThread.date,
                        snippet: selectedThread.snippet,
                        pin: pin || undefined,
                        expiresAt: expiresAt || null,
                      },
                      sessionToken,
                    )

                    setPermalinks((current) => [createdPermalink, ...current])
                    await copyPermalinkToClipboard(createdPermalink.token)
                    setSuccessToast('Permalink kopiert')
                    setIsPermalinkOverlayOpen(false)
                    setSelectedThread(null)
                    event.currentTarget.reset()
                  } catch (error) {
                    setPermalinkError(
                      error instanceof Error ? error.message : 'Permalink konnte nicht erstellt werden.',
                    )
                  } finally {
                    setIsSavingPermalink(false)
                  }
                }}
              >
                {selectedThread ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
                    <p className="font-medium text-slate-950">{selectedThread.subject}</p>
                    <p className="mt-1">
                      {selectedThread.from} · {formatDate(selectedThread.date)}
                    </p>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <Label htmlFor="permalink-pin">PIN (optional)</Label>
                  <Input id="permalink-pin" maxLength={4} name="pin" placeholder="4 Ziffern" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="permalink-expires-at">Ablaufdatum (optional)</Label>
                  <Input id="permalink-expires-at" name="expiresAt" type="datetime-local" />
                </div>

                {permalinkError ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {permalinkError}
                  </div>
                ) : null}

                <div className="flex justify-end gap-3">
                  <Button onClick={() => setIsPermalinkOverlayOpen(false)} type="button" variant="ghost">
                    Abbrechen
                  </Button>
                  <Button disabled={isSavingPermalink} type="submit">
                    {isSavingPermalink ? <LoaderCircle className="size-4 animate-spin" /> : <LinkIcon className="size-4" />}
                    Permalink erstellen
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {successToast ? (
        <div className="pointer-events-none fixed bottom-6 right-6 z-[60] rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 shadow-sm">
          {successToast}
        </div>
      ) : null}
    </>
  )
}
