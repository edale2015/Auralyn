import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Activity, Bot, AlertTriangle, CheckCircle, XCircle,
  Play, RefreshCw, Cpu, Zap, Shield, TrendingUp, Clock,
  FlaskConical, Search, ClipboardList, HeartPulse, BarChart3
} from "lucide-react";

function StatusDot({ status }: { status: string }) {
  const color = status === "healthy" ? "text-green-500"
    : status === "running" ? "text-blue-500 animate-pulse"
    : status === "error" ? "text-red-500"
    : status === "disabled" ? "text-gray-400"
    : "text-yellow-500";
  return <span className={`text-xl ${color}`} data-testid={`dot-${status}`}>●</span>;
}

function AgentsTab() {
  const { toast } = useToast();
  const { data, refetch, isLoading } = useQuery<any>({ queryKey: ["/api/engines/status"] });

  const runAgent = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", `/api/engines/run/${name}`);
      return res.json();
    },
    onSuccess: (result, name) => {
      queryClient.invalidateQueries({ queryKey: ["/api/engines/status"] });
      toast({ title: `Agent ${name} completed`, description: result.success ? `Done in ${result.durationMs}ms` : result.error });
    }
  });

  const runAll = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/engines/run-all");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/engines/status"] });
      toast({ title: "All agents executed" });
    }
  });

  const toggleAgent = useMutation({
    mutationFn: async ({ name, action }: { name: string; action: "enable" | "disable" }) => {
      const res = await apiRequest("POST", `/api/engines/agents/${name}/${action}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/engines/status"] });
    }
  });

  const agents: any[] = data?.agents ?? [];
  const stats = data?.stats;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><Bot className="h-4 w-4" /> Agent Control Panel</CardTitle>
            <div className="flex gap-2">
              <Button data-testid="button-refresh-agents" variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-3 w-3 mr-1" /> Refresh
              </Button>
              <Button data-testid="button-run-all" size="sm" onClick={() => runAll.mutate()} disabled={runAll.isPending}>
                <Play className="h-3 w-3 mr-1" /> {runAll.isPending ? "Running..." : "Run All"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {stats && (
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
              {[
                { label: "Total", value: stats.total, color: "" },
                { label: "Healthy", value: stats.healthy, color: "text-green-600" },
                { label: "Idle", value: stats.idle, color: "text-yellow-600" },
                { label: "Running", value: stats.running, color: "text-blue-600" },
                { label: "Error", value: stats.error, color: "text-red-600" },
                { label: "Disabled", value: stats.disabled, color: "text-gray-400" },
              ].map(s => (
                <div key={s.label} className="border rounded p-2 text-center">
                  <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-4">Loading agents...</p>
          ) : (
            <div className="space-y-2">
              {agents.map((agent: any) => (
                <div key={agent.name} className="flex items-center justify-between p-3 border rounded-lg" data-testid={`agent-row-${agent.name}`}>
                  <div className="flex items-center gap-3">
                    <StatusDot status={agent.status} />
                    <div>
                      <p className="font-medium text-sm">{agent.name}</p>
                      <p className="text-xs text-muted-foreground">{agent.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right text-xs text-muted-foreground hidden md:block">
                      <div>{agent.runCount} runs</div>
                      <div>{agent.avgDurationMs}ms avg</div>
                    </div>
                    <Badge variant="outline" className="text-xs">{agent.layer}</Badge>
                    <Button
                      data-testid={`button-run-${agent.name}`}
                      size="sm" variant="outline"
                      onClick={() => runAgent.mutate(agent.name)}
                      disabled={agent.status === "disabled" || runAgent.isPending}
                    >
                      <Play className="h-3 w-3" />
                    </Button>
                    <Button
                      data-testid={`button-toggle-${agent.name}`}
                      size="sm"
                      variant={agent.status === "disabled" ? "default" : "ghost"}
                      onClick={() => toggleAgent.mutate({ name: agent.name, action: agent.status === "disabled" ? "enable" : "disable" })}
                    >
                      {agent.status === "disabled" ? "Enable" : "Disable"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DiagnosticTab() {
  const { data, refetch } = useQuery<any>({ queryKey: ["/api/engines/diagnostic"] });

  const statusColor = (s: string) => s === "pass" ? "text-green-600" : s === "warn" ? "text-yellow-600" : "text-red-600";
  const statusIcon = (s: string) => s === "pass" ? <CheckCircle className="h-4 w-4 text-green-500" /> : s === "warn" ? <AlertTriangle className="h-4 w-4 text-yellow-500" /> : <XCircle className="h-4 w-4 text-red-500" />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4" /> System Diagnostic</CardTitle>
            <Button data-testid="button-refresh-diagnostic" variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-3 w-3 mr-1" /> Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {data && (
            <>
              <div className="flex items-center gap-3 mb-4 p-3 bg-muted/30 rounded-lg">
                <div className={`text-2xl font-bold ${data.status === "healthy" ? "text-green-600" : data.status === "degraded" ? "text-yellow-600" : "text-red-600"}`}>
                  {data.status?.toUpperCase()}
                </div>
                <div className="text-sm text-muted-foreground">
                  Memory: {data.metrics?.memoryUsedMb}MB · Uptime: {Math.round((data.metrics?.uptimeSeconds ?? 0) / 60)}m
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <h4 className="text-sm font-medium">Health Checks</h4>
                {data.checks?.map((c: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-sm" data-testid={`check-${c.name}`}>
                    {statusIcon(c.status)}
                    <span className="font-medium">{c.name}</span>
                    <span className={`text-xs ${statusColor(c.status)}`}>{c.message}</span>
                  </div>
                ))}
              </div>

              {data.alerts?.length > 0 && (
                <div className="space-y-1">
                  <h4 className="text-sm font-medium">Recent Alerts</h4>
                  {data.alerts.slice(-5).map((a: any, i: number) => (
                    <div key={i} className={`text-xs p-2 rounded ${a.level === "critical" ? "bg-red-50 dark:bg-red-900/20 text-red-700" : a.level === "warn" ? "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700" : "bg-muted/30"}`}>
                      [{a.level.toUpperCase()}] {a.message}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OrchestratorTab() {
  const { toast } = useToast();
  const { data: metrics, refetch } = useQuery<any>({ queryKey: ["/api/engines/orchestrator/metrics"] });
  const { data: log } = useQuery<any[]>({ queryKey: ["/api/engines/orchestrator/log"] });
  const [complaint, setComplaint] = useState("");
  const [answers, setAnswers] = useState("");

  const runFlow = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/engines/orchestrator/run", {
        complaint,
        answers: answers ? JSON.parse(answers) : {}
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/engines/orchestrator/metrics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/engines/orchestrator/log"] });
      toast({ title: data.success ? "Flow completed" : "Flow failed", description: `${data.latencyMs}ms · billing: ${data.billing?.icd10 ?? "N/A"}` });
    }
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><Cpu className="h-4 w-4" /> Master Clinical Orchestrator</CardTitle>
            <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-3 w-3 mr-1" />Refresh</Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            The unified pipeline: validate → scoring → billing → outcome logging → learning cycle → audit event.
          </p>
          {metrics && (
            <div className="grid grid-cols-4 gap-2 mb-4">
              <div className="border rounded p-2 text-center">
                <p className="text-lg font-bold">{metrics.totalFlows}</p>
                <p className="text-xs text-muted-foreground">Total Flows</p>
              </div>
              <div className="border rounded p-2 text-center">
                <p className="text-lg font-bold text-green-600">{Math.round((metrics.successRate ?? 0) * 100)}%</p>
                <p className="text-xs text-muted-foreground">Success Rate</p>
              </div>
              <div className="border rounded p-2 text-center">
                <p className="text-lg font-bold text-red-500">{Math.round((metrics.errorRate ?? 0) * 100)}%</p>
                <p className="text-xs text-muted-foreground">Error Rate</p>
              </div>
              <div className="border rounded p-2 text-center">
                <p className="text-lg font-bold">{metrics.avgLatencyMs}ms</p>
                <p className="text-xs text-muted-foreground">Avg Latency</p>
              </div>
            </div>
          )}

          <div className="space-y-2 mb-3">
            <Input data-testid="input-complaint" placeholder='Complaint (e.g. "sore throat fever 3 days")' value={complaint} onChange={e => setComplaint(e.target.value)} />
            <Input data-testid="input-answers" placeholder='Answers JSON (e.g. {"fever":"yes"}) — optional' value={answers} onChange={e => setAnswers(e.target.value)} />
          </div>
          <Button data-testid="button-run-flow" onClick={() => runFlow.mutate()} disabled={runFlow.isPending || !complaint}>
            <Play className="h-3 w-3 mr-1" /> {runFlow.isPending ? "Running..." : "Run Full Clinical Flow"}
          </Button>
        </CardContent>
      </Card>

      {log && log.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" /> Recent Flows</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {log.slice(-10).reverse().map((f: any) => (
                <div key={f.id} className="flex items-center justify-between p-2 border rounded text-sm" data-testid={`flow-${f.id}`}>
                  <div className="flex items-center gap-2">
                    {f.success ? <CheckCircle className="h-3 w-3 text-green-500" /> : <XCircle className="h-3 w-3 text-red-500" />}
                    <span className="font-medium">{f.complaint}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{f.latencyMs}ms</span>
                    <Badge variant={f.success ? "default" : "destructive"}>{f.success ? "success" : "error"}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SmsTab() {
  const { toast } = useToast();
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");

  const send = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/clinical/sms/send", { to, body: message });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: data.success ? "SMS sent" : "SMS failed", description: data.sid ?? data.error });
    }
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Zap className="h-4 w-4" /> SMS / WhatsApp Gateway</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Send outbound SMS or WhatsApp messages via Twilio. Configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER in environment secrets.
          </p>
          <div className="space-y-2 mb-3">
            <Input data-testid="input-sms-to" placeholder="+1234567890" value={to} onChange={e => setTo(e.target.value)} />
            <Input data-testid="input-sms-message" placeholder="Message body" value={message} onChange={e => setMessage(e.target.value)} />
          </div>
          <Button data-testid="button-send-sms" onClick={() => send.mutate()} disabled={send.isPending || !to || !message}>
            {send.isPending ? "Sending..." : "Send SMS"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function SystemHealthTab() {
  const [health, setHealth] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await fetch("/api/monitoring/health", {
          headers: { Authorization: `Bearer ${localStorage.getItem("app_auth_token")}` },
        });
        const data = await res.json();
        setHealth(data);
      } catch {}
      setLoading(false);
    };
    fetchHealth();
    const interval = setInterval(fetchHealth, 3000);
    return () => clearInterval(interval);
  }, []);

  const { data: prediction } = useQuery<any>({ queryKey: ["/api/monitoring/predict-failures"] });
  const { data: loopData } = useQuery<any>({ queryKey: ["/api/monitoring/health/detailed"] });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <HeartPulse className="h-4 w-4" /> Live Engine Health
            <Badge variant="outline" className="ml-auto text-xs">Auto-refresh 3s</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading engine health...</p>
          ) : Object.keys(health).length === 0 ? (
            <p className="text-sm text-muted-foreground">No engine logs yet. Run a clinical flow to populate.</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(health).map(([engine, stats]: [string, any]) => (
                <div key={engine} className="flex items-center gap-3 p-2 rounded-lg border bg-card" data-testid={`health-engine-${engine}`}>
                  <span className={`text-lg ${stats.error > 0 ? "text-red-500" : "text-green-500"}`}>●</span>
                  <span className="text-sm font-medium flex-1">{engine}</span>
                  <Badge variant="outline" className="text-xs">✓ {stats.healthy}</Badge>
                  {stats.error > 0 && <Badge variant="destructive" className="text-xs">✗ {stats.error}</Badge>}
                  {stats.warning > 0 && <Badge className="text-xs bg-yellow-500">⚠ {stats.warning}</Badge>}
                  <span className="text-xs text-muted-foreground">{stats.avgLatencyMs}ms avg</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {prediction && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Failure Prediction</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 mb-2">
              <Badge variant={prediction.unstable ? "destructive" : "default"}>
                {prediction.unstable ? "Unstable" : "Stable"}
              </Badge>
              <span className="text-sm">Error rate: <strong>{(prediction.errorRate * 100).toFixed(1)}%</strong></span>
            </div>
            <p className="text-sm text-muted-foreground">{prediction.recommendation}</p>
            {prediction.topFailingEngines?.length > 0 && (
              <div className="mt-2 space-y-1">
                {prediction.topFailingEngines.map((e: any) => (
                  <div key={e.engine} className="text-xs text-muted-foreground">
                    {e.engine}: {e.errorCount} errors ({(e.rate * 100).toFixed(0)}%)
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {loopData?.autonomousLoop && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><RefreshCw className="h-4 w-4" /> Autonomous Loop</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Badge variant={loopData.autonomousLoop.running ? "default" : "outline"}>
                {loopData.autonomousLoop.running ? "Running" : "Stopped"}
              </Badge>
              <span className="text-sm text-muted-foreground">Cycles completed: {loopData.autonomousLoop.cycleCount}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SimulationTab() {
  const { toast } = useToast();
  const [complaint, setComplaint] = useState("sore-throat");
  const [age, setAge] = useState("35");
  const [result, setResult] = useState<any>(null);

  const { data: history } = useQuery<any[]>({ queryKey: ["/api/simulation/history"] });

  const runSim = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/simulation/run", {
        complaint,
        answers: { age: Number(age), fever: true },
        channel: "web",
      });
      return res.json();
    },
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/simulation/history"] });
      toast({ title: data.success ? "Simulation complete" : "Simulation blocked", description: data.traceId ? `Trace: ${data.traceId?.slice(0, 8)}...` : data.error });
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><FlaskConical className="h-4 w-4" /> Digital Twin Simulation</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Run a simulated clinical flow through the full pipeline. Results are persisted to PostgreSQL.
          </p>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <Input data-testid="input-sim-complaint" placeholder="Complaint (e.g. sore-throat)" value={complaint} onChange={e => setComplaint(e.target.value)} />
            <Input data-testid="input-sim-age" placeholder="Patient age" value={age} onChange={e => setAge(e.target.value)} type="number" />
          </div>
          <Button data-testid="button-run-sim" onClick={() => runSim.mutate()} disabled={runSim.isPending || !complaint}>
            {runSim.isPending ? <><RefreshCw className="h-3 w-3 mr-1 animate-spin" />Running...</> : <><Play className="h-3 w-3 mr-1" />Run Simulation</>}
          </Button>

          {result && (
            <div className="mt-4 p-3 rounded-lg bg-muted space-y-2">
              <div className="flex gap-2">
                <Badge variant={result.success ? "default" : "destructive"}>{result.success ? "Success" : result.blocked ? "Blocked by Safety Gate" : "Error"}</Badge>
                {result.traceId && <Badge variant="outline" className="font-mono text-xs">Trace: {result.traceId.slice(0, 8)}...</Badge>}
                {result.safetyGate && <Badge variant={result.safetyGate.level === "HIGH" ? "destructive" : result.safetyGate.level === "MEDIUM" ? "secondary" : "default"}>{result.safetyGate.level}</Badge>}
              </div>
              {result.explanation && (
                <p className="text-sm text-muted-foreground">{result.explanation.summary}</p>
              )}
              {result.error && <p className="text-sm text-destructive">{result.error}</p>}
              <p className="text-xs text-muted-foreground">{result.latencyMs}ms · {result.timestamp}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {history && history.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Simulation History ({history.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {history.map((h: any) => (
                <div key={h.id} className="flex items-center gap-2 p-2 rounded border text-sm" data-testid={`sim-history-${h.id}`}>
                  <Badge variant={(h.result as any)?.success ? "default" : "destructive"} className="text-xs">
                    {(h.result as any)?.success ? "✓" : "✗"}
                  </Badge>
                  <span className="flex-1 font-mono text-xs text-muted-foreground">{(h.result as any)?.traceId?.slice(0, 8) ?? "—"}</span>
                  <span className="text-xs text-muted-foreground">{new Date(h.createdAt).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TraceTab() {
  const [traceId, setTraceId] = useState("");
  const [steps, setSteps] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const lookup = async () => {
    if (!traceId.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/audit/trace/${traceId.trim()}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("app_auth_token")}` },
      });
      setSteps(await res.json());
    } catch {
      setSteps([]);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Search className="h-4 w-4" /> Audit Trace Replay</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Enter a trace ID from a clinical flow to replay every step immutably stored in PostgreSQL.
          </p>
          <div className="flex gap-2 mb-4">
            <Input
              data-testid="input-trace-id"
              placeholder="Trace ID (UUID)"
              value={traceId}
              onChange={e => setTraceId(e.target.value)}
              className="font-mono text-sm"
            />
            <Button data-testid="button-lookup-trace" onClick={lookup} disabled={loading || !traceId.trim()}>
              {loading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
            </Button>
          </div>

          {searched && steps.length === 0 && !loading && (
            <p className="text-sm text-muted-foreground">No steps found for this trace ID.</p>
          )}

          {steps.length > 0 && (
            <div className="space-y-3">
              {steps.map((s, i) => (
                <div key={s.id} className="border rounded-lg p-3" data-testid={`trace-step-${i}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="font-mono text-xs">{i + 1}</Badge>
                    <span className="font-semibold text-sm">{s.step}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{new Date(s.createdAt).toLocaleTimeString()}</span>
                  </div>
                  {s.output && (
                    <pre className="text-xs bg-muted rounded p-2 overflow-x-auto max-h-40 overflow-y-auto">
                      {JSON.stringify(s.output, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ComplianceTab() {
  const { data: logs, isLoading } = useQuery<any[]>({
    queryKey: ["/api/audit/recent"],
    refetchInterval: 10000,
  });

  const { data: outcomes } = useQuery<any[]>({ queryKey: ["/api/outcome/outcomes"] });
  const { data: weights } = useQuery<any[]>({ queryKey: ["/api/outcome/weights"] });

  const runLearning = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/outcome/learning/run");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/outcome/weights"] });
      console.log(`[Learning] Processed ${data.processed} outcomes, updated: ${data.updated?.join(", ")}`);
    },
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Audit Log Summary</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{logs?.length ?? 0}</div>
            <div className="text-xs text-muted-foreground">Recent audit entries (last 50)</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2">Learning Weights <Button size="sm" variant="outline" onClick={() => runLearning.mutate()} disabled={runLearning.isPending} data-testid="button-run-learning">{runLearning.isPending ? "Running..." : "Run Cycle"}</Button></CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{weights?.length ?? 0}</div>
            <div className="text-xs text-muted-foreground">Diagnosis weights in DB</div>
          </CardContent>
        </Card>
      </div>

      {weights && weights.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Top Diagnosis Weights</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {weights.slice(0, 10).map((w: any) => (
                <div key={w.diagnosis} className="flex items-center gap-2" data-testid={`weight-${w.diagnosis}`}>
                  <span className="text-sm flex-1">{w.diagnosis}</span>
                  <div className="w-24 bg-muted rounded-full h-1.5">
                    <div className="bg-primary h-1.5 rounded-full" style={{ width: `${Math.min(100, (w.value / 2) * 100)}%` }} />
                  </div>
                  <span className="text-xs font-mono text-muted-foreground w-12 text-right">{w.value?.toFixed(3)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><ClipboardList className="h-4 w-4" /> Recent Audit Trail</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : !logs || logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No audit entries yet. Run a clinical flow.</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {logs.map((d: any) => (
                <div key={d.id} className="flex items-center gap-2 p-2 border rounded text-xs" data-testid={`audit-entry-${d.id}`}>
                  <Badge variant="outline" className="font-mono shrink-0">{d.step}</Badge>
                  <span className="font-mono text-muted-foreground truncate flex-1">{d.traceId?.slice(0, 8)}...</span>
                  <span className="text-muted-foreground shrink-0">{new Date(d.createdAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function EngineDashboard() {
  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-engine-title">
            <Activity className="h-6 w-6" /> Engine Control Center
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live health monitoring · Digital twin · Audit trace replay · Compliance · Agents · Orchestrator · Auto-debug · SMS
          </p>
        </div>

        <Tabs defaultValue="health">
          <TabsList className="grid grid-cols-4 mb-1">
            <TabsTrigger value="health" data-testid="tab-health"><HeartPulse className="h-3 w-3 mr-1" />Health</TabsTrigger>
            <TabsTrigger value="simulation" data-testid="tab-simulation"><FlaskConical className="h-3 w-3 mr-1" />Simulation</TabsTrigger>
            <TabsTrigger value="trace" data-testid="tab-trace"><Search className="h-3 w-3 mr-1" />Trace</TabsTrigger>
            <TabsTrigger value="compliance" data-testid="tab-compliance"><ClipboardList className="h-3 w-3 mr-1" />Compliance</TabsTrigger>
          </TabsList>
          <TabsList className="grid grid-cols-4 mb-4">
            <TabsTrigger value="agents" data-testid="tab-agents"><Bot className="h-3 w-3 mr-1" />Agents</TabsTrigger>
            <TabsTrigger value="orchestrator" data-testid="tab-orchestrator"><Cpu className="h-3 w-3 mr-1" />Orchestrator</TabsTrigger>
            <TabsTrigger value="diagnostic" data-testid="tab-diagnostic"><Shield className="h-3 w-3 mr-1" />Diagnostic</TabsTrigger>
            <TabsTrigger value="sms" data-testid="tab-sms"><Zap className="h-3 w-3 mr-1" />SMS</TabsTrigger>
          </TabsList>

          <TabsContent value="health"><SystemHealthTab /></TabsContent>
          <TabsContent value="simulation"><SimulationTab /></TabsContent>
          <TabsContent value="trace"><TraceTab /></TabsContent>
          <TabsContent value="compliance"><ComplianceTab /></TabsContent>
          <TabsContent value="agents"><AgentsTab /></TabsContent>
          <TabsContent value="orchestrator"><OrchestratorTab /></TabsContent>
          <TabsContent value="diagnostic"><DiagnosticTab /></TabsContent>
          <TabsContent value="sms"><SmsTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
