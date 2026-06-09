import { useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  Copy,
  Pencil,
  ExternalLink,
  Link as LinkIcon,
  LoaderCircle,
  Trash2,
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
  deleteMailbox,
  deletePermalink,
  loadImapJob,
  loadMailboxFolders,
	  loadMailboxes,
	  loadMailboxPermalinks,
	  loadProfile,
	  startCreatePermalinkJob,
	  startLoadMailboxThreadsJob,
	  updateMailbox,
	  updatePermalink,
	} from '../lib/neon-api'
import type {
  CreatePermalinkJobResult,
  ImapJobStatus,
  InboxThreadRecord,
  LoadThreadsJobResult,
  MailFolderRecord,
  MailboxRecord,
  PermalinkRecord,
} from '../lib/types'
import { useAuth } from '../lib/use-auth'

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

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

const mailboxPalette = [
  { accent: '#2563eb', surface: '#eff6ff' },
  { accent: '#059669', surface: '#ecfdf5' },
  { accent: '#dc2626', surface: '#fef2f2' },
  { accent: '#7c3aed', surface: '#f5f3ff' },
  { accent: '#d97706', surface: '#fffbeb' },
  { accent: '#0891b2', surface: '#ecfeff' },
  { accent: '#be123c', surface: '#fff1f2' },
  { accent: '#4f46e5', surface: '#eef2ff' },
  { accent: '#16a34a', surface: '#f0fdf4' },
  { accent: '#c2410c', surface: '#fff7ed' },
  { accent: '#0f766e', surface: '#f0fdfa' },
  { accent: '#9333ea', surface: '#faf5ff' },
  { accent: '#0284c7', surface: '#f0f9ff' },
  { accent: '#65a30d', surface: '#f7fee7' },
  { accent: '#b91c1c', surface: '#fef2f2' },
  { accent: '#4338ca', surface: '#eef2ff' },
  { accent: '#0d9488', surface: '#f0fdfa' },
  { accent: '#ca8a04', surface: '#fefce8' },
  { accent: '#db2777', surface: '#fdf2f8' },
  { accent: '#475569', surface: '#f8fafc' },
]

function getMailboxColor(index: number) {
  return mailboxPalette[index % mailboxPalette.length]
}

type InboxThreadViewRecord = InboxThreadRecord & {
  mailbox_id: string
}

export function DashboardPage() {
	  const { ensureProfile, session } = useAuth()
	  const [mailboxes, setMailboxes] = useState<MailboxRecord[]>([])
	  const [selectedMailboxIds, setSelectedMailboxIds] = useState<string[]>([])
  const [threads, setThreads] = useState<InboxThreadViewRecord[]>([])
  const [permalinks, setPermalinks] = useState<PermalinkRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingThreads, setIsLoadingThreads] = useState(false)
  const [isLoadingPermalinks, setIsLoadingPermalinks] = useState(false)
  const [isSavingMailbox, setIsSavingMailbox] = useState(false)
  const [deletingMailboxId, setDeletingMailboxId] = useState<string | null>(null)
  const [isSavingPermalink, setIsSavingPermalink] = useState(false)
  const [threadJobStatus, setThreadJobStatus] = useState<ImapJobStatus | null>(null)
  const [permalinkJobStatus, setPermalinkJobStatus] = useState<ImapJobStatus | null>(null)
  const [deletingPermalinkId, setDeletingPermalinkId] = useState<string | null>(null)
  const [pendingDeleteMailboxId, setPendingDeleteMailboxId] = useState<string | null>(null)
  const [pendingDeletePermalinkId, setPendingDeletePermalinkId] = useState<string | null>(null)
  const [mailboxError, setMailboxError] = useState<string | null>(null)
  const [permalinkError, setPermalinkError] = useState<string | null>(null)
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [isMailboxOverlayOpen, setIsMailboxOverlayOpen] = useState(false)
  const [isPermalinkOverlayOpen, setIsPermalinkOverlayOpen] = useState(false)
	  const [editingMailbox, setEditingMailbox] = useState<MailboxRecord | null>(null)
	  const [editingPermalink, setEditingPermalink] = useState<PermalinkRecord | null>(null)
  const [folderOptions, setFolderOptions] = useState<MailFolderRecord[]>([])
  const [selectedFolderPaths, setSelectedFolderPaths] = useState<string[]>([])
  const [isLoadingFolders, setIsLoadingFolders] = useState(false)
  const [folderError, setFolderError] = useState<string | null>(null)
  const [expandedThreadIds, setExpandedThreadIds] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<'inbox' | 'permalinks'>('inbox')
  const [selectedThread, setSelectedThread] = useState<InboxThreadViewRecord | null>(null)
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
	        setSelectedMailboxIds((current) =>
	          current.filter((mailboxId) => loadedMailboxes.some((mailbox) => mailbox.id === mailboxId)),
	        )
      } catch (error) {
        setGeneralError(error instanceof Error ? error.message : 'Daten konnten nicht geladen werden.')
      } finally {
        setIsLoading(false)
      }
    }

    void run()
  }, [ensureProfile, session?.user?.name, sessionToken])

	  const selectedMailboxes = useMemo(
	    () => mailboxes.filter((mailbox) => selectedMailboxIds.includes(mailbox.id)),
	    [mailboxes, selectedMailboxIds],
	  )

	  const selectedMailbox = selectedMailboxes.length === 1 ? selectedMailboxes[0] : null

  const mailboxColors = useMemo(() => {
    return new Map(mailboxes.map((mailbox, index) => [mailbox.id, getMailboxColor(index)]))
  }, [mailboxes])

  useEffect(() => {
    let isCancelled = false

    const run = async () => {
      if (!sessionToken || !selectedMailbox) {
        setFolderOptions([])
        setSelectedFolderPaths([])
        setIsLoadingFolders(false)
        setFolderError(null)
        return
      }

      const defaultFolder = selectedMailbox.folder || 'INBOX'
      setSelectedFolderPaths([defaultFolder])
      setFolderOptions([
        {
          path: defaultFolder,
          name: defaultFolder,
          specialUse: defaultFolder.toLowerCase() === 'inbox' ? '\\Inbox' : null,
          isStandard: true,
        },
      ])
      setIsLoadingFolders(true)
      setFolderError(null)

      try {
        const loadedFolders = await loadMailboxFolders(selectedMailbox.id, sessionToken)
        const hasDefaultFolder = loadedFolders.some(
          (folder) => folder.path.toLowerCase() === defaultFolder.toLowerCase(),
        )
        const nextFolders = hasDefaultFolder
          ? loadedFolders
          : [
              {
                path: defaultFolder,
                name: defaultFolder,
                specialUse: defaultFolder.toLowerCase() === 'inbox' ? '\\Inbox' : null,
                isStandard: true,
              },
              ...loadedFolders,
            ]

        if (!isCancelled) {
          setFolderOptions(nextFolders)
        }
      } catch (error) {
        if (!isCancelled) {
          setFolderError(error instanceof Error ? error.message : 'Folder konnten nicht geladen werden.')
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingFolders(false)
        }
      }
    }

    void run()

    return () => {
      isCancelled = true
    }
  }, [selectedMailbox, sessionToken])

  useEffect(() => {
	    let isCancelled = false
	
	    const run = async () => {
	      if (!sessionToken) {
	        setThreads([])
	        setThreadJobStatus(null)
	        return
	      }

	      const targetMailboxes = selectedMailboxIds.length > 0 ? selectedMailboxes : mailboxes

	      if (targetMailboxes.length === 0) {
	        setThreads([])
	        setThreadJobStatus(null)
	        return
	      }
	
	      setIsLoadingThreads(true)
	      setThreadJobStatus('pending')
	      setGeneralError(null)
	
	      try {
	        const loadedThreads = await Promise.all(
	          targetMailboxes.map(async (mailbox) => {
	            const foldersForMailbox =
	              selectedMailbox?.id === mailbox.id && selectedFolderPaths.length > 0
	                ? selectedFolderPaths
	                : undefined
	            const startedJob = await startLoadMailboxThreadsJob(mailbox.id, sessionToken, foldersForMailbox)
	            let currentJob = startedJob
	
	            for (let attempt = 0; attempt < 120; attempt += 1) {
	              if (isCancelled) {
	                return [] as InboxThreadViewRecord[]
	              }
	
	              setThreadJobStatus(currentJob.status)
	
	              if (currentJob.status === 'completed') {
	                return (currentJob.result?.threads ?? []).map((thread) => ({
	                  ...thread,
	                  mailbox_id: mailbox.id,
	                }))
	              }
	
	              if (currentJob.status === 'failed') {
	                throw new Error(currentJob.error || 'INBOX konnte nicht geladen werden.')
	              }
	
	              await delay(1500)
	              currentJob = await loadImapJob<LoadThreadsJobResult>(startedJob.id, sessionToken)
	            }
	
	            throw new Error('INBOX-Job laeuft zu lange. Bitte spaeter erneut versuchen.')
	          }),
	        )

	        if (!isCancelled) {
	          setThreads(loadedThreads.flat().sort((a, b) => (a.date < b.date ? 1 : -1)))
	        }
	      } catch (error) {
	        if (!isCancelled) {
	          setGeneralError(error instanceof Error ? error.message : 'INBOX konnte nicht geladen werden.')
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingThreads(false)
          setThreadJobStatus(null)
        }
      }
    }

    void run()

	    return () => {
	      isCancelled = true
	    }
	  }, [mailboxes, selectedFolderPaths, selectedMailbox, selectedMailboxIds, selectedMailboxes, sessionToken])

  const copyPermalinkToClipboard = async (token: string) => {
    await navigator.clipboard.writeText(getPermalinkUrl(token))
  }

  const handleDeletePermalink = async (permalinkId: string, mailboxId: string) => {
    if (!sessionToken) {
      setGeneralError('Session-Token fehlt. Bitte erneut einloggen.')
      return
    }

    setDeletingPermalinkId(permalinkId)
    setGeneralError(null)

    try {
      await deletePermalink(mailboxId, permalinkId, sessionToken)
      setPermalinks((current) => current.filter((item) => item.id !== permalinkId))
      setSuccessToast('Permalink geloescht')
    } catch (error) {
      setGeneralError(
        error instanceof Error ? error.message : 'Permalink konnte nicht geloescht werden.',
      )
    } finally {
      setDeletingPermalinkId(null)
      setPendingDeletePermalinkId(null)
    }
  }

  const handleDeleteMailbox = async (mailboxId: string) => {
    if (!sessionToken) {
      setGeneralError('Session-Token fehlt. Bitte erneut einloggen.')
      return
    }

    setDeletingMailboxId(mailboxId)
    setGeneralError(null)

    try {
      await deleteMailbox(mailboxId, sessionToken)
      setMailboxes((current) => {
        const nextMailboxes = current.filter((mailbox) => mailbox.id !== mailboxId)

        setSelectedMailboxIds((currentSelectedIds) =>
          currentSelectedIds.filter((selectedId) => selectedId !== mailboxId),
        )

        return nextMailboxes
      })

      if (selectedMailboxIds.includes(mailboxId)) {
        setThreads([])
        setPermalinks([])
      }

      setSuccessToast('IMAP-Server geloescht')
    } catch (error) {
      setGeneralError(
        error instanceof Error ? error.message : 'IMAP-Server konnte nicht geloescht werden.',
      )
    } finally {
      setDeletingMailboxId(null)
      setPendingDeleteMailboxId(null)
    }
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
    if (!pendingDeletePermalinkId) {
      return
    }

    const handlePointerDown = () => {
      setPendingDeletePermalinkId(null)
    }

    document.addEventListener('pointerdown', handlePointerDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [pendingDeletePermalinkId])

  useEffect(() => {
    if (!pendingDeleteMailboxId) {
      return
    }

    const handlePointerDown = () => {
      setPendingDeleteMailboxId(null)
    }

    document.addEventListener('pointerdown', handlePointerDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [pendingDeleteMailboxId])

	  useEffect(() => {
	    const run = async () => {
	      if (!sessionToken) {
	        setPermalinks([])
	        return
	      }

	      const targetMailboxes = selectedMailboxIds.length > 0 ? selectedMailboxes : mailboxes

	      if (targetMailboxes.length === 0) {
	        setPermalinks([])
	        return
	      }
	
	      setIsLoadingPermalinks(true)
	
	      try {
	        const loadedPermalinks = await Promise.all(
	          targetMailboxes.map((mailbox) => loadMailboxPermalinks(mailbox.id, sessionToken)),
	        )
	        setPermalinks(loadedPermalinks.flat().sort((a, b) => (a.created_at < b.created_at ? 1 : -1)))
	      } catch (error) {
	        setGeneralError(
	          error instanceof Error ? error.message : 'Permalinks konnten nicht geladen werden.',
        )
      } finally {
        setIsLoadingPermalinks(false)
      }
    }
	
	    void run()
	  }, [mailboxes, selectedMailboxIds, selectedMailboxes, sessionToken])

  return (
    <>
      <div
        className="px-6 py-6 sm:px-8"
        onClick={() => setSelectedMailboxIds([])}
      >
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
          <Card className="border-slate-200/80 shadow-none" onClick={(event) => event.stopPropagation()}>
            <CardHeader className="pb-3">
              <CardTitle className="text-xl">IMAP-Server</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                className="w-full"
                onClick={() => {
                  setEditingMailbox(null)
                  setMailboxError(null)
                  setIsMailboxOverlayOpen(true)
                }}
              >
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
                const isSelected = selectedMailboxIds.includes(mailbox.id)
                const mailboxColor = mailboxColors.get(mailbox.id) ?? getMailboxColor(0)

                return (
	                  <div
	                    key={mailbox.id}
	                    className={[
	                      'w-full rounded-[24px] bg-white px-4 py-4 text-slate-950 transition hover:bg-slate-50',
	                      isSelected
	                        ? 'border-2'
	                        : 'border',
	                    ].join(' ')}
	                    style={{
	                      borderColor: isSelected ? mailboxColor.accent : '#e2e8f0',
	                      boxShadow: `inset 6px 0 0 ${mailboxColor.accent}`,
	                    }}
	                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        className="min-w-0 flex-1 text-left"
                        onClick={(event) => {
                          if (event.metaKey || event.ctrlKey) {
                            setSelectedMailboxIds((current) =>
                              current.includes(mailbox.id)
                                ? current.filter((selectedId) => selectedId !== mailbox.id)
                                : [...current, mailbox.id],
                            )
                            return
                          }

                          setSelectedMailboxIds([mailbox.id])
                        }}
                        type="button"
                      >
	                        <div className="min-w-0">
	                            <p className="truncate font-medium">{mailbox.label}</p>
	                            <p className="mt-1 truncate text-sm text-slate-600">
	                              {mailbox.username}
	                            </p>
	                            <p className="mt-1 truncate text-xs text-slate-500">
	                              {mailbox.host}:{mailbox.port}
	                            </p>
	                        </div>
	                      </button>
	
	                      <div className="flex shrink-0 items-center gap-2">
	                        <Button
	                          aria-label="IMAP-Server bearbeiten"
	                          className="size-7 p-0"
                          onClick={(event) => {
                            event.stopPropagation()
                            setEditingMailbox(mailbox)
                            setMailboxError(null)
                            setIsMailboxOverlayOpen(true)
                          }}
                          size="sm"
                          type="button"
	                          variant="outline"
	                        >
	                          <Pencil className="size-3" />
	                        </Button>
                        <Button
                          aria-label={
                            pendingDeleteMailboxId === mailbox.id
                              ? 'Loeschen bestaetigen'
                              : 'IMAP-Server loeschen'
                          }
	                          className="size-7 border-rose-200 bg-rose-50 p-0 text-rose-700 hover:border-rose-300 hover:bg-rose-100 hover:text-rose-800"
                          disabled={deletingMailboxId === mailbox.id}
                          onPointerDown={(event) => {
                            event.stopPropagation()
                          }}
                          onClick={(event) => {
                            event.stopPropagation()

                            if (pendingDeleteMailboxId === mailbox.id) {
                              void handleDeleteMailbox(mailbox.id)
                              return
                            }

                            setPendingDeleteMailboxId(mailbox.id)
                          }}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
	                          {deletingMailboxId === mailbox.id ? (
	                            <LoaderCircle className="size-3 animate-spin" />
	                          ) : pendingDeleteMailboxId === mailbox.id ? (
	                            <span className="text-sm font-semibold leading-none">?</span>
	                          ) : (
	                            <Trash2 className="size-3" />
	                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>

	          <div className="space-y-6" onClick={(event) => event.stopPropagation()}>
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
	                      : 'Bereits eingerichtete Permalinks aus allen IMAP-Servern.'}
	                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
	                  {isLoadingPermalinks ? (
	                    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
	                      <LoaderCircle className="size-4 animate-spin" />
	                      Permalinks werden geladen...
	                    </div>
	                  ) : null}
	
	                  {!isLoadingPermalinks && permalinks.length === 0 ? (
	                    <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-600">
	                      Noch keine Permalinks.
	                    </div>
	                  ) : null}
	
	                  {permalinks.map((item) => {
	                    const mailbox = mailboxes.find((entry) => entry.id === item.mailbox_id)
	                    const itemColor = mailboxColors.get(item.mailbox_id) ?? getMailboxColor(0)
	                    const expiresAt = item.expires_at ? new Date(item.expires_at) : null
	                    const isExpired = expiresAt ? expiresAt <= new Date() : false

	                    return (
	                    <div
	                      key={item.id}
	                      className="rounded-[24px] border border-slate-200 bg-white px-4 py-4"
	                      style={{
	                        borderLeftColor: itemColor.accent,
	                        borderLeftWidth: 6,
	                      }}
	                    >
	                      <div className="flex items-start justify-between gap-4">
	                        <div className="min-w-0">
	                          <p className="text-xs text-slate-400">
	                            {mailbox?.label ? `${mailbox.label} · ` : ''}from {item.from_label} to {mailbox?.username ?? 'dein Postfach'}
	                          </p>
	                          <p className="mt-1 font-medium text-slate-950">{item.subject}</p>
	                        </div>
	                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
	                          <Button
	                            aria-label="Permalink bearbeiten"
	                            className="size-8 p-0"
	                            onClick={() => {
	                              setEditingPermalink(item)
	                              setSelectedThread(null)
	                              setPermalinkError(null)
	                              setIsPermalinkOverlayOpen(true)
	                            }}
	                            size="sm"
	                            type="button"
	                            variant="outline"
	                          >
	                            <Pencil className="size-3.5" />
	                          </Button>
	                          <Button
	                            aria-label="Permalink kopieren"
	                            className="size-8 p-0"
	                            onClick={() => {
	                              void copyPermalinkToClipboard(item.token)
	                            }}
	                            size="sm"
	                            type="button"
	                            variant="outline"
	                          >
	                            <Copy className="size-3.5" />
	                          </Button>
	                          <a
	                            aria-label="Permalink oeffnen"
	                            className="inline-flex size-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-950 transition hover:border-slate-300 hover:bg-slate-50"
	                            href={getPermalinkUrl(item.token)}
	                            rel="noreferrer"
	                            target="_blank"
	                          >
	                            <ExternalLink className="size-3.5" />
	                          </a>
	                          <Button
	                            aria-label={
	                              pendingDeletePermalinkId === item.id
	                                ? 'Loeschen bestaetigen'
	                                : 'Permalink loeschen'
	                            }
	                            className="size-8 border-rose-200 bg-rose-50 p-0 text-rose-700 hover:border-rose-300 hover:bg-rose-100 hover:text-rose-800"
	                            disabled={deletingPermalinkId === item.id}
	                            onPointerDown={(event) => {
	                              event.stopPropagation()
	                            }}
	                            onClick={(event) => {
	                              event.stopPropagation()

	                              if (pendingDeletePermalinkId === item.id) {
	                                void handleDeletePermalink(item.id, item.mailbox_id)
	                                return
	                              }

	                              setPendingDeletePermalinkId(item.id)
	                            }}
	                            size="sm"
	                            type="button"
	                            variant="outline"
	                          >
	                            {deletingPermalinkId === item.id ? (
	                              <LoaderCircle className="size-3.5 animate-spin" />
	                            ) : pendingDeletePermalinkId === item.id ? (
	                              <span className="text-sm font-semibold leading-none">?</span>
	                            ) : (
	                              <Trash2 className="size-3.5" />
	                            )}
	                          </Button>
	                        </div>
	                      </div>
	                      <p className="mt-3 overflow-hidden text-sm leading-6 text-slate-600 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:4]">
	                        {item.snippet || 'Kein Textauszug gespeichert.'}
	                      </p>
	                      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
	                        <p className="text-sm text-slate-500">
	                          {item.from_label} · {formatDate(item.email_date)}
	                        </p>
	                        <div className="flex shrink-0 flex-wrap items-center justify-start gap-2 sm:justify-end">
	                          <Badge className="min-h-7" variant={isExpired ? 'danger' : 'success'}>
	                            {item.expires_at ? formatDate(item.expires_at) : 'activ'}
	                          </Badge>
	                          {item.has_pin ? (
	                            <Badge className="min-h-7" variant="warn">
	                              PIN
	                            </Badge>
	                          ) : null}
	                        </div>
	                      </div>
	                    </div>
	                    )
	                  })}
                </CardContent>
              </Card>
            ) : (
              <Card className="border-slate-200/80 shadow-none">
                <CardHeader>
                  <CardTitle className="text-xl">E-Mail-Threads</CardTitle>
                  <CardDescription>
                    Hier waehlt man einen Thread aus und legt dafuer in einem Overlay einen neuen Permalink an.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
	                  {selectedMailbox ? (
	                    <div className="space-y-2 rounded-2xl border border-slate-200 bg-white px-4 py-4">
	                      <div className="flex items-center justify-between gap-3">
	                        <p className="text-sm font-medium text-slate-700">Folder</p>
	                        {isLoadingFolders ? (
	                          <div className="flex items-center gap-2 text-xs text-slate-500">
	                            <LoaderCircle className="size-3.5 animate-spin" />
	                            werden geladen
	                          </div>
	                        ) : null}
	                      </div>
	                      <div className="flex flex-wrap gap-2">
	                        {folderOptions.map((folder) => {
	                          const isSelected = selectedFolderPaths.includes(folder.path)

	                          return (
	                            <button
	                              key={folder.path}
	                              className={[
	                                'rounded-full border px-3 py-1.5 text-sm font-medium transition',
	                                isSelected
	                                  ? 'border-slate-950 bg-slate-950 text-white'
	                                  : folder.isStandard
	                                    ? 'border-slate-300 bg-slate-50 text-slate-700 hover:border-slate-400'
	                                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950',
	                              ].join(' ')}
	                              onClick={() => {
	                                setSelectedFolderPaths((current) => {
	                                  if (current.includes(folder.path)) {
	                                    return current.length > 1
	                                      ? current.filter((path) => path !== folder.path)
	                                      : current
	                                  }

	                                  return [...current, folder.path]
	                                })
	                              }}
	                              type="button"
	                            >
	                              {folder.name || folder.path}
	                            </button>
	                          )
	                        })}
	                      </div>
	                      {folderError ? (
	                        <p className="text-sm text-rose-600">{folderError}</p>
	                      ) : null}
	                    </div>
	                  ) : null}

	                  {isLoadingThreads ? (
	                    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
	                      <LoaderCircle className="size-4 animate-spin" />
	                      {threadJobStatus === 'processing'
	                        ? 'IMAP-Server wird im Hintergrund abgefragt...'
	                        : 'E-Mails werden geladen...'}
	                    </div>
	                  ) : null}
	
	                  {!isLoadingThreads && threads.length === 0 ? (
	                    <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-600">
	                      Noch keine E-Mails gefunden.
	                    </div>
	                  ) : null}
	
	                  {threads.map((thread) => {
	                    const mailbox = mailboxes.find((entry) => entry.id === thread.mailbox_id)
	                    const threadColor = mailboxColors.get(thread.mailbox_id) ?? getMailboxColor(0)
	                    const threadExpansionId = `${thread.mailbox_id}-${thread.id}`
	                    const isExpanded = expandedThreadIds.includes(threadExpansionId)
	                    const threadMessages = thread.messages ?? []

	                    return (
	                    <div
	                      key={`${thread.mailbox_id}-${thread.id}`}
	                      className="rounded-[24px] border border-slate-200 bg-white px-4 py-4"
	                      style={{
	                        borderLeftColor: threadColor.accent,
	                        borderLeftWidth: 6,
	                      }}
	                    >
	                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
	                        <div className="min-w-0 flex-1">
	                          <div className="mb-2 flex flex-wrap items-center justify-start gap-1.5 sm:float-right sm:ml-3 sm:justify-end">
	                            {thread.folders?.map((folder) => (
	                              <Badge key={folder} className="min-h-6 px-2 py-0.5 text-[11px]" variant="default">
	                                {folder}
	                              </Badge>
	                            ))}
	                            {threadMessages.length > 1 ? (
	                              <Button
	                                aria-label={isExpanded ? 'Thread einklappen' : 'Thread aufklappen'}
	                                className="size-7 p-0"
	                                onClick={() => {
	                                  setExpandedThreadIds((current) =>
	                                    current.includes(threadExpansionId)
	                                      ? current.filter((id) => id !== threadExpansionId)
	                                      : [...current, threadExpansionId],
	                                  )
	                                }}
	                                size="sm"
	                                type="button"
	                                variant="outline"
	                              >
	                                <ChevronDown
	                                  className={[
	                                    'size-3.5 transition-transform',
	                                    isExpanded ? 'rotate-180' : '',
	                                  ].join(' ')}
	                                />
	                              </Button>
	                            ) : null}
	                            </div>
	                        <p className="text-xs text-slate-400">
	                          {mailbox?.label ? `${mailbox.label} · ` : ''}from {thread.from} to {mailbox?.username ?? 'dein Postfach'}
	                        </p>
                        <p className="font-medium text-slate-950">{thread.subject}</p>
                        <p className="mt-1 text-sm text-slate-600">
                          {thread.from} · {formatDate(thread.date)}
                          {thread.messageCount && thread.messageCount > 1 ? ` · ${thread.messageCount} E-Mails` : ''}
                        </p>
                        <p className="mt-2 text-sm text-slate-500">{thread.snippet}</p>
                      </div>
	                      <Button
	                        onClick={() => {
	                          setSelectedThread(thread)
	                          setEditingPermalink(null)
	                          setPermalinkError(null)
	                          setIsPermalinkOverlayOpen(true)
	                        }}
                        variant="outline"
                      >
                        <LinkIcon className="size-4" />
	                        Permalink anlegen
	                      </Button>
	                      </div>
	                      {isExpanded && threadMessages.length > 1 ? (
	                        <div className="mt-4 space-y-2 border-t border-slate-200 pt-4">
	                          {threadMessages.map((message) => (
	                            <div key={message.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
	                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
	                                <div className="min-w-0">
	                                  <p className="truncate text-sm font-medium text-slate-950">{message.subject}</p>
	                                  <p className="mt-1 text-xs text-slate-500">
	                                    {message.from} · {formatDate(message.date)}
	                                  </p>
	                                </div>
	                                <Badge className="min-h-6 shrink-0 px-2 py-0.5 text-[11px]" variant="default">
	                                  {message.folder}
	                                </Badge>
	                              </div>
	                              <p className="mt-2 text-sm leading-6 text-slate-600">{message.snippet}</p>
	                            </div>
	                          ))}
	                        </div>
	                      ) : null}
	                    </div>
	                    )
	                  })}
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
                <CardTitle>
                  {editingMailbox ? 'IMAP-Server bearbeiten' : 'Neuen IMAP-Server eintragen'}
                </CardTitle>
                <CardDescription>
                  {editingMailbox
                    ? 'Passwort leer lassen, wenn es unveraendert bleiben soll.'
                    : 'Nur die wirklich noetigen Angaben, der Rest bleibt schlank.'}
                </CardDescription>
              </div>
              <Button
                aria-label="Overlay schliessen"
                className="size-9 p-0"
                onClick={() => {
                  setIsMailboxOverlayOpen(false)
                  setEditingMailbox(null)
                }}
                size="sm"
                variant="ghost"
              >
                <X className="size-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <form
                key={editingMailbox?.id ?? 'new-mailbox'}
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
                    const input = {
                      label: String(formData.get('label') ?? ''),
                      host: String(formData.get('host') ?? ''),
                      port: Number(formData.get('port') ?? 993),
                      username: String(formData.get('username') ?? ''),
                      password: String(formData.get('imapPassword') ?? '').trim(),
                      folder: String(formData.get('folder') ?? 'INBOX'),
                      secure: true,
                    }

                    if (editingMailbox) {
                      const updatedMailbox = await updateMailbox(
                        editingMailbox.id,
                        {
                          ...input,
                          password: input.password || undefined,
                        },
                        sessionToken,
                      )

                      setMailboxes((current) =>
                        current.map((mailbox) =>
                          mailbox.id === updatedMailbox.id ? updatedMailbox : mailbox,
                        ),
                      )
                      setSelectedMailboxIds([updatedMailbox.id])
                      setSuccessToast('IMAP-Server gespeichert')
                    } else {
                      const createdMailbox = await createMailbox(input, sessionToken)

                      setMailboxes((current) => [createdMailbox, ...current])
                      setSelectedMailboxIds([createdMailbox.id])
                      setSuccessToast('IMAP-Server gespeichert')
                    }

                    setIsMailboxOverlayOpen(false)
                    setEditingMailbox(null)
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
                    <Input
                      id="mailbox-label"
                      name="label"
                      defaultValue={editingMailbox?.label ?? ''}
                      placeholder="ralfw.de"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mailbox-folder">Ordner</Label>
                    <Input
                      id="mailbox-folder"
                      defaultValue={editingMailbox?.folder ?? 'INBOX'}
                      name="folder"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mailbox-host">IMAP Host</Label>
                  <Input
                    id="mailbox-host"
                    name="host"
                    defaultValue={editingMailbox?.host ?? ''}
                    placeholder="mail.example.com"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="mailbox-port">Port</Label>
                    <Input id="mailbox-port" defaultValue={editingMailbox?.port ?? 993} name="port" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mailbox-username">Benutzername</Label>
                    <Input
                      id="mailbox-username"
                      name="username"
                      defaultValue={editingMailbox?.username ?? ''}
                      placeholder="info@example.com"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mailbox-password">IMAP Passwort</Label>
                  <Input
                    id="mailbox-password"
                    name="imapPassword"
                    placeholder={editingMailbox ? 'Unveraendert lassen' : ''}
                    type="password"
                  />
                </div>

                {mailboxError ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {mailboxError}
                  </div>
                ) : null}

                <div className="flex justify-end gap-3 pt-2">
                  <Button
                    onClick={() => {
                      setIsMailboxOverlayOpen(false)
                      setEditingMailbox(null)
                    }}
                    type="button"
                    variant="ghost"
                  >
                    Abbrechen
                  </Button>
                  <Button disabled={isSavingMailbox} type="submit">
                    {isSavingMailbox ? <LoaderCircle className="size-4 animate-spin" /> : <Server className="size-4" />}
                    {editingMailbox ? 'Aenderungen speichern' : 'Speichern'}
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
	                <CardTitle>{editingPermalink ? 'Permalink bearbeiten' : 'Neuen Permalink anlegen'}</CardTitle>
	                <CardDescription>
	                  {editingPermalink
	                    ? editingPermalink.subject
	                    : selectedThread
	                      ? selectedThread.subject
	                      : 'PIN und Ablaufdatum sind optional.'}
	                </CardDescription>
              </div>
              <Button
                aria-label="Overlay schliessen"
                className="size-9 p-0"
	                onClick={() => {
	                  setIsPermalinkOverlayOpen(false)
	                  setEditingPermalink(null)
	                  setSelectedThread(null)
	                }}
                size="sm"
                variant="ghost"
              >
                <X className="size-4" />
              </Button>
            </CardHeader>
            <CardContent>
	              <form
	                key={editingPermalink?.id ?? selectedThread?.id ?? 'new-permalink'}
	                className="space-y-4"
                onSubmit={async (event) => {
                  event.preventDefault()

		                  if (!sessionToken || (!selectedThread && !editingPermalink)) {
		                    setPermalinkError('Thread oder Session fehlt.')
		                    return
		                  }

                  const formData = new FormData(event.currentTarget)
                  const pin = String(formData.get('pin') ?? '').trim()
                  const expiresAt = String(formData.get('expiresAt') ?? '').trim()

                  setIsSavingPermalink(true)
	                  setPermalinkJobStatus(editingPermalink ? null : 'pending')
	                  setPermalinkError(null)
	
	                  try {
	                    if (editingPermalink) {
	                      const updatedPermalink = await updatePermalink(
	                        editingPermalink.mailbox_id,
	                        editingPermalink.id,
	                        {
	                          pin,
	                          expiresAt: expiresAt || null,
	                        },
	                        sessionToken,
	                      )

	                      setPermalinks((current) =>
	                        current.map((item) =>
	                          item.id === updatedPermalink.id ? updatedPermalink : item,
	                        ),
	                      )
	                      setSuccessToast('Permalink gespeichert')
	                      setIsPermalinkOverlayOpen(false)
	                      setEditingPermalink(null)
	                      event.currentTarget.reset()
	                      return
	                    }

	                    if (!selectedThread) {
	                      throw new Error('Thread fehlt.')
	                    }

		                    const startedJob = await startCreatePermalinkJob(
		                      selectedThread.mailbox_id,
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
                    let currentJob = startedJob

                    for (let attempt = 0; attempt < 120; attempt += 1) {
                      setPermalinkJobStatus(currentJob.status)

                      if (currentJob.status === 'completed') {
                        const createdPermalink = currentJob.result?.permalink

                        if (!createdPermalink) {
                          throw new Error('Permalink-Job wurde ohne Ergebnis abgeschlossen.')
                        }

                        setPermalinks((current) => [createdPermalink, ...current])
                        await copyPermalinkToClipboard(createdPermalink.token)
	                        setSuccessToast('Permalink kopiert')
	                        setIsPermalinkOverlayOpen(false)
	                        setSelectedThread(null)
	                        setEditingPermalink(null)
	                        event.currentTarget.reset()
                        return
                      }

                      if (currentJob.status === 'failed') {
                        throw new Error(currentJob.error || 'Permalink konnte nicht erstellt werden.')
                      }

                      await delay(1500)
                      currentJob = await loadImapJob<CreatePermalinkJobResult>(startedJob.id, sessionToken)
                    }

                    throw new Error('Permalink-Job laeuft zu lange. Bitte spaeter erneut versuchen.')
                  } catch (error) {
                    setPermalinkError(
                      error instanceof Error ? error.message : 'Permalink konnte nicht erstellt werden.',
                    )
                  } finally {
                    setIsSavingPermalink(false)
                    setPermalinkJobStatus(null)
                  }
                }}
              >
	                {selectedThread || editingPermalink ? (
	                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
	                    <p className="font-medium text-slate-950">
	                      {editingPermalink?.subject ?? selectedThread?.subject}
	                    </p>
	                    <p className="mt-1">
	                      {editingPermalink
	                        ? `${editingPermalink.from_label} · ${formatDate(editingPermalink.email_date)}`
	                        : selectedThread
	                          ? `${selectedThread.from} · ${formatDate(selectedThread.date)}`
	                          : ''}
	                    </p>
	                  </div>
	                ) : null}

                <div className="space-y-2">
                  <Label htmlFor="permalink-pin">PIN (optional)</Label>
	                  <Input
	                    id="permalink-pin"
	                    maxLength={4}
	                    name="pin"
	                    defaultValue={editingPermalink?.has_pin ? '••••' : ''}
	                    placeholder="4 Ziffern"
	                  />
	                  {editingPermalink?.has_pin ? (
	                    <p className="text-sm text-slate-500">Leer speichern entfernt die PIN, 4 Ziffern ersetzen sie.</p>
	                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="permalink-expires-at">Ablaufdatum (optional)</Label>
	                  <Input
	                    id="permalink-expires-at"
	                    name="expiresAt"
	                    type="datetime-local"
	                    defaultValue={editingPermalink?.expires_at ? editingPermalink.expires_at.slice(0, 16) : ''}
	                  />
                </div>

                {permalinkError ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {permalinkError}
                  </div>
                ) : null}

                {isSavingPermalink ? (
                  <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <LoaderCircle className="size-4 animate-spin" />
                    {permalinkJobStatus === 'processing'
                      ? 'Mail wird im Hintergrund aus IMAP gelesen und als Snapshot gespeichert...'
                      : 'Permalink-Job wird gestartet...'}
                  </div>
                ) : null}

                <div className="flex justify-end gap-3">
	                  <Button
	                    onClick={() => {
	                      setIsPermalinkOverlayOpen(false)
	                      setEditingPermalink(null)
	                      setSelectedThread(null)
	                    }}
	                    type="button"
	                    variant="ghost"
	                  >
	                    Abbrechen
	                  </Button>
	                  <Button disabled={isSavingPermalink} type="submit">
	                    {isSavingPermalink ? <LoaderCircle className="size-4 animate-spin" /> : <LinkIcon className="size-4" />}
	                    {isSavingPermalink
	                      ? editingPermalink
	                        ? 'Wird gespeichert'
	                        : 'Snapshot wird erstellt'
	                      : editingPermalink
	                        ? 'Speichern'
	                        : 'Permalink erstellen'}
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
