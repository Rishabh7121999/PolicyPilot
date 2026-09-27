import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useMatch } from 'react-router-dom'
import { listPolicies, sendChatMessage, speakTextStream, transcribeAudio } from '../api/client'
import { ChatBubble, type ChatMessage } from './ChatBubble'
import { MicButton } from './MicButton'
import { ArrowRightIcon, ChatIcon, ChevronDownIcon, CloseIcon, LeafLogoIcon, SendIcon } from './icons'
import { useVoiceRecorder } from '../hooks/useVoiceRecorder'
import { AudioQueuePlayer } from '../lib/audioQueue'
import type { ClarificationOption, PolicyListItem } from '../api/types'

function policyLabel(p: PolicyListItem): string {
  return [p.insurer, p.product_name].filter(Boolean).join(' — ') || `${p.policy_type} policy`
}

const SUGGESTED_PROMPTS = [
  'What is covered in my policy?',
  'How do I file a claim?',
  'Find cashless hospitals',
  'Explain this in simple terms',
]

type AssistantTab = 'chat' | 'voice'

export function FloatingAssistant() {
  const location = useLocation()
  const policyMatch = useMatch('/policies/:id')
  const policyId = policyMatch?.params.id ? Number(policyMatch.params.id) : null

  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<AssistantTab>('chat')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  // Once a "which policy?" clarification is answered, keep that policy in
  // scope for the rest of this floating conversation (until the page/policy
  // context changes) so follow-ups don't get re-asked.
  const [scopedPolicyId, setScopedPolicyId] = useState<number | null>(null)
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null)
  const [voiceMode, setVoiceMode] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [policies, setPolicies] = useState<PolicyListItem[]>([])
  const [scopePickerOpen, setScopePickerOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const audioPlayerRef = useRef<AudioQueuePlayer | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const effectivePolicyId = policyId ?? scopedPolicyId
  const routePolicy = policyId != null ? policies.find((p) => p.id === policyId) : undefined
  const scopedPolicy = scopedPolicyId != null ? policies.find((p) => p.id === scopedPolicyId) : undefined

  useEffect(() => {
    listPolicies()
      .then((data) => setPolicies(data.filter((p) => p.status === 'ready')))
      .catch(() => {})
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Reset the conversation when switching which policy is in scope, so the
  // assistant doesn't carry over context from a different policy's page.
  useEffect(() => {
    setMessages([])
    setScopedPolicyId(null)
    setPendingQuestion(null)
    setScopePickerOpen(false)
    audioPlayerRef.current?.stop()
    setSpeaking(false)
  }, [policyId])

  useEffect(() => {
    return () => audioPlayerRef.current?.stop()
  }, [])

  // Clicking anywhere outside the open panel dismisses it, like a typical
  // chat widget -- but not while the scope picker's own dropdown is open,
  // since that's rendered inside the panel and shouldn't fight with this.
  useEffect(() => {
    if (!open) return

    function handlePointerDown(e: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  async function speakAnswer(text: string) {
    audioPlayerRef.current?.stop()
    const player = new AudioQueuePlayer(() => {
      setSpeaking(false)
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

  async function runTurn(
    text: string,
    opts?: { speak?: boolean; showUserBubble?: boolean; policyIdOverride?: number | null },
  ) {
    if (!text.trim() || busy) return

    audioPlayerRef.current?.stop()
    setSpeaking(false)

    const history = messages.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)

    if (opts?.showUserBubble !== false) {
      setMessages((prev) => [...prev, { role: 'user', text }])
    }
    setBusy(true)

    // Placeholder assistant bubble that fills in as tokens stream in.
    setMessages((prev) => [...prev, { role: 'assistant', text: '' }])

    function updateLastMessage(patch: Partial<ChatMessage>) {
      setMessages((prev) => {
        const copy = [...prev]
        copy[copy.length - 1] = { ...copy[copy.length - 1], ...patch }
        return copy
      })
    }

    const policyIdForThisTurn =
      opts?.policyIdOverride !== undefined ? opts.policyIdOverride : effectivePolicyId

    let resolvedPolicy: ClarificationOption | undefined
    let clarificationOptions: ClarificationOption[] | undefined
    let needsClarification = false
    let streamedText = ''
    let finalText = ''

    try {
      await sendChatMessage(
        { message: text, history, policy_id: policyIdForThisTurn, voice: opts?.speak },
        (event) => {
          if (event.type === 'meta') {
            // Only treat the resolved policy as newly-established (and worth
            // surfacing) when it differs from what was already in scope
            // going into this turn -- otherwise every message in an
            // already-scoped conversation would get a redundant "Answered
            // using" tag. Route-locked conversations never get this
            // treatment since their scope is already visible via the badge.
            if (
              policyId == null &&
              event.resolved_policy &&
              event.resolved_policy.id !== policyIdForThisTurn
            ) {
              resolvedPolicy = event.resolved_policy
            }
            clarificationOptions = event.clarification_options ?? undefined
            needsClarification = event.needs_clarification
          } else if (event.type === 'token') {
            streamedText += event.text
            updateLastMessage({ text: streamedText })
          } else if (event.type === 'done') {
            finalText = event.answer
            updateLastMessage({
              text: finalText,
              sources: event.sources,
              clarificationOptions,
              resolvedPolicy,
            })
          }
        },
      )

      if (resolvedPolicy) setScopedPolicyId(resolvedPolicy.id)
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
    setScopedPolicyId(option.id)
    const question = pendingQuestion
    setPendingQuestion(null)
    if (question) await runTurn(question, { showUserBubble: false, policyIdOverride: option.id })
  }

  async function handleRecorded(blob: Blob) {
    setBusy(true)
    try {
      const { transcript } = await transcribeAudio(blob)
      setBusy(false)
      if (transcript.trim()) {
        sendMessage(transcript, { speak: true })
      }
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

  // The full Chat page is the persistent-history surface; this floating
  // widget is the ephemeral quick-question one, so don't show both at once.
  if (location.pathname.startsWith('/chat')) return null

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-sage-800 px-4 py-3 text-sm font-medium text-white shadow-lg hover:bg-sage-900"
      >
        <LeafLogoIcon className="h-5 w-5" />
        {policyId ? 'Ask about your policy' : 'Ask about your policies'}
      </button>
    )
  }

  const messageList = (
    <div className="flex-1 space-y-3 overflow-y-auto p-4">
      {messages.length === 0 && (
        <div>
          <p className="rounded-2xl bg-beige-100 p-3 text-sm text-neutral-700">
            Hi! I'm your PolicyPilot assistant. I can help you with:
            <br />
            Explaining your policy in simple terms, checking what's covered, guiding you through the claim
            process, finding cashless hospitals, and answering any questions about your insurance.
            <br />
            <br />
            How can I help you today?
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {SUGGESTED_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => sendMessage(prompt)}
                className="rounded-full border border-beige-200 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-beige-100"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}
      {messages.map((m, i) => (
        <ChatBubble key={i} message={m} onSelectClarification={handleSelectClarification} />
      ))}
      {busy && messages[messages.length - 1]?.text === '' && (
        <p className="text-sm text-neutral-500">Thinking…</p>
      )}
      <div ref={scrollRef} />
    </div>
  )

  return (
    <div
      ref={panelRef}
      className="fixed bottom-6 right-6 z-40 flex h-[560px] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-beige-200 bg-cream-50 shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-beige-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <LeafLogoIcon className="h-5 w-5" />
          <span className="text-sm font-semibold text-neutral-900">PolicyPilot Assistant</span>
        </div>
        <div className="flex items-center gap-1">
          <Link
            to={policyId ? `/chat?policy_id=${policyId}` : '/chat'}
            title="Open full chat history"
            className="flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-sage-700 hover:bg-beige-100"
          >
            Full chat <ArrowRightIcon className="h-3 w-3" />
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-full p-1 text-neutral-400 hover:bg-beige-100"
            aria-label="Close assistant"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="border-b border-beige-200 px-4 py-2">
        {policyId != null ? (
          <span className="inline-flex items-center rounded-full bg-sage-100 px-2.5 py-1 text-xs font-medium text-sage-800">
            Scoped to: {routePolicy ? policyLabel(routePolicy) : 'this policy'}
          </span>
        ) : (
          <div className="relative inline-block">
            <button
              type="button"
              onClick={() => setScopePickerOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-full border border-beige-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-beige-50"
            >
              {scopedPolicy ? `Scoped to: ${policyLabel(scopedPolicy)}` : 'All policies'}
              <ChevronDownIcon className="h-3.5 w-3.5" />
            </button>
            {scopePickerOpen && (
              <div className="absolute left-0 top-full z-10 mt-1 w-56 max-h-64 overflow-y-auto rounded-xl border border-beige-200 bg-white p-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setScopedPolicyId(null)
                    setScopePickerOpen(false)
                  }}
                  className={`block w-full rounded-lg px-2.5 py-1.5 text-left text-xs ${
                    scopedPolicyId == null ? 'bg-sage-100 text-sage-800' : 'text-neutral-700 hover:bg-beige-100'
                  }`}
                >
                  All policies
                </button>
                {policies.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setScopedPolicyId(p.id)
                      setScopePickerOpen(false)
                    }}
                    className={`block w-full truncate rounded-lg px-2.5 py-1.5 text-left text-xs ${
                      scopedPolicyId === p.id ? 'bg-sage-100 text-sage-800' : 'text-neutral-700 hover:bg-beige-100'
                    }`}
                  >
                    {policyLabel(p)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-1 border-b border-beige-200 px-4 pt-2">
        <button
          type="button"
          onClick={() => setTab('chat')}
          className={`flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-sm font-medium ${
            tab === 'chat' ? 'border-b-2 border-sage-600 text-sage-700' : 'text-neutral-500'
          }`}
        >
          <ChatIcon className="h-4 w-4" /> Chat
        </button>
        <button
          type="button"
          onClick={() => setTab('voice')}
          className={`flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-sm font-medium ${
            tab === 'voice' ? 'border-b-2 border-sage-600 text-sage-700' : 'text-neutral-500'
          }`}
        >
          Voice
        </button>
      </div>

      {tab === 'chat' ? (
        <>
          {messageList}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              sendMessage(input)
            }}
            className="flex items-center gap-2 border-t border-beige-200 p-3"
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
              className="flex-1 rounded-full border border-beige-200 px-4 py-2 text-sm text-neutral-900 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sage-700 text-white disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Send"
            >
              <SendIcon className="h-4 w-4" />
            </button>
          </form>
        </>
      ) : (
        <>
          {messageList}
          <div className="flex flex-col items-center gap-2 border-t border-beige-200 p-4">
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
            <p className="text-xs text-neutral-500">
              {recording
                ? "Listening… pause and I'll answer automatically"
                : speaking
                  ? 'Speaking… tap the mic to interrupt'
                  : 'Tap the mic and ask your question out loud'}
            </p>
            <MicButton
              recording={recording}
              hasSpoken={hasSpoken}
              onStart={startRecording}
              onStop={stopRecording}
              disabled={busy}
              speaking={speaking}
              onInterrupt={handleInterrupt}
            />
          </div>
        </>
      )}
    </div>
  )
}
