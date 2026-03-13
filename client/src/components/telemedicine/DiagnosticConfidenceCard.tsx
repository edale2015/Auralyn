import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Brain, TrendingUp } from "lucide-react"
import { diagnosticConfidenceApi, type ConfidenceResult } from "@/lib/diagnosticConfidenceApi"

interface Props {
  caseId?: string
  state?: any
  className?: string
}

function ConfidenceBar({ value, color }: { value: number; color: string }) {
  const pct = Math.round(value * 100)
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-xs tabular-nums text-slate-500">{pct}%</span>
    </div>
  )
}

function colorFor(conf: number) {
  if (conf >= 0.6) return "bg-emerald-500"
  if (conf >= 0.35) return "bg-amber-400"
  return "bg-slate-300"
}

function RankBadge({ rank }: { rank: number }) {
  const cls =
    rank === 0
      ? "bg-violet-100 text-violet-700"
      : rank === 1
        ? "bg-blue-100 text-blue-700"
        : "bg-slate-100 text-slate-600"
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${cls}`}>
      #{rank + 1}
    </span>
  )
}

export default function DiagnosticConfidenceCard({ caseId, state, className = "" }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["diagnosticConfidence", caseId ?? "state", state],
    queryFn: () =>
      caseId
        ? diagnosticConfidenceApi.getForCase(caseId)
        : diagnosticConfidenceApi.fromState(state),
    enabled: !!(caseId || state?.differential?.length),
    staleTime: 30_000,
  })

  return (
    <Card className={className} data-testid="diagnostic-confidence-card">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Brain className="h-4 w-4 text-violet-500" />
          Diagnostic Confidence
          <Badge variant="outline" className="ml-auto text-xs">
            3-signal fusion
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        )}
        {error && (
          <p className="text-sm text-rose-500">Failed to load confidence scores</p>
        )}
        {!isLoading && !error && !data?.result?.length && (
          <p className="text-sm text-slate-400">
            No differential available yet. Run triage first.
          </p>
        )}
        {data?.result?.map((r: ConfidenceResult, i: number) => (
          <div
            key={r.diagnosis}
            className="mb-3 rounded-xl border bg-slate-50 p-3"
            data-testid={`confidence-row-${i}`}
          >
            <div className="mb-1 flex items-center gap-2">
              <RankBadge rank={i} />
              <span className="font-medium capitalize">
                {r.diagnosis.replace(/_/g, " ")}
              </span>
              <span className="ml-auto flex items-center gap-1 text-sm font-semibold">
                <TrendingUp className="h-3 w-3 text-slate-400" />
                {(r.confidence * 100).toFixed(1)}%
              </span>
            </div>
            <ConfidenceBar value={r.confidence} color={colorFor(r.confidence)} />
            <div className="mt-1 flex gap-3 text-xs text-slate-400">
              <span data-testid={`rule-score-${i}`}>
                rule {(r.ruleScore * 100).toFixed(0)}%
              </span>
              <span data-testid={`similarity-score-${i}`}>
                similar {(r.similarityScore * 100).toFixed(0)}%
              </span>
              <span data-testid={`prob-score-${i}`}>
                prior {(r.probability * 100).toFixed(0)}%
              </span>
            </div>
            {r.explanation.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {r.explanation.map((e) => (
                  <span
                    key={e}
                    className="rounded bg-white px-1.5 py-0.5 text-xs text-slate-500 border"
                  >
                    {e}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
