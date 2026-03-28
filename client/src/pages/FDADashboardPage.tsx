import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, AlertTriangle, FlaskConical, Activity, Brain, Database } from "lucide-react";

interface FDAMetrics {
  total: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  sensitivity: number;
  precision: number;
  accuracy: number;
  f1Score: number;
  passesThreshold: boolean;
  threshold: number;
}

interface GoldenResult {
  caseId: string;
  description: string;
  passed: boolean;
  blocked: boolean;
  expectedBlock: boolean;
  matchedKeywords: string[];
  missingKeywords: string[];
  latencyMs: number;
  error?: string;
}

interface ValidationReport {
  ranAt: string;
  metrics: FDAMetrics;
  safetyAccuracy: number;
  goldenResults: GoldenResult[];
}

interface IntelligenceSnapshot {
  bayesian: { learnedDiagnoses: number; counts: Record<string, Record<string, number>> };
  similarity: { storedCases: number };
  alertLog: Array<{ level: string; type: string; message: string; sentAt: number; channel: string }>;
}

function MetricTile({
  label, value, sub, pass, testId,
}: { label: string; value: string; sub?: string; pass?: boolean; testId: string }) {
  return (
    <div className={`rounded-lg p-3 text-center space-y-0.5 ${
      pass === true ? "bg-green-950/30 border border-green-800/30"
      : pass === false ? "bg-red-950/30 border border-red-800/30"
      : "bg-muted/40"
    }`} data-testid={testId}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold ${pass === true ? "text-green-400" : pass === false ? "text-red-400" : "text-foreground"}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function FDAGrade({ metrics }: { metrics: FDAMetrics }) {
  const score = metrics.f1Score;
  if (score >= 0.9) return <Badge className="bg-green-600 text-white text-xs">A — FDA Ready</Badge>;
  if (score >= 0.8) return <Badge className="bg-blue-600 text-white text-xs">B — Near Ready</Badge>;
  if (score >= 0.65) return <Badge className="bg-yellow-600 text-white text-xs">C — Improving</Badge>;
  return <Badge variant="destructive" className="text-xs">D — Needs Work</Badge>;
}

export default function FDADashboardPage() {
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [intel, setIntel]   = useState<IntelligenceSnapshot | null>(null);
  const [running, setRunning] = useState(false);
  const [tab, setTab]         = useState<"metrics" | "cases" | "intelligence">("metrics");
  const { toast } = useToast();

  const runValidation = async () => {
    setRunning(true);
    try {
      const r = await fetch("/api/fda-validation/run", { method: "POST" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Unknown error");
      setReport(j.report);
      toast({
        title: j.report.metrics.passesThreshold ? "Validation passed FDA threshold ✅" : "⚠ Validation below FDA threshold",
        description: `Accuracy ${(j.report.metrics.accuracy * 100).toFixed(1)}% · F1 ${j.report.metrics.f1Score.toFixed(3)} · Safety ${(j.report.metrics.safetyAccuracy * 100).toFixed(1)}%`,
        variant: j.report.metrics.passesThreshold ? "default" : "destructive",
      });
    } catch (e: any) {
      toast({ title: "Validation failed", description: e.message, variant: "destructive" });
    } finally { setRunning(false); }
  };

  const loadIntelligence = async () => {
    try {
      const r = await fetch("/api/fda-validation/intelligence");
      const j = await r.json();
      if (j.ok) setIntel(j);
    } catch {}
    setTab("intelligence");
  };

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-5">
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FlaskConical className="h-6 w-6 text-blue-400" />
          <div>
            <h1 className="text-xl font-bold tracking-tight" data-testid="text-fda-title">FDA-Grade Validation Dashboard</h1>
            <p className="text-xs text-muted-foreground">Accuracy · Precision · Recall · F1 · Safety — continuously measured against golden cases</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadIntelligence} data-testid="btn-load-intelligence">
            <Brain className="h-3.5 w-3.5 mr-1" /> Intelligence
          </Button>
          <Button size="sm" onClick={runValidation} disabled={running} data-testid="btn-run-validation">
            {running ? "Validating…" : "Run Validation"}
          </Button>
        </div>
      </div>

      {/* ── No data state ─────────────────────────────────────── */}
      {!report && !intel && (
        <Card className="border-dashed border-border/60">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <FlaskConical className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Click "Run Validation" to execute all golden cases and compute FDA-grade metrics.</p>
          </CardContent>
        </Card>
      )}

      {/* ── Report ─────────────────────────────────────────────── */}
      {report && (
        <>
          {/* Tab nav */}
          <div className="flex gap-1 border-b border-border/60">
            {(["metrics", "cases", "intelligence"] as const).map(t => (
              <button key={t} onClick={() => { if (t === "intelligence") loadIntelligence(); else setTab(t); }}
                className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors ${tab === t ? "bg-background border border-b-background border-border/60 text-foreground -mb-px" : "text-muted-foreground hover:text-foreground"}`}
                data-testid={`tab-${t}`}>
                {t === "metrics" ? "Metrics" : t === "cases" ? "Case Results" : "Intelligence"}
              </button>
            ))}
          </div>

          {/* ── Metrics Tab ─────────────────────────────────────── */}
          {tab === "metrics" && (
            <div className="space-y-4">
              <Card className="border border-border/60">
                <CardHeader className="py-3 px-4 flex flex-row items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-blue-400" />
                    <CardTitle className="text-sm font-semibold">Validation Report</CardTitle>
                    <FDAGrade metrics={report.metrics} />
                    <Badge variant={report.metrics.passesThreshold ? "default" : "destructive"} className="text-[10px]">
                      {report.metrics.passesThreshold ? `≥${(report.metrics.threshold * 100).toFixed(0)}% threshold ✓` : "Below threshold"}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{new Date(report.ranAt).toLocaleString()}</p>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-4">
                  {/* Primary metrics */}
                  <div className="grid grid-cols-4 gap-3">
                    <MetricTile label="Accuracy" value={`${(report.metrics.accuracy * 100).toFixed(1)}%`}
                      pass={report.metrics.accuracy >= report.metrics.threshold} testId="metric-accuracy" />
                    <MetricTile label="Precision" value={`${(report.metrics.precision * 100).toFixed(1)}%`} testId="metric-precision" />
                    <MetricTile label="Recall (Sensitivity)" value={`${(report.metrics.sensitivity * 100).toFixed(1)}%`} testId="metric-recall" />
                    <MetricTile label="F1 Score" value={report.metrics.f1Score.toFixed(3)}
                      pass={report.metrics.f1Score >= 0.8} testId="metric-f1" />
                  </div>

                  {/* Confusion matrix */}
                  <div className="grid grid-cols-3 gap-3">
                    <MetricTile label="True Positives" value={String(report.metrics.truePositives)} pass testId="metric-tp" />
                    <MetricTile label="False Positives" value={String(report.metrics.falsePositives)} pass={report.metrics.falsePositives === 0} testId="metric-fp" />
                    <MetricTile label="False Negatives" value={String(report.metrics.falseNegatives)} pass={report.metrics.falseNegatives === 0} testId="metric-fn" />
                  </div>

                  {/* Safety accuracy */}
                  <div className="rounded-lg bg-muted/30 px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-400" />
                      <span className="text-sm font-medium">Safety Gate Accuracy</span>
                      <span className="text-xs text-muted-foreground">(correct block / allow decisions)</span>
                    </div>
                    <span className={`text-lg font-bold ${report.safetyAccuracy >= 0.8 ? "text-green-400" : "text-red-400"}`} data-testid="metric-safety">
                      {(report.safetyAccuracy * 100).toFixed(1)}%
                    </span>
                  </div>

                  {/* Total cases */}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Activity className="h-3.5 w-3.5" />
                    <span>Total golden cases evaluated: <strong className="text-foreground">{report.metrics.total}</strong></span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── Cases Tab ──────────────────────────────────────── */}
          {tab === "cases" && (
            <Card className="border border-border/60">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-semibold">Per-Case Results ({report.goldenResults.length} cases)</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="space-y-1.5 max-h-[520px] overflow-y-auto">
                  {report.goldenResults.map((r, i) => (
                    <div key={i}
                      className={`rounded-lg px-3 py-2 flex items-start gap-3 ${r.passed ? "bg-green-950/20 border border-green-900/30" : "bg-red-950/20 border border-red-900/30"}`}
                      data-testid={`row-case-${r.caseId}`}>
                      <span className="shrink-0 mt-0.5 text-base">{r.passed ? "✅" : "❌"}</span>
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-foreground">{r.caseId}</span>
                          {r.blocked && <Badge variant="destructive" className="text-[9px] h-3.5 px-1">BLOCKED</Badge>}
                          {r.expectedBlock && !r.blocked && <Badge variant="secondary" className="text-[9px] h-3.5 px-1">Expected block</Badge>}
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate">{r.description}</p>
                        {r.matchedKeywords.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {r.matchedKeywords.map(k => (
                              <span key={k} className="text-[9px] bg-green-900/40 text-green-300 rounded px-1">{k}</span>
                            ))}
                          </div>
                        )}
                        {r.missingKeywords.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {r.missingKeywords.map(k => (
                              <span key={k} className="text-[9px] bg-red-900/40 text-red-300 rounded px-1">missing: {k}</span>
                            ))}
                          </div>
                        )}
                        {r.error && <p className="text-[10px] text-red-400">{r.error}</p>}
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">{r.latencyMs}ms</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ── Intelligence Tab ────────────────────────────────────── */}
      {tab === "intelligence" && intel && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Bayesian snapshot */}
          <Card className="border border-border/60">
            <CardHeader className="py-3 px-4 flex flex-row items-center gap-2">
              <Brain className="h-4 w-4 text-purple-400" />
              <CardTitle className="text-sm font-semibold">Adaptive Bayesian Engine</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded bg-muted/40 p-2 text-center">
                  <p className="text-[10px] text-muted-foreground">Learned Diagnoses</p>
                  <p className="font-bold text-base" data-testid="text-bayes-dx">{intel.bayesian.learnedDiagnoses}</p>
                </div>
                <div className="rounded bg-muted/40 p-2 text-center">
                  <p className="text-[10px] text-muted-foreground">Similarity Cases</p>
                  <p className="font-bold text-base" data-testid="text-sim-cases">{intel.similarity.storedCases}</p>
                </div>
              </div>
              {intel.bayesian.learnedDiagnoses === 0 ? (
                <p className="text-xs text-muted-foreground italic">No adaptive training yet. Training accumulates as the self-learning engine processes outcomes.</p>
              ) : (
                <div className="space-y-1 max-h-36 overflow-y-auto text-xs">
                  {Object.entries(intel.bayesian.counts).slice(0, 8).map(([dx, features]) => (
                    <div key={dx} className="flex items-center justify-between bg-muted/20 rounded px-2 py-1" data-testid={`row-bayes-${dx}`}>
                      <span className="font-medium">{dx}</span>
                      <span className="text-muted-foreground">{Object.keys(features).length} features</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Alert dispatch log */}
          <Card className="border border-border/60">
            <CardHeader className="py-3 px-4 flex flex-row items-center gap-2">
              <Activity className="h-4 w-4 text-amber-400" />
              <CardTitle className="text-sm font-semibold">Alert Dispatcher Log</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {intel.alertLog.length === 0 ? (
                <div className="flex items-center gap-2 py-4">
                  <ShieldCheck className="h-4 w-4 text-green-400" />
                  <p className="text-xs text-green-400">No alerts dispatched — system nominal.</p>
                </div>
              ) : (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {intel.alertLog.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs bg-muted/20 rounded px-2 py-1" data-testid={`row-alert-${i}`}>
                      <Badge variant={a.level === "critical" ? "destructive" : "secondary"} className="text-[9px] h-3.5 px-1 shrink-0">{a.level}</Badge>
                      <span className="text-muted-foreground shrink-0">{new Date(a.sentAt).toLocaleTimeString()}</span>
                      <span className="font-medium shrink-0">{a.type}</span>
                      <span className="truncate text-muted-foreground">{a.message}</span>
                      <Badge variant="outline" className="text-[9px] h-3.5 px-1 shrink-0">{a.channel}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Hybrid scoring info */}
          <Card className="border border-border/60 md:col-span-2">
            <CardHeader className="py-3 px-4 flex flex-row items-center gap-2">
              <Database className="h-4 w-4 text-blue-400" />
              <CardTitle className="text-sm font-semibold">Hybrid Scoring Architecture</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="rounded bg-purple-950/20 border border-purple-900/30 p-3">
                  <p className="font-semibold text-purple-300 mb-1">Static Bayesian Prior</p>
                  <p className="text-muted-foreground">Symptom→Dx map with 17 symptom nodes covering ENT, flu, cardiac, respiratory</p>
                </div>
                <div className="rounded bg-blue-950/20 border border-blue-900/30 p-3">
                  <p className="font-semibold text-blue-300 mb-1">Adaptive Bayes (RLHF)</p>
                  <p className="text-muted-foreground">Trained from confirmed outcome data with Laplace smoothing per diagnosis</p>
                </div>
                <div className="rounded bg-green-950/20 border border-green-900/30 p-3">
                  <p className="font-semibold text-green-300 mb-1">Case Similarity (Jaccard)</p>
                  <p className="text-muted-foreground">Top-k historical case lookup, weighted by similarity score</p>
                </div>
                <div className="rounded bg-amber-950/20 border border-amber-900/30 p-3">
                  <p className="font-semibold text-amber-300 mb-1">RLHF Weight Store</p>
                  <p className="text-muted-foreground">Per-diagnosis multiplier updated by self-learning feedback loop every 60s</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
