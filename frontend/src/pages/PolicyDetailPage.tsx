import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deletePolicy, getPolicy, getPolicyFileUrl, updatePolicyType } from '../api/client'
import { PolicyDetailTabs } from '../components/PolicyDetailTabs'
import { StatusBadge } from '../components/StatusBadge'
import { DownloadIcon, TypeIcon } from '../components/icons'
import { useAppShell } from '../context/AppShellContext'
import { usePolling } from '../hooks/usePolling'
import { formatCoverage } from '../lib/format'
import { TYPE_TINT } from '../lib/policyType'
import type { PolicyDetail, PolicyType } from '../api/types'

const TYPE_OPTIONS: PolicyType[] = ['health', 'life', 'motor']

export function PolicyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const policyId = Number(id)
  const navigate = useNavigate()
  const { refreshPolicies } = useAppShell()
  const [policy, setPolicy] = useState<PolicyDetail | null>(null)
  const [editingType, setEditingType] = useState(false)
  const [savingType, setSavingType] = useState(false)

  const refresh = useCallback(async () => {
    const data = await getPolicy(policyId)
    setPolicy(data)
  }, [policyId])

  useEffect(() => {
    refresh()
  }, [refresh])

  usePolling(refresh, 2000, policy?.status === 'processing')

  async function handleTypeChange(newType: PolicyType) {
    setSavingType(true)
    try {
      const updated = await updatePolicyType(policyId, newType)
      setPolicy(updated)
      refreshPolicies()
    } finally {
      setSavingType(false)
      setEditingType(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this policy? This removes its file and indexed data.')) return
    await deletePolicy(policyId)
    refreshPolicies()
    navigate('/policies')
  }

  if (!policy) {
    return <div className="mx-auto max-w-4xl px-6 py-8 text-sm text-neutral-500">Loading…</div>
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link to="/policies" className="text-sm text-neutral-500 hover:underline">
        ← My Policies
      </Link>

      <div className="mt-4 flex flex-col gap-4 rounded-2xl border border-beige-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${TYPE_TINT[policy.policy_type] ?? TYPE_TINT.unknown}`}>
            <TypeIcon type={policy.policy_type} className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-neutral-900">
                {policy.product_name ?? policy.source_file}
              </h1>
              <StatusBadge status={policy.status} />
            </div>
            <p className="mt-0.5 text-sm text-neutral-500">
              {policy.insurer ?? '—'} · Policy No. {policy.policy_number ?? '—'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={getPolicyFileUrl(policy.id)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-beige-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-beige-50"
          >
            <DownloadIcon className="h-4 w-4" />
            Download Policy
          </a>
          <button
            type="button"
            onClick={handleDelete}
            className="rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div className="rounded-xl border border-beige-200 bg-white p-3">
          <p className="text-xs text-neutral-400">Coverage</p>
          <p className="font-medium text-neutral-900">{formatCoverage(policy.sum_insured_numeric)}</p>
        </div>
        <div className="rounded-xl border border-beige-200 bg-white p-3">
          <p className="text-xs text-neutral-400">Renewal Date</p>
          <p className="font-medium text-neutral-900">{policy.policy_end_date ?? '—'}</p>
        </div>
        <div className="col-span-2 rounded-xl border border-beige-200 bg-white p-3">
          <p className="text-xs text-neutral-400">Policy Type</p>
          {editingType ? (
            <div className="mt-1 flex items-center gap-2">
              <select
                defaultValue={policy.policy_type}
                disabled={savingType}
                onChange={(e) => handleTypeChange(e.target.value as PolicyType)}
                className="rounded-lg border border-beige-200 bg-white px-2 py-1 text-sm"
              >
                {TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => setEditingType(false)} className="text-xs text-neutral-500 hover:underline">
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <p className="font-medium capitalize text-neutral-900">{policy.policy_type}</p>
              <button
                type="button"
                onClick={() => setEditingType(true)}
                className="text-xs font-medium text-sage-700 hover:underline"
              >
                Edit
              </button>
            </div>
          )}
        </div>
      </div>
      {editingType && (
        <p className="mt-2 text-xs text-neutral-400">
          Correcting the type fixes search/chat filtering, but won't retroactively re-extract type-specific details — re-upload for that.
        </p>
      )}

      <div className="mt-8">
        {policy.status === 'processing' && (
          <p className="text-sm text-neutral-500">
            Processing your document — this can take a few minutes for large PDFs…
          </p>
        )}

        {policy.status === 'failed' && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {policy.error_message ?? 'Ingestion failed.'}
          </p>
        )}

        {policy.status === 'ready' && policy.summary_json && (
          <PolicyDetailTabs summary={policy.summary_json} insuredName={policy.summary_json.policyholder_name} />
        )}
      </div>
    </div>
  )
}
