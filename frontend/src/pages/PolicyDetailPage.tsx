import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deletePolicy, downloadPolicyFile, getPolicy, updatePolicyType } from '../api/client'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { PolicyDetailTabs } from '../components/PolicyDetailTabs'
import { RenewalChip } from '../components/RenewalChip'
import { StatusBadge } from '../components/StatusBadge'
import { ChatIcon, DocumentIcon, DownloadIcon, TypeIcon } from '../components/icons'
import { useAppShell } from '../context/AppShellContext'
import { usePolling } from '../hooks/usePolling'
import { formatCoverage } from '../lib/format'
import { TYPE_LABEL, TYPE_TINT } from '../lib/policyType'
import type { PolicyDetail, PolicyType } from '../api/types'

const TYPE_OPTIONS: PolicyType[] = ['health', 'life', 'motor']

/** The one number people most often look up for each policy type. */
function typeHeadline(policy: PolicyDetail): { label: string; value: string } | null {
  const s = policy.summary_json
  if (!s) return null
  if (s.policy_type === 'health' && s.health_details?.co_pay_percentage)
    return { label: 'Co-pay', value: s.health_details.co_pay_percentage }
  if (s.policy_type === 'motor' && s.motor_details?.idv) return { label: 'IDV', value: s.motor_details.idv }
  if (s.policy_type === 'life' && s.life_details?.policy_term)
    return { label: 'Policy term', value: s.life_details.policy_term }
  return null
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-beige-200 bg-white p-4">
      <p className="text-sm text-neutral-500">{label}</p>
      <div className="mt-1 text-base font-semibold text-neutral-900">{children}</div>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-4xl animate-pulse px-4 py-6 sm:px-6 sm:py-8" aria-label="Loading policy">
      <div className="h-4 w-24 rounded bg-beige-200" />
      <div className="mt-4 h-24 rounded-2xl bg-beige-100" />
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-beige-100" />
        ))}
      </div>
      <div className="mt-8 h-64 rounded-2xl bg-beige-100" />
    </div>
  )
}

export function PolicyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const policyId = Number(id)
  const navigate = useNavigate()
  const { refreshPolicies, openPolicyViewer } = useAppShell()
  const [policy, setPolicy] = useState<PolicyDetail | null>(null)
  const [editingType, setEditingType] = useState(false)
  const [savingType, setSavingType] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

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
    await deletePolicy(policyId)
    refreshPolicies()
    navigate('/policies')
  }

  if (!policy) return <DetailSkeleton />

  const title = policy.product_name ?? policy.insurer ?? policy.source_file
  const headline = typeHeadline(policy)
  const ready = policy.status === 'ready'

  return (
    <div className="mx-auto max-w-4xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
      <Link to="/policies" className="rounded text-sm text-neutral-500 hover:underline">
        ← My Policies
      </Link>

      <div className="mt-4 flex flex-col gap-4 rounded-2xl border border-beige-200 bg-white p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${TYPE_TINT[policy.policy_type] ?? TYPE_TINT.unknown}`}>
            <TypeIcon type={policy.policy_type} className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-neutral-900">{title}</h1>
              <StatusBadge status={policy.status} />
            </div>
            <p className="mt-0.5 text-sm text-neutral-500">
              {TYPE_LABEL[policy.policy_type] ?? TYPE_LABEL.unknown}
              {' · '}
              {editingType ? (
                <span className="inline-flex items-center gap-2">
                  <select
                    aria-label="Policy type"
                    defaultValue={policy.policy_type}
                    disabled={savingType}
                    onChange={(e) => handleTypeChange(e.target.value as PolicyType)}
                    className="rounded-lg border border-beige-200 bg-white px-2 py-1 text-sm text-neutral-800"
                  >
                    {TYPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {TYPE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => setEditingType(false)} className="text-sm hover:underline">
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingType(true)}
                  className="text-sm font-medium text-sage-700 hover:underline"
                >
                  Wrong type?
                </button>
              )}
            </p>
            <p className="text-sm text-neutral-500">
              {policy.insurer ?? '—'} · Policy No. {policy.policy_number ?? '—'}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:max-w-[16rem] sm:justify-end">
          <button
            type="button"
            onClick={() => openPolicyViewer(policy.id)}
            className="flex items-center gap-1.5 rounded-lg bg-sage-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sage-800"
          >
            <DocumentIcon className="h-4 w-4" />
            View Policy
          </button>
          <button
            type="button"
            onClick={() => downloadPolicyFile(policy.id, policy.source_file).catch(() => {})}
            className="flex items-center gap-1.5 rounded-lg border border-beige-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-beige-50"
          >
            <DownloadIcon className="h-4 w-4" />
            Download
          </button>
          {ready && (
            <Link
              to={`/chat?policy_id=${policy.id}`}
              className="flex items-center gap-1.5 rounded-lg border border-beige-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-beige-50"
            >
              <ChatIcon className="h-4 w-4" />
              Ask about it
            </Link>
          )}
        </div>
      </div>
      {editingType && (
        <p className="mt-2 text-sm text-neutral-500">
          Changing the type fixes search and chat filtering, but won't re-extract type-specific details. Re-upload
          the policy for that.
        </p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact label="Coverage">{formatCoverage(policy.sum_insured_numeric)}</Fact>
        <Fact label="Renews">
          <span className="flex flex-wrap items-center gap-2">
            {policy.policy_end_date ?? '—'}
            <RenewalChip isoDate={policy.policy_end_date_iso} />
          </span>
        </Fact>
        <Fact label="Premium">{policy.summary_json?.premium_amount ?? '—'}</Fact>
        <Fact label={headline?.label ?? 'Plan'}>
          <span className="line-clamp-2">{headline?.value ?? policy.summary_json?.plan_variant ?? '—'}</span>
        </Fact>
      </div>

      <div className="mt-8">
        {policy.status === 'processing' && (
          <div className="rounded-2xl border border-beige-200 bg-white p-5" role="status">
            <p className="text-sm font-medium text-neutral-900">Reading your document…</p>
            <p className="mt-1 text-sm text-neutral-500">This can take a few minutes for large PDFs.</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-beige-200">
              <div className="h-full w-1/3 rounded-full bg-sage-600 motion-safe:animate-pulse" />
            </div>
          </div>
        )}

        {policy.status === 'failed' && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {policy.error_message ?? "We couldn't read this document."} Try deleting it and uploading it again.
          </p>
        )}

        {ready && policy.summary_json && (
          <PolicyDetailTabs summary={policy.summary_json} insuredName={policy.summary_json.policyholder_name} />
        )}
      </div>

      <div className="mt-12 border-t border-beige-200 pt-6">
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          className="rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          Delete this policy
        </button>
      </div>

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
