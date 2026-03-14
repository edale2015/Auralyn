import { useQuery } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type Recommendation = {
  templateId: string
  label: string
  category: string
  usageCount: number
  acceptanceRate: number
  avgEditDistance: number
  score: number
}

export default function TemplateRecommendationsPanel({
  onSelect,
}: {
  onSelect?: (templateId: string, label: string) => void
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/recommendation-analytics/summary"],
    queryFn: () => fetch("/api/recommendation-analytics/summary").then((r) => r.json()),
    refetchInterval: 15000,
  })

  const topTemplates: Recommendation[] = data?.summary?.topTemplates ?? []

  if (isLoading) {
    return <div className="animate-pulse h-24 bg-muted rounded-lg" />
  }

  if (topTemplates.length === 0) {
    return (
      <div className="text-xs text-muted-foreground text-center py-6 border rounded-lg border-dashed">
        No template usage data yet. As doctors use templates, recommendations will appear here.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {topTemplates.map((t, i) => (
        <button
          key={t.templateId}
          data-testid={`template-rec-${t.templateId}`}
          onClick={() => onSelect?.(t.templateId, t.label)}
          className="w-full text-left border rounded-lg px-3 py-2 hover:bg-blue-50 hover:border-blue-200 transition-colors text-xs"
        >
          <div className="flex items-center gap-2 mb-1">
            <Badge className="text-[10px] bg-gray-100 text-gray-700">#{i + 1}</Badge>
            <span className="font-medium">{t.label}</span>
            <Badge variant="outline" className="text-[10px] ml-auto">{t.category}</Badge>
          </div>
          <div className="flex gap-4 text-muted-foreground">
            <span>Used {t.usageCount}×</span>
            <span className={cn(t.acceptanceRate > 0.7 ? "text-green-600" : "text-amber-600")}>
              {(t.acceptanceRate * 100).toFixed(0)}% accepted
            </span>
            <span>Score {t.score.toFixed(2)}</span>
          </div>
        </button>
      ))}
    </div>
  )
}
