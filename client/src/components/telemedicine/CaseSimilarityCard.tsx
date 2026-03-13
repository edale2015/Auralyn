import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangle, Brain, CheckCircle, TrendingUp, Users } from "lucide-react"

interface SimilarCase {
  caseId: string
  complaint: string
  symptoms: string[]
  differential: string[]
  disposition: string
  similarityScore: number
  outcome?: {
    actualDiagnosis?: string
    actualDisposition?: string
    topPredictionMatch?: boolean
    dispositionMatch?: boolean
    safetyMiss?: boolean
  }
}

interface SimilarityResult {
  query?: any
  similarCases?: SimilarCase[]
  summary?: {
    topDiagnoses?: Array<{ diagnosis: string; count: number }>
    topDispositions?: Array<{ disposition: string; count: number }>
    safetyWarnings?: Array<{ diagnosis: string; cases: number; message: string }>
  }
}

interface Props {
  result: SimilarityResult | null
  isLoading?: boolean
  className?: string
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const color = pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-slate-300"
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-500">{pct}%</span>
    </div>
  )
}

export default function CaseSimilarityCard({ result, isLoading, className = "" }: Props) {
  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4 text-violet-500" />
            Similar Prior Cases
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!result) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4 text-violet-500" />
            Similar Prior Cases
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">No similarity data available. Run analysis to find similar cases.</p>
        </CardContent>
      </Card>
    )
  }

  const similarCases = result.similarCases ?? []
  const summary = result.summary ?? {}
  const safetyWarnings = summary.safetyWarnings ?? []

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Brain className="h-4 w-4 text-violet-500" />
          Similar Prior Cases
          {similarCases.length > 0 && (
            <Badge variant="secondary" className="ml-auto text-xs">
              {similarCases.length} match{similarCases.length !== 1 ? "es" : ""}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {safetyWarnings.length > 0 && (
          <div className="space-y-2">
            {safetyWarnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" data-testid={`safety-warning-${i}`}>
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <span>{w.message}</span>
              </div>
            ))}
          </div>
        )}

        {similarCases.length === 0 ? (
          <p className="text-sm text-slate-500">No similar cases found in the index. Rebuild the index to include historical cases.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Likely outcomes from similar cases</p>
              <div className="space-y-2">
                {(summary.topDiagnoses ?? []).map((row, idx) => (
                  <div key={idx} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm" data-testid={`top-diagnosis-${idx}`}>
                    <span className="font-medium capitalize">{row.diagnosis.replace(/_/g, " ")}</span>
                    <div className="flex items-center gap-1 text-slate-500">
                      <Users className="h-3 w-3" />
                      <span>{row.count}</span>
                    </div>
                  </div>
                ))}
                {(summary.topDispositions ?? []).map((row, idx) => (
                  <div key={`disp-${idx}`} className="flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2 text-sm" data-testid={`top-disposition-${idx}`}>
                    <span className="font-medium capitalize text-blue-800">→ {row.disposition.replace(/_/g, " ")}</span>
                    <div className="flex items-center gap-1 text-blue-600">
                      <TrendingUp className="h-3 w-3" />
                      <span>{row.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Nearest matched cases</p>
              <div className="space-y-2">
                {similarCases.map((row, idx) => (
                  <div key={idx} className="rounded-lg border bg-white p-3 text-sm shadow-sm" data-testid={`similar-case-${idx}`}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-medium text-slate-700">{row.caseId}</span>
                      <ScoreBar score={row.similarityScore} />
                    </div>
                    <div className="text-slate-600">
                      <span className="capitalize">{(row.complaint ?? "").replace(/_/g, " ")}</span>
                    </div>
                    {row.symptoms?.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {row.symptoms.slice(0, 4).map((s, si) => (
                          <span key={si} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 capitalize">{s.replace(/_/g, " ")}</span>
                        ))}
                      </div>
                    )}
                    {row.outcome && (
                      <div className="mt-1.5 flex items-center gap-2 text-xs">
                        {row.outcome.actualDiagnosis && (
                          <span className="text-emerald-700">Dx: {row.outcome.actualDiagnosis}</span>
                        )}
                        {row.outcome.safetyMiss && (
                          <span className="flex items-center gap-1 text-red-600">
                            <AlertTriangle className="h-3 w-3" /> Safety miss
                          </span>
                        )}
                        {row.outcome.topPredictionMatch && (
                          <span className="flex items-center gap-1 text-emerald-600">
                            <CheckCircle className="h-3 w-3" /> Prediction matched
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
