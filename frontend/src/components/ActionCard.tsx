import type { ReactNode } from 'react'
import { ArrowRightIcon } from './icons'

interface ActionCardProps {
  icon: ReactNode
  tint: 'sage' | 'peach' | 'teal' | 'beige'
  title: string
  description: string
  cta: string
  onClick: () => void
}

const TINTS: Record<ActionCardProps['tint'], string> = {
  sage: 'bg-sage-50',
  peach: 'bg-peach-100',
  teal: 'bg-teal-50',
  beige: 'bg-beige-50',
}

const ICON_TINTS: Record<ActionCardProps['tint'], string> = {
  sage: 'bg-sage-100 text-sage-700',
  peach: 'bg-peach-200 text-red-500',
  teal: 'bg-teal-100 text-teal-700',
  beige: 'bg-beige-200 text-neutral-600',
}

export function ActionCard({ icon, tint, title, description, cta, onClick }: ActionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-start rounded-2xl border border-beige-200 p-5 text-left transition-shadow hover:shadow-md ${TINTS[tint]}`}
    >
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${ICON_TINTS[tint]}`}>{icon}</div>
      <p className="mt-3 text-sm font-semibold text-neutral-900">{title}</p>
      <p className="mt-1 text-sm text-neutral-500">{description}</p>
      <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-sage-700">
        {cta} <ArrowRightIcon className="h-3.5 w-3.5" />
      </span>
    </button>
  )
}
