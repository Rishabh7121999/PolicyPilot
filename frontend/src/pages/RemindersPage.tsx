import { useEffect, useState } from 'react'
import { listPolicies } from '../api/client'
import { CalendarIcon, TypeIcon } from '../components/icons'
import { useAppShell } from '../context/AppShellContext'
import { daysUntil } from '../lib/format'
import { TYPE_TINT } from '../lib/policyType'
import { Link } from 'react-router-dom'
import type { PolicyListItem } from '../api/types'

export function RemindersPage() {
  const [policies, setPolicies] = useState<PolicyListItem[]>([])
  const [loading, setLoading] = useState(true)
  const { policiesVersion } = useAppShell()

  useEffect(() => {
    listPolicies().then((data) => {
      setPolicies(data.filter((p) => p.status === 'ready'))
      setLoading(false)
    })
  }, [policiesVersion])

  const withDate = policies
    .filter((p) => p.policy_end_date_iso)
    .sort((a, b) => (a.policy_end_date_iso! < b.policy_end_date_iso! ? -1 : 1))
  const withoutDate = policies.filter((p) => !p.policy_end_date_iso)

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-xl font-semibold text-neutral-900">Reminders</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Upcoming renewals, based on the dates extracted from your policies.
      </p>

      {loading ? (
        <p className="mt-8 text-sm text-neutral-500">Loading…</p>
      ) : (
        <div className="mt-6 space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-neutral-700">Upcoming</h2>
            {withDate.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-500">No policies with a usable renewal date yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {withDate.map((p) => {
                  const days = daysUntil(p.policy_end_date_iso)
                  return (
                    <li key={p.id}>
                      <Link
                        to={`/policies/${p.id}`}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-beige-200 bg-white p-4 hover:shadow-md"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${TYPE_TINT[p.policy_type] ?? TYPE_TINT.unknown}`}>
                            <TypeIcon type={p.policy_type} className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-neutral-900">
                              {p.product_name ?? p.source_file}
                            </p>
                            <p className="text-xs text-neutral-500">{p.insurer ?? '—'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 text-sm text-neutral-600">
                          <CalendarIcon className="h-4 w-4" />
                          {p.policy_end_date}
                          {days !== null && (
                            <span className={days <= 30 ? 'font-medium text-red-500' : 'text-neutral-400'}>
                              ({days >= 0 ? `${days}d` : 'overdue'})
                            </span>
                          )}
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {withoutDate.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-neutral-700">
                No renewal date on file
              </h2>
              <ul className="mt-3 space-y-2">
                {withoutDate.map((p) => (
                  <li key={p.id}>
                    <Link
                      to={`/policies/${p.id}`}
                      className="flex items-center gap-3 rounded-2xl border border-beige-200 bg-white p-4 opacity-70 hover:opacity-100"
                    >
                      <TypeIcon type={p.policy_type} className="h-4 w-4" />
                      <p className="text-sm text-neutral-700">
                        {p.product_name ?? p.source_file}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
