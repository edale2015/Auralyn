import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingUp, Activity, BarChart3 } from "lucide-react";

const severityColors: Record<string, string> = {
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-orange-100 text-orange-700 border-orange-200",
  low: "bg-yellow-100 text-yellow-700 border-yellow-200",
};

export default function SL5PopulationHealthPage() {
  const { data: summary, isLoading: sumLoading } = useQuery({ queryKey: ["/api/sl5/summary"] });
  const { data: trendsData, isLoading: trendsLoading } = useQuery({ queryKey: ["/api/sl5/complaint-trends"] });
  const { data: distData, isLoading: distLoading } = useQuery({ queryKey: ["/api/sl5/disposition-distribution"] });
  const { data: alertsData, isLoading: alertsLoading } = useQuery({ queryKey: ["/api/sl5/drift-alerts"] });

  const trends: any[] = trendsData?.trends ?? [];
  const distribution: any[] = distData?.distribution ?? [];
  const alerts: any[] = alertsData?.alerts ?? [];
  const sum: any = summary ?? {};

  const DISPOSITIONS = ["Home Care", "Urgent Care", "ED", "Prescription", "Watchful Waiting", "Telehealth Follow-up"];
  const DISP_COLORS = ["bg-green-400", "bg-blue-400", "bg-red-400", "bg-purple-400", "bg-yellow-400", "bg-teal-400"];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Skill Layer 5 — Population Health & Drift Monitor</h1>
        <p className="text-slate-500 text-sm mt-1">Aggregate complaint trends, disposition patterns, and drift detection</p>
      </div>

      {/* Summary */}
      {!sumLoading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "This Week Volume", value: sum.totalVolume, icon: Activity, color: "bg-blue-50" },
            { label: "Active Alerts", value: sum.activeAlerts, icon: AlertTriangle, color: "bg-orange-50" },
            { label: "High Severity", value: sum.highSeverityAlerts, icon: AlertTriangle, color: "bg-red-50" },
            { label: "Top Complaint", value: sum.topComplaint, icon: TrendingUp, color: "bg-green-50" },
          ].map(s => (
            <div key={s.label} className={`${s.color} rounded-xl p-4 border flex items-center gap-3`}>
              <s.icon className="h-5 w-5 text-slate-500 flex-shrink-0" />
              <div>
                <div className="text-lg font-bold text-slate-800 truncate" data-testid={`stat-pop-${s.label.toLowerCase().replace(/\s/g, "-")}`}>{s.value}</div>
                <div className="text-xs text-slate-500">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Drift Alerts */}
      {!alertsLoading && alerts.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold text-slate-700 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-500" /> Drift Alerts
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {alerts.map((a: any) => (
              <div key={a.complaint} data-testid={`alert-drift-${a.complaint}`} className={`rounded-xl border px-4 py-3 flex items-center justify-between ${severityColors[a.severity]}`}>
                <div>
                  <div className="font-semibold text-sm">{a.complaint}</div>
                  <div className="text-xs opacity-75">{a.message}</div>
                </div>
                <Badge className={`${severityColors[a.severity]} border text-xs`}>{a.severity}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Complaint volume trend table */}
      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b bg-slate-50 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-slate-500" />
          <span className="font-semibold text-slate-700 text-sm">Complaint Volume Trends (Last 7 Weeks)</span>
        </div>
        {trendsLoading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading trends…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="text-left px-4 py-2 font-medium text-slate-600">Complaint</th>
                  {(trends[0]?.weeks ?? []).map((w: string) => (
                    <th key={w} className="text-center px-2 py-2 font-medium text-slate-500 text-xs">{w}</th>
                  ))}
                  <th className="text-center px-3 py-2 font-medium text-slate-600 text-xs">Drift</th>
                </tr>
              </thead>
              <tbody>
                {trends.map((t: any) => (
                  <tr key={t.complaint} data-testid={`row-trend-${t.complaint}`} className="border-b hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-700">{t.complaint}</td>
                    {t.volumes.map((v: number, i: number) => {
                      const max = Math.max(...t.volumes);
                      const intensity = Math.round((v / max) * 80 + 20);
                      const isLast = i === t.volumes.length - 1;
                      return (
                        <td key={i} className={`px-2 py-2.5 text-center text-xs ${isLast ? "font-bold" : ""}`}>
                          <div className="flex flex-col items-center gap-0.5">
                            <span className={isLast ? "text-blue-700" : "text-slate-600"}>{v}</span>
                            <div className="h-1.5 w-8 rounded-full bg-slate-200 overflow-hidden">
                              <div className="h-full bg-blue-400 rounded-full" style={{ width: `${intensity}%` }} />
                            </div>
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2.5 text-center">
                      <Badge className={`text-xs border-0 ${t.trending ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>
                        {t.driftScore}%
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Disposition distribution */}
      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b bg-slate-50">
          <span className="font-semibold text-slate-700 text-sm">Disposition Distribution by Complaint</span>
        </div>
        {distLoading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading…</div>
        ) : (
          <div className="divide-y">
            {distribution.map((d: any) => (
              <div key={d.complaint} data-testid={`row-dist-${d.complaint}`} className="px-5 py-3">
                <div className="text-sm font-medium text-slate-700 mb-1.5">{d.complaint}</div>
                <div className="flex h-4 rounded-full overflow-hidden gap-px">
                  {DISPOSITIONS.map((disp, i) => {
                    const pct = d.distribution[disp] ?? 0;
                    if (pct < 0.5) return null;
                    return (
                      <div
                        key={disp}
                        className={`${DISP_COLORS[i]} flex-none`}
                        style={{ width: `${pct}%` }}
                        title={`${disp}: ${pct}%`}
                      />
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {DISPOSITIONS.map((disp, i) => {
                    const pct = d.distribution[disp] ?? 0;
                    if (pct < 2) return null;
                    return (
                      <div key={disp} className="flex items-center gap-1 text-xs text-slate-500">
                        <div className={`w-2 h-2 rounded-sm ${DISP_COLORS[i]}`} />
                        {disp} {pct}%
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
