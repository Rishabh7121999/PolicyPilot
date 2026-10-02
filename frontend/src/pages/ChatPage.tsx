import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  createChatSession,
  deleteChatSession,
  getChatSession,
  listChatSessions,
  listPolicies,
  sendSessionMessage,
  speakTextStream,
  transcribeAudio,
  updateChatSessionPolicy,
} from '../api/client'
import { ChatBubble, type ChatMessage } from '../components/ChatBubble'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { MicButton } from '../components/MicButton'
import { ChatIcon, ChevronDownIcon, CloseIcon, DocumentIcon, MenuIcon, PanelToggleIcon, SendIcon } from '../components/icons'
import { useAppShell } from '../context/AppShellContext'
import { useVoiceRecorder } from '../hooks/useVoiceRecorder'
import { AudioQueuePlayer } from '../lib/audioQueue'
import { policyDisplayLabel } from '../lib/policyType'
import type { ChatSessionListItem, ClarificationOption, PolicyListItem } from '../api/types'

const policyLabel = policyDisplayLabel

const SUGGESTIONS = [
  'What is covered under my policy?',
  'What is the waiting period?',
  'How do I file a claim?',
  'Find cashless hospitals',
]

export function ChatPage() {
  const [searchParams] = useSearchParams()
  const policyIdParam = searchParams.get('policy_id')
  const initialPolicyId = policyIdParam ? Number(policyIdParam) : null
  // A quick action on Home can deep-link here with a pre-filled question
  // (e.g. "Find Cashless Hospitals") -- just prefill the box, don't auto-send,
  // so the user can review/edit before it goes out.
  const initialQuestion = searchParams.get('q') ?? ''

  const [sessions, setSessions] = useState<ChatSessionListItem[]>([])
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null)
  const [activePolicyId, setActivePolicyId] = useState<number | null>(initialPolicyId)
  const [policies, setPolicies] = useState<PolicyListItem[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState(initialQuestion)
  const [busy, setBusy] = useState(false)
  const [loadingSessions, setLoadingSessions] = useState(true)
  // The question that triggered a "which policy?" clarification, held onto so
  // picking a chip can re-ask it now that the session is scoped.
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null)
  const [voiceMode, setVoiceMode] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  // Start the conversation list collapsed on narrower desktops so the
  // conversation itself gets the width.
  const [paneCollapsed, setPaneCollapsed] = useState(() => window.matchMedia('(max-width: 1279px)').matches)
  const [deleteTarget, setDeleteTarget] = useState<ChatSessionListItem | null>(null)
  const { openPolicyViewer } = useAppShell()
  const [mobilePaneOpen, setMobilePaneOpen] = useState(false)
  const [scopePickerOpen, setScopePickerOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const audioPlayerRef = useRef<AudioQueuePlayer | null>(null)
  const scopePickerRef = useRef<HTMLDivElement>(null)

  const activePolicy = activePolicyId != null ? policies.find((p) => p.id === activePolicyId) : undefined

  async function refreshSessions() {
    const data = await listChatSessions()
    setSessions(data)
  }

  useEffect(() => {
    refreshSessions().finally(() => setLoadingSessions(false))
    listPolicies()
      .then((data) => setPolicies(data.filter((p) => p.status === 'ready')))
      .catch(() => {})
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    return () => audioPlayerRef.current?.stop()
  }, [])

  useEffect(() => {
    if (!scopePickerOpen) return

    function handlePointerDown(e: PointerEvent) {
      if (scopePickerRef.current && !scopePickerRef.current.contains(e.target as Node)) {
        setScopePickerOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [scopePickerOpen])

  async function openSession(id: number) {
    setActiveSessionId(id)
    setPendingQuestion(null)
    setMobilePaneOpen(false)
    audioPlayerRef.current?.stop()
    setSpeaking(false)
    const detail = await getChatSession(id)
    setActivePolicyId(detail.policy_id)
    setMessages(
      detail.messages.map((m) => ({
        role: m.role,
        text: m.text,
        sources: m.sources ?? undefined,
        clarificationOptions: m.meta?.clarification_options,
        resolvedPolicy: m.meta?.resolved_policy,
      })),
    )
  }

  function startNewChat() {
    setActiveSessionId(null)
    setMessages([])
    setPendingQuestion(null)
    audioPlayerRef.current?.stop()
    setSpeaking(false)
    setMobilePaneOpen(false)
  }

  async function ensureSession(): Promise<number> {
    if (activeSessionId !== null) return activeSessionId
    const session = await createChatSession(activePolicyId)
    setActiveSessionId(session.id)
    setSessions((prev) => [session, ...prev])
    return session.id
  }

  // Persists a policy scope onto a session (creating the session first if
  // none exists yet) and keeps local state/the sidebar list in sync.
  async function persistScope(sessionId: number, newPolicyId: number | null) {
    setActivePolicyId(newPolicyId)
    await updateChatSessionPolicy(sessionId, newPolicyId)
    setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, policy_id: newPolicyId } : s)))
  }

  async function handleScopeSelect(newPolicyId: number | null) {
    setScopePickerOpen(false)
    setPendingQuestion(null)

    // Don't create a session just for a pre-message scope change -- only
    // persist if one already exists, matching the lazy session-creation
    // behavior everywhere else on this page.
    if (activeSessionId !== null) {
      await persistScope(activeSessionId, newPolicyId)
    } else {
      setActivePolicyId(newPolicyId)
    }
  }

  async function speakAnswer(text: string) {
    audioPlayerRef.current?.stop()
    const player = new AudioQueuePlayer(() => {
      setSpeaking(false)
      // Hands-free mode: as soon as the answer finishes playing, start
      // listening for the next question automatically.
      if (voiceMode) startRecording()
    })
    audioPlayerRef.current = player
    setSpeaking(true)

    try {
      await speakTextStream(text, (blob) => player.push(blob))
    } catch (err) {
      // Server TTS unavailable (e.g. its daily quota is spent) -- use the
      // browser's own voice rather than answering in silence.
      console.warn('Server voice unavailable, using browser speech:', err)
      await player.speakWithBrowser(text)
    } finally {
      player.end()
    }
  }

  async function runTurn(text: string, opts?: { speak?: boolean; showUserBubble?: boolean }) {
    if (!text.trim() || busy) return

    audioPlayerRef.current?.stop()
    setSpeaking(false)

    if (opts?.showUserBubble !== false) {
      setMessages((prev) => [...prev, { role: 'user', text }])
    }
    setBusy(true)

    const policyIdBeforeThisTurn = activePolicyId

    // Placeholder assistant bubble that fills in as tokens stream in.
    setMessages((prev) => [...prev, { role: 'assistant', text: '' }])

    function updateLastMessage(patch: Partial<ChatMessage>) {
      setMessages((prev) => {
        const copy = [...prev]
        copy[copy.length - 1] = { ...copy[copy.length - 1], ...patch }
        return copy
      })
    }

    let resolvedPolicy: ClarificationOption | undefined
    let clarificationOptions: ClarificationOption[] | undefined
    let needsClarification = false
    let streamedText = ''
    let finalText = ''

    try {
      const sessionId = await ensureSession()

      await sendSessionMessage(
        sessionId,
        text,
        (event) => {
          if (event.type === 'meta') {
            // Only surface/persist the resolved policy when it's
            // newly-established relative to what was already scoped going
            // into this turn, so an already-scoped session doesn't get a
            // redundant tag + PATCH every turn.
            if (event.resolved_policy && event.resolved_policy.id !== policyIdBeforeThisTurn) {
              resolvedPolicy = event.resolved_policy
            }
            clarificationOptions = event.clarification_options ?? undefined
            needsClarification = event.needs_clarification
          } else if (event.type === 'token') {
            streamedText += event.text
            updateLastMessage({ text: streamedText })
          } else if (event.type === 'done') {
            finalText = event.assistant_message.text
            updateLastMessage({
              text: finalText,
              sources: event.assistant_message.sources ?? undefined,
              clarificationOptions,
              resolvedPolicy,
            })
          }
        },
        { voice: opts?.speak },
      )

      if (resolvedPolicy) await persistScope(sessionId, resolvedPolicy.id)
      refreshSessions()
      setPendingQuestion(needsClarification ? text : null)

      if (opts?.speak) {
        await speakAnswer(finalText)
      }
    } catch (err) {
      updateLastMessage({ text: `Error: ${err instanceof Error ? err.message : 'something went wrong'}` })
    } finally {
      setBusy(false)
    }
  }

  function sendMessage(text: string, opts?: { speak?: boolean }) {
    setInput('')
    return runTurn(text, { speak: opts?.speak, showUserBubble: true })
  }

  async function handleSelectClarification(option: ClarificationOption) {
    const sessionId = await ensureSession()
    await persistScope(sessionId, option.id)

    const question = pendingQuestion
    setPendingQuestion(null)
    if (question) await runTurn(question, { showUserBubble: false })
  }

  async function handleRecorded(blob: Blob) {
    setBusy(true)
    try {
      const { transcript } = await transcribeAudio(blob)
      setBusy(false)
      if (transcript.trim()) sendMessage(transcript, { speak: true })
    } catch (err) {
      setBusy(false)
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: `Transcription error: ${err instanceof Error ? err.message : 'something went wrong'}` },
      ])
    }
  }

  const { recording, hasSpoken, startRecording, stopRecording } = useVoiceRecorder({ onRecorded: handleRecorded })

  function handleInterrupt() {
    audioPlayerRef.current?.stop()
    setSpeaking(false)
  }

  async function confirmDeleteSession() {
    if (!deleteTarget) return
    const id = deleteTarget.id
    await deleteChatSession(id)
    setSessions((prev) => prev.filter((s) => s.id !== id))
    if (activeSessionId === id) startNewChat()
    setDeleteTarget(null)
  }

  function togglePane(e?: MouseEvent) {
    e?.stopPropagation()
    setPaneCollapsed((v) => !v)
  }

  // While collapsed, clicking anywhere in the rail expands it back out.
  function handlePaneClick() {
    if (paneCollapsed) setPaneCollapsed(false)
  }

  return (
    <div className="flex h-full overflow-hidden">
      {mobilePaneOpen && (
        <div
          onClick={() => setMobilePaneOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 transition-opacity md:hidden"
        />
      )}

      <aside
        onClick={handlePaneClick}
        className={`fixed inset-y-0 left-0 z-40 flex w-72 -translate-x-full flex-col border-r border-beige-200 bg-cream-50 p-4 transition-transform duration-200 md:relative md:z-auto md:translate-x-0 md:transition-[width] ${
          mobilePaneOpen ? 'translate-x-0' : ''
        } ${paneCollapsed ? 'md:w-16 md:cursor-pointer md:items-center md:px-2 md:py-4' : 'md:w-72 md:p-4'}`}
      >
        <div className={`mb-3 flex items-center gap-2 ${paneCollapsed ? 'md:flex-col' : ''}`}>
          <button
            type="button"
            onClick={startNewChat}
            title="New chat"
            aria-label="New chat"
            className={`flex items-center justify-center gap-2 rounded-xl bg-sage-700 text-sm font-medium text-white transition-transform duration-150 hover:bg-sage-800 active:scale-[0.97] ${
              paneCollapsed ? 'md:h-9 md:w-9' : 'flex-1 px-3 py-2.5'
            }`}
          >
            <span className="text-base leading-none">+</span>
            <span className={paneCollapsed ? 'md:hidden' : ''}>New Chat</span>
          </button>
          <button
            type="button"
            onClick={togglePane}
            title={paneCollapsed ? 'Expand conversations' : 'Collapse conversations'}
            aria-label={paneCollapsed ? 'Expand conversations' : 'Collapse conversations'}
            className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl text-neutral-500 hover:bg-beige-100 md:flex"
          >
            <PanelToggleIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setMobilePaneOpen(false)}
            title="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-neutral-500 hover:bg-beige-100 md:hidden"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        {!paneCollapsed && (
          <div className="flex-1 space-y-1 overflow-y-auto">
            {loadingSessions ? (
              <p className="p-2 text-sm text-neutral-500">Loading…</p>
            ) : sessions.length === 0 ? (
              <p className="p-2 text-sm text-neutral-500">No conversations yet.</p>
            ) : (
              sessions.map((s) => (
                <div
                  key={s.id}
                  className={`group flex w-full items-center rounded-xl text-base transition-colors ${
                    activeSessionId === s.id ? 'bg-sage-100 text-sage-800' : 'text-neutral-700 hover:bg-beige-100'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => openSession(s.id)}
                    className="min-w-0 flex-1 truncate px-3 py-3 text-left"
                  >
                    {s.title ?? 'New conversation'}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeleteTarget(s)
                    }}
                    aria-label={`Delete conversation ${s.title ?? ''}`}
                    className="mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-500 opacity-0 hover:text-red-600 focus:opacity-100 group-hover:opacity-100"
                  >
                    <CloseIcon className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2 border-b border-beige-200 bg-cream-50/60 px-3 py-3 sm:px-8">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobilePaneOpen(true)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-beige-100 md:hidden"
              aria-label="Open conversations"
            >
              <MenuIcon className="h-4 w-4" />
            </button>
            <div ref={scopePickerRef} className="relative">
            <button
              type="button"
              onClick={() => setScopePickerOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-full border border-beige-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm hover:bg-beige-50"
            >
              <span className="text-neutral-500">Asking about</span>
              <span className="max-w-[12rem] truncate">
                {activePolicy ? policyLabel(activePolicy) : 'All policies'}
              </span>
              <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
            </button>
            {scopePickerOpen && (
              <div className="absolute left-0 top-full z-10 mt-1.5 max-h-64 w-80 overflow-y-auto rounded-xl border border-beige-200 bg-white p-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => handleScopeSelect(null)}
                  className={`block w-full rounded-lg px-3 py-2.5 text-left text-sm ${
                    activePolicyId == null ? 'bg-sage-100 text-sage-800' : 'text-neutral-700 hover:bg-beige-100'
                  }`}
                >
                  All policies
                </button>
                {policies.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleScopeSelect(p.id)}
                    className={`block w-full truncate rounded-lg px-3 py-2.5 text-left text-sm ${
                      activePolicyId === p.id ? 'bg-sage-100 text-sage-800' : 'text-neutral-700 hover:bg-beige-100'
                    }`}
                  >
                    {policyLabel(p)}
                  </button>
                ))}
              </div>
            )}
            </div>
            {activePolicy && (
              <button
                type="button"
                onClick={() => openPolicyViewer(activePolicy.id)}
                className="hidden items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-sage-700 hover:bg-sage-50 sm:inline-flex"
              >
                <DocumentIcon className="h-4 w-4" />
                View policy
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setVoiceMode((v) => !v)}
            aria-pressed={voiceMode}
            title="When on, the assistant automatically starts listening again after it finishes speaking"
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              voiceMode ? 'bg-sage-700 text-white' : 'border border-beige-200 text-neutral-600 hover:bg-beige-100'
            }`}
          >
            {voiceMode ? 'Hands-free: on' : 'Hands-free: off'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
          <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-5">
          {messages.length === 0 && (
            <div className="m-auto max-w-xl py-8 text-center">
              <ChatIcon className="mx-auto mb-4 h-10 w-10 text-sage-400" />
              <h2 className="text-xl font-semibold text-neutral-900">What would you like to know?</h2>
              <p className="mt-2 text-base text-neutral-600">
                Ask about coverage, claims, waiting periods, or cashless hospitals.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setInput(q)}
                    className="rounded-full border border-beige-200 bg-white px-4 py-2 text-sm text-neutral-700 hover:bg-beige-100"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <ChatBubble key={i} message={m} policies={policies} onSelectClarification={handleSelectClarification} />
          ))}
          {voiceMode && recording && <p className="text-base text-neutral-500">Listening…</p>}
          <div ref={scrollRef} />
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            sendMessage(input)
          }}
          className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 pb-5 pt-3 sm:px-8"
        >
          <MicButton
            recording={recording}
            hasSpoken={hasSpoken}
            onStart={startRecording}
            onStop={stopRecording}
            disabled={busy}
            speaking={speaking}
            onInterrupt={handleInterrupt}
            large
          />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your question…"
            disabled={busy}
            className="flex-1 rounded-full border border-beige-200 bg-white px-5 py-3.5 text-base text-neutral-900 shadow-sm outline-none focus:border-sage-400 focus:ring-2 focus:ring-sage-200 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sage-700 text-white disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Send"
          >
            <SendIcon className="h-4 w-4" />
          </button>
        </form>
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="Delete conversation?"
          message={`"${deleteTarget.title ?? 'New conversation'}" and all its messages will be removed. This can't be undone.`}
          confirmLabel="Delete"
          onConfirm={confirmDeleteSession}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
