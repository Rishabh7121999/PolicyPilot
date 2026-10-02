import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listPolicies } from '../api/client'
import { ActionCard } from '../components/ActionCard'
import { StatCard } from '../components/StatCard'
import {
  BellIcon,
  CalendarIcon,
  ChatIcon,
  DocumentIcon,
  HospitalIcon,
  LightbulbIcon,
  ShieldIcon,
  TypeIcon,
  UmbrellaIcon,
} from '../components/icons'
import { useAppShell } from '../context/AppShellContext'
import { useAuth } from '../context/AuthContext'
import { usePolling } from '../hooks/usePolling'
import { daysUntil, formatCoverage } from '../lib/format'
import { TYPE_LABEL } from '../lib/policyType'
import type { PolicyListItem } from '../api/types'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

type Tint = 'peach' | 'teal' | 'sage' | 'beige'

const TINT_ICON_BG: Record<Tint, string> = {
  peach: 'bg-peach-100 text-red-500',
  teal: 'bg-teal-100 text-teal-700',
  sage: 'bg-sage-100 text-sage-700',
  beige: 'bg-beige-200 text-neutral-600',
}

const TINT_PILL: Record<Tint, string> = {
  peach: 'bg-peach-100 text-red-600 hover:bg-peach-200',
  teal: 'bg-teal-100 text-teal-700 hover:bg-teal-200',
  sage: 'bg-sage-100 text-sage-800 hover:bg-sage-200',
  beige: 'bg-beige-200 text-neutral-700 hover:bg-beige-300',
}

interface AttentionItem {
  key: string
  icon: ReactNode
  tint: Tint
  title: string
  subtitle: string
  cta: string
  to: string
}

function buildAttentionItems(policies: PolicyListItem[]): AttentionItem[] {
  const items: AttentionItem[] = []

  for (const p of policies) {
    const name = [p.insurer, p.product_name].filter(Boolean).join(' · ') || p.source_file

    if (p.status === 'ready') {
      const days = daysUntil(p.policy_end_date_iso)
      if (days !== null && days <= 30) {
        const overdue = days < 0
        items.push({
          key: `renewal-${p.id}`,
          icon: <CalendarIcon className="h-5 w-5" />,
          tint: 'peach',
          title: `${TYPE_LABEL[p.policy_type] ?? 'Policy'} ${overdue ? 'renewal overdue' : 'renewal due soon'}`,
          subtitle: `${name} · ${overdue ? 'Expired on' : 'Renews on'} ${p.policy_end_date}`,
          cta: 'Review',
          to: `/policies/${p.id}`,
        })
      }
    } else if (p.status === 'processing') {
      items.push({
        key: `processing-${p.id}`,
        icon: <DocumentIcon className="h-5 w-5" />,
        tint: 'teal',
        title: `${p.source_file} is being processed`,
        subtitle: "We're extracting your policy details. This usually takes a few minutes.",
        cta: 'View Status',
        to: `/policies/${p.id}`,
      })
    } else if (p.status === 'failed') {
      items.push({
        key: `failed-${p.id}`,
        icon: <DocumentIcon className="h-5 w-5" />,
        tint: 'peach',
        title: `${p.source_file} failed to process`,
        subtitle: 'We ran into a problem reading this document.',
        cta: 'View Details',
        to: `/policies/${p.id}`,
      })
    }
  }

  return items
}

interface Insight {
  key: string
  icon: ReactNode
  tint: Tint
  text: string
}

function buildInsights(policies: PolicyListItem[]): Insight[] {
  const ready = policies.filter((p) => p.status === 'ready')
  const insights: Insight[] = []

  const byType = new Map<string, { count: number; total: number }>()
  for (const p of ready) {
    if (p.sum_insured_numeric == null) continue
    const entry = byType.get(p.policy_type) ?? { count: 0, total: 0 }
    entry.count += 1
    entry.total += p.sum_insured_numeric
    byType.set(p.policy_type, entry)
  }
  const topType = [...byType.entries()].sort((a, b) => b[1].total - a[1].total)[0]
  if (topType) {
    const [type, { count, total }] = topType
    const label = (TYPE_LABEL[type] ?? 'policy').replace(' Insurance', '').toLowerCase()
    insights.push({
      key: 'coverage',
      icon: <LightbulbIcon className="h-5 w-5" />,
      tint: 'peach',
      text:
        count > 1
          ? `You have ${formatCoverage(total)} combined coverage across ${count} ${label} policies.`
          : `You have ${formatCoverage(total)} coverage in your ${label} policy.`,
    })
  }

  const upcoming = ready
    .map((p) => ({ p, days: daysUntil(p.policy_end_date_iso) }))
    .filter((x) => x.days !== null && x.days >= 0)
    .sort((a, b) => (a.days as number) - (b.days as number))
  if (upcoming.length > 0) {
    const { p, days } = upcoming[0]
    const label = (TYPE_LABEL[p.policy_type] ?? 'policy').replace(' Insurance', '').toLowerCase()
    insights.push({
      key: 'renewal',
      icon: <TypeIcon type={p.policy_type} className="h-5 w-5" />,
      tint: 'teal',
      text: `Your ${label} policy expires in ${days} day${days === 1 ? '' : 's'}.`,
    })
  }

  const typeCounts = new Map<string, number>()
  for (const p of ready) typeCounts.set(p.policy_type, (typeCounts.get(p.policy_type) ?? 0) + 1)
  const dupType = [...typeCounts.entries()].find(([, c]) => c > 1)
  if (dupType) {
    const [type, count] = dupType
    const label = (TYPE_LABEL[type] ?? 'policy').replace(' Insurance', '').toLowerCase()
    insights.push({
      key: 'overlap',
      icon: <DocumentIcon className="h-5 w-5" />,
      tint: 'beige',
      text: `You have ${count} ${label} policies — worth comparing coverage to avoid overlap.`,
    })
  }

  return insights.slice(0, 3)
}

export function HomePage() {
  const [policies, setPolicies] = useState<PolicyListItem[]>([])
  const [loading, setLoading] = useState(true)
  const { policiesVersion } = useAppShell()
  const { user } = useAuth()
  const navigate = useNavigate()

  const refresh = useCallback(() => {
    listPolicies().then((data) => {
      setPolicies(data)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh, policiesVersion])

  usePolling(refresh, 2000, policies.some((p) => p.status === 'processing'))

  const readyPolicies = policies.filter((p) => p.status === 'ready')
  const renewalDue = readyPolicies.filter((p) => {
    const d = daysUntil(p.policy_end_date_iso)
    return d !== null && d <= 30
  })
  const totalCoverage = readyPolicies.reduce((sum, p) => sum + (p.sum_insured_numeric ?? 0), 0)
  // Summing health + life + motor cover into one figure hides what it's made
  // of, so show the per-type split underneath.
  const coverageBreakdown = (['health', 'life', 'motor'] as const)
    .map((type) => {
      const total = readyPolicies
        .filter((p) => p.policy_type === type)
        .reduce((sum, p) => sum + (p.sum_insured_numeric ?? 0), 0)
      return total > 0 ? `${TYPE_LABEL[type].replace(' Insurance', '')} ${formatCoverage(total)}` : null
    })
    .filter(Boolean)
    .join(' · ')

  const attentionItems = buildAttentionItems(policies)
  const insights = buildInsights(policies)
  const firstName = user?.name.trim().split(/\s+/)[0] ?? 'there'

  function askQuestion(question: string) {
    navigate(`/chat?q=${encodeURIComponent(question)}`)
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">
          {getGreeting()}, {firstName} 👋
        </h1>
        <p className="mt-1 text-base text-neutral-500">
          Here's what you need to know about your insurance today.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={<ShieldIcon className="h-5 w-5" />}
          value={String(readyPolicies.length)}
          label="Active policies"
          tint="sage"
          to="/policies"
          loading={loading}
        />
        <StatCard
          icon={<BellIcon className="h-5 w-5" />}
          value={String(renewalDue.length)}
          label="Renewals due or overdue"
          tint="peach"
          to="/reminders"
          loading={loading}
        />
        <StatCard
          icon={<UmbrellaIcon className="h-5 w-5" />}
          value={formatCoverage(totalCoverage)}
          label="Total coverage"
          detail={coverageBreakdown || undefined}
          tint="teal"
          loading={loading}
        />
      </div>

      {!loading && attentionItems.length > 0 && (
        <div className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-neutral-900">Things to take care of</h2>
            <Link to="/reminders" className="text-sm font-medium text-sage-700 hover:underline">
              View All
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {attentionItems.map((item) => (
              <Link
                key={item.key}
                to={item.to}
                className="flex items-center justify-between gap-4 rounded-2xl border border-beige-200 bg-white p-4 transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]"
              >
                <div className="flex min-w-0 items-start gap-3 sm:items-center">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TINT_ICON_BG[item.tint]}`}>
                    {item.icon}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-900 sm:truncate">{item.title}</p>
                    <p className="text-sm text-neutral-500 sm:truncate">{item.subtitle}</p>
                  </div>
                </div>
                <span className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium ${TINT_PILL[item.tint]}`}>
                  {item.cta} →
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-10">
        <h2 className="text-lg font-semibold text-neutral-900">What would you like to do?</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ActionCard
            icon={<ChatIcon className="h-5 w-5" />}
            tint="teal"
            title="Ask PolicyPilot"
            description="Get instant answers about your policies"
            cta="Ask now"
            onClick={() => navigate('/chat')}
          />
          <ActionCard
            icon={<DocumentIcon className="h-5 w-5" />}
            tint="peach"
            title="Start a Claim"
            description="Step-by-step guidance for your claim"
            cta="Start now"
            onClick={() => askQuestion('How do I file a claim on my policy?')}
          />
          <ActionCard
            icon={<HospitalIcon className="h-5 w-5" />}
            tint="beige"
            title="Find Cashless Hospitals"
            description="Check the network hospitals on your policy"
            cta="Ask now"
            onClick={() => askQuestion('Which cashless hospitals are in my network?')}
          />
        </div>
      </div>

      {!loading && insights.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-semibold text-neutral-900">PolicyPilot Insights</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {insights.map((insight) => (
              <div key={insight.key} className="rounded-2xl border border-beige-200 bg-white p-4">
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${TINT_ICON_BG[insight.tint]}`}>
                  {insight.icon}
                </div>
                <p className="mt-3 text-sm text-neutral-700">{insight.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
