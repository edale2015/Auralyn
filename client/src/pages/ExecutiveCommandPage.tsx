import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Shield, Activity, Brain, RefreshCw, AlertTriangle,
  CheckCircle, XCircle, Users, TrendingUp, BarChart3,
  Zap, Network, Lock, Cpu, Scale, FlaskConical,
  ChevronRight, MessageSquare, Target,
} from "lucide-react";

/* ── types ─────────────────────────────────────────────────────────────── */
interface ExecutiveSummary {
  systemHealth: "OPTIMAL" | "STABLE" | "DEGRADED" | "CRITICAL";
  healthScore:  number;
  pipeline:     { pipelineVersion: string; stages: number; stageNames: string[] };
  metrics:      { requests: number; errors: number; errorRate: number; avgLatencyMs: number; p95LatencyMs: number };
  agents:       { total: number; healthy: number; warning: number; critical: number };
  moat:         { overall: number; grade: string; flywheel: { totalEncounters: number; velocity24h: number; goldenPromotions: number }; network: { activeClinicCount: number; totalNetworkCases: number } };
  rlhf:         { pendingProposals: number; approvedVersions: number; redisHydrated: boolean; locked: boolean; lockReason?: string };
  learning:     { policyMode: string; policyVersion: number; totalOutcomes: number; accuracy: number };
  debate:       { agentAccuracies: Record<string, number> };
  predictiveRisk: { predicted: boolean; reason: string | null; confidence: string };
  alerts:       string[];
  generatedAt:  string;
}

interface DebateResult {
  opinions: Array<{ agent: string; role: string; diagnosis: string; confidence: number; disposition: string; reasoning: string; historicalAccuracy: number }>;
  consensus: { diagnosis: string; confidence: number; disposition: string };
  disagreement: boolean;
  disagreementType: string;
  safetyVetoed: boolean;
  modelAveragedDiagnosis: string;
  modelAveragedConfidence: number;
  confidenceDelta: number;
  debateMs: number;
}

/* ── helpers ─────────────────────────────────────────────────────────────── */
function healthColor(h: string) {
  if (h === "OPTIMAL")  return "text-green-600 dark:text-green-400";
  if (h === "STABLE")   return "text-blue-600 dark:text-blue-400";
  if (h === "DEGRADED") return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function healthBg(h: string) {
  if (h === "OPTIMAL")  return "bg-green-50 border-green-200 dark:bg-green-900/10 dark:border-green-800";
  if (h === "STABLE")   return "bg-blue-50 border-blue-200 dark:bg-blue-900/10 dark:border-blue-800";
  if (h === "DEGRADED") return "bg-yellow-50 border-yellow-200 dark:bg-yellow-900/10 dark:border-yellow-800";
  return "bg-red-50 border-red-200 dark:bg-red-900/10 dark:border-red-800";
}

function modeColor(m: string) {
  if (m === "CONSERVATIVE")  return "text-orange-600";
  if (m === "PROBABILISTIC") return "text-purple-600";
  return "text-blue-600";
}

function pct(n: number) { return (n * 100).toFixed(1) + "%"; }

/* ── component ───────────────────────────────────────────────────────────── */
export default function ExecutiveCommandPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [debateSymptoms, setDebateSymptoms] = useState("sore throat, fever, exudate");
  const [debateComplaint, setDebateComplaint] = useState("sore throat");
  const [debateResult, setDebateResult] = useState<DebateResult | null>(null);

  const { data: exec, isLoading, refetch } = useQuery<ExecutiveSummary>({
    queryKey: ["/api/phase9/executive"],
    refetchInterval: 15000,
  });

  const { data: policyData } = useQuery<{ weights: any; mode: string }>({
    queryKey: ["/api/phase9/policy"],
  });

  const runDebate = useMutation({
    mutationFn: () => apiRequest("POST", "/api/phase9/debate", {
      symptoms:  debateSymptoms.split(",").map(s => s.trim()).filter(Boolean),
      complaint: debateComplaint,
    }),
    onSuccess: async (res: any) => {
      const d = await res.json();
      setDebateResult(d);
      toast({ title: "Debate complete", description: `${d.disagreement ? "Agents disagreed" : "Agents reached consensus"} in ${d.debateMs}ms` });
    },
    onError: () => toast({ title: "Debate failed", variant: "destructive" }),
  });

  const evolvePolicy = useMutation({
    mutationFn: () => apiRequest("POST", "/api/phase9/policy/evolve", {}),
    onSuccess: async (res: any) => {
      const d = await res.json();
      qc.invalidateQueries({ queryKey: ["/api/phase9/policy"] });
      qc.invalidateQueries({ queryKey: ["/api/phase9/executive"] });
      toast({
        title: d.evolved ? "Policy evolved" : "Policy unchanged",
        description: d.evolved
          ? `v${d.after.version}: Conservative ${d.after.conservative.toFixed(2)}, Probabilistic ${d.after.probabilistic.toFixed(2)}`
          : d.blockedReason,
      });
    },
  });

  const runLearning = useMutation({
    mutationFn: () => apiRequest("GET", "/api/phase9/learning/run"),
    onSuccess: async (res: any) => {
      const d = await res.json();
      qc.invalidateQueries({ queryKey: ["/api/phase9/executive"] });
      toast({ title: d.ran ? "Learning pass complete" : "Learning blocked", description: d.ran ? `${d.proposalsCreated} proposals created from ${d.totalCases} cases` : d.blockedReason });
    },
  });

  const e = exec;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">

      {/* ── header ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2" data-testid="text-exec-title">
            <Cpu className="h-6 w-6 text-indigo-600" />
            Executive Command Center
          </h1>
          <p className="text-sm text-gray-500 mt-1">Phase 9 — Multi-agent intelligence · Self-improving policy · CEO-grade system view</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-exec">
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-gray-500 animate-pulse" data-testid="status-loading-exec">
          <Activity className="h-4 w-4" /> Loading executive summary…
        </div>
      )}

      {e && (
        <>
          {/* ── system health banner ──────────────────────────────────── */}
          <div
            className={`rounded-xl border p-6 ${healthBg(e.systemHealth)}`}
            data-testid="section-system-health"
          >
            <div className="flex items-center gap-6 flex-wrap">
              <div className="text-center">
                <div className={`text-5xl font-black ${healthColor(e.systemHealth)}`} data-testid="text-health-status">{e.systemHealth}</div>
                <div className="text-xs text-gray-500 mt-1">System Status</div>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Health Score</span>
                  <span className="text-2xl font-bold" data-testid="text-health-score">{e.healthScore}/100</span>
                </div>
                <Progress value={e.healthScore} className="h-3 mb-3" />
                <div className="grid grid-cols-4 gap-3 text-center text-xs">
                  <div><div className="font-bold text-gray-900 dark:text-white" data-testid="text-metric-requests">{e.metrics.requests.toLocaleString()}</div><div className="text-gray-500">Requests</div></div>
                  <div><div className="font-bold text-gray-900 dark:text-white" data-testid="text-metric-errors">{e.metrics.errors}</div><div className="text-gray-500">Errors</div></div>
                  <div><div className="font-bold text-gray-900 dark:text-white" data-testid="text-metric-latency">{Math.round(e.metrics.avgLatencyMs)}ms</div><div className="text-gray-500">Avg Latency</div></div>
                  <div><div className="font-bold text-gray-900 dark:text-white" data-testid="text-metric-error-rate">{pct(e.metrics.errorRate)}</div><div className="text-gray-500">Error Rate</div></div>
                </div>
              </div>
            </div>
            {/* Alerts */}
            {e.alerts.length > 0 && (
              <div className="mt-4 space-y-1">
                {e.alerts.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-orange-700 dark:text-orange-300" data-testid={`alert-${i}`}>
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" /> {a}
                  </div>
                ))}
              </div>
            )}
            {e.alerts.length === 0 && (
              <div className="mt-3 flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                <CheckCircle className="h-4 w-4" /> No active alerts
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* ── pipeline ──────────────────────────────────────────── */}
            <Card data-testid="card-pipeline">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Zap className="h-4 w-4 text-yellow-500" />
                  Pipeline v{e.pipeline.pipelineVersion}
                  <Badge variant="outline" className="ml-auto text-xs">{e.pipeline.stages} stages</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {(e.pipeline.stageNames ?? []).map((s, i) => (
                    <div key={s} className="flex items-center gap-2 text-xs" data-testid={`stage-${i}`}>
                      <CheckCircle className="h-3 w-3 text-green-500 flex-shrink-0" />
                      <span className="text-gray-600 dark:text-gray-400">{i + 1}. {s}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* ── agent health ───────────────────────────────────────── */}
            <Card data-testid="card-agents">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-500" />
                  Agent Health
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: "Total Agents", val: e.agents.total,    color: "text-gray-900 dark:text-white", testid: "text-agents-total" },
                  { label: "Healthy",      val: e.agents.healthy,   color: "text-green-600",  testid: "text-agents-healthy" },
                  { label: "Warning",      val: e.agents.warning,   color: "text-yellow-600", testid: "text-agents-warning" },
                  { label: "Critical",     val: e.agents.critical,  color: "text-red-600",    testid: "text-agents-critical" },
                ].map(r => (
                  <div key={r.label} className="flex justify-between text-sm">
                    <span className="text-gray-500">{r.label}</span>
                    <span className={`font-bold ${r.color}`} data-testid={r.testid}>{r.val}</span>
                  </div>
                ))}
                <div className="pt-2 border-t">
                  <div className="text-xs text-gray-500 mb-1">Phase 9 Agent Accuracies</div>
                  {Object.entries(e.debate.agentAccuracies).map(([agent, acc]) => (
                    <div key={agent} className="flex justify-between text-xs mb-1" data-testid={`accuracy-${agent}`}>
                      <span className="text-gray-500 truncate">{agent.replace(/_/g, " ")}</span>
                      <span className="font-medium text-purple-600">{pct(acc)}</span>
                    </div>
                  ))}
                  {Object.keys(e.debate.agentAccuracies).length === 0 && (
                    <p className="text-xs text-gray-400 italic">Run the debate engine to populate</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* ── moat snapshot ─────────────────────────────────────── */}
            <Card data-testid="card-moat-exec">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Shield className="h-4 w-4 text-indigo-500" />
                  Moat Snapshot
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Defensibility Grade</span>
                  <span className="text-2xl font-black text-indigo-600" data-testid="text-exec-moat-grade">{e.moat.grade}</span>
                </div>
                <Progress value={e.moat.overall} className="h-2" />
                {[
                  { label: "Total Encounters", val: e.moat.flywheel.totalEncounters.toLocaleString(), testid: "text-exec-fly-total" },
                  { label: "24h Velocity",     val: `${e.moat.flywheel.velocity24h}/day`,             testid: "text-exec-fly-vel" },
                  { label: "Golden Promoted",  val: e.moat.flywheel.goldenPromotions.toLocaleString(), testid: "text-exec-fly-golden" },
                  { label: "Active Clinics",   val: e.moat.network.activeClinicCount.toString(),       testid: "text-exec-clinics" },
                  { label: "Network Cases",    val: e.moat.network.totalNetworkCases.toLocaleString(),  testid: "text-exec-net-cases" },
                ].map(r => (
                  <div key={r.label} className="flex justify-between text-xs">
                    <span className="text-gray-500">{r.label}</span>
                    <span className="font-semibold text-gray-900 dark:text-white" data-testid={r.testid}>{r.val}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* ── RLHF governance ───────────────────────────────────── */}
            <Card data-testid="card-rlhf-exec">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Scale className="h-4 w-4 text-green-500" />
                  RLHF Governance
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-yellow-50 dark:bg-yellow-900/10 rounded-lg p-3">
                    <div className="text-2xl font-bold text-yellow-600" data-testid="text-rlhf-pending">{e.rlhf.pendingProposals}</div>
                    <div className="text-xs text-gray-500">Pending</div>
                  </div>
                  <div className="bg-green-50 dark:bg-green-900/10 rounded-lg p-3">
                    <div className="text-2xl font-bold text-green-600" data-testid="text-rlhf-approved">{e.rlhf.approvedVersions}</div>
                    <div className="text-xs text-gray-500">Versions</div>
                  </div>
                  <div className={`rounded-lg p-3 ${e.rlhf.locked ? "bg-red-50 dark:bg-red-900/10" : "bg-blue-50 dark:bg-blue-900/10"}`}>
                    <div className={`text-2xl font-bold ${e.rlhf.locked ? "text-red-600" : "text-blue-600"}`} data-testid="text-rlhf-lock">
                      {e.rlhf.locked ? "🔒" : "🔓"}
                    </div>
                    <div className="text-xs text-gray-500">{e.rlhf.locked ? "Locked" : "Unlocked"}</div>
                  </div>
                </div>
                {e.rlhf.locked && (
                  <div className="text-xs text-red-600 bg-red-50 dark:bg-red-900/10 rounded p-2">
                    <strong>Drift lock:</strong> {e.rlhf.lockReason}
                  </div>
                )}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Redis persisted</span>
                  <span className={e.rlhf.redisHydrated ? "text-green-600" : "text-yellow-600"}>
                    {e.rlhf.redisHydrated ? "✅ Yes" : "⚠️ In-memory only"}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* ── policy evolution ──────────────────────────────────── */}
            <Card data-testid="card-policy">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-purple-500" />
                  Policy Evolution (Phase 9)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-4">
                  <div>
                    <div className="text-xs text-gray-500">Current Mode</div>
                    <div className={`text-lg font-bold ${modeColor(e.learning.policyMode)}`} data-testid="text-policy-mode">
                      {e.learning.policyMode}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Policy Version</div>
                    <div className="text-lg font-bold text-gray-900 dark:text-white" data-testid="text-policy-version">v{e.learning.policyVersion}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Outcomes</div>
                    <div className="text-lg font-bold text-gray-900 dark:text-white" data-testid="text-outcomes-total">{e.learning.totalOutcomes}</div>
                  </div>
                </div>
                {policyData && (
                  <div className="space-y-1">
                    {["conservative", "balanced", "probabilistic"].map(k => (
                      <div key={k} className="space-y-0.5">
                        <div className="flex justify-between text-xs">
                          <span className="capitalize text-gray-500">{k}</span>
                          <span className="font-medium">{((policyData.weights?.[k] ?? 1) / 3 * 100).toFixed(1)}%</span>
                        </div>
                        <Progress value={(policyData.weights?.[k] ?? 1) / 3 * 100} className="h-1" />
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm" variant="outline" className="flex-1"
                    onClick={() => runLearning.mutate()}
                    disabled={runLearning.isPending}
                    data-testid="button-run-learning"
                  >
                    {runLearning.isPending ? <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> : <Brain className="h-3 w-3 mr-1" />}
                    Run Learning
                  </Button>
                  <Button
                    size="sm" variant="outline" className="flex-1"
                    onClick={() => evolvePolicy.mutate()}
                    disabled={evolvePolicy.isPending}
                    data-testid="button-evolve-policy"
                  >
                    {evolvePolicy.isPending ? <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> : <TrendingUp className="h-3 w-3 mr-1" />}
                    Evolve Policy
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── multi-agent debate engine ──────────────────────────────── */}
          <Card data-testid="card-debate">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-blue-500" />
                Multi-Agent Debate Engine
                <Badge variant="outline" className="ml-auto text-xs">Phase 9</Badge>
              </CardTitle>
              <p className="text-xs text-gray-500">
                Three real clinical agents argue over every diagnosis. Consensus uses Bayesian model averaging weighted by historical accuracy.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">Symptoms (comma-separated)</Label>
                  <Input
                    value={debateSymptoms}
                    onChange={e => setDebateSymptoms(e.target.value)}
                    className="h-8 text-sm"
                    data-testid="input-debate-symptoms"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Chief Complaint</Label>
                  <Input
                    value={debateComplaint}
                    onChange={e => setDebateComplaint(e.target.value)}
                    className="h-8 text-sm"
                    data-testid="input-debate-complaint"
                  />
                </div>
              </div>
              <Button
                onClick={() => runDebate.mutate()}
                disabled={runDebate.isPending}
                data-testid="button-run-debate"
              >
                {runDebate.isPending ? (
                  <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Running debate…</>
                ) : (
                  <><Brain className="h-4 w-4 mr-2" /> Run Multi-Agent Debate</>
                )}
              </Button>

              {debateResult && (
                <div className="space-y-3" data-testid="section-debate-result">
                  {/* Consensus */}
                  <div className={`rounded-lg p-4 border ${debateResult.safetyVetoed ? "bg-red-50 border-red-200 dark:bg-red-900/10 dark:border-red-800" : "bg-green-50 border-green-200 dark:bg-green-900/10 dark:border-green-800"}`}>
                    <div className="flex items-center gap-2 mb-1">
                      {debateResult.safetyVetoed ? <AlertTriangle className="h-4 w-4 text-red-600" /> : <CheckCircle className="h-4 w-4 text-green-600" />}
                      <span className="font-semibold text-sm" data-testid="text-consensus-dx">
                        Consensus: {debateResult.modelAveragedDiagnosis}
                      </span>
                      <Badge variant="outline" className="text-xs">{pct(debateResult.modelAveragedConfidence)}</Badge>
                      {debateResult.safetyVetoed && <Badge className="bg-red-600 text-white text-xs">Safety Veto</Badge>}
                      {debateResult.disagreement && (
                        <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">
                          Disagreement: {debateResult.disagreementType}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      Model-averaged confidence · Δ{pct(debateResult.confidenceDelta)} spread · {debateResult.debateMs}ms
                    </div>
                  </div>

                  {/* Individual opinions */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {debateResult.opinions.map(op => (
                      <div key={op.agent} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border" data-testid={`opinion-${op.agent}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 capitalize">
                            {op.agent.replace(/_/g, " ")}
                          </span>
                          <Badge variant="outline" className="text-xs">{pct(op.historicalAccuracy)} acc</Badge>
                        </div>
                        <div className="text-sm font-bold text-gray-900 dark:text-white">{op.diagnosis}</div>
                        <div className="text-xs text-gray-500">{pct(op.confidence)} confidence</div>
                        <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">{op.disposition}</div>
                        <div className="text-xs text-gray-400 mt-1 line-clamp-2">{op.reasoning}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── predictive risk ───────────────────────────────────────── */}
          <Card data-testid="card-predictive">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="h-4 w-4 text-orange-500" />
                Predictive Risk Engine (Phase 7)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold ${e.predictiveRisk.predicted ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`} data-testid="text-predictive-status">
                  {e.predictiveRisk.predicted ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                  {e.predictiveRisk.predicted ? "FAILURE PREDICTED" : "SYSTEM STABLE"}
                </div>
                {e.predictiveRisk.reason && (
                  <span className="text-sm text-gray-600 dark:text-gray-400">{e.predictiveRisk.reason}</span>
                )}
                <span className="text-sm text-gray-400 ml-auto">Confidence: {e.predictiveRisk.confidence}</span>
              </div>
            </CardContent>
          </Card>

          {/* ── phase summaries ───────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { phase: "Phase 6", name: "Control Tower", icon: <BarChart3 className="h-5 w-5 text-blue-500" />, status: "LIVE", detail: "Agent registry · Event bus · LLM router" },
              { phase: "Phase 7", name: "Self-Learning", icon: <Brain className="h-5 w-5 text-purple-500" />, status: "LIVE", detail: "Outcome tracking · RLHF · Drift control" },
              { phase: "Phase 8", name: "Autonomous", icon: <Cpu className="h-5 w-5 text-green-500" />, status: "LIVE", detail: "Task graph · Self-healing · Policy engine" },
              { phase: "Phase 9", name: "Multi-Agent", icon: <Network className="h-5 w-5 text-orange-500" />, status: "LIVE", detail: "Debate engine · Policy evolution · Continuous learning" },
            ].map(p => (
              <div key={p.phase} className="bg-gray-50 dark:bg-gray-800 border rounded-xl p-4" data-testid={`card-phase-summary-${p.phase.replace(" ", "-")}`}>
                <div className="flex items-center justify-between mb-2">
                  {p.icon}
                  <Badge className="bg-green-600 text-white text-xs">{p.status}</Badge>
                </div>
                <div className="text-xs font-medium text-gray-500">{p.phase}</div>
                <div className="text-sm font-bold text-gray-900 dark:text-white">{p.name}</div>
                <div className="text-xs text-gray-400 mt-1">{p.detail}</div>
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-400 text-right">
            Executive summary generated {new Date(e.generatedAt).toLocaleTimeString()} · refreshes every 15s
          </p>
        </>
      )}
    </div>
  );
}
