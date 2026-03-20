import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Activity, Bot, AlertTriangle, CheckCircle, XCircle,
  Play, RefreshCw, Cpu, Zap, Shield, TrendingUp, Clock
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

export default function EngineDashboard() {
  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-engine-title">
            <Activity className="h-6 w-6" /> Engine Control Center
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live agent monitoring · Master clinical orchestrator · Auto-debug · SMS gateway
          </p>
        </div>

        <Tabs defaultValue="agents">
          <TabsList className="grid grid-cols-4 mb-4">
            <TabsTrigger value="agents" data-testid="tab-agents"><Bot className="h-3 w-3 mr-1" />Agents</TabsTrigger>
            <TabsTrigger value="orchestrator" data-testid="tab-orchestrator"><Cpu className="h-3 w-3 mr-1" />Orchestrator</TabsTrigger>
            <TabsTrigger value="diagnostic" data-testid="tab-diagnostic"><Shield className="h-3 w-3 mr-1" />Diagnostic</TabsTrigger>
            <TabsTrigger value="sms" data-testid="tab-sms"><Zap className="h-3 w-3 mr-1" />SMS</TabsTrigger>
          </TabsList>

          <TabsContent value="agents"><AgentsTab /></TabsContent>
          <TabsContent value="orchestrator"><OrchestratorTab /></TabsContent>
          <TabsContent value="diagnostic"><DiagnosticTab /></TabsContent>
          <TabsContent value="sms"><SmsTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
