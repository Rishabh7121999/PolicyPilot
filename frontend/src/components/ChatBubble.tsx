import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { SourceList } from './SourceList'
import type { ClarificationOption } from '../api/types'

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
}

const markdownComponents = {
  p: ({ children }: { children?: ReactNode }) => <p className="mb-1.5 last:mb-0">{children}</p>,
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="mb-1.5 ml-4 list-disc space-y-0.5 last:mb-0">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="mb-1.5 ml-4 list-decimal space-y-0.5 last:mb-0">{children}</ol>
  ),
  strong: ({ children }: { children?: ReactNode }) => <strong className="font-semibold">{children}</strong>,
  a: ({ children, href }: { children?: ReactNode; href?: string }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-sage-700 underline">
      {children}
    </a>
  ),
  table: ({ children }: { children?: ReactNode }) => (
    <div className="my-1.5 overflow-x-auto">
      <table className="min-w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: ReactNode }) => (
    <th className="border border-beige-200 bg-beige-50 px-2 py-1 text-left font-medium">{children}</th>
  ),
  td: ({ children }: { children?: ReactNode }) => (
    <td className="border border-beige-200 px-2 py-1">{children}</td>
  ),
}

export function ChatBubble({ message, onSelectClarification }: ChatBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
          isUser
            ? 'bg-neutral-900 text-white'
            : 'bg-neutral-100 text-neutral-900'
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.text}</p>
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {message.text}
          </ReactMarkdown>
        )}
        {!isUser && message.sources && <SourceList sources={message.sources} />}
        {!isUser && message.clarificationOptions && message.clarificationOptions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.clarificationOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => onSelectClarification?.(option)}
                className="rounded-full border border-sage-300 bg-white px-3 py-1 text-xs font-medium text-sage-800 hover:bg-sage-50"
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
        {!isUser && message.resolvedPolicy && (
          <p className="mt-1.5 text-[11px] text-neutral-400">
            Answered using: {message.resolvedPolicy.label}
          </p>
        )}
      </div>
    </div>
  )
}
