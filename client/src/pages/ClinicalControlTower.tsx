import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Radar, Activity, Cpu, FlaskConical, AlertTriangle,
  Radio, LayoutGrid, Lightbulb, RefreshCw, Play,
  CheckCircle2, XCircle, TrendingUp, TrendingDown, ShieldAlert
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function pct(n: number) { return `${Math.round((n ?? 0) * 100)}%`; }
function round2(n: number) { return Math.round((n ?? 0) * 100) / 100; }

const statusColor: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  stub: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  planned: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

const levelColor: Record<string, string> = {
  Safety: "border-l-red-500",
  Diagnostic: "border-l-blue-500",
  Conversation: "border-l-purple-500",
  PhysicianControl: "border-l-emerald-500",
  Learning: "border-l-amber-500",
  SystemIntelligence: "border-l-slate-500",
};

// ─── System Health ────────────────────────────────────────────────────────────
function PanelSystemHealth() {
  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/cct/health"],
    refetchInterval: 30000,
  });

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Loading health data…</div>;
  if (!data) return null;

  const { systemHealth, simulation, coverage, topSuggestions } = data;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {/* Top KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">System Health</div>
            <div className={`text-4xl font-bold mt-1 ${systemHealth.score >= 80 ? "text-green-600" : "text-yellow-600"}`}>
              {systemHealth.score}%
            </div>
            <Progress value={systemHealth.score} className="mt-2 h-1.5" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Active Engines</div>
            <div className="text-4xl font-bold mt-1">{systemHealth.activeEngines}</div>
            <div className="text-xs text-muted-foreground mt-1">of {systemHealth.totalEngines} total</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Complaint Coverage</div>
            <div className="text-4xl font-bold mt-1">{coverage.totalComplaints}</div>
            <div className="text-xs text-muted-foreground mt-1">{pct(coverage.avgPassRate)} avg pass rate</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Simulation Accuracy</div>
            <div className={`text-4xl font-bold mt-1 ${simulation ? (simulation.dispositionAccuracy >= 0.9 ? "text-green-600" : "text-yellow-600") : "text-muted-foreground"}`}>
              {simulation ? pct(simulation.dispositionAccuracy) : "—"}
            </div>
            {simulation && <div className="text-xs text-muted-foreground mt-1">{simulation.totalCases} cases run</div>}
          </CardContent>
        </Card>
      </div>

      {/* Engine breakdown */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Engine Level Breakdown</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Object.entries(systemHealth.enginesByLevel ?? {}).map(([level, cnt]: any) => (
              <div key={level} className={`border-l-4 pl-3 py-2 ${levelColor[level] ?? "border-l-slate-300"}`}>
                <div className="text-xs text-muted-foreground">{level}</div>
                <div className="text-2xl font-bold">{cnt}</div>
                <div className="text-xs text-muted-foreground">engines</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Top suggestions */}
      {topSuggestions?.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Top Priority Suggestions</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {topSuggestions.map((s: any, i: number) => (
              <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/40">
                <Lightbulb className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-sm font-medium">{s.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{s.description}</div>
                </div>
                <Badge variant="secondary" className="ml-auto text-xs flex-shrink-0">{s.priority}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Engine Performance ────────────────────────────────────────────────────────
function PanelEnginePerformance() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/cct/engines"] });
  const [filter, setFilter] = useState("all");

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Loading engines…</div>;
  if (!data) return null;

  const levels = ["all", "Safety", "Diagnostic", "Conversation", "PhysicianControl", "Learning", "SystemIntelligence"];
  const filtered = filter === "all" ? data.engines : data.engines.filter((e: any) => e.level === filter);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="text-sm font-medium">{data.active} active of {data.total} total</div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All levels" />
          </SelectTrigger>
          <SelectContent>
            {levels.map(l => <SelectItem key={l} value={l}>{l === "all" ? "All Levels" : l}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex gap-2 ml-auto flex-wrap">
          {Object.entries(data.counts ?? {}).map(([level, cnt]: any) => (
            <Badge key={level} variant="outline" className="text-xs">{level}: {cnt}</Badge>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((engine: any) => (
          <div key={engine.name} className={`border-l-4 border rounded-lg px-3 py-2 ${levelColor[engine.level] ?? "border-l-slate-300"}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium truncate">{engine.name}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${statusColor[engine.status]}`}>{engine.status}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">{engine.level}</div>
            {engine.avgLatencyMs && (
              <div className="text-xs text-muted-foreground">{engine.avgLatencyMs}ms avg</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Simulation Lab ─────────────────────────────────────────────────────────
function PanelSimulation() {
  const { data, isLoading, refetch } = useQuery<any>({ queryKey: ["/api/cct/simulation-summary"] });
  const { toast } = useToast();
  const [complaint, setComplaint] = useState("cough");
  const [count, setCount] = useState(50);

  const runMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/simulation-lab/run", { complaint, count, difficulty: "moderate" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cct/simulation-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cct/failures"] });
      toast({ title: "Simulation complete" });
      refetch();
    },
    onError: () => toast({ title: "Simulation failed", variant: "destructive" }),
  });

  const complaints = ["cough", "chest_pain", "headache", "dizziness", "sore_throat", "fever", "ear_pain", "breathlessness"];

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Loading…</div>;

  const s = data?.lastSummary;
  const learning = data?.learningUpdates;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-sm">Quick Run</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 items-end">
            <Select value={complaint} onValueChange={setComplaint}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {complaints.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="number" min={1} max={500} value={count} onChange={e => setCount(Number(e.target.value))} className="w-24" />
            <Button onClick={() => runMutation.mutate()} disabled={runMutation.isPending} className="gap-2">
              <Play className="h-4 w-4" />
              {runMutation.isPending ? "Running…" : "Run"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {s && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Disposition Accuracy", value: pct(s.dispositionAccuracy), ok: s.dispositionAccuracy >= 0.9 },
            { label: "Diagnosis Accuracy", value: pct(s.diagnosisAccuracy), ok: s.diagnosisAccuracy >= 0.75 },
            { label: "Avg Score", value: `${round2(s.avgScore)}/100`, ok: s.avgScore >= 70 },
            { label: "Red Flag Miss", value: pct(s.redFlagMissRate), ok: s.redFlagMissRate <= 0.02, invert: true },
          ].map(({ label, value, ok, invert }) => (
            <Card key={label}>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className={`text-2xl font-bold mt-1 ${(invert ? !ok : ok) ? "text-green-600" : "text-red-600"}`}>{value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!s && (
        <Card>
          <CardContent className="pt-8 pb-8 text-center text-muted-foreground">No simulation data — run one above</CardContent>
        </Card>
      )}

      {learning && learning.total > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Learning Queue</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {Object.entries(learning.byType).map(([type, cnt]: any) => (
                <div key={type} className="flex items-center gap-2 bg-muted/50 rounded px-3 py-1.5 text-sm">
                  <span className="capitalize font-medium">{type.replace(/_/g, " ")}</span>
                  <Badge variant="secondary">{cnt}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Failure Analysis ─────────────────────────────────────────────────────────
function PanelFailures() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/cct/failures"] });

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Loading…</div>;
  if (!data) return null;

  const critical = (data.failures as any[]).filter(f => f.category === "missed_red_flag");

  return (
    <div className="space-y-4">
      {critical.length > 0 && (
        <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-800 rounded-lg">
          <ShieldAlert className="h-5 w-5 text-red-600 flex-shrink-0" />
          <div>
            <div className="text-sm font-semibold text-red-800 dark:text-red-300">
              {critical[0].count} missed red flag cases detected
            </div>
            <div className="text-xs text-red-700 dark:text-red-400">Emergency triage failures require immediate attention</div>
          </div>
        </div>
      )}

      {data.failures.length === 0 ? (
        <Card>
          <CardContent className="pt-10 pb-10 text-center">
            <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-2" />
            <p className="text-muted-foreground">No failures recorded across {data.totalRuns} runs</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(data.failures as any[]).map((f: any) => (
            <Card key={f.category} className={f.category === "missed_red_flag" ? "border-red-400" : ""}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className={`h-4 w-4 ${f.category === "missed_red_flag" ? "text-red-600" : "text-yellow-600"}`} />
                    <span className="text-sm font-medium capitalize">{f.category.replace(/_/g, " ")}</span>
                  </div>
                  <Badge variant={f.category === "missed_red_flag" ? "destructive" : "secondary"}>{f.count}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">Across {data.totalRuns} simulation runs</p>
    </div>
  );
}

// ─── Channel Analytics ────────────────────────────────────────────────────────
function PanelChannels() {
  const { data = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/cct/channels"] });

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Loading…</div>;

  const sorted = [...(data as any[])].sort((a, b) => a.dropoutRate - b.dropoutRate);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {sorted.map((ch: any) => (
          <Card key={ch.channel}>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Radio className="h-4 w-4 text-blue-500" />
                  <span className="font-semibold capitalize">{ch.channel}</span>
                </div>
                <Badge variant="outline" className={ch.dropoutRate <= 0.07 ? "text-green-600 border-green-400" : "text-yellow-600 border-yellow-400"}>
                  {pct(ch.dropoutRate)} dropout
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Avg Completion</div>
                  <div className="font-semibold">{ch.avgCompletionTime}s</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Questions</div>
                  <div className="font-semibold">{ch.avgQuestions}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Delivery Rate</div>
                  <div className="font-semibold">{pct(ch.deliverySuccessRate)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Satisfaction</div>
                  <div className="font-semibold">{ch.typicalUserSatisfaction}/5</div>
                </div>
              </div>

              <div>
                <div className="text-xs text-muted-foreground mb-1">Delivery success</div>
                <div className="w-full bg-muted rounded-full h-1.5">
                  <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${ch.deliverySuccessRate * 100}%` }} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Coverage Matrix ──────────────────────────────────────────────────────────
function PanelCoverage() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/cct/coverage"] });

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Loading…</div>;
  if (!data) return null;

  const { stats, matrix } = data;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Complaints", value: stats.totalComplaints },
          { label: "Avg Pass Rate", value: pct(stats.avgPassRate) },
          { label: "Unique Engines", value: stats.totalUniqueEngines },
          { label: "Above 90%", value: stats.complaintsAbove90pct },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="text-3xl font-bold mt-1">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Object.values(matrix as Record<string, any>).map((entry: any) => (
          <Card key={entry.complaint}>
            <CardContent className="pt-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold capitalize">{entry.complaint.replace(/_/g, " ")}</span>
                <Badge
                  variant="outline"
                  className={entry.simulationPassRate >= 0.90 ? "text-green-600 border-green-400" : entry.simulationPassRate >= 0.80 ? "text-yellow-600 border-yellow-400" : "text-red-600 border-red-400"}
                >
                  {pct(entry.simulationPassRate)} pass
                </Badge>
              </div>

              <div className="w-full bg-muted rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full ${entry.simulationPassRate >= 0.90 ? "bg-green-500" : entry.simulationPassRate >= 0.80 ? "bg-yellow-500" : "bg-red-500"}`}
                  style={{ width: `${entry.simulationPassRate * 100}%` }}
                />
              </div>

              <div className="flex flex-wrap gap-1">
                {entry.engines.map((e: string) => (
                  <Badge key={e} variant="secondary" className="text-xs font-mono">{e}</Badge>
                ))}
              </div>

              <div className="text-xs text-muted-foreground">Guideline: {entry.guidelineSource}</div>

              {entry.gapAreas.length > 0 && (
                <div className="text-xs text-orange-600 dark:text-orange-400">
                  Gaps: {entry.gapAreas.join(", ")}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Improvements ─────────────────────────────────────────────────────────────
function PanelImprovements() {
  const { data, isLoading, refetch } = useQuery<any>({ queryKey: ["/api/cct/improvements"] });

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Loading…</div>;
  if (!data) return null;

  const allImprovements = (data.allImprovements ?? []).flatMap((r: any) => r.improvements ?? []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{data.total} improvement cycles recorded</p>
        <Button size="sm" variant="outline" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {allImprovements.length === 0 ? (
        <Card>
          <CardContent className="pt-10 pb-10 text-center text-muted-foreground">
            <Lightbulb className="h-10 w-10 mx-auto mb-2 opacity-40" />
            Run a simulation to generate improvement suggestions
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {allImprovements.slice(0, 30).map((imp: any, i: number) => (
            <Card key={i} className={imp.priority === "critical" ? "border-red-400 dark:border-red-700" : ""}>
              <CardContent className="pt-3 pb-3">
                <div className="flex items-start gap-3">
                  <Lightbulb className={`h-4 w-4 mt-0.5 flex-shrink-0 ${imp.priority === "critical" ? "text-red-500" : imp.priority === "high" ? "text-orange-500" : "text-blue-400"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{imp.suggestion}</span>
                      <Badge variant={imp.priority === "critical" ? "destructive" : "secondary"} className="text-xs">{imp.priority}</Badge>
                      {imp.engine && <Badge variant="outline" className="text-xs font-mono">{imp.engine}</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {imp.action} · {imp.estimatedImpact}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ClinicalControlTower() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Radar className="h-7 w-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold">Clinical Control Tower</h1>
          <p className="text-sm text-muted-foreground">
            Unified command center — system health, engine atlas, simulation lab, failure analysis, channel analytics, and coverage matrix
          </p>
        </div>
      </div>

      <Tabs defaultValue="health">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="health" className="gap-1.5" data-testid="tab-cct-health"><Activity className="h-3.5 w-3.5" />System Health</TabsTrigger>
          <TabsTrigger value="engines" className="gap-1.5" data-testid="tab-cct-engines"><Cpu className="h-3.5 w-3.5" />Engines</TabsTrigger>
          <TabsTrigger value="simulation" className="gap-1.5" data-testid="tab-cct-simulation"><FlaskConical className="h-3.5 w-3.5" />Simulation</TabsTrigger>
          <TabsTrigger value="failures" className="gap-1.5" data-testid="tab-cct-failures"><AlertTriangle className="h-3.5 w-3.5" />Failures</TabsTrigger>
          <TabsTrigger value="channels" className="gap-1.5" data-testid="tab-cct-channels"><Radio className="h-3.5 w-3.5" />Channels</TabsTrigger>
          <TabsTrigger value="coverage" className="gap-1.5" data-testid="tab-cct-coverage"><LayoutGrid className="h-3.5 w-3.5" />Coverage</TabsTrigger>
          <TabsTrigger value="improvements" className="gap-1.5" data-testid="tab-cct-improvements"><Lightbulb className="h-3.5 w-3.5" />Improvements</TabsTrigger>
        </TabsList>

        <TabsContent value="health"><PanelSystemHealth /></TabsContent>
        <TabsContent value="engines"><PanelEnginePerformance /></TabsContent>
        <TabsContent value="simulation"><PanelSimulation /></TabsContent>
        <TabsContent value="failures"><PanelFailures /></TabsContent>
        <TabsContent value="channels"><PanelChannels /></TabsContent>
        <TabsContent value="coverage"><PanelCoverage /></TabsContent>
        <TabsContent value="improvements"><PanelImprovements /></TabsContent>
      </Tabs>
    </div>
  );
}
