import { useRef, useState } from 'react'
import type { HealthDetails, LifeDetails, MotorDetails, PolicySummary } from '../api/types'
import { ActionCard } from './ActionCard'
import { ChatIcon, DocumentIcon, QuestionIcon, UmbrellaIcon } from './icons'

type Tab = 'overview' | 'covered' | 'claim' | 'faqs'

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'covered', label: "What's Covered" },
  { id: 'claim', label: 'Claim Process' },
  { id: 'faqs', label: 'FAQs' },
]

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null

  return (
    <div className="flex items-center justify-between border-b border-beige-100 py-2.5 text-sm last:border-0">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="font-medium text-neutral-900">{value}</dd>
    </div>
  )
}

function ListSection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null

  return (
    <div>
      <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-700">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

function HealthDetailsSection({ details }: { details: HealthDetails }) {
  return (
    <div className="rounded-2xl border border-beige-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-neutral-900">Health Plan Details</h3>
      <dl className="mt-2">
        <Field label="Room Rent Limit" value={details.room_rent_limit} />
        <Field label="Pre-Hospitalization Cover" value={details.pre_hospitalization_days} />
        <Field label="Post-Hospitalization Cover" value={details.post_hospitalization_days} />
        <Field label="Co-Pay" value={details.co_pay_percentage} />
        <Field label="Restoration Benefit" value={details.restoration_benefit} />
        <Field label="No-Claim Bonus" value={details.no_claim_bonus} />
        <Field label="Maternity Cover" value={details.maternity_cover} />
        <Field label="Ambulance Cover" value={details.ambulance_cover} />
        <Field label="Health Checkup Benefit" value={details.health_checkup_benefit} />
      </dl>
      <div className="mt-3">
        <ListSection title="Sub-Limits" items={details.sub_limits} />
      </div>
      <div className="mt-3">
        <ListSection title="Day-Care Procedures" items={details.day_care_procedures} />
      </div>
    </div>
  )
}

function LifeDetailsSection({ details }: { details: LifeDetails }) {
  return (
    <div className="rounded-2xl border border-beige-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-neutral-900">Life Plan Details</h3>
      <dl className="mt-2">
        <Field label="Plan Type" value={details.plan_type} />
        <Field label="Policy Term" value={details.policy_term} />
        <Field label="Premium Paying Term" value={details.premium_paying_term} />
        <Field label="Death Benefit" value={details.death_benefit} />
        <Field label="Maturity Benefit" value={details.maturity_benefit} />
        <Field label="Surrender Value" value={details.surrender_value} />
        <Field label="Tax Benefit" value={details.tax_benefit} />
        <Field label="Free-Look Period" value={details.free_look_period} />
        <Field label="Grace Period" value={details.grace_period} />
        <Field label="Policy Loan" value={details.policy_loan_available} />
      </dl>
    </div>
  )
}

function MotorDetailsSection({ details }: { details: MotorDetails }) {
  return (
    <div className="rounded-2xl border border-beige-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-neutral-900">Motor Plan Details</h3>
      <dl className="mt-2">
        <Field label="Registration Number" value={details.registration_number} />
        <Field label="Vehicle" value={details.make_model_variant} />
        <Field label="Year of Manufacture" value={details.year_of_manufacture} />
        <Field label="IDV" value={details.idv} />
        <Field label="Cover Type" value={details.cover_type} />
        <Field label="No-Claim Bonus" value={details.no_claim_bonus_percentage} />
        <Field label="Compulsory Deductible" value={details.compulsory_deductible} />
        <Field label="Third-Party Liability Limit" value={details.third_party_liability_limit} />
        <Field label="PA Cover (Owner-Driver)" value={details.pa_cover_owner_driver} />
      </dl>
      <div className="mt-3">
        <ListSection title="Add-Ons" items={details.add_ons} />
      </div>
    </div>
  )
}

export function PolicyDetailTabs({
  summary,
  insuredName,
}: {
  summary: PolicySummary
  insuredName: string | null
}) {
  const [tab, setTab] = useState<Tab>('overview')
  const tabBarRef = useRef<HTMLDivElement>(null)

  // Tiles jump straight to a tab's content, which can land below the fold if
  // the tile itself was scrolled down the overview page -- scroll the tab bar
  // back into view so the switch doesn't feel like it went nowhere.
  function selectTab(id: Tab) {
    setTab(id)
    tabBarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div>
      <div ref={tabBarRef} className="flex gap-1 overflow-x-auto border-b border-beige-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => selectTab(t.id)}
            className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'border-sage-600 text-sage-700'
                : 'border-transparent text-neutral-500 hover:text-neutral-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6 animate-fade-in" key={tab}>
        {tab === 'overview' && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-beige-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-neutral-900">Key Information</h3>
              <dl className="mt-2">
                <Field label="Insured Name" value={insuredName ?? summary.policyholder_name} />
                <Field label="Sum Insured" value={summary.sum_insured} />
                <Field label="Start Date" value={summary.policy_start_date} />
                <Field label="Renewal Date" value={summary.policy_end_date} />
                <Field label="Premium" value={summary.premium_amount} />
                <Field label="Plan Variant" value={summary.plan_variant} />
                <Field label="Nominee" value={summary.nominee} />
              </dl>
            </div>

            {summary.policy_type === 'health' && summary.health_details && (
              <HealthDetailsSection details={summary.health_details} />
            )}
            {summary.policy_type === 'life' && summary.life_details && (
              <LifeDetailsSection details={summary.life_details} />
            )}
            {summary.policy_type === 'motor' && summary.motor_details && (
              <MotorDetailsSection details={summary.motor_details} />
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ActionCard
                icon={<UmbrellaIcon className="h-5 w-5" />}
                tint="teal"
                title="What's covered in your plan"
                description="View benefits, inclusions and exclusions."
                cta="View now"
                onClick={() => selectTab('covered')}
              />
              <ActionCard
                icon={<DocumentIcon className="h-5 w-5" />}
                tint="peach"
                title="Know your claim process"
                description="Step-by-step guide to file your claim easily."
                cta="Know more"
                onClick={() => selectTab('claim')}
              />
              <ActionCard
                icon={<QuestionIcon className="h-5 w-5" />}
                tint="beige"
                title="Frequently asked questions"
                description="Get answers to common questions about your policy."
                cta="View FAQs"
                onClick={() => selectTab('faqs')}
              />
            </div>
          </div>
        )}

        {tab === 'covered' && (
          <div className="space-y-6 rounded-2xl border border-beige-200 bg-white p-5">
            <ListSection title="Riders / Add-Ons" items={summary.riders} />
            <ListSection title="Key Exclusions" items={summary.key_exclusions} />
            {summary.waiting_periods.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-neutral-900">Waiting Periods</h3>
                <div className="mt-2 overflow-hidden rounded-lg border border-beige-200">
                  <table className="w-full text-sm">
                    <tbody>
                      {summary.waiting_periods.map((wp, i) => (
                        <tr key={i} className="border-b border-beige-100 last:border-0">
                          <td className="px-3 py-2 text-neutral-700">{wp.condition}</td>
                          <td className="px-3 py-2 text-right font-medium text-neutral-900">
                            {wp.duration}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {summary.riders.length === 0 && summary.key_exclusions.length === 0 && summary.waiting_periods.length === 0 && (
              <p className="text-sm text-neutral-500">Nothing specific was extracted for this section.</p>
            )}
          </div>
        )}

        {tab === 'claim' && (
          <div className="rounded-2xl border border-beige-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-neutral-900">Claim Process</h3>
            <p className="mt-2 text-sm text-neutral-700">
              {summary.claim_process_summary ?? 'No claim process details were found in this document.'}
            </p>
          </div>
        )}

        {tab === 'faqs' && (
          <div className="space-y-3">
            {summary.faqs.length === 0 && (
              <p className="text-sm text-neutral-500">No FAQs were generated for this policy.</p>
            )}
            {summary.faqs.map((faq, i) => (
              <details
                key={i}
                className="group rounded-2xl border border-beige-200 bg-white p-4"
              >
                <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-neutral-900">
                  <ChatIcon className="h-4 w-4 shrink-0 text-sage-600" />
                  {faq.question}
                </summary>
                <p className="mt-2 pl-6 text-sm text-neutral-600">{faq.answer}</p>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
