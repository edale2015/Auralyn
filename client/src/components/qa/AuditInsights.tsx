import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, AlertTriangle, BookOpen, Clock, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

type DomainStat = { domain: string; cnt: number; deployed: number; pending: number; rejected: number };
type RecentChange = { change_id: string; domain: string; action: string; changed_by: string; status: string; rationale: string; created_at: string };
type RiskyChange  = { record_id: string; change_count: number; domain: string };
type DriftInfo    = { thisWeek: number; lastWeek: number; driftPct: number | null; alert: boolean };

const statusConfig: Record<string, string> = {
  deployed: "border-green-500/30 text-green-400 bg-green-500/10",
  pending:  "border-yellow-500/30 text-yellow-400 bg-yellow-500/10",
  rejected: "border-red-500/30 text-red-400 bg-red-500/10",
};

const domainColors: Record<string, string> = {
  treatment_rule:        "text-green-400",
  red_flag_rule:         "text-red-400",
  diagnosis_rule:        "text-blue-400",
  feature_likelihood:    "text-purple-400",
  suggestion:            "text-cyan-400",
};

export default function AuditInsights() {
  const q = useQuery<{
    ok: boolean;
    byDomain: DomainStat[];
    recentChanges: RecentChange[];
    riskyChanges: RiskyChange[];
    pendingReview: RecentChange[];
    drift: DriftInfo;
    learningStats: Array<{ status: string; cnt: number }>;
  }>({
    queryKey: ["/api/qa/audit-insights"],
    refetchInterval: 30_000,
  });

  const drift   = q.data?.drift;
  const pending = q.data?.pendingReview ?? [];
  const risky   = q.data?.riskyChanges ?? [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/20">
        <BookOpen size={13} className="text-orange-400" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Audit Intelligence</span>
        {pending.length > 0 && (
          <Badge variant="outline" className="ml-auto text-[10px] h-4 border-yellow-500/30 text-yellow-400 bg-yellow-500/10">
            {pending.length} pending
          </Badge>
        )}
      </div>

      <ScrollArea className="flex-1">
        {q.isLoading ? (
          <div className="p-3 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded" />)}</div>
        ) : (
          <div className="p-3 space-y-4">

            {/* Drift Alert */}
            {drift && (
              <Card className={cn("p-3 border", drift.alert ? "border-orange-500/30 bg-orange-500/5" : "border-border/50")}>
                <div className="flex items-center gap-2 mb-2">
                  {drift.driftPct !== null && drift.driftPct > 0
                    ? <TrendingUp size={13} className={drift.alert ? "text-orange-400" : "text-green-400"} />
                    : <TrendingDown size={13} className="text-blue-400" />}
                  <span className="text-xs font-semibold">Change Velocity</span>
                  {drift.alert && (
                    <Badge variant="outline" className="text-[10px] h-4 border-orange-500/30 text-orange-400 bg-orange-500/10">
                      ⚠ Drift Alert
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-lg font-black tabular-nums" data-testid="stat-this-week">{drift.thisWeek}</div>
                    <div className="text-[10px] text-muted-foreground">This week</div>
                  </div>
                  <div>
                    <div className="text-lg font-black tabular-nums">{drift.lastWeek}</div>
                    <div className="text-[10px] text-muted-foreground">Last week</div>
                  </div>
                  <div>
                    <div className={cn("text-lg font-black tabular-nums", drift.driftPct !== null && drift.driftPct > 50 ? "text-orange-400" : "text-muted-foreground")}>
                      {drift.driftPct !== null ? `${drift.driftPct > 0 ? "+" : ""}${drift.driftPct}%` : "N/A"}
                    </div>
                    <div className="text-[10px] text-muted-foreground">Drift</div>
                  </div>
                </div>
              </Card>
            )}

            {/* Change frequency by domain */}
            {(q.data?.byDomain ?? []).length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Activity size={12} className="text-muted-foreground" />
                  <span className="text-xs font-semibold">Changes by Domain</span>
                </div>
                <div className="space-y-1.5">
                  {(q.data?.byDomain ?? []).map(d => (
                    <div key={d.domain} className="flex items-center gap-2">
                      <span className={cn("text-[11px] font-medium w-36 truncate", domainColors[d.domain] ?? "text-muted-foreground")}>
                        {d.domain.replace(/_/g, " ")}
                      </span>
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary"
                          style={{ width: `${Math.min((d.cnt / Math.max(...(q.data?.byDomain ?? []).map(x => x.cnt), 1)) * 100, 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground tabular-nums w-6 text-right">{d.cnt}</span>
                      <Badge variant="outline" className={cn("text-[9px] h-3.5 px-1", statusConfig.deployed)}>{d.deployed}✓</Badge>
                      {d.pending > 0 && <Badge variant="outline" className={cn("text-[9px] h-3.5 px-1", statusConfig.pending)}>{d.pending}⏳</Badge>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Risky changes */}
            {risky.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={12} className="text-orange-400" />
                  <span className="text-xs font-semibold">High-Frequency Changes</span>
                </div>
                <div className="space-y-1.5">
                  {risky.map((r, i) => (
                    <Card key={i} className="p-2.5 border border-orange-500/20 bg-orange-500/5 flex items-center gap-2">
                      <AlertTriangle size={11} className="text-orange-400 flex-shrink-0" />
                      <span className="text-xs font-mono flex-1 truncate">{r.record_id}</span>
                      <Badge variant="outline" className="text-[10px] border-orange-500/30 text-orange-400">{r.change_count}×</Badge>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Pending review */}
            {pending.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Clock size={12} className="text-yellow-400" />
                  <span className="text-xs font-semibold">Pending Review</span>
                  <Badge variant="outline" className="text-[10px] h-4 border-yellow-500/30 text-yellow-400 bg-yellow-500/10">{pending.length}</Badge>
                </div>
                <div className="space-y-1.5">
                  {pending.map((c, i) => (
                    <Card key={i} className="p-2.5 border border-yellow-500/20 bg-yellow-500/5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Badge variant="outline" className="text-[9px] h-3.5 px-1 font-mono border-muted-foreground/20 text-muted-foreground">{c.domain}</Badge>
                        <Badge variant="outline" className="text-[9px] h-3.5 px-1 border-muted-foreground/20 text-muted-foreground">{c.action}</Badge>
                        <span className="text-[10px] text-muted-foreground ml-auto">{c.changed_by}</span>
                      </div>
                      {c.rationale && <div className="text-[11px] text-muted-foreground leading-snug line-clamp-2">{c.rationale}</div>}
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Recent changes */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Clock size={12} className="text-muted-foreground" />
                <span className="text-xs font-semibold">Recent KB Changes</span>
              </div>
              {(q.data?.recentChanges ?? []).length === 0 ? (
                <div className="text-xs text-muted-foreground italic">No changes recorded yet</div>
              ) : (
                <div className="space-y-1.5">
                  {(q.data?.recentChanges ?? []).map((c, i) => (
                    <div key={i} className="flex items-center gap-2 py-1 border-b border-border/30 last:border-0">
                      <span className={cn("text-[10px] font-medium truncate flex-1", domainColors[c.domain] ?? "text-muted-foreground")}>
                        {c.domain.replace(/_/g, " ")} · {c.action}
                      </span>
                      <Badge variant="outline" className={cn("text-[9px] h-3.5 px-1 flex-shrink-0", statusConfig[c.status] ?? "border-muted-foreground/30 text-muted-foreground")}>
                        {c.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}
      </ScrollArea>
    </div>
  );
}
