import type { ReactNode } from 'react'

interface StatCardProps {
  icon: ReactNode
  value: string
  label: string
  tint: 'sage' | 'peach' | 'teal'
}

const TINTS: Record<StatCardProps['tint'], string> = {
  sage: 'bg-sage-100 text-sage-700',
  peach: 'bg-peach-100 text-peach-300',
  teal: 'bg-teal-100 text-teal-700',
}

export function StatCard({ icon, value, label, tint }: StatCardProps) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-beige-200 bg-white p-5">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${TINTS[tint]}`}>{icon}</div>
      <div>
        <p className="text-xl font-semibold text-neutral-900">{value}</p>
        <p className="text-sm text-neutral-500">{label}</p>
      </div>
    </div>
  )
}
