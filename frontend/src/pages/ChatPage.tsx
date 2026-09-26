import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { listPolicies, sendChatMessage, speakText, transcribeAudio } from '../api/client'
import { ChatBubble, type ChatMessage } from '../components/ChatBubble'
import { MicButton } from '../components/MicButton'
import type { PolicyListItem } from '../api/types'

export function ChatPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const policyIdParam = searchParams.get('policy_id')
  const policyId = policyIdParam ? Number(policyIdParam) : null

  const [policies, setPolicies] = useState<PolicyListItem[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [autoSpeak, setAutoSpeak] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listPolicies().then((data) => setPolicies(data.filter((p) => p.status === 'ready')))
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(text: string) {
    if (!text.trim() || busy) return

    const history = messages.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
    setMessages((prev) => [...prev, { role: 'user', text }])
    setInput('')
    setBusy(true)

    try {
      const result = await sendChatMessage({ message: text, history, policy_id: policyId })
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: result.answer, sources: result.sources },
      ])

      if (autoSpeak) {
        const blob = await speakText(result.answer)
        new Audio(URL.createObjectURL(blob)).play()
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: `Error: ${err instanceof Error ? err.message : 'something went wrong'}`,
        },
      ])
    } finally {
      setBusy(false)
    }
  }

  async function handleRecorded(blob: Blob) {
    setBusy(true)
    try {
      const { transcript } = await transcribeAudio(blob)
      setBusy(false)
      if (transcript.trim()) {
        setAutoSpeak(true)
        sendMessage(transcript)
      }
    } catch (err) {
      setBusy(false)
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: `Transcription error: ${err instanceof Error ? err.message : 'something went wrong'}`,
        },
      ])
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-57px)] max-w-3xl flex-col px-4">
      <div className="flex items-center justify-between py-4">
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Chat</h1>
        <select
          value={policyId ?? ''}
          onChange={(e) =>
            setSearchParams(e.target.value ? { policy_id: e.target.value } : {})
          }
          className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
        >
          <option value="">All policies</option>
          {policies.map((p) => (
            <option key={p.id} value={p.id}>
              {p.product_name ?? p.source_file}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto pb-4">
        {messages.length === 0 && (
          <p className="mt-8 text-center text-sm text-neutral-500">
            Ask a question about your policies, by text or voice.
          </p>
        )}
        {messages.map((m, i) => (
          <ChatBubble key={i} message={m} />
        ))}
        {busy && <p className="text-sm text-neutral-500">Thinking…</p>}
        <div ref={scrollRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          setAutoSpeak(false)
          sendMessage(input)
        }}
        className="flex items-center gap-2 border-t border-neutral-200 py-3 dark:border-neutral-800"
      >
        <MicButton onRecorded={handleRecorded} disabled={busy} />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your insurance…"
          disabled={busy}
          className="flex-1 rounded-full border border-neutral-300 px-4 py-2 text-sm text-neutral-900 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          Send
        </button>
      </form>
    </div>
  )
}
