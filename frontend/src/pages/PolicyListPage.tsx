import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { deletePolicy, listPolicies } from '../api/client'
import { StatusBadge } from '../components/StatusBadge'
import { UploadPolicyDialog } from '../components/UploadPolicyDialog'
import type { PolicyListItem } from '../api/types'

export function PolicyListPage() {
  const [policies, setPolicies] = useState<PolicyListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)

  async function refresh() {
    const data = await listPolicies()
    setPolicies(data)
    setLoading(false)
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handleDelete(id: number) {
    if (!confirm('Delete this policy? This removes its file and indexed data.')) return
    await deletePolicy(id)
    refresh()
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
          Your Policies
        </h1>
        <button
          onClick={() => setShowUpload(true)}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Upload Policy
        </button>
      </div>

      {loading ? (
        <p className="mt-8 text-sm text-neutral-500">Loading…</p>
      ) : policies.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-500">
          No policies yet. Upload a PDF to get started.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {policies.map((policy) => (
            <li
              key={policy.id}
              className="flex items-center justify-between rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
            >
              <Link to={`/policies/${policy.id}`} className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-neutral-900 dark:text-neutral-100">
                    {policy.product_name ?? policy.source_file}
                  </span>
                  <StatusBadge status={policy.status} />
                </div>
                <p className="mt-1 truncate text-sm text-neutral-500 dark:text-neutral-400">
                  {policy.insurer ?? '—'} · {policy.policy_type} · {policy.chunk_count} chunks
                </p>
              </Link>
              <button
                onClick={() => handleDelete(policy.id)}
                className="ml-4 shrink-0 rounded-lg px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      {showUpload && (
        <UploadPolicyDialog onClose={() => setShowUpload(false)} onUploaded={refresh} />
      )}
    </div>
  )
}
