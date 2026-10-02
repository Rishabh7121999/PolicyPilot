import { useState } from 'react'
import { Modal } from './Modal'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => Promise<void> | void
  onCancel: () => void
}

/** In-app replacement for window.confirm() on destructive actions. */
export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  const [working, setWorking] = useState(false)

  async function handleConfirm() {
    setWorking(true)
    try {
      await onConfirm()
    } finally {
      setWorking(false)
    }
  }

  return (
    <Modal onClose={onCancel} labelledBy="confirm-title" className="w-full max-w-sm p-6">
      <h2 id="confirm-title" className="text-lg font-semibold text-neutral-900">
        {title}
      </h2>
      <p className="mt-2 text-sm text-neutral-600">{message}</p>
      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          data-autofocus
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-beige-100"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={working}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {working ? 'Deleting…' : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
