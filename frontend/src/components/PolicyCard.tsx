import { Link } from 'react-router-dom'
import type { PolicyListItem } from '../api/types'
import { formatCoverage } from '../lib/format'
import { TYPE_LABEL, TYPE_TINT } from '../lib/policyType'
import { StatusBadge } from './StatusBadge'
import { ArrowRightIcon, TypeIcon } from './icons'

export function PolicyCard({ policy }: { policy: PolicyListItem }) {
  return (
    <Link
      to={`/policies/${policy.id}`}
      className="flex flex-col rounded-2xl border border-beige-200 bg-white p-5 transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${TYPE_TINT[policy.policy_type] ?? TYPE_TINT.unknown}`}>
          <TypeIcon type={policy.policy_type} className="h-5 w-5" />
        </div>
        <StatusBadge status={policy.status} />
      </div>

      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-neutral-400">
        {TYPE_LABEL[policy.policy_type] ?? TYPE_LABEL.unknown}
      </p>
      <p className="truncate text-base font-semibold text-neutral-900">
        {policy.product_name ?? policy.source_file}
      </p>

      <dl className="mt-3 space-y-1 text-sm text-neutral-500">
        <div className="flex justify-between">
          <dt>Policy No.</dt>
          <dd className="text-neutral-700">{policy.policy_number ?? '—'}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Coverage</dt>
          <dd className="text-neutral-700">{formatCoverage(policy.sum_insured_numeric)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Renewal Date</dt>
          <dd className="text-neutral-700">{policy.policy_end_date ?? '—'}</dd>
        </div>
      </dl>

      <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-sage-700">
        View Details <ArrowRightIcon className="h-3.5 w-3.5" />
      </span>
    </Link>
  )
}
