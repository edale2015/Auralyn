export default function AcceptanceSummaryCards({
  summary,
}: {
  summary: {
    total: number
    unchanged: number
    light: number
    moderate: number
    heavy: number
    acceptedUnchangedRate: number
    acceptedLightRate: number
    heavyRewriteRate: number
    avgSimilarity: number | string | null
  }
}) {
  const cards: [string, string | number][] = [
    ["Total", summary.total],
    ["Unchanged", summary.unchanged],
    ["Light Edit", summary.light],
    ["Moderate", summary.moderate],
    ["Heavy Rewrite", summary.heavy],
    ["Unchanged %", `${(summary.acceptedUnchangedRate * 100).toFixed(1)}%`],
    ["Light %", `${(summary.acceptedLightRate * 100).toFixed(1)}%`],
    ["Heavy %", `${(summary.heavyRewriteRate * 100).toFixed(1)}%`],
    ["Avg Similarity", Number(summary.avgSimilarity || 0).toFixed(2)],
  ]

  return (
    <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
      {cards.map(([label, value]) => (
        <div key={String(label)} className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="text-xs text-muted-foreground mb-1">{label}</div>
          <div className="text-2xl font-semibold">{String(value)}</div>
        </div>
      ))}
    </div>
  )
}
