import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, Clock, CheckCircle2, AlertTriangle, Users } from "lucide-react";

function TrendIcon({ trend }: { trend: string }) {
  if (trend === "up") return <TrendingUp className="h-4 w-4 text-green-500" />;
  if (trend === "down") return <TrendingDown className="h-4 w-4 text-red-500" />;
  return <Minus className="h-4 w-4 text-slate-400" />;
}

export default function SL4ProviderAnalyticsPage() {
  const { data, isLoading } = useQuery({ queryKey: ["/api/sl4/providers"] });
  const providers: any[] = data?.providers ?? [];
  const summary: any = data?.summary ?? {};

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Skill Layer 4 — Provider Performance Analytics</h1>
        <p className="text-slate-500 text-sm mt-1">Per-physician review metrics and performance benchmarks</p>
      </div>

      {/* Summary bar */}
      {!isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Providers", value: summary.providerCount, icon: Users, color: "bg-slate-50" },
            { label: "Total Reviewed", value: summary.totalCasesReviewed, icon: CheckCircle2, color: "bg-blue-50" },
            { label: "Avg Approval Rate", value: `${summary.avgApprovalRate}%`, icon: CheckCircle2, color: "bg-green-50" },
            { label: "Flagged Cases", value: summary.totalFlaggedCases, icon: AlertTriangle, color: "bg-red-50" },
          ].map(s => (
            <div key={s.label} className={`${s.color} rounded-xl p-4 border flex items-center gap-3`}>
              <s.icon className="h-5 w-5 text-slate-500 flex-shrink-0" />
              <div>
                <div className="text-xl font-bold text-slate-800" data-testid={`stat-provider-${s.label.toLowerCase().replace(/\s/g, "-")}`}>{s.value}</div>
                <div className="text-xs text-slate-500">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Provider cards */}
      {isLoading ? (
        <div className="p-8 text-center text-slate-400">Loading provider data…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {providers.map((p: any) => (
            <div key={p.physicianId} data-testid={`card-provider-${p.physicianId}`} className="rounded-2xl border bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-semibold text-slate-800">{p.name}</div>
                  <div className="text-xs text-slate-500">{p.specialty} · {p.physicianId}</div>
                </div>
                <div className="flex items-center gap-1">
                  <TrendIcon trend={p.trend} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-slate-50 rounded-lg p-2 text-center">
                  <div className="text-lg font-bold text-slate-800">{p.casesReviewed}</div>
                  <div className="text-xs text-slate-500">Cases Reviewed</div>
                </div>
                <div className={`rounded-lg p-2 text-center ${p.approvalRate >= 90 ? "bg-green-50" : p.approvalRate >= 80 ? "bg-yellow-50" : "bg-red-50"}`}>
                  <div className={`text-lg font-bold ${p.approvalRate >= 90 ? "text-green-700" : p.approvalRate >= 80 ? "text-yellow-700" : "text-red-700"}`}>{p.approvalRate}%</div>
                  <div className="text-xs text-slate-500">Approval Rate</div>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-600 border-t pt-3">
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-slate-400" />
                  <span>{p.avgTimeToReviewMin} min avg</span>
                </div>
                <div className="flex items-center gap-1">
                  <span>Override: {p.overrideRate}%</span>
                </div>
                {p.flaggedCases > 0 && (
                  <Badge className="bg-red-100 text-red-700 border-0 text-xs">
                    {p.flaggedCases} flagged
                  </Badge>
                )}
              </div>

              <div className="mt-2 text-xs text-slate-400">
                Last active: {new Date(p.lastActive).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
