import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface ComplaintTrend {
  complaint: string
  count7Days: number
  count24Hours: number
  trend: "surge" | "elevated" | "normal" | "low"
  changePercent: number
}

interface EpidemiologyReport {
  trends: ComplaintTrend[]
  surges: string[]
  reportedAt: string
  windowDays: number
}

const TREND_COLORS = {
  surge: "bg-red-100 text-red-700 border-red-200",
  elevated: "bg-orange-100 text-orange-700 border-orange-200",
  normal: "bg-gray-100 text-gray-600 border-gray-200",
  low: "bg-blue-100 text-blue-600 border-blue-200",
}

const TREND_ICONS = {
  surge: "🔺",
  elevated: "↑",
  normal: "→",
  low: "↓",
}

export default function EpidemiologyPanel() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["/api/clinical/epidemiology"],
    queryFn: () => fetch("/api/clinical/epidemiology?days=7").then((r) => r.json()),
    refetchInterval: 60000,
  })

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading epidemiology data…</p>
  if (error || !data?.ok) return <p className="text-sm text-red-500">Epidemiology unavailable.</p>

  const report: EpidemiologyReport = data.report ?? {}
  const outbreak = data.outbreak ?? {}
  const trends: ComplaintTrend[] = report.trends ?? []

  return (
    <div className="space-y-3">
      {outbreak.outbreak && (
        <Alert className="border-red-300 bg-red-50">
          <AlertDescription className="text-sm font-medium text-red-800">
            🚨 {outbreak.message}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            📈 Complaint Trends (7-day window)
          </CardTitle>
          <div className="text-[9px] text-muted-foreground">
            Reported: {report.reportedAt ? new Date(report.reportedAt).toLocaleTimeString() : "—"}
          </div>
        </CardHeader>
        <CardContent className="p-2">
          {trends.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No complaint data yet. Cases will appear here as they are processed.
            </p>
          ) : (
            <div className="space-y-1.5">
              {trends.map((t) => (
                <div
                  key={t.complaint}
                  className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-muted/30"
                  data-testid={`epi-trend-${t.complaint}`}
                >
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`text-[9px] px-1 py-0 ${TREND_COLORS[t.trend]}`}
                    >
                      {TREND_ICONS[t.trend]} {t.trend}
                    </Badge>
                    <span className="text-xs font-medium text-gray-800">
                      {t.complaint.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-right">
                    <div className="text-xs text-muted-foreground">
                      <span className="font-semibold text-gray-700">{t.count7Days}</span>
                      <span className="text-[9px] ml-0.5">7d</span>
                    </div>
                    <div
                      className={`text-[10px] font-mono ${
                        t.changePercent > 0 ? "text-red-600" : "text-blue-600"
                      }`}
                    >
                      {t.changePercent > 0 ? "+" : ""}
                      {t.changePercent.toFixed(0)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {report.surges?.length > 0 && (
        <Card>
          <CardContent className="p-3">
            <div className="text-xs font-semibold text-red-700 mb-1.5">🔺 Active Surges</div>
            <div className="flex gap-1 flex-wrap">
              {report.surges.map((s) => (
                <Badge key={s} variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">
                  {s.replace(/_/g, " ")}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
