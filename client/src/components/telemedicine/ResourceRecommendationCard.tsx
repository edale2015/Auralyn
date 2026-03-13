import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface ResourceRecommendation {
  type: "lab" | "imaging" | "referral" | "medication" | "monitoring"
  resource: string
  priority: "stat" | "urgent" | "routine"
  rationale: string
  diagnosis?: string
}

interface Props {
  caseId: string
}

const TYPE_ICONS: Record<string, string> = {
  lab: "🧪",
  imaging: "🔬",
  referral: "👨‍⚕️",
  medication: "💊",
  monitoring: "📈",
}

const PRIORITY_COLORS: Record<string, string> = {
  stat: "bg-red-100 text-red-700 border-red-200",
  urgent: "bg-orange-100 text-orange-700 border-orange-200",
  routine: "bg-blue-100 text-blue-700 border-blue-200",
}

export default function ResourceRecommendationCard({ caseId }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/clinical/resources", caseId],
    queryFn: () => fetch(`/api/clinical/resources/${caseId}?topN=4`).then((r) => r.json()),
    enabled: !!caseId,
    refetchInterval: 8000,
  })

  if (isLoading) return <p className="text-xs text-muted-foreground">Loading resources…</p>
  if (error || !data?.ok) return <p className="text-xs text-red-500">Resources unavailable.</p>

  const resources: ResourceRecommendation[] = data.resources ?? []

  return (
    <Card data-testid="resource-recommendation-card">
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          🧪 Recommended Resources
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 space-y-2">
        {resources.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">
            No resources suggested yet.
          </p>
        )}
        {resources.map((r, i) => (
          <div
            key={i}
            className="flex items-start gap-2 p-2 rounded bg-muted/40 border border-muted"
            data-testid={`resource-row-${i}`}
          >
            <span className="text-base leading-none mt-0.5">{TYPE_ICONS[r.type] ?? "📋"}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-medium text-gray-800">{r.resource}</span>
                <Badge
                  variant="outline"
                  className={`text-[9px] px-1 py-0 ${PRIORITY_COLORS[r.priority]}`}
                >
                  {r.priority.toUpperCase()}
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">{r.rationale}</p>
              {r.diagnosis && (
                <span className="text-[9px] text-muted-foreground">
                  For: {r.diagnosis.replace(/_/g, " ")}
                </span>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
