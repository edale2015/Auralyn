import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, FlaskConical, AlertTriangle, CheckCircle, ArrowUpRight, ArrowDownRight, Eye, BarChart3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

type RunStats = {
  accuracy: number;
  underTriageCount: number;
  overTriageCount: number;
  mismatchCount: number;
  matchCount: number;
  errorCount: number;
  underTriageRate: number;
  overTriageRate: number;
  dispositionBreakdown: Record<string, number>;
  avgDurationMs: number;
};

type TestRun = {
  runId: string;
  complaintId: string;
  totalCases: number;
  timestamp: string;
  stats: RunStats;
};

type RunStatus = "idle" | "generating" | "running" | "complete" | "error";

const COUNT_OPTIONS = [100, 500, 1000, 5000, 10000];

function StatCard({ label, value, subValue, icon }: { label: string; value: string | number; subValue?: string; icon?: React.ReactNode }) {
  return (
    <Card data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">{label}</span>
          {icon}
        </div>
        <div className="text-2xl font-bold mt-1">{value}</div>
        {subValue && <div className="text-xs text-muted-foreground mt-0.5">{subValue}</div>}
      </CardContent>
    </Card>
  );
}

function DispositionBreakdown({ breakdown }: { breakdown: Record<string, number> }) {
  const entries = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (entries.length === 0) return null;

  return (
    <Card data-testid="card-disposition-breakdown">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 flex-wrap"><BarChart3 className="h-4 w-4" />Disposition Breakdown</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {entries.map(([disp, count]) => {
          const pct = total > 0 ? (count / total) * 100 : 0;
          return (
            <div key={disp} className="flex items-center gap-2" data-testid={`disposition-${disp}`}>
              <span className="text-xs w-32 truncate text-muted-foreground">{disp}</span>
              <div className="flex-1 h-4 bg-muted rounded-md overflow-hidden">
                <div className="h-full bg-primary rounded-md transition-all" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs font-medium w-16 text-right">{count} ({pct.toFixed(0)}%)</span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function RunStatsPanel({ stats, runId }: { stats: RunStats; runId: string }) {
  return (
    <div className="space-y-3" data-testid={`stats-panel-${runId}`}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Accuracy"
          value={`${(stats.accuracy * 100).toFixed(1)}%`}
          subValue={`${stats.matchCount} matched`}
          icon={<CheckCircle className="h-4 w-4 text-green-600" />}
        />
        <StatCard
          label="Under-Triage"
          value={stats.underTriageCount}
          subValue={`${(stats.underTriageRate * 100).toFixed(1)}% rate`}
          icon={<ArrowDownRight className="h-4 w-4 text-red-600" />}
        />
        <StatCard
          label="Over-Triage"
          value={stats.overTriageCount}
          subValue={`${(stats.overTriageRate * 100).toFixed(1)}% rate`}
          icon={<ArrowUpRight className="h-4 w-4 text-yellow-600" />}
        />
        <StatCard
          label="Mismatches"
          value={stats.mismatchCount}
          subValue={stats.errorCount > 0 ? `${stats.errorCount} errors` : undefined}
          icon={<AlertTriangle className="h-4 w-4 text-orange-500" />}
        />
      </div>
      <DispositionBreakdown breakdown={stats.dispositionBreakdown} />
    </div>
  );
}

export default function SyntheticTesting() {
  const { authFetch } = useAuth();
  const { toast } = useToast();
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [complaints, setComplaints] = useState<string[]>([]);
  const [selectedComplaint, setSelectedComplaint] = useState("");
  const [selectedCount, setSelectedCount] = useState("100");
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [runStatsCache, setRunStatsCache] = useState<Record<string, RunStats>>({});

  async function loadComplaints() {
    try {
      const res = await authFetch("/api/syntheticTesting/complaints");
      const json = await res.json();
      setComplaints(json.complaints || []);
    } catch {}
  }

  async function loadRuns() {
    try {
      const res = await authFetch("/api/syntheticTesting/runs");
      const json = await res.json();
      setRuns(json.runs || []);
    } catch {} finally { setLoading(false); }
  }

  useEffect(() => {
    loadComplaints();
    loadRuns();
  }, []);

  async function loadRunStats(runId: string) {
    if (runStatsCache[runId]) return;
    try {
      const res = await authFetch(`/api/syntheticTesting/runs/${runId}/stats`);
      const stats = await res.json();
      setRunStatsCache(prev => ({ ...prev, [runId]: stats }));
    } catch {}
  }

  async function generate() {
    if (!selectedComplaint) return;
    setRunStatus("generating");
    try {
      setRunStatus("running");
      const res = await authFetch("/api/syntheticTesting/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complaintId: selectedComplaint, count: Number(selectedCount) }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed");
      }
      const data = await res.json();
      setRunStatus("complete");
      toast({ title: "Test run complete", description: `${data.totalCases} cases — ${(data.stats?.accuracy * 100).toFixed(1)}% accuracy` });
      loadRuns();
      setTimeout(() => setRunStatus("idle"), 3000);
    } catch (err: any) {
      setRunStatus("error");
      toast({ title: "Error", description: err?.message, variant: "destructive" });
      setTimeout(() => setRunStatus("idle"), 3000);
    }
  }

  function toggleExpand(runId: string) {
    if (expandedRun === runId) {
      setExpandedRun(null);
    } else {
      setExpandedRun(runId);
      loadRunStats(runId);
    }
  }

  const statusLabel: Record<RunStatus, string> = {
    idle: "",
    generating: "Generating cases...",
    running: "Running engine...",
    complete: "Complete",
    error: "Error",
  };

  return (
    <div className="p-6 space-y-6" data-testid="page-synthetic-testing">
      <div className="flex items-center gap-3 flex-wrap">
        <FlaskConical className="h-5 w-5" />
        <h2 className="text-xl font-semibold">Synthetic Testing</h2>
      </div>

      <Card data-testid="card-run-config">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">New Test Run</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-3 flex-wrap items-end">
            <div className="space-y-1 min-w-[200px] flex-1 max-w-sm">
              <label className="text-xs text-muted-foreground">Complaint</label>
              <Select value={selectedComplaint} onValueChange={setSelectedComplaint} data-testid="select-complaint">
                <SelectTrigger data-testid="select-complaint-trigger">
                  <SelectValue placeholder="Select complaint..." />
                </SelectTrigger>
                <SelectContent>
                  {complaints.map(c => (
                    <SelectItem key={c} value={c} data-testid={`option-complaint-${c}`}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 min-w-[120px]">
              <label className="text-xs text-muted-foreground">Case Count</label>
              <Select value={selectedCount} onValueChange={setSelectedCount} data-testid="select-count">
                <SelectTrigger data-testid="select-count-trigger">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNT_OPTIONS.map(n => (
                    <SelectItem key={n} value={String(n)} data-testid={`option-count-${n}`}>{n.toLocaleString()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={generate}
              disabled={runStatus !== "idle" || !selectedComplaint}
              data-testid="button-generate"
            >
              {runStatus !== "idle" && runStatus !== "complete" && runStatus !== "error" ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : null}
              Generate & Run
            </Button>
          </div>
          {runStatus !== "idle" && (
            <div className="flex items-center gap-2" data-testid="status-progress">
              {runStatus === "complete" ? (
                <Badge variant="default" data-testid="badge-status-complete">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  {statusLabel[runStatus]}
                </Badge>
              ) : runStatus === "error" ? (
                <Badge variant="destructive" data-testid="badge-status-error">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {statusLabel[runStatus]}
                </Badge>
              ) : (
                <Badge variant="secondary" data-testid="badge-status-running">
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  {statusLabel[runStatus]}
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12" data-testid="status-loading">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : runs.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="text-empty">No test runs yet.</p>
      ) : (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Previous Runs</h3>
          {runs.map((r) => (
            <Card key={r.runId} data-testid={`run-${r.runId}`}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium">{r.complaintId}</div>
                    <div className="text-xs text-muted-foreground">{r.runId}</div>
                    <div className="text-xs text-muted-foreground">{r.totalCases} cases</div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {r.stats && (
                      <Badge variant={r.stats.accuracy >= 0.9 ? "default" : r.stats.accuracy >= 0.7 ? "secondary" : "destructive"} data-testid={`badge-accuracy-${r.runId}`}>
                        {(r.stats.accuracy * 100).toFixed(1)}% accuracy
                      </Badge>
                    )}
                    {r.stats && r.stats.underTriageCount > 0 && (
                      <Badge variant="destructive" data-testid={`badge-undertriage-${r.runId}`}>
                        <ArrowDownRight className="h-3 w-3 mr-0.5" />
                        {r.stats.underTriageCount} under
                      </Badge>
                    )}
                    {r.stats && r.stats.overTriageCount > 0 && (
                      <Badge variant="secondary" data-testid={`badge-overtriage-${r.runId}`}>
                        <ArrowUpRight className="h-3 w-3 mr-0.5" />
                        {r.stats.overTriageCount} over
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-xs" data-testid={`badge-time-${r.runId}`}>
                      {new Date(r.timestamp).toLocaleString()}
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleExpand(r.runId)}
                    data-testid={`button-expand-${r.runId}`}
                  >
                    <BarChart3 className="h-3.5 w-3.5 mr-1" />
                    {expandedRun === r.runId ? "Hide Stats" : "View Stats"}
                  </Button>
                  <Link href={`/mismatch-dashboard/${r.runId}`}>
                    <Button variant="outline" size="sm" data-testid={`button-mismatches-${r.runId}`}>
                      <Eye className="h-3.5 w-3.5 mr-1" />
                      View Mismatches
                    </Button>
                  </Link>
                </div>
                {expandedRun === r.runId && (
                  runStatsCache[r.runId] ? (
                    <RunStatsPanel stats={runStatsCache[r.runId]} runId={r.runId} />
                  ) : r.stats ? (
                    <RunStatsPanel stats={r.stats} runId={r.runId} />
                  ) : (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  )
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
