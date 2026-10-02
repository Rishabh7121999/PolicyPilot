import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listPolicies } from '../api/client'
import { RenewalChip } from '../components/RenewalChip'
import { CalendarIcon, TypeIcon } from '../components/icons'
import { useAppShell } from '../context/AppShellContext'
import { usePolling } from '../hooks/usePolling'
import { daysUntil, formatCoverage } from '../lib/format'
import { TYPE_TINT } from '../lib/policyType'
import type { PolicyListItem } from '../api/types'

const GROUPS: { title: string; test: (days: number) => boolean }[] = [
  { title: 'Overdue', test: (d) => d < 0 },
  { title: 'Next 30 days', test: (d) => d >= 0 && d <= 30 },
  { title: 'Next 90 days', test: (d) => d > 30 && d <= 90 },
  { title: 'Later', test: (d) => d > 90 },
]

function ReminderRow({ policy }: { policy: PolicyListItem }) {
  return (
    <li>
      <Link
        to={`/policies/${policy.id}`}
        className="flex items-center justify-between gap-3 rounded-2xl border border-beige-200 bg-white p-4 transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TYPE_TINT[policy.policy_type] ?? TYPE_TINT.unknown}`}
          >
            <TypeIcon type={policy.policy_type} className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-neutral-900">
              {policy.product_name ?? policy.insurer ?? policy.source_file}
            </p>
            <p className="truncate text-sm text-neutral-500">
              {policy.insurer ?? '—'} · {formatCoverage(policy.sum_insured_numeric)} cover
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
          <span className="flex items-center gap-1.5 text-sm text-neutral-600">
            <CalendarIcon className="h-4 w-4" />
            {policy.policy_end_date}
          </span>
          <RenewalChip isoDate={policy.policy_end_date_iso} />
        </div>
      </Link>
    </li>
  )
}

export function RemindersPage() {
  const [allPolicies, setAllPolicies] = useState<PolicyListItem[]>([])
  const [loading, setLoading] = useState(true)
  const { policiesVersion, openUploadDialog } = useAppShell()

  const refresh = useCallback(() => {
    listPolicies().then((data) => {
      setAllPolicies(data)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh, policiesVersion])

  usePolling(refresh, 2000, allPolicies.some((p) => p.status === 'processing'))

  const policies = allPolicies.filter((p) => p.status === 'ready')

  const withDate = policies
    .filter((p) => daysUntil(p.policy_end_date_iso) !== null)
    .sort((a, b) => (a.policy_end_date_iso! < b.policy_end_date_iso! ? -1 : 1))
  const withoutDate = policies.filter((p) => daysUntil(p.policy_end_date_iso) === null)

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
      <h1 className="text-2xl font-semibold text-neutral-900">Reminders</h1>
      <p className="mt-1 text-base text-neutral-500">Upcoming renewals, based on the dates in your policies.</p>

      {loading ? (
        <div className="mt-6 space-y-2" aria-label="Loading reminders">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[74px] animate-pulse rounded-2xl bg-beige-100" />
          ))}
        </div>
      ) : policies.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-beige-200 bg-white p-8 text-center">
          <CalendarIcon className="mx-auto h-8 w-8 text-sage-500" />
          <p className="mt-3 text-base font-medium text-neutral-900">No renewals to track yet</p>
          <p className="mt-1 text-sm text-neutral-500">Upload a policy and we'll remind you before it expires.</p>
          <button
            type="button"
            onClick={openUploadDialog}
            className="mt-4 rounded-xl bg-sage-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sage-800"
          >
            Upload policy
          </button>
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {GROUPS.map(({ title, test }) => {
            const items = withDate.filter((p) => test(daysUntil(p.policy_end_date_iso)!))
            if (items.length === 0) return null
            return (
              <section key={title}>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                  {title} <span className="font-normal">({items.length})</span>
                </h2>
                <ul className="mt-3 space-y-2">
                  {items.map((p) => (
                    <ReminderRow key={p.id} policy={p} />
                  ))}
                </ul>
              </section>
            )
          })}

          {withoutDate.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">No renewal date found</h2>
              <p className="mt-1 text-sm text-neutral-500">We couldn't find an end date in these documents.</p>
              <ul className="mt-3 space-y-2">
                {withoutDate.map((p) => (
                  <li key={p.id}>
                    <Link
                      to={`/policies/${p.id}`}
                      className="flex items-center gap-3 rounded-2xl border border-beige-200 bg-white p-4 text-sm text-neutral-700 hover:bg-beige-50"
                    >
                      <TypeIcon type={p.policy_type} className="h-4 w-4" />
                      {p.product_name ?? p.insurer ?? p.source_file}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
