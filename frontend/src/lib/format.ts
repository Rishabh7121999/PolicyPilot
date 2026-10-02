export function formatCoverage(amount: number | null): string {
  if (amount === null || Number.isNaN(amount)) return '—'

  if (amount >= 1_00_00_000) return `₹${(amount / 1_00_00_000).toFixed(2).replace(/\.00$/, '')} Cr`
  if (amount >= 1_00_000) return `₹${(amount / 1_00_000).toFixed(2).replace(/\.00$/, '')} L`

  return `₹${amount.toLocaleString('en-IN')}`
}

export function daysUntil(isoDate: string | null): number | null {
  if (!isoDate) return null

  const target = new Date(isoDate)
  if (Number.isNaN(target.getTime())) return null

  const now = new Date()
  const diffMs = target.setHours(0, 0, 0, 0) - now.setHours(0, 0, 0, 0)
  return Math.round(diffMs / (1000 * 60 * 60 * 24))
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}
