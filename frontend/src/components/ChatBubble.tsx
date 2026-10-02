import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { SourceList } from './SourceList'
import type { ClarificationOption, PolicyListItem } from '../api/types'

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  sources?: string[]
  clarificationOptions?: ClarificationOption[]
  resolvedPolicy?: ClarificationOption
}

interface ChatBubbleProps {
  message: ChatMessage
  onSelectClarification?: (option: ClarificationOption) => void
  // Used to turn source citations into links that open the cited policy.
  policies?: PolicyListItem[]
  // Smaller type for the floating assistant's narrow panel.
  compact?: boolean
}

function TypingIndicator() {
  return (
    <span className="flex items-center gap-1 py-1.5" role="status" aria-label="Thinking">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="h-2 w-2 rounded-full bg-neutral-400 motion-safe:animate-bounce"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  )
}

const markdownComponents = {
  p: ({ children }: { children?: ReactNode }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="mb-2 ml-5 list-disc space-y-1 last:mb-0">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="mb-2 ml-5 list-decimal space-y-1 last:mb-0">{children}</ol>
  ),
  strong: ({ children }: { children?: ReactNode }) => <strong className="font-semibold">{children}</strong>,
  a: ({ children, href }: { children?: ReactNode; href?: string }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-sage-700 underline">
      {children}
    </a>
  ),
  table: ({ children }: { children?: ReactNode }) => (
    <div className="my-2 overflow-x-auto">
      <table className="min-w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: ReactNode }) => (
    <th className="border border-beige-200 bg-beige-50 px-3 py-1.5 text-left font-medium">{children}</th>
  ),
  td: ({ children }: { children?: ReactNode }) => (
    <td className="border border-beige-200 px-3 py-1.5">{children}</td>
  ),
}

export function ChatBubble({ message, onSelectClarification, policies, compact }: ChatBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`rounded-2xl leading-relaxed ${
          compact ? 'max-w-[88%] px-4 py-2.5 text-sm' : 'max-w-[88%] px-5 py-3 text-base sm:max-w-[80%]'
        } ${
          isUser
            ? 'bg-sage-700 text-white'
            : 'border border-beige-200 bg-white text-neutral-900 shadow-sm'
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.text}</p>
        ) : message.text === '' ? (
          <TypingIndicator />
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {message.text}
          </ReactMarkdown>
        )}
        {!isUser && message.sources && <SourceList sources={message.sources} policies={policies} />}
        {!isUser && message.clarificationOptions && message.clarificationOptions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {message.clarificationOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => onSelectClarification?.(option)}
                className="rounded-full border border-sage-300 bg-white px-4 py-2 text-sm font-medium text-sage-800 hover:bg-sage-50"
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
        {!isUser && message.resolvedPolicy && (
          <p className="mt-2 text-xs text-neutral-500">
            Answered using: {message.resolvedPolicy.label}
          </p>
        )}
      </div>
    </div>
  )
}
