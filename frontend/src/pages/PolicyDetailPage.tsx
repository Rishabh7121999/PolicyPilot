import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getPolicy } from '../api/client'
import { PolicySummaryCard } from '../components/PolicySummaryCard'
import { StatusBadge } from '../components/StatusBadge'
import { usePolling } from '../hooks/usePolling'
import type { PolicyDetail } from '../api/types'

export function PolicyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const policyId = Number(id)
  const [policy, setPolicy] = useState<PolicyDetail | null>(null)

  const refresh = useCallback(async () => {
    const data = await getPolicy(policyId)
    setPolicy(data)
  }, [policyId])

  useEffect(() => {
    refresh()
  }, [refresh])

  usePolling(refresh, 2000, policy?.status === 'processing')

  if (!policy) {
    return <div className="mx-auto max-w-3xl px-4 py-8 text-sm text-neutral-500">Loading…</div>
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link to="/" className="text-sm text-neutral-500 hover:underline">
        ← All policies
      </Link>

      <div className="mt-3 flex items-center gap-3">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
          {policy.product_name ?? policy.source_file}
        </h1>
        <StatusBadge status={policy.status} />
      </div>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        {policy.insurer ?? '—'} · {policy.source_file}
      </p>

      <div className="mt-8">
        {policy.status === 'processing' && (
          <p className="text-sm text-neutral-500">
            Processing your document — this can take a few minutes for large PDFs…
          </p>
        )}

        {policy.status === 'failed' && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {policy.error_message ?? 'Ingestion failed.'}
          </p>
        )}

        {policy.status === 'ready' && policy.summary_json && (
          <>
            <PolicySummaryCard summary={policy.summary_json} />
            <Link
              to={`/chat?policy_id=${policy.id}`}
              className="mt-8 inline-block rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              Ask about this policy
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
