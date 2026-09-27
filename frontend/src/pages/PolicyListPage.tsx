import { useEffect, useState } from 'react'
import { listPolicies } from '../api/client'
import { PolicyCard } from '../components/PolicyCard'
import { UploadIcon } from '../components/icons'
import { useAppShell } from '../context/AppShellContext'
import type { PolicyListItem, PolicyType } from '../api/types'

const FILTERS: { label: string; value: PolicyType | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Health', value: 'health' },
  { label: 'Life', value: 'life' },
  { label: 'Motor', value: 'motor' },
]

export function PolicyListPage() {
  const [policies, setPolicies] = useState<PolicyListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<PolicyType | 'all'>('all')
  const { policiesVersion, openUploadDialog } = useAppShell()

  useEffect(() => {
    listPolicies().then((data) => {
      setPolicies(data)
      setLoading(false)
    })
  }, [policiesVersion])

  const filtered = filter === 'all' ? policies : policies.filter((p) => p.policy_type === filter)

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-neutral-900">My Policies</h1>
        <button
          type="button"
          onClick={openUploadDialog}
          className="flex items-center gap-2 rounded-xl bg-sage-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-sage-800"
        >
          <UploadIcon className="h-4 w-4" />
          Upload Policy
        </button>
      </div>

      <div className="mt-5 flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === f.value
                ? 'bg-sage-700 text-white'
                : 'bg-white text-neutral-600 hover:bg-beige-100'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-8 text-sm text-neutral-500">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-500">
          No policies here yet. Upload a PDF to get started.
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((policy) => (
            <PolicyCard key={policy.id} policy={policy} />
          ))}
        </div>
      )}
    </div>
  )
}
