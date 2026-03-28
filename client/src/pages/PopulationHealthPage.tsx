import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Globe2, AlertTriangle, RefreshCw } from "lucide-react";

function Bar({ label, value, max, color = "bg-blue-500" }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-28 truncate text-muted-foreground text-right">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-muted/40">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-6 text-right font-mono">{value}</span>
    </div>
  );
}

export default function PopulationHealthPage() {
  const { toast } = useToast();
  const [cohort,    setCohort]    = useState<any>(null);
  const [zipMap,    setZipMap]    = useState<Record<string, number>>({});
  const [dxMap,     setDxMap]     = useState<Record<string, number>>({});
  const [outbreaks, setOutbreaks] = useState<any[]>([]);

  const fetchAll = useCallback(async () => {
    try {
      const [rc, rz, rd, ro] = await Promise.allSettled([
        fetch("/api/population-health/cohort").then(r => r.json()),
        fetch("/api/population-health/heatmap/zip").then(r => r.json()),
        fetch("/api/population-health/heatmap/diagnosis").then(r => r.json()),
        fetch("/api/population-health/outbreaks").then(r => r.json()),
      ]);
      if (rc.status === "fulfilled") setCohort(rc.value.stats);
      if (rz.status === "fulfilled") setZipMap(rz.value.heatmap ?? {});
      if (rd.status === "fulfilled") setDxMap(rd.value.heatmap ?? {});
      if (ro.status === "fulfilled") setOutbreaks(ro.value.alerts ?? []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 8000);
    return () => clearInterval(t);
  }, [fetchAll]);

  const logDemo = async () => {
    try {
      await fetch("/api/population-health/log", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: `demo-${Date.now()}` }),
      });
      toast({ title: "Case logged" });
      fetchAll();
    } catch {}
  };

  const zipEntries = Object.entries(zipMap).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const dxEntries  = Object.entries(dxMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxZip     = zipEntries[0]?.[1] ?? 1;
  const maxDx      = dxEntries[0]?.[1]  ?? 1;

  const outbreakColor: Record<string, string> = { watch: "border-amber-500/40 bg-amber-950/20", warning: "border-orange-500/40 bg-orange-950/20", alert: "border-red-500/40 bg-red-950/20" };
  const outbreakBadge: Record<string, any>    = { watch: "secondary", warning: "default", alert: "destructive" };

  return (
    <div className="p-4 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe2 className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">Population Health</h1>
          {cohort?.activeOutbreaks > 0 && (
            <Badge variant="destructive" className="text-[10px]">{cohort.activeOutbreaks} Outbreak{cohort.activeOutbreaks !== 1 ? "s" : ""}</Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={fetchAll} data-testid="btn-refresh-pop"><RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh</Button>
          <Button size="sm" onClick={logDemo} data-testid="btn-log-case">+ Log Case</Button>
        </div>
      </div>

      {/* Cohort stats */}
      {cohort && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="border-border/60"><CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Total Cases</p>
            <p className="text-2xl font-bold">{cohort.total}</p>
          </CardContent></Card>
          <Card className="border-border/60"><CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Active Outbreaks</p>
            <p className={`text-2xl font-bold ${cohort.activeOutbreaks > 0 ? "text-red-400" : "text-green-400"}`}>{cohort.activeOutbreaks}</p>
          </CardContent></Card>
          <Card className="border-border/60"><CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Critical Cases</p>
            <p className="text-2xl font-bold text-red-400">{cohort.bySeverity?.critical ?? 0}</p>
          </CardContent></Card>
          <Card className="border-border/60"><CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Pediatric</p>
            <p className="text-2xl font-bold text-blue-400">{cohort.byAge?.pediatric ?? 0}</p>
          </CardContent></Card>
        </div>
      )}

      {/* Outbreak alerts */}
      {outbreaks.length > 0 && (
        <Card className="border-border/60">
          <CardHeader className="py-3 px-4 flex flex-row items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <CardTitle className="text-sm font-semibold">Outbreak Alerts</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {outbreaks.map(ob => (
              <div key={ob.alertId} className={`rounded-lg border px-3 py-2 text-xs ${outbreakColor[ob.severity] ?? "border-border/40"}`} data-testid={`row-outbreak-${ob.alertId}`}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant={outbreakBadge[ob.severity]} className="text-[9px] h-3.5 px-1 uppercase">{ob.severity}</Badge>
                      <span className="font-semibold">ZIP {ob.zip}</span>
                      <span className="text-muted-foreground">·</span>
                      <span>{ob.complaint}</span>
                    </div>
                    <p className="text-muted-foreground mt-0.5">{ob.count} cases (threshold: {ob.threshold}) · Detected {new Date(ob.detectedAt).toLocaleTimeString()}</p>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* ZIP Heatmap */}
        <Card className="border-border/60">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-semibold">Top ZIPs by Case Volume</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-1.5">
            {zipEntries.map(([zip, count]) => (
              <Bar key={zip} label={zip} value={count} max={maxZip} color="bg-cyan-500" />
            ))}
          </CardContent>
        </Card>

        {/* Diagnosis Heatmap */}
        <Card className="border-border/60">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-semibold">Top Diagnoses</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-1.5">
            {dxEntries.map(([dx, count]) => (
              <Bar key={dx} label={dx} value={count} max={maxDx} color="bg-violet-500" />
            ))}
          </CardContent>
        </Card>

        {/* Age cohort */}
        {cohort && (
          <Card className="border-border/60">
            <CardHeader className="py-3 px-4"><CardTitle className="text-sm font-semibold">Age Cohort Breakdown</CardTitle></CardHeader>
            <CardContent className="px-4 pb-4 space-y-1.5">
              {Object.entries(cohort.byAge ?? {}).map(([ag, count]) => (
                <Bar key={ag} label={ag} value={count as number} max={cohort.total} color="bg-blue-500" />
              ))}
            </CardContent>
          </Card>
        )}

        {/* Payer mix */}
        {cohort && (
          <Card className="border-border/60">
            <CardHeader className="py-3 px-4"><CardTitle className="text-sm font-semibold">Payer Mix</CardTitle></CardHeader>
            <CardContent className="px-4 pb-4 space-y-1.5">
              {Object.entries(cohort.byPayer ?? {}).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 8).map(([payer, count]) => (
                <Bar key={payer} label={payer} value={count as number} max={cohort.total} color="bg-emerald-500" />
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
