import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listPolicies } from '../api/client'
import { PolicyCard } from '../components/PolicyCard'
import { StatCard } from '../components/StatCard'
import { BellIcon, ShieldIcon, UploadIcon } from '../components/icons'
import { useAppShell } from '../context/AppShellContext'
import { daysUntil, formatCoverage } from '../lib/format'
import type { PolicyListItem } from '../api/types'

export function HomePage() {
  const [policies, setPolicies] = useState<PolicyListItem[]>([])
  const [loading, setLoading] = useState(true)
  const { policiesVersion, openUploadDialog } = useAppShell()

  useEffect(() => {
    listPolicies().then((data) => {
      setPolicies(data)
      setLoading(false)
    })
  }, [policiesVersion])

  const readyPolicies = policies.filter((p) => p.status === 'ready')
  const renewalDue = readyPolicies.filter((p) => {
    const d = daysUntil(p.policy_end_date_iso)
    return d !== null && d >= 0 && d <= 30
  })
  const totalCoverage = readyPolicies.reduce((sum, p) => sum + (p.sum_insured_numeric ?? 0), 0)

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">
            Good morning, Rishabh 👋
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Here's an overview of your insurance policies
          </p>
        </div>
        <button
          type="button"
          onClick={openUploadDialog}
          className="flex items-center gap-2 rounded-xl bg-sage-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-sage-800"
        >
          <UploadIcon className="h-4 w-4" />
          Upload Policy
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={<ShieldIcon className="h-5 w-5" />} value={String(readyPolicies.length)} label="Active Policies" tint="sage" />
        <StatCard icon={<BellIcon className="h-5 w-5" />} value={String(renewalDue.length)} label="Renewal Due" tint="peach" />
        <StatCard icon={<ShieldIcon className="h-5 w-5" />} value={formatCoverage(totalCoverage)} label="Total Coverage" tint="teal" />
      </div>

      <div className="mt-10 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-900">Your Policies</h2>
        <Link to="/policies" className="text-sm font-medium text-sage-700 hover:underline">
          View All
        </Link>
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-neutral-500">Loading…</p>
      ) : policies.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-500">No policies yet. Upload a PDF to get started.</p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {policies.slice(0, 6).map((policy) => (
            <PolicyCard key={policy.id} policy={policy} />
          ))}
        </div>
      )}
    </div>
  )
}
