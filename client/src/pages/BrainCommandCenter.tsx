import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  BrainCircuit, AlertTriangle, Activity, CheckCircle2, Layers,
  TrendingUp, TrendingDown, Minus, Users, Zap, RefreshCw,
  Shield, FlaskConical, GitBranch, Target, Radio, Siren,
} from "lucide-react";

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

export default function BrainCommandCenter() {
  const [activeTab, setActiveTab] = useState("command");

  const { data: snapshot, isLoading, refetch } = useQuery({
    queryKey: ["/api/mission/snapshot"],
    refetchInterval: 6000,
  });

  const metaLearnMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/learning/meta-learn"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/mission/snapshot"] }),
  });

  const snap = (snapshot as any) ?? {};
  const grid = snap.commandGrid ?? [];
  const highRisk = snap.highRiskPatients ?? [];
  const agents = snap.agents ?? [];
  const qaStats = snap.qaStats ?? {};
  const qaHistory = snap.qa ?? [];
  const cognitive = snap.cognitiveHistory ?? [];
  const thresholds = snap.systemThresholds ?? {};

  const totalPatients = grid.length;
  const criticalCount = grid.filter((p: any) => p.triageLevel === "emergency" || p.triageLevel === "critical").length;
  const escalationCount = grid.filter((p: any) => p.escalation).length;

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
              Multi-agent cognitive intelligence · QA · Trajectory · Digital Twin · RLHF
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
        <Card data-testid="stat-qa-score">
          <CardContent className="p-4 flex items-center gap-3">
            <Shield className="h-8 w-8 text-emerald-500" />
            <div>
              <div className="text-2xl font-bold text-emerald-600">{qaStats.avgScore != null ? `${(qaStats.avgScore * 100).toFixed(0)}%` : "—"}</div>
              <div className="text-xs text-gray-500">QA Score (avg)</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="command" data-testid="tab-command">Command Grid</TabsTrigger>
          <TabsTrigger value="cognitive" data-testid="tab-cognitive">Cognitive Stream</TabsTrigger>
          <TabsTrigger value="qa" data-testid="tab-qa">QA Audit</TabsTrigger>
          <TabsTrigger value="agents" data-testid="tab-agents">Agent Performance</TabsTrigger>
          <TabsTrigger value="thresholds" data-testid="tab-thresholds">Meta-Learning</TabsTrigger>
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

        <TabsContent value="agents" className="mt-4">
          <div className="space-y-3">
            {agents.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-gray-400" data-testid="empty-agents">
                  No agent performance data yet. Ingest outcomes via <code className="font-mono text-xs">/api/telemed/outcome</code> to see rankings.
                </CardContent>
              </Card>
            ) : (
              agents.map((a: any, idx: number) => (
                <Card key={a.agentId} data-testid={`agent-perf-${a.agentId}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          #{idx + 1} {a.agentId.replace(/_/g, " ")}
                        </div>
                        <Badge variant={a.score > 0 ? "default" : "destructive"} className="text-xs">
                          Score: {a.score.toFixed(2)}
                        </Badge>
                      </div>
                      <div className="flex gap-4 text-xs text-gray-500">
                        <span>Total: <strong>{a.total}</strong></span>
                        <span className="text-emerald-600">✓ {a.correct}</span>
                        <span className="text-red-500">✗ {a.incorrect}</span>
                        <span className="text-orange-400">↑ {a.overtriage}</span>
                        <span className="text-red-700">↓ {a.undertriage}</span>
                      </div>
                    </div>
                    <Progress value={Math.max(0, ((a.score + 1) / 2) * 100)} className="h-1.5 mt-2" />
                  </CardContent>
                </Card>
              ))
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
      </Tabs>
    </div>
  );
}
