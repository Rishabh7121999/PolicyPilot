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
import { MicButton } from '../components/MicButton'
import { ChatIcon, ChevronDownIcon, PanelToggleIcon, SendIcon } from '../components/icons'
import { useVoiceRecorder } from '../hooks/useVoiceRecorder'
import { AudioQueuePlayer } from '../lib/audioQueue'
import type { ChatSessionListItem, ClarificationOption, PolicyListItem } from '../api/types'

function policyLabel(p: PolicyListItem): string {
  return [p.insurer, p.product_name].filter(Boolean).join(' — ') || `${p.policy_type} policy`
}

export function ChatPage() {
  const [searchParams] = useSearchParams()
  const policyIdParam = searchParams.get('policy_id')
  const initialPolicyId = policyIdParam ? Number(policyIdParam) : null

  const [sessions, setSessions] = useState<ChatSessionListItem[]>([])
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null)
  const [activePolicyId, setActivePolicyId] = useState<number | null>(initialPolicyId)
  const [policies, setPolicies] = useState<PolicyListItem[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [loadingSessions, setLoadingSessions] = useState(true)
  // The question that triggered a "which policy?" clarification, held onto so
  // picking a chip can re-ask it now that the session is scoped.
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null)
  const [voiceMode, setVoiceMode] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [paneCollapsed, setPaneCollapsed] = useState(false)
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
      console.error('Voice playback failed:', err)
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

  async function handleDeleteSession(id: number, e: MouseEvent) {
    e.stopPropagation()
    if (!confirm('Delete this conversation?')) return
    await deleteChatSession(id)
    setSessions((prev) => prev.filter((s) => s.id !== id))
    if (activeSessionId === id) startNewChat()
  }

  return (
    <div className="flex h-full overflow-hidden">
      <aside
        className={`flex shrink-0 flex-col border-r border-beige-200 bg-cream-50 transition-[width] duration-200 ${
          paneCollapsed ? 'w-16 items-center px-2 py-4' : 'w-72 p-4'
        }`}
      >
        <div className={`mb-3 flex items-center gap-2 ${paneCollapsed ? 'flex-col' : ''}`}>
          <button
            type="button"
            onClick={() => setPaneCollapsed((v) => !v)}
            title={paneCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-neutral-500 hover:bg-beige-100"
          >
            <PanelToggleIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={startNewChat}
            title="New chat"
            className={`flex items-center justify-center gap-2 rounded-xl bg-sage-700 text-sm font-medium text-white hover:bg-sage-800 ${
              paneCollapsed ? 'h-9 w-9' : 'flex-1 px-3 py-2.5'
            }`}
          >
            <span className="text-base leading-none">+</span>
            {!paneCollapsed && 'New Chat'}
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
                <button
                  key={s.id}
                  type="button"
                  onClick={() => openSession(s.id)}
                  className={`group flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm ${
                    activeSessionId === s.id ? 'bg-sage-100 text-sage-800' : 'text-neutral-700 hover:bg-beige-100'
                  }`}
                >
                  <span className="truncate">{s.title ?? 'New conversation'}</span>
                  <span
                    role="button"
                    onClick={(e) => handleDeleteSession(s.id, e)}
                    className="shrink-0 text-xs text-neutral-400 opacity-0 hover:text-red-500 group-hover:opacity-100"
                  >
                    ✕
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </aside>

      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between gap-2 border-b border-beige-200 bg-cream-50/60 px-6 py-2.5">
          <div ref={scopePickerRef} className="relative">
            <button
              type="button"
              onClick={() => setScopePickerOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-full border border-beige-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm hover:bg-beige-50"
            >
              <span className="text-neutral-400">Scope</span>
              <span className="max-w-[12rem] truncate">
                {activePolicy ? policyLabel(activePolicy) : 'All policies'}
              </span>
              <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
            </button>
            {scopePickerOpen && (
              <div className="absolute left-0 top-full z-10 mt-1.5 max-h-64 w-64 overflow-y-auto rounded-xl border border-beige-200 bg-white p-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => handleScopeSelect(null)}
                  className={`block w-full rounded-lg px-2.5 py-1.5 text-left text-xs ${
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
                    className={`block w-full truncate rounded-lg px-2.5 py-1.5 text-left text-xs ${
                      activePolicyId === p.id ? 'bg-sage-100 text-sage-800' : 'text-neutral-700 hover:bg-beige-100'
                    }`}
                  >
                    {policyLabel(p)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setVoiceMode((v) => !v)}
            title="When on, the assistant automatically starts listening again after it finishes speaking"
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              voiceMode ? 'bg-sage-700 text-white' : 'border border-beige-200 text-neutral-600 hover:bg-beige-100'
            }`}
          >
            {voiceMode ? 'Hands-free: on' : 'Hands-free: off'}
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-6">
          {messages.length === 0 && (
            <div className="mx-auto max-w-md pt-16 text-center text-sm text-neutral-500">
              <ChatIcon className="mx-auto mb-3 h-8 w-8 text-sage-400" />
              Ask anything about your policies — coverage, claims, waiting periods, cashless hospitals.
            </div>
          )}
          {messages.map((m, i) => (
            <ChatBubble key={i} message={m} onSelectClarification={handleSelectClarification} />
          ))}
          {busy && messages[messages.length - 1]?.text === '' && (
            <p className="text-sm text-neutral-500">Thinking…</p>
          )}
          {voiceMode && recording && <p className="text-sm text-neutral-500">Listening…</p>}
          <div ref={scrollRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            sendMessage(input)
          }}
          className="mx-auto flex w-full max-w-2xl items-center gap-2 border-t border-beige-200 p-4"
        >
          <MicButton
            recording={recording}
            hasSpoken={hasSpoken}
            onStart={startRecording}
            onStop={stopRecording}
            disabled={busy}
            speaking={speaking}
            onInterrupt={handleInterrupt}
          />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your question…"
            disabled={busy}
            className="flex-1 rounded-full border border-beige-200 bg-white px-4 py-2.5 text-sm text-neutral-900 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sage-700 text-white disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Send"
          >
            <SendIcon className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  )
}
