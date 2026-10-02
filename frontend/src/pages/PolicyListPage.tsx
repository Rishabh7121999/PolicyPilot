import { useCallback, useEffect, useMemo, useState } from 'react'
import { listPolicies } from '../api/client'
import { PolicyCard } from '../components/PolicyCard'
import { SearchIcon, UploadIcon } from '../components/icons'
import { useAppShell } from '../context/AppShellContext'
import { usePolling } from '../hooks/usePolling'
import { useUploadFlow } from '../hooks/useUploadFlow'
import type { PolicyListItem, PolicyType } from '../api/types'

const FILTERS: { label: string; value: PolicyType | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Health', value: 'health' },
  { label: 'Life', value: 'life' },
  { label: 'Motor', value: 'motor' },
]

type SortOption = 'latest' | 'oldest' | 'renewal'

const SORT_OPTIONS: { label: string; value: SortOption }[] = [
  { label: 'Newest first', value: 'latest' },
  { label: 'Oldest first', value: 'oldest' },
  { label: 'Renewal date', value: 'renewal' },
]

export function PolicyListPage() {
  const [policies, setPolicies] = useState<PolicyListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<PolicyType | 'all'>('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortOption>('latest')
  const { policiesVersion, refreshPolicies, openUploadDialog } = useAppShell()

  const refresh = useCallback(() => {
    listPolicies().then((data) => {
      setPolicies(data)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh, policiesVersion])

  // Keep polling while any policy is still being ingested, so a card flips
  // from "Processing" to ready without the user having to reload.
  usePolling(refresh, 2000, policies.some((p) => p.status === 'processing'))

  const upload = useUploadFlow(refreshPolicies)

  function handleDeleted(id: number) {
    setPolicies((prev) => prev.filter((p) => p.id !== id))
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: policies.length }
    for (const p of policies) c[p.policy_type] = (c[p.policy_type] ?? 0) + 1
    return c
  }, [policies])

  const filtered = useMemo(() => {
    let list = filter === 'all' ? policies : policies.filter((p) => p.policy_type === filter)

    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((p) =>
        [p.product_name, p.insurer, p.policy_number, p.source_file]
          .filter((v): v is string => Boolean(v))
          .some((v) => v.toLowerCase().includes(q)),
      )
    }

    return [...list].sort((a, b) => {
      if (sort === 'renewal') {
        if (!a.policy_end_date_iso) return 1
        if (!b.policy_end_date_iso) return -1
        return a.policy_end_date_iso < b.policy_end_date_iso ? -1 : 1
      }
      const cmp = a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0
      return sort === 'oldest' ? cmp : -cmp
    })
  }, [policies, filter, search, sort])

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">My Policies</h1>
          <p className="mt-1 text-base text-neutral-500">Manage and view all your insurance policies in one place.</p>
        </div>
        {policies.length > 0 && (
          <button
            type="button"
            onClick={openUploadDialog}
            className="flex items-center gap-2 rounded-xl bg-sage-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sage-800"
          >
            <UploadIcon className="h-4 w-4" />
            Upload policy
          </button>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
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
              {f.label} ({counts[f.value] ?? 0})
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-full border border-beige-200 bg-white px-3 py-2 text-sm focus-within:border-sage-400 focus-within:ring-2 focus-within:ring-sage-200 sm:flex-none">
            <SearchIcon className="h-4 w-4 shrink-0 text-neutral-500" />
            <input
              type="search"
              aria-label="Search policies"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search policies…"
              className="w-full min-w-0 bg-transparent text-neutral-700 outline-none placeholder:text-neutral-500 sm:w-44"
            />
          </div>
          <label htmlFor="policy-sort" className="text-sm text-neutral-500">
            Sort
          </label>
          <select
            id="policy-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="rounded-full border border-beige-200 bg-white px-3 py-2 text-sm text-neutral-700"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading policies">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-56 animate-pulse rounded-2xl bg-beige-100" />
          ))}
        </div>
      ) : filtered.length === 0 && policies.length > 0 ? (
        <div className="mt-8 rounded-2xl border border-beige-200 bg-white p-8 text-center">
          <p className="text-base font-medium text-neutral-900">No policies match</p>
          <p className="mt-1 text-sm text-neutral-500">Try a different search or filter.</p>
          <button
            type="button"
            onClick={() => {
              setSearch('')
              setFilter('all')
            }}
            className="mt-4 rounded-lg px-3 py-2 text-sm font-medium text-sage-700 hover:bg-sage-50"
          >
            Clear filters
          </button>
        </div>
      ) : filtered.length === 0 ? null : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((policy) => (
            <PolicyCard key={policy.id} policy={policy} onDeleted={handleDeleted} />
          ))}
        </div>
      )}

      <div
        onDragOver={upload.handleDragOver}
        onDragLeave={upload.handleDragLeave}
        onDrop={upload.handleDrop}
        className={`mt-8 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed text-center transition-all duration-150 ease-out ${
          policies.length === 0 && !loading ? 'p-10 sm:p-16' : 'p-6 sm:p-8'
        } ${
          upload.dragActive ? 'scale-[1.01] border-sage-500 bg-sage-50' : 'border-beige-200 bg-white'
        }`}
      >
        <UploadIcon className={policies.length === 0 ? 'h-10 w-10 text-sage-600' : 'h-6 w-6 text-sage-600'} />
        <p className={`mt-3 font-semibold text-neutral-900 ${policies.length === 0 ? 'text-lg' : 'text-sm'}`}>
          {policies.length === 0 ? 'Upload your first policy' : 'Upload another policy'}
        </p>
        {policies.length === 0 && (
          <p className="mt-1 max-w-md text-sm text-neutral-500">
            We'll read it, work out whether it's health, life or motor, and pull out the key details for you.
          </p>
        )}
        <p className="mt-1 text-sm text-neutral-500">
          Drag &amp; drop your policy document here, or{' '}
          <label className="cursor-pointer rounded font-medium text-sage-700 hover:underline focus-within:ring-2 focus-within:ring-sage-400">
            click to browse
            <input
              type="file"
              accept="application/pdf"
              className="sr-only"
              onChange={(e) => {
                const selected = e.target.files?.[0]
                if (selected) upload.startUpload(selected)
              }}
            />
          </label>
        </p>
        <p className="mt-2 text-xs text-neutral-500">Supported format: PDF</p>

        {upload.file && (upload.submitting || upload.processing) && (
          <div className="mt-4 w-full max-w-sm">
            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span className="truncate">{upload.file.name}</span>
              <span>{upload.submitting ? `${upload.progress}%` : 'Processing…'}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-beige-200">
              <div
                className="h-full rounded-full bg-sage-600 transition-all"
                style={{ width: `${upload.submitting ? upload.progress : 100}%` }}
              />
            </div>
          </div>
        )}
        {upload.error && <p className="mt-3 text-sm text-red-600">{upload.error}</p>}
      </div>
    </div>
  )
}
