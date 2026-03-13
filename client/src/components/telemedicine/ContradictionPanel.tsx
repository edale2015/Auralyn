import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface MissingEvidence {
  diagnosis: string
  requiredFeature: string
  present: boolean
  impact: "high" | "medium" | "low"
  note: string
}

interface ContradictingEvidence {
  diagnosis: string
  contradictingFeature: string
  reason: string
  strengthReducedBy: number
}

interface UnruledOutDanger {
  diagnosis: string
  riskLevel: "critical" | "high"
  rulingOutQuestion: string
  presentFeatures: string[]
}

interface ContradictionReport {
  topDiagnosis: string
  missingEvidence: MissingEvidence[]
  contradictions: ContradictingEvidence[]
  unruledDangers: UnruledOutDanger[]
  prematureClosureRisk: "high" | "moderate" | "low"
  closureReason?: string
}

interface Props {
  caseId: string
}

const IMPACT_COLORS = {
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-orange-100 text-orange-700 border-orange-200",
  low: "bg-gray-100 text-gray-500 border-gray-200",
}

const CLOSURE_COLORS = {
  high: "border-red-400 bg-red-50",
  moderate: "border-amber-400 bg-amber-50",
  low: "border-green-400 bg-green-50",
}

const CLOSURE_TEXT = {
  high: "text-red-800",
  moderate: "text-amber-800",
  low: "text-green-800",
}

const RISK_BADGE = {
  critical: "bg-red-100 text-red-800 border-red-300",
  high: "bg-orange-100 text-orange-800 border-orange-300",
}

export default function ContradictionPanel({ caseId }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/clinical/contradiction", caseId],
    queryFn: () => fetch(`/api/clinical/contradiction/${caseId}`).then((r) => r.json()),
    enabled: !!caseId,
    refetchInterval: 6000,
  })

  if (isLoading) return <p className="text-xs text-muted-foreground">Analyzing differential…</p>
  if (error || !data?.ok) return <p className="text-xs text-red-500">Analysis unavailable.</p>

  const report: ContradictionReport = data.report
  if (!report) return null

  const { missingEvidence, contradictions, unruledDangers, prematureClosureRisk, closureReason } =
    report

  const highMissing = missingEvidence.filter((m) => m.impact === "high")
  const medMissing = missingEvidence.filter((m) => m.impact === "medium")

  return (
    <div className="space-y-3">
      <Alert className={`border-2 ${CLOSURE_COLORS[prematureClosureRisk]}`}>
        <AlertDescription className={`text-sm font-semibold ${CLOSURE_TEXT[prematureClosureRisk]}`}>
          {prematureClosureRisk === "high" && "🔴"}
          {prematureClosureRisk === "moderate" && "🟡"}
          {prematureClosureRisk === "low" && "🟢"}{" "}
          Premature closure risk:{" "}
          <span className="uppercase">{prematureClosureRisk}</span>
          {closureReason && (
            <span className="block text-xs font-normal mt-0.5 opacity-80">{closureReason}</span>
          )}
        </AlertDescription>
      </Alert>

      {unruledDangers.length > 0 && (
        <Card className="border-red-200">
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-xs font-semibold text-red-700 uppercase tracking-wide">
              ⛔ Dangerous Diagnoses Not Yet Ruled Out
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 space-y-2">
            {unruledDangers.map((d, i) => (
              <div
                key={i}
                className="rounded border p-2 bg-red-50 border-red-200 space-y-1"
                data-testid={`unruled-danger-${i}`}
              >
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`text-[9px] px-1 py-0 ${RISK_BADGE[d.riskLevel]}`}
                  >
                    {d.riskLevel.toUpperCase()}
                  </Badge>
                  <span className="text-xs font-semibold text-red-800">
                    {d.diagnosis.replace(/_/g, " ").toUpperCase()}
                  </span>
                </div>
                <p className="text-[10px] text-red-700 italic">{d.rulingOutQuestion}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {missingEvidence.length > 0 && (
        <Card>
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              🔍 Missing Key Evidence for{" "}
              <span className="text-gray-800">{report.topDiagnosis?.replace(/_/g, " ")}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 space-y-1.5">
            {[...highMissing, ...medMissing].map((m, i) => (
              <div
                key={i}
                className="flex items-start gap-2"
                data-testid={`missing-evidence-${i}`}
              >
                <Badge
                  variant="outline"
                  className={`text-[9px] px-1 py-0 flex-shrink-0 mt-0.5 ${IMPACT_COLORS[m.impact]}`}
                >
                  {m.impact}
                </Badge>
                <div>
                  <span className="text-xs font-medium text-gray-800">
                    {m.requiredFeature.replace(/_/g, " ")}
                  </span>
                  <p className="text-[10px] text-muted-foreground">{m.note}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {contradictions.length > 0 && (
        <Card>
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              ⚡ Contradicting Evidence Present
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 space-y-2">
            {contradictions.map((c, i) => (
              <div
                key={i}
                className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded p-2"
                data-testid={`contradiction-${i}`}
              >
                <span className="text-amber-600 text-xs font-bold flex-shrink-0">−{(c.strengthReducedBy * 100).toFixed(0)}%</span>
                <div>
                  <span className="text-xs font-medium text-amber-800">
                    {c.contradictingFeature.replace(/_/g, " ")}
                  </span>
                  <p className="text-[10px] text-amber-700">{c.reason}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {missingEvidence.length === 0 && contradictions.length === 0 && unruledDangers.length === 0 && (
        <Card>
          <CardContent className="pt-4 text-sm text-muted-foreground text-center">
            No missing evidence or contradictions detected for the current top diagnosis.
          </CardContent>
        </Card>
      )}
    </div>
  )
}
