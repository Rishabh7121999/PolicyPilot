import type { PolicyStatus } from '../api/types'

const STYLES: Record<PolicyStatus, string> = {
  processing: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  ready: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
}

export function StatusBadge({ status }: { status: PolicyStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status]}`}
    >
      {status === 'processing' && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
      )}
      {status}
    </span>
  )
}
