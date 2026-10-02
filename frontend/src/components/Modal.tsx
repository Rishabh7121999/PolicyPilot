import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps {
  onClose: () => void
  labelledBy: string
  className?: string
  children: ReactNode
}

/** Shared overlay shell: backdrop click and Esc close it, and focus moves into
 * the dialog on open and back to whatever had it on close. Portaled to <body>
 * so a transformed ancestor (hover-lifted cards, page transitions) can't
 * trap its `fixed` positioning. */
export function Modal({ onClose, labelledBy, className = '', children }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  // Callers usually pass an inline onClose; keep the latest in a ref so the
  // mount effect below runs once instead of re-grabbing focus every render.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    panelRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [])

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={(e) => e.stopPropagation()}
        className={`rounded-2xl bg-cream-50 shadow-xl ${className}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
