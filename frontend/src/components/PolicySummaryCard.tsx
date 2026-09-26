import type { PolicySummary } from '../api/types'

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null

  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-neutral-900 dark:text-neutral-100">{value}</dd>
    </div>
  )
}

export function PolicySummaryCard({ summary }: { summary: PolicySummary }) {
  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Field label="Policy Number" value={summary.policy_number} />
        <Field label="Insurer" value={summary.insurer} />
        <Field label="Product" value={summary.product_name} />
        <Field label="Policyholder" value={summary.policyholder_name} />
        <Field label="Plan Variant" value={summary.plan_variant} />
        <Field label="Sum Insured" value={summary.sum_insured} />
        <Field label="Premium" value={summary.premium_amount} />
        <Field label="Premium Due" value={summary.premium_due_date} />
        <Field label="Start Date" value={summary.policy_start_date} />
        <Field label="End Date" value={summary.policy_end_date} />
        <Field label="Nominee" value={summary.nominee} />
      </dl>

      {summary.riders.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Riders</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {summary.riders.map((rider) => (
              <li
                key={rider}
                className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
              >
                {rider}
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.waiting_periods.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Waiting Periods
          </h3>
          <div className="mt-2 overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-sm">
              <tbody>
                {summary.waiting_periods.map((wp, i) => (
                  <tr
                    key={i}
                    className="border-b border-neutral-200 last:border-0 dark:border-neutral-800"
                  >
                    <td className="px-3 py-2 text-neutral-700 dark:text-neutral-300">
                      {wp.condition}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-neutral-900 dark:text-neutral-100">
                      {wp.duration}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {summary.key_exclusions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Key Exclusions
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-700 dark:text-neutral-300">
            {summary.key_exclusions.map((exclusion) => (
              <li key={exclusion}>{exclusion}</li>
            ))}
          </ul>
        </div>
      )}

      {summary.claim_process_summary && (
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Claim Process
          </h3>
          <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">
            {summary.claim_process_summary}
          </p>
        </div>
      )}
    </div>
  )
}
