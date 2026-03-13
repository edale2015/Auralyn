import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface ConsensusResult {
  diagnosis: string
  consensusScore: number
  votes: Record<string, number>
  sources: string[]
}

interface Props {
  caseId: string
}

function ConsensusBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 mt-0.5">
      <div
        className={`h-1.5 rounded-full ${color}`}
        style={{ width: `${(value * 100).toFixed(0)}%` }}
      />
    </div>
  )
}

const SOURCE_COLORS: Record<string, string> = {
  rule_engine: "bg-blue-100 text-blue-700 border-blue-200",
  evidence_graph: "bg-violet-100 text-violet-700 border-violet-200",
  similar_cases: "bg-green-100 text-green-700 border-green-200",
  bayesian_confidence: "bg-amber-100 text-amber-700 border-amber-200",
}

const BAR_COLORS = ["bg-blue-500", "bg-violet-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500"]

export default function DiagnosticConsensusCard({ caseId }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/clinical/consensus", caseId],
    queryFn: () => fetch(`/api/clinical/consensus/${caseId}`).then((r) => r.json()),
    enabled: !!caseId,
    refetchInterval: 6000,
  })

  if (isLoading) return <p className="text-xs text-muted-foreground">Computing consensus…</p>
  if (error || !data?.ok) return <p className="text-xs text-red-500">Consensus unavailable.</p>

  const consensus: ConsensusResult[] = data.consensus ?? []
  const sources: string[] = data.sources ?? []

  return (
    <Card data-testid="diagnostic-consensus-card">
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          🗺 Diagnostic Consensus
        </CardTitle>
        <div className="flex gap-1 flex-wrap">
          {sources.map((s) => (
            <Badge
              key={s}
              variant="outline"
              className={`text-[9px] px-1 py-0 ${SOURCE_COLORS[s] ?? "bg-gray-100 text-gray-600"}`}
            >
              {s.replace(/_/g, " ")}
            </Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-3 space-y-2">
        {consensus.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">
            No differential available yet.
          </p>
        )}
        {consensus.slice(0, 6).map((r, i) => (
          <div
            key={r.diagnosis}
            className="space-y-0.5"
            data-testid={`consensus-row-${i}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-800">
                {r.diagnosis.replace(/_/g, " ")}
              </span>
              <span className="text-xs font-bold text-gray-700">
                {(r.consensusScore * 100).toFixed(0)}%
              </span>
            </div>
            <ConsensusBar value={r.consensusScore} color={BAR_COLORS[i % BAR_COLORS.length]} />
            <div className="flex gap-1 flex-wrap">
              {r.sources.map((s) => (
                <span
                  key={s}
                  className={`text-[8px] px-1 rounded border ${SOURCE_COLORS[s] ?? "bg-gray-50 text-gray-500 border-gray-200"}`}
                >
                  {s.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
