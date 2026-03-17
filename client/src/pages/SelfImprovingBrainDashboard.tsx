import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Brain, AlertTriangle, Shield, Users, Database, Rocket, RefreshCw, CheckCircle, XCircle, Wrench } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

function ImprovementCycleTab() {
  const { data, isLoading, refetch } = useQuery<any>({ queryKey: ["/api/self-improving/cycle"] });

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Running improvement cycle...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Latest Improvement Cycle</h3>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-run-cycle">
          <RefreshCw className="h-3 w-3 mr-1" /> Re-Run Cycle
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold" data-testid="text-failure-count">{data?.failures?.length || 0}</div>
            <div className="text-xs text-muted-foreground">Predictive Risks</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold" data-testid="text-debug-count">{data?.debugActions?.length || 0}</div>
            <div className="text-xs text-muted-foreground">Debug Actions</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold">{data?.agentStatus?.activeTasks?.length || 0}</div>
            <div className="text-xs text-muted-foreground">Active Agents</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold">{data?.memorySnapshot?.totalEntries || 0}</div>
            <div className="text-xs text-muted-foreground">Memory Entries</div>
          </CardContent>
        </Card>
      </div>

      {data?.recommendations?.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">AI Recommendations</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2" data-testid="improvement-recommendations">
              {data.recommendations.map((r: string, i: number) => (
                <div key={i} className="text-sm p-3 rounded border bg-muted/30 flex items-start gap-2" data-testid={`recommendation-${i}`}>
                  <Brain className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <span>{r}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {data?.rootCause?.rootCause && (
        <Card className="border-orange-200 dark:border-orange-800">
          <CardHeader><CardTitle className="text-sm">Root Cause Analysis</CardTitle></CardHeader>
          <CardContent>
            <div className="text-sm">
              <span className="font-medium">Primary source:</span>{" "}
              <Badge variant="outline" data-testid="text-root-cause">{data.rootCause.rootCause}</Badge>
            </div>
            {data.rootCause.patterns?.map((p: string, i: number) => (
              <div key={i} className="text-sm text-orange-600 dark:text-orange-400 mt-1">{p}</div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PredictiveFailuresTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/predictive-failures"] });
  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Analyzing failure patterns...</div>;

  const riskColor: Record<string, string> = {
    low: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    high: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    critical: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-4 text-center">
          <div className="text-3xl font-bold" data-testid="text-services-monitored">{data?.totalServices || 0}</div>
          <div className="text-xs text-muted-foreground">Services Monitored</div>
        </CardContent>
      </Card>

      {data?.risks?.length > 0 ? (
        <Card>
          <CardHeader><CardTitle className="text-sm">Active Risks</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3" data-testid="risk-list">
              {data.risks.map((r: any, i: number) => (
                <div key={i} className="border rounded-lg p-3 space-y-2" data-testid={`risk-${i}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{r.service}</span>
                    <Badge className={riskColor[r.risk]}>{r.risk.toUpperCase()}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{r.reason}</p>
                  <p className="text-xs text-orange-600 dark:text-orange-400">{r.prediction}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card><CardContent className="pt-4 text-center text-green-600">No active failure risks detected</CardContent></Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-sm">Service Metrics History</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2" data-testid="service-history">
            {Object.entries(data?.history || {}).map(([service, metrics]: [string, any]) => (
              <div key={service} className="flex items-center gap-3 p-2 rounded bg-muted/30">
                <span className="flex-1 text-sm font-medium">{service}</span>
                <span className="text-xs font-mono">{metrics.points} pts</span>
                <span className="text-xs font-mono">{metrics.avgLatency}ms avg</span>
                <Badge variant="outline" className="text-xs">{(metrics.errorRate * 100).toFixed(1)}% err</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AutoDebuggerTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/auto-debugger/actions"] });
  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Loading debug actions...</div>;

  const typeIcon: Record<string, any> = {
    restart: <RefreshCw className="h-3 w-3" />,
    alert: <AlertTriangle className="h-3 w-3" />,
    adjust: <Wrench className="h-3 w-3" />,
    reroute: <Shield className="h-3 w-3" />,
    fix: <CheckCircle className="h-3 w-3" />,
  };

  const sevColor: Record<string, string> = {
    info: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    warning: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    critical: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold" data-testid="text-total-debug-actions">{data?.summary?.totalActions || 0}</div>
            <div className="text-xs text-muted-foreground">Total Actions</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold text-red-600">{data?.summary?.bySeverity?.critical || 0}</div>
            <div className="text-xs text-muted-foreground">Critical</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold text-yellow-600">{data?.summary?.bySeverity?.warning || 0}</div>
            <div className="text-xs text-muted-foreground">Warning</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <Badge variant={data?.summary?.running ? "default" : "secondary"} className="text-lg px-3 py-1">
              {data?.summary?.running ? "ACTIVE" : "STOPPED"}
            </Badge>
            <div className="text-xs text-muted-foreground mt-1">Agent Status</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Debug Actions</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-[400px] overflow-y-auto" data-testid="debug-action-list">
            {data?.actions?.map((a: any, i: number) => (
              <div key={a.id || i} className="flex items-start gap-2 p-2 rounded bg-muted/30 text-sm" data-testid={`debug-action-${i}`}>
                <span className="mt-0.5">{typeIcon[a.type]}</span>
                <div className="flex-1">
                  <div className="font-medium">{a.target}</div>
                  <div className="text-xs text-muted-foreground">{a.details}</div>
                </div>
                <Badge className={`text-xs shrink-0 ${sevColor[a.severity] || ""}`}>{a.severity}</Badge>
              </div>
            ))}
            {(!data?.actions || data.actions.length === 0) && (
              <div className="text-center py-4 text-muted-foreground">No debug actions recorded</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AgentCoordinatorTab() {
  const { data: agents, isLoading: loadingAgents } = useQuery<any>({ queryKey: ["/api/agent-coordinator"] });
  const { data: memory, isLoading: loadingMemory } = useQuery<any>({ queryKey: ["/api/clinical-memory"] });

  if (loadingAgents || loadingMemory) return <div className="text-center py-12 text-muted-foreground">Loading agent status...</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold" data-testid="text-active-agents">{agents?.activeTasks?.length || 0}</div>
            <div className="text-xs text-muted-foreground">Active Tasks</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold text-green-600">{agents?.completedTasks || 0}</div>
            <div className="text-xs text-muted-foreground">Completed</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold">{agents?.agents?.length || 0}</div>
            <div className="text-xs text-muted-foreground">Agents</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold">{memory?.summary?.totalEntries || 0}</div>
            <div className="text-xs text-muted-foreground">Memory Entries</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Active Agent Tasks</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2" data-testid="agent-task-list">
            {agents?.activeTasks?.map((t: any, i: number) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded bg-muted/30" data-testid={`agent-task-${i}`}>
                <Users className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">{t.agent}</span>
                <span className="text-xs text-muted-foreground flex-1">{t.task.replace(/_/g, " ")}</span>
                <Badge variant="default" className="text-xs">Active</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {memory?.summary?.byType && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Memory Distribution</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2" data-testid="memory-types">
              {Object.entries(memory.summary.byType).map(([type, count]: [string, any]) => (
                <Badge key={type} variant="secondary" className="text-xs">
                  <Database className="h-3 w-3 mr-1" />
                  {type.replace(/_/g, " ")}: {count}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AutonomousDeployTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/autonomous-deploy/history"] });

  const deployMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/autonomous-deploy", { version: { id: `v_${Date.now()}`, status: "approved" } });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/autonomous-deploy/history"] });
    },
  });

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Loading deployment history...</div>;

  const statusColor: Record<string, string> = {
    approved: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    rejected: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    rolled_back: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="grid grid-cols-3 gap-4 flex-1 mr-4">
          <Card>
            <CardContent className="pt-4 text-center">
              <div className="text-3xl font-bold text-green-600" data-testid="text-deploy-approved">{data?.approved || 0}</div>
              <div className="text-xs text-muted-foreground">Approved</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <div className="text-3xl font-bold text-red-600">{data?.rejected || 0}</div>
              <div className="text-xs text-muted-foreground">Rejected</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <div className="text-3xl font-bold text-orange-600">{data?.rolledBack || 0}</div>
              <div className="text-xs text-muted-foreground">Rolled Back</div>
            </CardContent>
          </Card>
        </div>
        <Button onClick={() => deployMutation.mutate()} disabled={deployMutation.isPending} data-testid="button-deploy">
          <Rocket className="h-4 w-4 mr-1" /> Deploy
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Deployment History</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3" data-testid="deploy-history">
            {data?.history?.map((d: any, i: number) => (
              <div key={d.id || i} className="border rounded-lg p-3" data-testid={`deploy-${i}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm">{d.version}</span>
                  <Badge className={statusColor[d.result?.status] || ""}>{d.result?.status?.toUpperCase()}</Badge>
                </div>
                {d.result?.reason && <p className="text-xs text-muted-foreground mb-2">{d.result.reason}</p>}
                <div className="flex flex-wrap gap-1">
                  {d.result?.checks?.map((c: any, j: number) => (
                    <Badge key={j} variant="outline" className="text-xs">
                      {c.passed ? <CheckCircle className="h-2 w-2 mr-1 text-green-500" /> : <XCircle className="h-2 w-2 mr-1 text-red-500" />}
                      {c.name}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
            {(!data?.history || data.history.length === 0) && (
              <div className="text-center py-4 text-muted-foreground">No deployments yet</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SelfImprovingBrainDashboard() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-self-improving-title">Self-Improving Clinical Brain</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Predictive failure detection, auto-debugging, agent coordination, memory, and autonomous deployment
        </p>
      </div>

      <Tabs defaultValue="cycle" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="cycle" data-testid="tab-cycle">
            <Brain className="h-4 w-4 mr-1" /> Cycle
          </TabsTrigger>
          <TabsTrigger value="predictive" data-testid="tab-predictive">
            <AlertTriangle className="h-4 w-4 mr-1" /> Predict
          </TabsTrigger>
          <TabsTrigger value="debugger" data-testid="tab-debugger">
            <Wrench className="h-4 w-4 mr-1" /> Debug
          </TabsTrigger>
          <TabsTrigger value="agents" data-testid="tab-agents">
            <Users className="h-4 w-4 mr-1" /> Agents
          </TabsTrigger>
          <TabsTrigger value="deploy" data-testid="tab-deploy">
            <Rocket className="h-4 w-4 mr-1" /> Deploy
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cycle"><ImprovementCycleTab /></TabsContent>
        <TabsContent value="predictive"><PredictiveFailuresTab /></TabsContent>
        <TabsContent value="debugger"><AutoDebuggerTab /></TabsContent>
        <TabsContent value="agents"><AgentCoordinatorTab /></TabsContent>
        <TabsContent value="deploy"><AutonomousDeployTab /></TabsContent>
      </Tabs>
    </div>
  );
}
