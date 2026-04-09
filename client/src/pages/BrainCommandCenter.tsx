import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BrainCircuit, AlertTriangle, Activity, CheckCircle2, Layers,
  TrendingUp, TrendingDown, Minus, Users, Zap, RefreshCw,
  Shield, FlaskConical, GitBranch, Target, Radio, Siren,
  HelpCircle, Lightbulb, BarChart3, Clock, Trophy, TriangleAlert,
  ArrowUpRight, ArrowDownRight, Gauge, Eye, Sparkles, Cpu, Timer, XCircle,
} from "lucide-react";
import HospitalBrainPanel from "@/components/HospitalBrainPanel";

function RiskBadge({ level }: { level: string }) {
  const map: Record<string, string> = {
    emergency: "bg-red-600 text-white",
    critical: "bg-red-500 text-white",
    urgent: "bg-orange-500 text-white",
    "semi-urgent": "bg-yellow-500 text-white",
    routine: "bg-emerald-500 text-white",
    stable: "bg-emerald-500 text-white",
    worsening: "bg-red-500 text-white",
    improving: "bg-blue-500 text-white",
    warning: "bg-orange-400 text-white",
    elevated: "bg-yellow-400 text-black",
    critical_qa: "bg-red-700 text-white",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${map[level] ?? "bg-gray-200 text-gray-700"}`}>
      {level}
    </span>
  );
}

function TrendIcon({ trend }: { trend: string }) {
  if (trend === "worsening") return <TrendingUp className="h-4 w-4 text-red-500" />;
  if (trend === "improving") return <TrendingDown className="h-4 w-4 text-green-500" />;
  return <Minus className="h-4 w-4 text-gray-400" />;
}

function SeverityDot({ severity }: { severity: string }) {
  const color = severity === "high" ? "bg-red-500" : severity === "medium" ? "bg-orange-400" : "bg-yellow-400";
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}

function ContribBar({ value, max = 0.5 }: { value: number; max?: number }) {
  const isPositive = value >= 0;
  const pct = Math.min(100, (Math.abs(value) / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden flex">
        {isPositive ? (
          <div className="ml-auto" style={{ width: `${pct}%`, background: "#16a34a" }} />
        ) : (
          <div className="mr-auto" style={{ width: `${pct}%`, background: "#dc2626" }} />
        )}
      </div>
      <span className={`text-xs font-mono font-semibold ${isPositive ? "text-emerald-600" : "text-red-500"}`}>
        {value >= 0 ? "+" : ""}{(value * 100).toFixed(0)}
      </span>
    </div>
  );
}

function WinRateBar({ rate, recent }: { rate: number; recent: number }) {
  const delta = recent - rate;
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${rate * 100}%` }} />
      </div>
      <span className="text-xs font-bold w-10 text-right">{(rate * 100).toFixed(0)}%</span>
      {Math.abs(delta) > 0.02 && (
        <span className={`text-xs flex items-center gap-0.5 ${delta > 0 ? "text-emerald-600" : "text-red-500"}`}>
          {delta > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {Math.abs(delta * 100).toFixed(0)}%
        </span>
      )}
    </div>
  );
}

function TriageTimeline({ history }: { history: any[] }) {
  if (!history.length) return (
    <div className="text-xs text-gray-400 py-4 text-center">No history yet for this case.</div>
  );
  return (
    <div className="relative">
      <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700" />
      <div className="space-y-3">
        {history.map((m, idx) => {
          const isLast = idx === history.length - 1;
          return (
            <div key={idx} className="flex gap-3 relative pl-10" data-testid={`temporal-entry-${idx}`}>
              <div className={`absolute left-2.5 top-1.5 w-3 h-3 rounded-full border-2 border-white dark:border-gray-900 ${
                m.triage === "emergency" ? "bg-red-500" :
                m.triage === "urgent" ? "bg-orange-400" :
                m.triage === "semi-urgent" ? "bg-yellow-400" : "bg-emerald-400"
              }`} />
              <div className={`flex-1 rounded-lg p-3 ${isLast ? "bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800" : "bg-gray-50 dark:bg-gray-900"}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Iteration #{m.iteration}</span>
                    <RiskBadge level={m.triage} />
                    {m.changedFromPrior && (
                      <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">Changed</Badge>
                    )}
                    {isLast && <Badge className="text-xs bg-blue-500 text-white">Latest</Badge>}
                  </div>
                  <span className="text-xs text-gray-400">{new Date(m.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="grid grid-cols-3 gap-x-4 text-xs text-gray-600 dark:text-gray-400">
                  <span>Urgency: <strong>{(m.urgencyScore * 100).toFixed(0)}%</strong></span>
                  <span>Uncertainty: <strong>{(m.uncertainty * 100).toFixed(0)}%</strong></span>
                  <span>Winner: <strong className="font-mono">{m.winnerAgent}</strong></span>
                </div>
                <div className="text-xs text-gray-500 mt-0.5">Dx: {m.topDiagnosis}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function BrainCommandCenter() {
  const [activeTab, setActiveTab] = useState("command");
  const [selectedCase, setSelectedCase] = useState<string>("");

  const { data: snapshot, isLoading, refetch } = useQuery({
    queryKey: ["/api/mission/snapshot"],
    refetchInterval: 6000,
  });

  const { data: caseData } = useQuery({
    queryKey: ["/api/mission/case-memory", selectedCase],
    queryFn: () => selectedCase ? fetch(`/api/mission/case-memory/${selectedCase}`).then(r => r.json()) : null,
    enabled: !!selectedCase,
    refetchInterval: selectedCase ? 5000 : false,
  });

  const metaLearnMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/learning/meta-learn"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/mission/snapshot"] }),
  });

  const snap = (snapshot as any) ?? {};
  const grid = snap.commandGrid ?? [];
  const highRisk = snap.highRiskPatients ?? [];
  const agents = snap.agents ?? [];
  const liveAgents = snap.liveAgentPerformance ?? {};
  const driftEvents = snap.driftEvents ?? [];
  const qaStats = snap.qaStats ?? {};
  const qaHistory = snap.qa ?? [];
  const cognitive = snap.cognitiveHistory ?? [];
  const thresholds = snap.systemThresholds ?? {};
  const shapHistory = snap.shapHistory ?? [];
  const activeCases = snap.activeCases ?? [];
  const engineReliability: any[] = snap.engineReliability ?? [];
  const engineHealth = snap.engineHealth ?? { healthy: 0, degraded: 0, critical: 0, total: 0 };

  const totalPatients = grid.length;
  const criticalCount = grid.filter((p: any) => p.triageLevel === "emergency" || p.triageLevel === "critical").length;
  const escalationCount = grid.filter((p: any) => p.escalation).length;

  const caseMemory = (caseData as any)?.memory ?? [];
  const caseShap = (caseData as any)?.shap ?? [];
  const latestShap = caseShap.length ? caseShap[caseShap.length - 1] : null;

  const liveAgentList = (liveAgents as any)?.agents ?? [];
  const topAgent = (liveAgents as any)?.topAgent ?? "—";

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" data-testid="brain-command-center">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-purple-100 dark:bg-purple-950">
            <BrainCircuit className="h-6 w-6 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Brain Command Center</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Multi-agent cognition · SHAP explainability · Drift detection · Temporal reasoning
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            data-testid="btn-refresh-snapshot"
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => metaLearnMutation.mutate()}
            disabled={metaLearnMutation.isPending}
            data-testid="btn-meta-learn"
          >
            <Zap className="h-4 w-4 mr-1" />
            {metaLearnMutation.isPending ? "Learning..." : "Run Meta-Learning"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card data-testid="stat-total-patients">
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="h-8 w-8 text-blue-500" />
            <div>
              <div className="text-2xl font-bold">{totalPatients}</div>
              <div className="text-xs text-gray-500">Active Patients</div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="stat-critical-patients">
          <CardContent className="p-4 flex items-center gap-3">
            <Siren className="h-8 w-8 text-red-500" />
            <div>
              <div className="text-2xl font-bold text-red-600">{criticalCount}</div>
              <div className="text-xs text-gray-500">Critical / Emergency</div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="stat-escalations">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 text-orange-500" />
            <div>
              <div className="text-2xl font-bold text-orange-600">{escalationCount}</div>
              <div className="text-xs text-gray-500">Active Escalations</div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="stat-top-agent">
          <CardContent className="p-4 flex items-center gap-3">
            <Trophy className="h-8 w-8 text-yellow-500" />
            <div>
              <div className="text-sm font-bold text-yellow-600 truncate max-w-[100px]">{topAgent.replace(/_/g, " ")}</div>
              <div className="text-xs text-gray-500">Top Agent (win rate)</div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="stat-engine-health">
          <CardContent className="p-4 flex items-center gap-3">
            <Cpu className={`h-8 w-8 ${engineHealth.critical > 0 ? "text-red-500" : engineHealth.degraded > 0 ? "text-orange-400" : "text-emerald-500"}`} />
            <div>
              <div className="flex items-center gap-1">
                <span className="text-lg font-bold text-emerald-600">{engineHealth.healthy}</span>
                <span className="text-xs text-gray-400">/ {engineHealth.total}</span>
              </div>
              <div className="text-xs text-gray-500">Engines Healthy</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap gap-1">
          <TabsTrigger value="command" data-testid="tab-command">Command Grid</TabsTrigger>
          <TabsTrigger value="cognitive" data-testid="tab-cognitive">Cognitive Stream</TabsTrigger>
          <TabsTrigger value="questions" data-testid="tab-questions">
            <HelpCircle className="h-3.5 w-3.5 mr-1" />
            Next Questions
          </TabsTrigger>
          <TabsTrigger value="why-won" data-testid="tab-why-won">
            <Sparkles className="h-3.5 w-3.5 mr-1" />
            Why This Won
          </TabsTrigger>
          <TabsTrigger value="temporal" data-testid="tab-temporal">
            <Clock className="h-3.5 w-3.5 mr-1" />
            Temporal View
          </TabsTrigger>
          <TabsTrigger value="agents" data-testid="tab-agents">
            <BarChart3 className="h-3.5 w-3.5 mr-1" />
            Agent Performance
          </TabsTrigger>
          <TabsTrigger value="engine-health" data-testid="tab-engine-health">
            <Cpu className="h-3.5 w-3.5 mr-1" />
            Engine Health
          </TabsTrigger>
          <TabsTrigger value="qa" data-testid="tab-qa">QA Audit</TabsTrigger>
          <TabsTrigger value="thresholds" data-testid="tab-thresholds">Meta-Learning</TabsTrigger>
          <TabsTrigger value="hospital-brain" data-testid="tab-hospital-brain">Hospital Brain</TabsTrigger>
        </TabsList>

        <TabsContent value="command" className="mt-4">
          {isLoading ? (
            <div className="text-center py-16 text-gray-400" data-testid="loading-command">Loading command grid...</div>
          ) : grid.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center text-gray-400" data-testid="empty-command">
                No active patients in the command grid. Process a case through the telemedicine assistant to see it appear here.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {grid.map((node: any) => (
                <Card key={node.caseId} className={`border-l-4 ${node.triageLevel === "emergency" || node.triageLevel === "critical" ? "border-l-red-500" : node.triageLevel === "urgent" ? "border-l-orange-400" : "border-l-emerald-400"}`} data-testid={`grid-node-${node.caseId}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            Case: <span className="font-mono text-xs">{node.caseId}</span>
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">{node.complaint}</div>
                        </div>
                        <RiskBadge level={node.triageLevel} />
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <TrendIcon trend={node.trajectory} />
                          <span>{node.trajectory}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="text-xs text-gray-400">Risk</div>
                          <div className="text-sm font-bold">{(node.riskScore * 100).toFixed(0)}%</div>
                        </div>
                        {node.escalation && (
                          <Badge variant="destructive" className="text-xs">
                            {node.escalation}
                          </Badge>
                        )}
                        <div className="text-right">
                          <div className="text-xs text-gray-400">Iteration</div>
                          <div className="text-sm font-medium">#{node.iteration}</div>
                        </div>
                        <div className="w-24">
                          <Progress value={node.riskScore * 100} className="h-2" />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="cognitive" className="mt-4">
          <div className="space-y-2">
            {cognitive.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-gray-400" data-testid="empty-cognitive">
                  No cognitive events yet. Run a case through the telemedicine assistant to populate this stream.
                </CardContent>
              </Card>
            ) : (
              cognitive.map((ev: any, idx: number) => (
                <Card key={idx} data-testid={`cognitive-event-${idx}`}>
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Radio className="h-3.5 w-3.5 text-purple-400 shrink-0 mt-0.5" />
                        <Badge variant="outline" className="text-xs">
                          {ev.topic}
                        </Badge>
                        {ev.payload?.safetyGovernorOverride && (
                          <Badge className="text-xs bg-red-600 text-white">Safety Override</Badge>
                        )}
                        {ev.payload?.fusionPriority && (
                          <Badge variant="outline" className="text-xs text-purple-600 border-purple-300">
                            Fusion: {ev.payload.fusionPriority}
                          </Badge>
                        )}
                        {ev.caseId && (
                          <span className="text-xs text-gray-400 font-mono">{ev.caseId}</span>
                        )}
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">
                        {new Date(ev.ts).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="mt-2 pl-6 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-300">
                      {ev.payload && Object.entries(ev.payload).slice(0, 8).map(([k, v]) => (
                        <div key={k} className="flex gap-1">
                          <span className="text-gray-400">{k}:</span>
                          <span className="font-medium">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="questions" className="mt-4 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-blue-500" />
                Next-Best-Question Panel
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">Questions ranked by information gain — the system's best move to reduce uncertainty</p>
            </div>
          </div>

          {shapHistory.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-gray-400" data-testid="empty-questions">
                No cases processed yet. Run a case to see ranked follow-up questions.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {shapHistory.slice().reverse().slice(0, 5).map((entry: any, entryIdx: number) => (
                <Card key={entryIdx} data-testid={`question-entry-${entryIdx}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-gray-400">{entry.caseId}</span>
                        <RiskBadge level={entry.triage} />
                        {entry.safetyGovernorOverride && (
                          <Badge className="text-xs bg-red-600 text-white">Safety Override</Badge>
                        )}
                      </div>
                      <span className="text-xs text-gray-400">{new Date(entry.ts).toLocaleTimeString()}</span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {cognitive.filter((ev: any) => ev.caseId === entry.caseId).slice(-1).map((ev: any) => {
                      const shouldRequery = ev.payload?.requery;
                      return null;
                    })}
                    <div className="text-xs text-gray-500 mb-3 italic">
                      Questions the system would ask next to best reduce clinical uncertainty:
                    </div>
                    <div className="space-y-2">
                      {[1, 2, 3].map((rank) => {
                        const q = null;
                        return (
                          <div key={rank} className={`flex items-start gap-3 p-3 rounded-lg ${rank === 1 ? "bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800" : "bg-gray-50 dark:bg-gray-900"}`}>
                            <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${rank === 1 ? "bg-blue-500 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-600"}`}>
                              {rank}
                            </div>
                            <div className="flex-1">
                              <div className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                {rank === 1 ? "Highest information gain question — ask this first" :
                                 rank === 2 ? "Secondary clarifying question" :
                                 "Tertiary disambiguation question"}
                              </div>
                              <div className="text-xs text-gray-400 mt-0.5">
                                Info gain: — · Target: diagnosis/triage
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="mt-2">
            <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Lightbulb className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-sm font-semibold text-blue-800 dark:text-blue-200">Re-Query Intelligence</div>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      When uncertainty exceeds 55%, consensus falls below 45%, or agent disagreement exceeds 25%,
                      the system automatically selects the question that would most reduce clinical ambiguity.
                      The question is ranked by expected information gain across the differential.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Gauge className="h-4 w-4 text-purple-500" />
                Live Re-Query Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-xs">
                {cognitive.slice(0, 5).map((ev: any, idx: number) => ev.payload?.requery !== undefined && (
                  <div key={idx} className={`p-3 rounded-lg border ${ev.payload.requery ? "bg-orange-50 border-orange-200 dark:bg-orange-950 dark:border-orange-800" : "bg-gray-50 border-gray-200 dark:bg-gray-900 dark:border-gray-800"}`}>
                    <div className="font-mono text-gray-400 truncate">{ev.caseId}</div>
                    <div className={`font-bold mt-1 ${ev.payload.requery ? "text-orange-600" : "text-emerald-600"}`}>
                      {ev.payload.requery ? "Re-query triggered" : "No re-query needed"}
                    </div>
                    {ev.payload.qaScore != null && (
                      <div className="text-gray-500 mt-0.5">QA: {(ev.payload.qaScore * 100).toFixed(0)}%</div>
                    )}
                  </div>
                ))}
                {cognitive.filter((ev: any) => ev.payload?.requery !== undefined).length === 0 && (
                  <div className="col-span-3 text-gray-400 text-center py-4">
                    No re-query decisions logged yet.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="why-won" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-yellow-500" />
                Why This Won — SHAP Explanation
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">Factor-by-factor breakdown of why each decision was made</p>
            </div>
            {activeCases.length > 0 && (
              <Select value={selectedCase} onValueChange={setSelectedCase} data-testid="select-case-shap">
                <SelectTrigger className="w-52 text-xs" data-testid="select-trigger-case">
                  <SelectValue placeholder="Select a case…" />
                </SelectTrigger>
                <SelectContent>
                  {activeCases.map((cid: string) => (
                    <SelectItem key={cid} value={cid} data-testid={`select-case-${cid}`}>{cid}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {shapHistory.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-gray-400" data-testid="empty-shap">
                No SHAP explanations yet. Process a case to see factor attribution.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {(selectedCase && latestShap ? [latestShap] : shapHistory.slice().reverse().slice(0, 3)).map((entry: any, idx: number) => {
                const exp = entry.explanation;
                if (!exp) return null;
                return (
                  <Card key={idx} className={`border-l-4 ${entry.triage === "emergency" ? "border-l-red-500" : entry.triage === "urgent" ? "border-l-orange-400" : "border-l-emerald-400"}`} data-testid={`shap-entry-${idx}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Trophy className="h-4 w-4 text-yellow-500" />
                          <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                            Winner: <span className="font-mono">{exp.winner}</span>
                          </span>
                          <Badge variant="outline" className="text-xs capitalize">{exp.winnerDomain}</Badge>
                          <RiskBadge level={entry.triage} />
                          {entry.safetyGovernorOverride && (
                            <Badge className="text-xs bg-red-600 text-white">Safety Governor Override</Badge>
                          )}
                        </div>
                        <span className="text-xs text-gray-400">{new Date(entry.ts).toLocaleTimeString()}</span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                        <div className="text-xs font-semibold text-amber-800 dark:text-amber-200 mb-1 flex items-center gap-1">
                          <Eye className="h-3.5 w-3.5" />
                          Narrative Explanation
                        </div>
                        <p className="text-xs text-amber-700 dark:text-amber-300">{exp.narrative}</p>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>Base score: <strong>{(exp.baseScore * 100).toFixed(0)}</strong></span>
                        <span className="text-gray-300">→</span>
                        <span>Final score: <strong className="text-gray-900 dark:text-gray-100">{(exp.finalScore * 100).toFixed(0)}</strong></span>
                        <div className="flex-1">
                          <Progress value={exp.finalScore * 100} className="h-1.5" />
                        </div>
                      </div>

                      <div>
                        <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Factor Attribution</div>
                        <div className="space-y-2">
                          {(exp.factors ?? []).map((f: any, fi: number) => (
                            <div key={fi} className="flex items-center gap-3" data-testid={`shap-factor-${fi}`}>
                              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${f.direction === "for" ? "bg-emerald-500" : f.direction === "against" ? "bg-red-500" : "bg-gray-300"}`} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2 mb-0.5">
                                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{f.name}</span>
                                  <ContribBar value={f.contribution} />
                                </div>
                                <div className="text-xs text-gray-400 truncate">{f.description}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="temporal" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Clock className="h-4 w-4 text-indigo-500" />
                Temporal Decision View
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">How the clinical decision evolved across iterations for a given case</p>
            </div>
            {activeCases.length > 0 && (
              <Select value={selectedCase} onValueChange={setSelectedCase} data-testid="select-case-temporal">
                <SelectTrigger className="w-52 text-xs" data-testid="select-trigger-temporal">
                  <SelectValue placeholder="Select a case to trace…" />
                </SelectTrigger>
                <SelectContent>
                  {activeCases.map((cid: string) => (
                    <SelectItem key={cid} value={cid} data-testid={`temporal-case-${cid}`}>{cid}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {!selectedCase ? (
            <Card>
              <CardContent className="py-10 text-center text-gray-400" data-testid="temporal-no-case">
                Select a case above to view its decision timeline.
              </CardContent>
            </Card>
          ) : caseMemory.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-gray-400" data-testid="temporal-empty">
                No history found for case <span className="font-mono">{selectedCase}</span>.
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Card data-testid="temporal-stat-iterations">
                  <CardContent className="p-3 text-center">
                    <div className="text-2xl font-bold">{caseMemory.length}</div>
                    <div className="text-xs text-gray-500">Iterations</div>
                  </CardContent>
                </Card>
                <Card data-testid="temporal-stat-changes">
                  <CardContent className="p-3 text-center">
                    <div className="text-2xl font-bold text-orange-600">
                      {caseMemory.filter((m: any) => m.changedFromPrior).length}
                    </div>
                    <div className="text-xs text-gray-500">Decision Changes</div>
                  </CardContent>
                </Card>
                <Card data-testid="temporal-stat-final">
                  <CardContent className="p-3 text-center">
                    <RiskBadge level={caseMemory[caseMemory.length - 1]?.triage ?? "—"} />
                    <div className="text-xs text-gray-500 mt-1">Final Triage</div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Decision Timeline — <span className="font-mono text-xs">{selectedCase}</span></CardTitle>
                </CardHeader>
                <CardContent>
                  <TriageTimeline history={caseMemory} />
                </CardContent>
              </Card>

              {caseShap.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-yellow-500" />
                      SHAP History for this Case
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {caseShap.map((s: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-3 text-xs border rounded-lg p-2" data-testid={`case-shap-${idx}`}>
                          <span className="text-gray-400 font-mono">Iter #{s.iteration}</span>
                          <RiskBadge level={s.triage} />
                          <span className="text-gray-600 dark:text-gray-300 flex-1 truncate">{s.explanation?.narrative}</span>
                          <span className="text-gray-400 shrink-0">{new Date(s.ts).toLocaleTimeString()}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="agents" className="mt-4 space-y-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-blue-500" />
              Live Agent Performance
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">Win rate, recent trend, and drift detection per agent</p>
          </div>

          {liveAgentList.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-gray-400" data-testid="empty-live-agents">
                No agent performance data yet. Process cases to begin tracking win rates.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {liveAgentList.map((a: any, idx: number) => (
                <Card key={a.agentId} className={a.driftAlert ? "border-orange-300 dark:border-orange-700" : ""} data-testid={`live-agent-perf-${a.agentId}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 w-48 shrink-0">
                        <span className="text-xs text-gray-400">#{idx + 1}</span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                          {a.agentId.replace(/_/g, " ")}
                        </span>
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0 capitalize">{a.domain}</Badge>
                      <WinRateBar rate={a.winRate} recent={a.recentWinRate} />
                      <div className="flex items-center gap-2 shrink-0">
                        {a.trend === "rising" ? (
                          <span className="flex items-center gap-0.5 text-xs text-emerald-600">
                            <TrendingUp className="h-3 w-3" /> Rising
                          </span>
                        ) : a.trend === "falling" ? (
                          <span className="flex items-center gap-0.5 text-xs text-red-500">
                            <TrendingDown className="h-3 w-3" /> Falling
                          </span>
                        ) : (
                          <span className="flex items-center gap-0.5 text-xs text-gray-400">
                            <Minus className="h-3 w-3" /> Stable
                          </span>
                        )}
                        {a.driftAlert && (
                          <Badge className="text-xs bg-orange-500 text-white flex items-center gap-0.5">
                            <TriangleAlert className="h-3 w-3" />
                            Drift
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 shrink-0">
                        {a.wins}W / {a.total - a.wins}L
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {driftEvents.length > 0 && (
            <Card className="border-orange-200 dark:border-orange-800">
              <CardHeader>
                <CardTitle className="text-sm text-orange-700 dark:text-orange-400 flex items-center gap-2">
                  <TriangleAlert className="h-4 w-4" />
                  Drift Events Detected
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {driftEvents.map((d: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-3 text-xs border border-orange-200 dark:border-orange-800 rounded-lg p-2 bg-orange-50 dark:bg-orange-950/40" data-testid={`drift-event-${idx}`}>
                      <span className={`font-bold ${d.direction === "rising" ? "text-emerald-600" : "text-red-600"}`}>
                        {d.direction === "rising" ? "↑" : "↓"} {d.direction}
                      </span>
                      <span className="font-mono text-gray-600 dark:text-gray-300">{d.agentId}</span>
                      <span className="text-gray-500">
                        Recent: {(d.windowWinRate * 100).toFixed(0)}% vs Overall: {(d.overallWinRate * 100).toFixed(0)}%
                        (Δ{d.delta > 0 ? "+" : ""}{(d.delta * 100).toFixed(0)}%)
                      </span>
                      <span className="ml-auto text-gray-400">{new Date(d.detectedAt).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Layers className="h-4 w-4 text-gray-500" />
                Outcome-Based Agent Scores (Historical)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {agents.length === 0 ? (
                  <div className="text-xs text-gray-400 text-center py-4">
                    No outcome data yet. Ingest outcomes via <code className="font-mono">/api/telemed/outcome</code>.
                  </div>
                ) : (
                  agents.map((a: any, idx: number) => (
                    <div key={a.agentId} className="flex items-center justify-between text-xs border rounded p-2" data-testid={`agent-hist-${a.agentId}`}>
                      <span className="font-semibold text-gray-700 dark:text-gray-300">
                        #{idx + 1} {a.agentId.replace(/_/g, " ")}
                      </span>
                      <div className="flex gap-3 text-gray-500">
                        <span>Score: <strong>{a.score.toFixed(2)}</strong></span>
                        <span className="text-emerald-600">✓ {a.correct}</span>
                        <span className="text-red-500">✗ {a.incorrect}</span>
                        <span className="text-orange-400">↑ {a.overtriage}</span>
                        <span className="text-red-700">↓ {a.undertriage}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="engine-health" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Cpu className="h-4 w-4 text-indigo-500" />
                Engine Reliability Scorecard
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Real-time latency (p50/p95), failure rate, and call volume for all telemedicine intelligence engines
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Card data-testid="engine-stat-healthy" className="border-emerald-200 dark:border-emerald-800">
              <CardContent className="p-4 text-center">
                <CheckCircle2 className="h-7 w-7 text-emerald-500 mx-auto mb-1" />
                <div className="text-3xl font-bold text-emerald-600">{engineHealth.healthy}</div>
                <div className="text-xs text-gray-500">Healthy</div>
              </CardContent>
            </Card>
            <Card data-testid="engine-stat-degraded" className={engineHealth.degraded > 0 ? "border-orange-300 dark:border-orange-700" : ""}>
              <CardContent className="p-4 text-center">
                <AlertTriangle className="h-7 w-7 text-orange-400 mx-auto mb-1" />
                <div className="text-3xl font-bold text-orange-500">{engineHealth.degraded}</div>
                <div className="text-xs text-gray-500">Degraded</div>
              </CardContent>
            </Card>
            <Card data-testid="engine-stat-critical" className={engineHealth.critical > 0 ? "border-red-300 dark:border-red-700" : ""}>
              <CardContent className="p-4 text-center">
                <XCircle className="h-7 w-7 text-red-500 mx-auto mb-1" />
                <div className="text-3xl font-bold text-red-600">{engineHealth.critical}</div>
                <div className="text-xs text-gray-500">Critical</div>
              </CardContent>
            </Card>
          </div>

          {engineReliability.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-gray-400" data-testid="empty-engine-health">
                No engine data yet. Process a case to begin tracking latency and reliability.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {engineReliability.map((eng: any) => {
                const statusColor =
                  eng.status === "healthy" ? "border-l-emerald-500" :
                  eng.status === "degraded" ? "border-l-orange-400" :
                  eng.status === "critical" ? "border-l-red-500" : "border-l-gray-300";
                const statusBadgeClass =
                  eng.status === "healthy" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" :
                  eng.status === "degraded" ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400" :
                  eng.status === "critical" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" :
                  "bg-gray-100 text-gray-500";
                return (
                  <Card key={eng.engine} className={`border-l-4 ${statusColor}`} data-testid={`engine-row-${eng.engine}`}>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-4">
                        <div className="w-36 shrink-0">
                          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{eng.engine.replace(/_/g, " ")}</div>
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium mt-0.5 ${statusBadgeClass}`}>
                            {eng.status}
                          </span>
                        </div>

                        <div className="grid grid-cols-5 gap-3 flex-1 text-xs">
                          <div className="text-center" data-testid={`engine-calls-${eng.engine}`}>
                            <div className="font-bold text-gray-900 dark:text-gray-100">{eng.calls}</div>
                            <div className="text-gray-400">calls</div>
                          </div>
                          <div className="text-center" data-testid={`engine-p50-${eng.engine}`}>
                            <div className="font-bold text-blue-600">{eng.p50Ms}ms</div>
                            <div className="text-gray-400">p50</div>
                          </div>
                          <div className="text-center" data-testid={`engine-p95-${eng.engine}`}>
                            <div className={`font-bold ${eng.p95Ms > 200 ? "text-orange-500" : "text-gray-700 dark:text-gray-300"}`}>
                              {eng.p95Ms}ms
                            </div>
                            <div className="text-gray-400">p95</div>
                          </div>
                          <div className="text-center" data-testid={`engine-failure-${eng.engine}`}>
                            <div className={`font-bold ${eng.failureRate > 0.1 ? "text-red-500" : "text-gray-700 dark:text-gray-300"}`}>
                              {(eng.failureRate * 100).toFixed(0)}%
                            </div>
                            <div className="text-gray-400">fail rate</div>
                          </div>
                          <div className="text-center">
                            <div className="font-bold text-gray-700 dark:text-gray-300">{eng.avgLatencyMs}ms</div>
                            <div className="text-gray-400">avg</div>
                          </div>
                        </div>

                        <div className="w-32 shrink-0">
                          <div className="text-xs text-gray-400 mb-1 flex justify-between">
                            <span>p95 target</span>
                            <span className={eng.p95Ms > 500 ? "text-red-500" : eng.p95Ms > 200 ? "text-orange-400" : "text-emerald-600"}>
                              {eng.p95Ms > 500 ? "slow" : eng.p95Ms > 200 ? "ok" : "fast"}
                            </span>
                          </div>
                          <Progress
                            value={Math.min(100, (eng.p95Ms / 500) * 100)}
                            className="h-1.5"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Timer className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-blue-800 dark:text-blue-200">Reliability Thresholds</div>
                  <div className="grid grid-cols-3 gap-4 mt-2 text-xs text-blue-600 dark:text-blue-400">
                    <div>
                      <span className="font-bold text-emerald-600">Healthy:</span> failure rate &lt; 20%, p95 &lt; 500ms
                    </div>
                    <div>
                      <span className="font-bold text-orange-500">Degraded:</span> failure rate 20–50%
                    </div>
                    <div>
                      <span className="font-bold text-red-600">Critical:</span> failure rate ≥ 50%
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="qa" className="mt-4 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Card data-testid="qa-avg-score">
              <CardContent className="p-4">
                <div className="text-xs text-gray-500 mb-1">Average QA Score</div>
                <div className="text-3xl font-bold text-emerald-600">
                  {qaStats.avgScore != null ? `${(qaStats.avgScore * 100).toFixed(0)}%` : "—"}
                </div>
                <Progress value={(qaStats.avgScore ?? 0) * 100} className="h-2 mt-2" />
              </CardContent>
            </Card>
            <Card data-testid="qa-total-cases">
              <CardContent className="p-4">
                <div className="text-xs text-gray-500 mb-1">Total QA'd Cases</div>
                <div className="text-3xl font-bold">{qaStats.totalCases ?? 0}</div>
              </CardContent>
            </Card>
            <Card data-testid="qa-flag-counts">
              <CardContent className="p-4">
                <div className="text-xs text-gray-500 mb-2">Flag Distribution</div>
                {qaStats.flagCounts && Object.keys(qaStats.flagCounts).length > 0 ? (
                  <div className="space-y-1">
                    {Object.entries(qaStats.flagCounts).map(([type, count]) => (
                      <div key={type} className="flex justify-between text-xs">
                        <span className="text-gray-600">{type.replace(/_/g, " ")}</span>
                        <span className="font-semibold">{String(count)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-gray-400">No flags recorded yet</div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-2">
            {qaHistory.slice(0, 15).map((entry: any, idx: number) => (
              <Card key={idx} className={`border-l-4 ${entry.score < 0.5 ? "border-l-red-400" : entry.score < 0.8 ? "border-l-yellow-400" : "border-l-emerald-400"}`} data-testid={`qa-entry-${idx}`}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {entry.score >= 0.8 ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                      )}
                      <span className="text-xs font-mono text-gray-500">{entry.caseId}</span>
                      <span className="text-xs font-bold">{(entry.score * 100).toFixed(0)}%</span>
                    </div>
                    <span className="text-xs text-gray-400">
                      {new Date(entry.passedAt).toLocaleTimeString()}
                    </span>
                  </div>
                  {entry.flags?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {entry.flags.map((f: any, fi: number) => (
                        <span key={fi} className="inline-flex items-center gap-1 text-xs bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                          <SeverityDot severity={f.severity} />
                          {f.message}
                        </span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            {qaHistory.length === 0 && (
              <Card>
                <CardContent className="py-10 text-center text-gray-400" data-testid="empty-qa">
                  No QA events recorded yet. Process a case to begin auditing.
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="thresholds" className="mt-4">
          <div className="grid grid-cols-2 gap-4">
            <Card data-testid="threshold-escalation">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="h-4 w-4 text-orange-500" />
                  Escalation Threshold
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold">{thresholds.escalationThreshold != null ? `${(thresholds.escalationThreshold * 100).toFixed(0)}%` : "—"}</div>
                <p className="text-xs text-gray-400 mt-1">Risk score at which cases auto-escalate</p>
                <Progress value={(thresholds.escalationThreshold ?? 0.7) * 100} className="h-2 mt-3" />
              </CardContent>
            </Card>
            <Card data-testid="threshold-uncertainty">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <FlaskConical className="h-4 w-4 text-blue-500" />
                  Uncertainty Threshold
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold">{thresholds.uncertaintyThreshold != null ? `${(thresholds.uncertaintyThreshold * 100).toFixed(0)}%` : "—"}</div>
                <p className="text-xs text-gray-400 mt-1">Uncertainty level triggering re-query</p>
                <Progress value={(thresholds.uncertaintyThreshold ?? 0.55) * 100} className="h-2 mt-3" />
              </CardContent>
            </Card>
            <Card data-testid="threshold-requery">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-purple-500" />
                  Re-query Threshold
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold">{thresholds.requeryThreshold != null ? `${(thresholds.requeryThreshold * 100).toFixed(0)}%` : "—"}</div>
                <p className="text-xs text-gray-400 mt-1">Confidence below which agents re-query</p>
                <Progress value={(thresholds.requeryThreshold ?? 0.6) * 100} className="h-2 mt-3" />
              </CardContent>
            </Card>
            <Card data-testid="threshold-safety-boost">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Shield className="h-4 w-4 text-emerald-500" />
                  Safety Boost Factor
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold">{thresholds.safetyBoostFactor != null ? `×${thresholds.safetyBoostFactor.toFixed(2)}` : "—"}</div>
                <p className="text-xs text-gray-400 mt-1">Multiplier applied to safety signal weights</p>
                <Progress value={Math.min(100, ((thresholds.safetyBoostFactor ?? 1) / 2) * 100)} className="h-2 mt-3" />
              </CardContent>
            </Card>
          </div>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-500" />
                Meta-Learning Engine
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Meta-learning automatically adjusts system thresholds based on observed agent performance patterns.
                It detects under-triage patterns (lowers escalation threshold) and over-triage patterns (raises threshold).
              </p>
              <Button
                onClick={() => metaLearnMutation.mutate()}
                disabled={metaLearnMutation.isPending}
                data-testid="btn-run-meta-learn"
                size="sm"
              >
                <Zap className="h-4 w-4 mr-2" />
                {metaLearnMutation.isPending ? "Adapting..." : "Run Threshold Adaptation"}
              </Button>
              {(metaLearnMutation as any).data && (
                <div className="text-xs text-emerald-600 font-medium mt-2">
                  Thresholds updated — refresh to see new values.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hospital-brain" className="mt-4">
          <HospitalBrainPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
