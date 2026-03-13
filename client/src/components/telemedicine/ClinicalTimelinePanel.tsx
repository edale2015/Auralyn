import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface TimelineEntry {
  time: string
  relativeTime: string
  type: string
  summary: string
  severity?: "info" | "warning" | "critical"
}

interface TimelineStats {
  totalEvents: number
  durationMinutes: number
  redFlagCount: number
  questionsAsked: number
}

interface Props {
  caseId: string
  className?: string
}

const SEVERITY_COLORS = {
  critical: "border-l-red-500 bg-red-50",
  warning: "border-l-amber-400 bg-amber-50",
  info: "border-l-blue-300 bg-white",
}

const SEVERITY_BADGES = {
  critical: "bg-red-100 text-red-700 border-red-200",
  warning: "bg-amber-100 text-amber-700 border-amber-200",
  info: "bg-gray-100 text-gray-600 border-gray-200",
}

export default function ClinicalTimelinePanel({ caseId, className }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/clinical/timeline", caseId],
    queryFn: () => fetch(`/api/clinical/timeline/${caseId}`).then((r) => r.json()),
    enabled: !!caseId,
    refetchInterval: 5000,
  })

  if (!caseId) return <p className="text-sm text-muted-foreground">Select a case first.</p>
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading timeline…</p>
  if (error || !data?.ok)
    return <p className="text-sm text-red-500">Failed to load timeline.</p>

  const timeline: TimelineEntry[] = data.timeline ?? []
  const stats: TimelineStats = data.stats ?? {}

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Events", value: stats.totalEvents ?? 0, color: "text-blue-700" },
          { label: "Duration", value: `${stats.durationMinutes ?? 0}m`, color: "text-green-700" },
          { label: "Red Flags", value: stats.redFlagCount ?? 0, color: "text-red-700" },
          { label: "Questions", value: stats.questionsAsked ?? 0, color: "text-amber-700" },
        ].map(({ label, value, color }) => (
          <Card key={label} className="text-center py-2">
            <div className={`text-lg font-bold ${color}`}>{value}</div>
            <div className="text-[10px] text-muted-foreground">{label}</div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            🕒 Event Timeline
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 max-h-[480px] overflow-y-auto space-y-1">
          {timeline.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No events yet.</p>
          )}
          {timeline.map((entry, i) => (
            <div
              key={i}
              className={`border-l-2 pl-2 pr-2 py-1 rounded-r text-xs ${
                SEVERITY_COLORS[entry.severity ?? "info"]
              }`}
              data-testid={`timeline-entry-${i}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-gray-800">{entry.summary}</span>
                <Badge
                  variant="outline"
                  className={`text-[9px] px-1 py-0 flex-shrink-0 ${
                    SEVERITY_BADGES[entry.severity ?? "info"]
                  }`}
                >
                  {entry.relativeTime}
                </Badge>
              </div>
              <div className="text-[9px] text-muted-foreground mt-0.5">{entry.type}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
