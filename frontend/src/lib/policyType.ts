export const TYPE_TINT: Record<string, string> = {
  health: 'bg-peach-100 text-red-500',
  life: 'bg-teal-100 text-teal-700',
  motor: 'bg-sage-100 text-sage-700',
  unknown: 'bg-beige-100 text-neutral-500',
}

export const TYPE_LABEL: Record<string, string> = {
  health: 'Health Insurance',
  life: 'Life Insurance',
  motor: 'Motor Insurance',
  unknown: 'Policy',
}

/** A short, human label for a policy in a selection list — "Health Insurance · ReAssure 2.0" —
 * instead of the raw uploaded filename. */
export function policyDisplayLabel(p: {
  policy_type: string
  product_name?: string | null
  insurer?: string | null
}): string {
  const type = TYPE_LABEL[p.policy_type] ?? TYPE_LABEL.unknown
  const detail = p.product_name || p.insurer
  return detail ? `${type} · ${detail}` : type
}
