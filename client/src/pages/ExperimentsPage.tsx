import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { FlaskConical, TrendingUp, RefreshCw } from "lucide-react";

function AccuracyBar({ rate, variant }: { rate: number; variant: "A" | "B" }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`w-4 font-bold ${variant === "A" ? "text-blue-400" : "text-violet-400"}`}>{variant}</span>
      <div className="flex-1 h-2.5 rounded-full bg-muted/40">
        <div className={`h-2.5 rounded-full ${variant === "A" ? "bg-blue-500" : "bg-violet-500"}`} style={{ width: `${rate * 100}%` }} />
      </div>
      <span className="w-10 text-right font-mono">{(rate * 100).toFixed(1)}%</span>
    </div>
  );
}

export default function ExperimentsPage() {
  const { toast } = useToast();
  const [experiments, setExperiments] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail]     = useState<any>(null);
  const [concluding, setConcluding] = useState(false);

  const fetchList = useCallback(async () => {
    try {
      const r = await fetch("/api/experiments");
      const j = await r.json();
      setExperiments(j.experiments ?? []);
      if (!selected && j.experiments?.[0]) setSelected(j.experiments[0].experimentId);
    } catch {}
  }, [selected]);

  const fetchDetail = useCallback(async () => {
    if (!selected) return;
    try {
      const r = await fetch(`/api/experiments/${selected}`);
      const j = await r.json();
      setDetail(j);
    } catch {}
  }, [selected]);

  useEffect(() => { fetchList(); const t = setInterval(fetchList, 8000); return () => clearInterval(t); }, [fetchList]);
  useEffect(() => { fetchDetail(); const t = setInterval(fetchDetail, 5000); return () => clearInterval(t); }, [fetchDetail]);

  const conclude = async () => {
    if (!selected) return;
    setConcluding(true);
    try {
      const r = await fetch(`/api/experiments/${selected}/conclude`, { method: "POST" });
      const j = await r.json();
      toast({
        title: `Experiment concluded`,
        description: j.experiment.conclusion === "no_significant_difference"
          ? "No statistically significant difference found"
          : `Winner: Variant ${j.experiment.winner} (p=${j.experiment.pValue})`,
      });
      fetchList(); fetchDetail();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setConcluding(false); }
  };

  const exp = detail?.experiment;
  const sig = detail?.significance;
  const accA = exp ? (exp.results.A.count > 0 ? exp.results.A.correct / exp.results.A.count : 0) : 0;
  const accB = exp ? (exp.results.B.count > 0 ? exp.results.B.correct / exp.results.B.count : 0) : 0;

  const statusColor: Record<string, string> = { active: "text-green-400", paused: "text-amber-400", concluded: "text-muted-foreground" };

  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">A/B Experiments</h1>
        </div>
        <Button size="sm" variant="outline" onClick={() => { fetchList(); fetchDetail(); }} data-testid="btn-refresh-exp">
          <RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Experiment list */}
        <div className="space-y-2">
          {experiments.map(e => (
            <button key={e.experimentId} onClick={() => setSelected(e.experimentId)}
              className={`w-full text-left rounded-lg border px-3 py-2 text-xs transition-colors ${selected === e.experimentId ? "border-primary/60 bg-primary/10" : "border-border/60 hover:border-border"}`}
              data-testid={`btn-select-exp-${e.experimentId}`}>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-medium ${statusColor[e.status]}`}>{e.status.toUpperCase()}</span>
                {e.winner && <Badge variant="default" className="text-[9px] h-3 px-1">Winner: {e.winner}</Badge>}
              </div>
              <p className="font-semibold mt-0.5 leading-tight">{e.name}</p>
              <p className="text-muted-foreground text-[10px] mt-0.5">{e.results.A.count + e.results.B.count} trials</p>
            </button>
          ))}
          {experiments.length === 0 && <p className="text-xs text-muted-foreground italic">No experiments.</p>}
        </div>

        {/* Experiment detail */}
        <div className="col-span-2 space-y-3">
          {exp ? (
            <>
              <Card className="border-border/60">
                <CardHeader className="py-3 px-4 flex flex-row items-start justify-between">
                  <div>
                    <CardTitle className="text-sm font-semibold">{exp.name}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">{exp.hypothesis}</p>
                  </div>
                  {exp.status === "active" && (
                    <Button size="sm" variant="outline" className="shrink-0 text-[10px] h-6 px-2" onClick={conclude} disabled={concluding} data-testid="btn-conclude-exp">
                      {concluding ? "…" : "Conclude"}
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  {/* Accuracy comparison */}
                  <div className="space-y-1.5">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Diagnostic Accuracy</p>
                    <AccuracyBar rate={accA} variant="A" />
                    <AccuracyBar rate={accB} variant="B" />
                  </div>

                  {/* Stats table */}
                  <div className="grid grid-cols-5 gap-2 text-xs">
                    {["", "Variant A", "Variant B", "Delta", ""].map((h, i) => (
                      <div key={i} className={`text-[10px] uppercase tracking-wide text-muted-foreground ${i === 0 ? "text-left" : "text-center"}`}>{h}</div>
                    ))}
                    {[
                      { label: "Trials",    a: exp.results.A.count,      b: exp.results.B.count,      fmt: (v: number) => v },
                      { label: "Correct",   a: exp.results.A.correct,    b: exp.results.B.correct,    fmt: (v: number) => v },
                      { label: "Accuracy",  a: accA * 100,               b: accB * 100,               fmt: (v: number) => v.toFixed(1) + "%" },
                      { label: "Avg ms",    a: exp.results.A.avgLatencyMs, b: exp.results.B.avgLatencyMs, fmt: (v: number) => v.toFixed(0) },
                      { label: "Safety ⚡", a: exp.results.A.safetyBlocks, b: exp.results.B.safetyBlocks, fmt: (v: number) => v },
                    ].map(row => {
                      const delta = row.b - row.a;
                      return [
                        <div key={`${row.label}-l`} className="text-xs text-muted-foreground">{row.label}</div>,
                        <div key={`${row.label}-a`} className="text-xs text-center font-mono text-blue-400">{row.fmt(row.a)}</div>,
                        <div key={`${row.label}-b`} className="text-xs text-center font-mono text-violet-400">{row.fmt(row.b)}</div>,
                        <div key={`${row.label}-d`} className={`text-xs text-center font-mono ${delta > 0 ? "text-green-400" : delta < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                          {delta > 0 ? "+" : ""}{row.fmt(delta)}
                        </div>,
                        <div key={`${row.label}-e`} />,
                      ];
                    }).flat()}
                  </div>

                  {/* Significance */}
                  {sig && (
                    <div className={`rounded-lg px-3 py-2 text-xs border ${sig.significant ? "border-green-800/40 bg-green-950/20" : "border-border/40 bg-muted/10"}`}>
                      <div className="flex items-center gap-2">
                        <TrendingUp className={`h-3.5 w-3.5 ${sig.significant ? "text-green-400" : "text-muted-foreground"}`} />
                        {sig.significant
                          ? <span className="text-green-400">Statistically significant (p={sig.pValue}) — Variant <strong>{sig.winner}</strong> wins</span>
                          : <span className="text-muted-foreground">Not yet significant (p={sig.pValue}) — need more trials</span>}
                      </div>
                    </div>
                  )}

                  {exp.conclusion && (
                    <div className="rounded-lg bg-muted/20 border border-border/40 px-3 py-2 text-xs">
                      <p className="text-muted-foreground">Concluded {new Date(exp.concludedAt).toLocaleString()}</p>
                      <p className="font-semibold mt-0.5">
                        {exp.conclusion === "no_significant_difference" ? "No significant difference detected" : `Winner: Variant ${exp.winner}`}
                        {exp.pValue !== undefined && ` (p=${exp.pValue})`}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Variant descriptions */}
              <div className="grid grid-cols-2 gap-3">
                {(["A", "B"] as const).map(v => (
                  <Card key={v} className={`border ${v === "A" ? "border-blue-800/40" : "border-violet-800/40"}`}>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className={`text-[10px] h-4 px-1 ${v === "A" ? "text-blue-400 border-blue-500/40" : "text-violet-400 border-violet-500/40"}`}>Variant {v}</Badge>
                        <span className="text-xs font-semibold">{exp[`variant${v}`]?.name}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{exp[`variant${v}`]?.description}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground italic">Select an experiment.</p>
          )}
        </div>
      </div>
    </div>
  );
}
