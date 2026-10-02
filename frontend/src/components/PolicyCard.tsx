import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { deletePolicy, downloadPolicyFile } from '../api/client'
import type { PolicyListItem } from '../api/types'
import { useAppShell } from '../context/AppShellContext'
import { formatCoverage } from '../lib/format'
import { TYPE_LABEL, TYPE_TINT } from '../lib/policyType'
import { ConfirmDialog } from './ConfirmDialog'
import { RenewalChip } from './RenewalChip'
import { StatusBadge } from './StatusBadge'
import { ArrowRightIcon, DocumentIcon, DownloadIcon, MoreIcon, TypeIcon } from './icons'

const menuItem = 'flex w-full items-center gap-2 px-3 py-2 text-left text-sm'

export function PolicyCard({ policy, onDeleted }: { policy: PolicyListItem; onDeleted?: (id: number) => void }) {
  const { openPolicyViewer } = useAppShell()
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const title = policy.product_name ?? policy.insurer ?? policy.source_file

  useEffect(() => {
    if (!menuOpen) return

    function handlePointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  async function handleDelete() {
    setDeleting(true)
    try {
      await deletePolicy(policy.id)
      setConfirmingDelete(false)
      onDeleted?.(policy.id)
    } catch {
      setDeleting(false)
    }
  }

  // The card is a plain container; the title link stretches over it (via
  // after:inset-0) so the whole card is clickable, while the ⋯ menu stays a
  // real, separately focusable button instead of being nested inside a link.
  return (
    <div
      className={`group relative flex flex-col rounded-2xl border border-beige-200 bg-white p-5 transition-all duration-150 ease-out focus-within:ring-2 focus-within:ring-sage-400 hover:-translate-y-0.5 hover:shadow-md ${
        deleting ? 'pointer-events-none opacity-50' : ''
      }`}
    >
      <div className="flex items-start justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${TYPE_TINT[policy.policy_type] ?? TYPE_TINT.unknown}`}>
          <TypeIcon type={policy.policy_type} className="h-5 w-5" />
        </div>
        <div className="relative z-10 flex items-center gap-1">
          <StatusBadge status={policy.status} />
          <div ref={menuRef} className="relative">
            <button
              type="button"
              aria-label="Policy actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-beige-100 hover:text-neutral-700"
            >
              <MoreIcon className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-9 z-20 w-40 overflow-hidden rounded-xl border border-beige-200 bg-white py-1 shadow-lg"
              >
                {policy.status === 'ready' && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      openPolicyViewer(policy.id)
                    }}
                    className={`${menuItem} text-neutral-700 hover:bg-beige-50`}
                  >
                    <DocumentIcon className="h-4 w-4" /> View policy
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    downloadPolicyFile(policy.id, policy.source_file).catch(() => {})
                  }}
                  className={`${menuItem} text-neutral-700 hover:bg-beige-50`}
                >
                  <DownloadIcon className="h-4 w-4" /> Download
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    setConfirmingDelete(true)
                  }}
                  className={`${menuItem} text-red-600 hover:bg-red-50`}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-neutral-500">
        {TYPE_LABEL[policy.policy_type] ?? TYPE_LABEL.unknown}
      </p>
      <Link
        to={`/policies/${policy.id}`}
        className="truncate text-base font-semibold text-neutral-900 outline-none after:absolute after:inset-0 after:rounded-2xl"
      >
        {title}
      </Link>

      <dl className="mt-3 space-y-1.5 text-sm text-neutral-500">
        <div className="flex justify-between gap-2">
          <dt>Policy No.</dt>
          <dd className="truncate text-neutral-700">{policy.policy_number ?? '—'}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Coverage</dt>
          <dd className="text-neutral-700">{formatCoverage(policy.sum_insured_numeric)}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt>Renews</dt>
          <dd className="flex items-center gap-2 text-neutral-700">
            {policy.policy_end_date ?? '—'}
            <RenewalChip isoDate={policy.policy_end_date_iso} onlyUrgent />
          </dd>
        </div>
      </dl>

      <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-sage-700">
        {policy.status === 'processing' ? 'View status' : 'View details'} <ArrowRightIcon className="h-3.5 w-3.5" />
      </span>

      {confirmingDelete && (
        <ConfirmDialog
          title="Delete policy?"
          message={`"${title}" will be removed along with its file and indexed data. This can't be undone.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  )
}
