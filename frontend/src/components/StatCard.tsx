import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface StatCardProps {
  icon: ReactNode
  value: string
  label: string
  tint: 'sage' | 'peach' | 'teal'
  detail?: string
  to?: string
  loading?: boolean
}

const TINTS: Record<StatCardProps['tint'], string> = {
  sage: 'bg-sage-100 text-sage-700',
  peach: 'bg-peach-100 text-red-600',
  teal: 'bg-teal-100 text-teal-700',
}

export function StatCard({ icon, value, label, tint, detail, to, loading }: StatCardProps) {
  const body = (
    <>
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${TINTS[tint]}`}>{icon}</div>
      <div className="min-w-0">
        {loading ? (
          <div className="h-7 w-16 animate-pulse rounded bg-beige-100" />
        ) : (
          <p className="text-xl font-semibold text-neutral-900">{value}</p>
        )}
        <p className="text-sm text-neutral-500">{label}</p>
        {detail && !loading && <p className="mt-0.5 truncate text-sm text-neutral-500">{detail}</p>}
      </div>
    </>
  )
  const base = 'flex items-center gap-4 rounded-2xl border border-beige-200 bg-white p-5'

  return to ? (
    <Link to={to} className={`${base} transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md`}>
      {body}
    </Link>
  ) : (
    <div className={base}>{body}</div>
  )
}
