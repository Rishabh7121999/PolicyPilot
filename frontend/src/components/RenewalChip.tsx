import { daysUntil } from '../lib/format'

function humanizeDays(days: number): string {
  if (days < 60) return `${days} days`
  if (days < 365) return `${Math.round(days / 30)} months`
  const years = Math.round(days / 365)
  return `${years} year${years === 1 ? '' : 's'}`
}

/** Countdown to a policy's renewal date: red when overdue, peach inside 30
 * days, neutral otherwise. `onlyUrgent` hides it beyond 30 days. */
export function RenewalChip({ isoDate, onlyUrgent }: { isoDate: string | null; onlyUrgent?: boolean }) {
  const days = daysUntil(isoDate)
  if (days === null) return null
  if (onlyUrgent && days > 30) return null

  const [label, tone] =
    days < 0
      ? ['Overdue', 'bg-red-100 text-red-700']
      : days === 0
        ? ['Today', 'bg-red-100 text-red-700']
        : days <= 30
          ? [`${days} day${days === 1 ? '' : 's'} left`, 'bg-peach-100 text-red-700']
          : [`in ${humanizeDays(days)}`, 'bg-beige-100 text-neutral-700']

  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{label}</span>
}
