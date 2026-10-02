import type { PolicyListItem } from '../api/types'
import { useAppShell } from '../context/AppShellContext'
import { DocumentIcon } from './icons'

// Sources come from the backend as "<source_file> (Page <n>)".
const SOURCE_PATTERN = /^(.*) \(Page (\d+)\)$/

function parseSource(source: string): { file: string; page?: number } {
  const match = SOURCE_PATTERN.exec(source)
  return match ? { file: match[1], page: Number(match[2]) } : { file: source }
}

export function SourceList({ sources, policies }: { sources: string[]; policies?: PolicyListItem[] }) {
  const { openPolicyViewer } = useAppShell()

  if (sources.length === 0) return null

  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {sources.map((source) => {
        const { file, page } = parseSource(source)
        const policy = policies?.find((p) => p.source_file === file)

        if (!policy) {
          return (
            <span key={source} className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600">
              {source}
            </span>
          )
        }

        return (
          <button
            key={source}
            type="button"
            onClick={() => openPolicyViewer(policy.id, page)}
            title="Open the policy at this page"
            className="inline-flex items-center gap-1 rounded-full border border-sage-200 bg-sage-50 px-2.5 py-1 text-xs text-sage-800 hover:bg-sage-100"
          >
            <DocumentIcon className="h-3.5 w-3.5" />
            {source}
          </button>
        )
      })}
    </div>
  )
}
