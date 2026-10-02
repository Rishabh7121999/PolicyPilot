import { useEffect, useState } from 'react'
import { fetchPolicyFile, getPolicy, saveBlob } from '../api/client'
import type { PolicyDetail } from '../api/types'
import { CloseIcon, DownloadIcon } from './icons'
import { Modal } from './Modal'

interface PolicyViewerDialogProps {
  policyId: number
  page?: number
  onClose: () => void
}

/** Shows the original policy PDF in the browser's built-in viewer, without
 * leaving the current page. `page` jumps to a cited page via the #page= hash. */
export function PolicyViewerDialog({ policyId, page, onClose }: PolicyViewerDialogProps) {
  const [policy, setPolicy] = useState<PolicyDetail | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null

    getPolicy(policyId)
      .then((p) => !cancelled && setPolicy(p))
      .catch(() => {})
    fetchPolicyFile(policyId)
      .then((b) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(b)
        setBlob(b)
        setUrl(objectUrl)
      })
      .catch(() => !cancelled && setError("We couldn't load this document."))

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [policyId])

  const title = policy?.product_name ?? policy?.insurer ?? policy?.source_file ?? 'Policy document'

  return (
    <Modal
      onClose={onClose}
      labelledBy="policy-viewer-title"
      className="flex h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden sm:h-[calc(100vh-4rem)]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-beige-200 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 id="policy-viewer-title" className="truncate text-base font-semibold text-neutral-900">
            {title}
          </h2>
          <p className="truncate text-sm text-neutral-500">
            {policy?.source_file}
            {page ? ` · Page ${page}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled={!blob}
            onClick={() => blob && saveBlob(blob, policy?.source_file ?? 'policy.pdf')}
            className="flex items-center gap-1.5 rounded-lg border border-beige-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-beige-50 disabled:opacity-50"
          >
            <DownloadIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Download</span>
          </button>
          <button
            type="button"
            data-autofocus
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 hover:bg-beige-100"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 bg-neutral-100">
        {error ? (
          <p className="p-6 text-sm text-red-600">{error}</p>
        ) : url ? (
          <iframe src={page ? `${url}#page=${page}` : url} title={title} className="h-full w-full border-0" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-neutral-500">Loading document…</div>
        )}
      </div>
    </Modal>
  )
}
