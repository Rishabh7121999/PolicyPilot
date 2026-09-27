export function SourceList({ sources }: { sources: string[] }) {
  if (sources.length === 0) return null

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {sources.map((source) => (
        <span
          key={source}
          className="rounded-full border border-neutral-200 px-2.5 py-0.5 text-xs text-neutral-500"
        >
          {source}
        </span>
      ))}
    </div>
  )
}
