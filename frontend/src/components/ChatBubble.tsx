import { SourceList } from './SourceList'

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  sources?: string[]
}

export function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
          isUser
            ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
            : 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100'
        }`}
      >
        <p className="whitespace-pre-wrap">{message.text}</p>
        {!isUser && message.sources && <SourceList sources={message.sources} />}
      </div>
    </div>
  )
}
