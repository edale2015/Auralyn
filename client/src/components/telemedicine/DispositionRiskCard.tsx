import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface RiskFactor {
  reason: string
  weight: number
}

interface DispositionRisk {
  riskScore: number
  riskLevel: "low" | "moderate" | "high" | "critical"
  factors: RiskFactor[]
  recommendedDisposition: string
}

interface Props {
  caseId: string
}

const LEVEL_COLORS = {
  low: "bg-green-100 text-green-800 border-green-200",
  moderate: "bg-amber-100 text-amber-800 border-amber-200",
  high: "bg-orange-100 text-orange-800 border-orange-200",
  critical: "bg-red-100 text-red-800 border-red-200",
}

const LEVEL_ICONS = {
  low: "🟢",
  moderate: "🟡",
  high: "🟠",
  critical: "🔴",
}

export default function DispositionRiskCard({ caseId }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/clinical/disposition-risk", caseId],
    queryFn: () => fetch(`/api/clinical/disposition-risk/${caseId}`).then((r) => r.json()),
    enabled: !!caseId,
    refetchInterval: 5000,
  })

  if (isLoading) return <p className="text-xs text-muted-foreground">Computing risk…</p>
  if (error || !data?.ok) return <p className="text-xs text-red-500">Risk unavailable.</p>

  const risk: DispositionRisk = data.risk
  if (!risk) return null

  const barWidth = `${(risk.riskScore * 100).toFixed(0)}%`

  return (
    <Card data-testid="disposition-risk-card">
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          ⚠️ Disposition Risk
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 space-y-3">
        <div className="flex items-center justify-between">
          <Badge
            variant="outline"
            className={`text-xs font-semibold ${LEVEL_COLORS[risk.riskLevel]}`}
          >
            {LEVEL_ICONS[risk.riskLevel]} {risk.riskLevel.toUpperCase()}
          </Badge>
          <span className="text-lg font-bold text-gray-800">
            {(risk.riskScore * 100).toFixed(0)}%
          </span>
        </div>

        <div className="w-full bg-gray-100 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${
              risk.riskLevel === "critical"
                ? "bg-red-500"
                : risk.riskLevel === "high"
                ? "bg-orange-500"
                : risk.riskLevel === "moderate"
                ? "bg-amber-500"
                : "bg-green-500"
            }`}
            style={{ width: barWidth }}
          />
        </div>

        <div className="text-xs text-muted-foreground">
          Recommended:{" "}
          <span className="font-semibold text-gray-800">
            {risk.recommendedDisposition?.replace(/_/g, " ")}
          </span>
        </div>

        {risk.factors.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              Risk Factors
            </div>
            {risk.factors.map((f, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-xs bg-muted/40 rounded px-2 py-1"
              >
                <span className="text-gray-700">{f.reason}</span>
                <span className="text-gray-500 text-[10px] font-mono">
                  {(f.weight * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
