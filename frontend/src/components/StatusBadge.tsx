import type { PolicyStatus } from '../api/types'

const STYLES: Record<PolicyStatus, string> = {
  processing: 'bg-amber-100 text-amber-800',
  ready: 'bg-sage-100 text-sage-700',
  failed: 'bg-red-100 text-red-800',
}

const DOT_STYLES: Record<PolicyStatus, string> = {
  processing: 'bg-amber-500 animate-pulse',
  ready: 'bg-sage-500',
  failed: 'bg-red-500',
}

const LABELS: Record<PolicyStatus, string> = {
  processing: 'Processing',
  ready: 'Active',
  failed: 'Failed',
}

export function StatusBadge({ status }: { status: PolicyStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_STYLES[status]}`} />
      {LABELS[status]}
    </span>
  )
}
