import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Bot, Shield, Stethoscope, Brain, DollarSign, AlertTriangle,
  Clock, Play, Pause, Trash2, RefreshCw, Activity, Zap, Settings,
  Send, BarChart3, HeartPulse,
} from "lucide-react";

const AGENT_ICONS: Record<string, any> = {
  safety: Shield,
  triage: AlertTriangle,
  diagnosis: Stethoscope,
  risk: HeartPulse,
  billing: DollarSign,
  followup: Clock,
};

const AGENT_DESCRIPTIONS: Record<string, string> = {
  safety: "Scans for 20+ emergency patterns and red flags. Cannot be disabled.",
  triage: "Assesses severity using urgency scoring engine.",
  diagnosis: "Matches symptoms to diagnoses and auto-codes ICD-10/CPT.",
  risk: "Classifies risk level and validates safe discharge.",
  billing: "Runs denial prediction, auto-fix, and RLHF scoring.",
  followup: "Schedules severity-adaptive follow-up messages.",
};

function AgentToggleCard({
  name,
  config,
  onToggle,
  isPending,
}: {
  name: string;
  config: { enabled: boolean; disabledAt?: string; disabledBy?: string; reason?: string };
  onToggle: (name: string, enabled: boolean) => void;
  isPending: boolean;
}) {
  const Icon = AGENT_ICONS[name] || Bot;
  const isSafety = name === "safety";

  return (
    <Card data-testid={`agent-card-${name}`} className={`border-2 transition-all ${config.enabled ? "border-green-200 dark:border-green-800" : "border-red-200 dark:border-red-800 opacity-75"}`}>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${config.enabled ? "bg-green-100 dark:bg-green-900" : "bg-red-100 dark:bg-red-900"}`}>
              <Icon className={`h-5 w-5 ${config.enabled ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold capitalize">{name}</span>
                <Badge data-testid={`badge-status-${name}`} variant={config.enabled ? "default" : "destructive"} className="text-xs">
                  {config.enabled ? "ACTIVE" : "DISABLED"}
                </Badge>
                {isSafety && <Badge variant="outline" className="text-xs">Required</Badge>}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{AGENT_DESCRIPTIONS[name] || "Custom agent"}</p>
              {!config.enabled && config.disabledAt && (
                <p className="text-xs text-red-500 mt-1">
                  Disabled {config.disabledBy ? `by ${config.disabledBy}` : ""} at {new Date(config.disabledAt).toLocaleString()}
                  {config.reason ? ` — ${config.reason}` : ""}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            <Switch
              data-testid={`toggle-${name}`}
              checked={config.enabled}
              disabled={isSafety || isPending}
              onCheckedChange={(checked) => onToggle(name, checked)}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function QueuePanel() {
  const { toast } = useToast();
  const [testInput, setTestInput] = useState("");

  const statsQuery = useQuery({ queryKey: ["/api/intake-queue/stats"] });
  const jobsQuery = useQuery({ queryKey: ["/api/intake-queue/jobs"] });

  const enqueueMutation = useMutation({
    mutationFn: async (data: { text: string; patientId?: string; priority?: number }) => {
      const res = await apiRequest("POST", "/api/intake-queue", data);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Case Queued", description: `Job ${data.jobId} at position ${data.position}` });
      queryClient.invalidateQueries({ queryKey: ["/api/intake-queue/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/intake-queue/jobs"] });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: async () => { const res = await apiRequest("POST", "/api/intake-queue/pause"); return res.json(); },
    onSuccess: () => {
      toast({ title: "Queue Paused" });
      queryClient.invalidateQueries({ queryKey: ["/api/intake-queue/stats"] });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: async () => { const res = await apiRequest("POST", "/api/intake-queue/resume"); return res.json(); },
    onSuccess: () => {
      toast({ title: "Queue Resumed" });
      queryClient.invalidateQueries({ queryKey: ["/api/intake-queue/stats"] });
    },
  });

  const drainMutation = useMutation({
    mutationFn: async () => { const res = await apiRequest("POST", "/api/intake-queue/drain"); return res.json(); },
    onSuccess: (data) => {
      toast({ title: "Queue Drained", description: `${data.drained} jobs removed` });
      queryClient.invalidateQueries({ queryKey: ["/api/intake-queue/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/intake-queue/jobs"] });
    },
  });

  const stats = statsQuery.data as any;
  const jobs = (jobsQuery.data || []) as any[];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold" data-testid="stat-queued">{stats?.queued ?? "—"}</p>
            <p className="text-xs text-muted-foreground">Queued</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold" data-testid="stat-processing">{stats?.processing ?? "—"}</p>
            <p className="text-xs text-muted-foreground">Processing</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold" data-testid="stat-total-processed">{stats?.totalProcessed ?? "—"}</p>
            <p className="text-xs text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold" data-testid="stat-avg-ms">{stats?.avgProcessingMs ?? "—"}ms</p>
            <p className="text-xs text-muted-foreground">Avg Latency</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button data-testid="button-pause-queue" variant="outline" size="sm" onClick={() => pauseMutation.mutate()} disabled={pauseMutation.isPending || !stats?.isRunning}>
          <Pause className="h-4 w-4 mr-1" /> Pause
        </Button>
        <Button data-testid="button-resume-queue" variant="outline" size="sm" onClick={() => resumeMutation.mutate()} disabled={resumeMutation.isPending || stats?.isRunning}>
          <Play className="h-4 w-4 mr-1" /> Resume
        </Button>
        <Button data-testid="button-drain-queue" variant="destructive" size="sm" onClick={() => drainMutation.mutate()} disabled={drainMutation.isPending}>
          <Trash2 className="h-4 w-4 mr-1" /> Drain
        </Button>
        <Button data-testid="button-refresh-queue" variant="ghost" size="sm" onClick={() => { statsQuery.refetch(); jobsQuery.refetch(); }}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Submit Test Case</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Textarea
              data-testid="input-queue-test"
              placeholder="Describe patient complaint..."
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              className="min-h-[60px]"
            />
            <Button
              data-testid="button-queue-submit"
              onClick={() => {
                if (testInput.trim()) {
                  enqueueMutation.mutate({ text: testInput, patientId: `PT-TEST-${Date.now()}` });
                  setTestInput("");
                }
              }}
              disabled={!testInput.trim() || enqueueMutation.isPending}
            >
              {enqueueMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4" /> Recent Jobs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No jobs yet</p>
          ) : (
            <div className="space-y-1 max-h-[300px] overflow-y-auto">
              {jobs.slice(0, 20).map((job: any) => (
                <div key={job.id} data-testid={`job-row-${job.id}`} className="flex items-center justify-between py-1.5 px-2 rounded text-sm hover:bg-muted/50">
                  <div className="flex items-center gap-2">
                    <Badge variant={
                      job.status === "completed" ? "default" :
                      job.status === "failed" ? "destructive" :
                      job.status === "processing" ? "secondary" : "outline"
                    } className="text-xs min-w-[70px] justify-center">
                      {job.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{job.patientId || job.id}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {job.decision && (
                      <Badge variant={job.decision === "critical" ? "destructive" : "outline"} className="text-xs">
                        {job.decision}
                      </Badge>
                    )}
                    {job.durationMs !== undefined && (
                      <span className="text-xs text-muted-foreground">{job.durationMs}ms</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {stats && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Settings className="h-4 w-4" /> Queue Config
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><span className="text-muted-foreground">Concurrency:</span> <strong>{stats.config.concurrency}</strong></div>
              <div><span className="text-muted-foreground">Max Retries:</span> <strong>{stats.config.maxRetries}</strong></div>
              <div><span className="text-muted-foreground">Max Queue:</span> <strong>{stats.config.maxQueueSize.toLocaleString()}</strong></div>
              <div><span className="text-muted-foreground">Status:</span> <Badge variant={stats.isRunning ? "default" : "destructive"} className="text-xs ml-1">{stats.isRunning ? "RUNNING" : "PAUSED"}</Badge></div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AgentStatsPanel() {
  const statsQuery = useQuery({ queryKey: ["/api/autonomous-agents/stats"] });
  const stats = statsQuery.data as Record<string, any> | undefined;

  if (statsQuery.isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => statsQuery.refetch()}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>
      {stats && Object.entries(stats).map(([name, s]: [string, any]) => {
        const Icon = AGENT_ICONS[name] || Bot;
        return (
          <Card key={name} data-testid={`stats-card-${name}`}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                  <span className="font-semibold capitalize">{name}</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div><span className="text-muted-foreground">Runs:</span> <strong>{s.runs}</strong></div>
                  <div><span className="text-muted-foreground">Success:</span> <strong className="text-green-600">{s.successRate}%</strong></div>
                  <div><span className="text-muted-foreground">Avg:</span> <strong>{s.avgMs}ms</strong></div>
                  {s.failures > 0 && (
                    <Badge variant="destructive" className="text-xs">{s.failures} failed</Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
      {(!stats || Object.keys(stats).length === 0) && (
        <p className="text-sm text-muted-foreground text-center py-4">No agent stats yet. Run some cases first.</p>
      )}
    </div>
  );
}

export default function AgentControlPanel() {
  const { toast } = useToast();

  const configQuery = useQuery({ queryKey: ["/api/agent-control/config"] });

  const toggleMutation = useMutation({
    mutationFn: async ({ name, enabled }: { name: string; enabled: boolean }) => {
      const res = await apiRequest("POST", "/api/agent-control/toggle", { name, enabled });
      return res.json();
    },
    onSuccess: (data) => {
      if (!data.success) {
        toast({ title: "Toggle Failed", description: data.error, variant: "destructive" });
        return;
      }
      toast({ title: `Agent ${data.enabled ? "Enabled" : "Disabled"}`, description: `${data.agent} is now ${data.enabled ? "active" : "inactive"}` });
      queryClient.invalidateQueries({ queryKey: ["/api/agent-control/config"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const agentConfigs = configQuery.data as Record<string, any> | undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="heading-agent-control">
            <Bot className="h-6 w-6" /> Agent Control Center
          </h1>
          <p className="text-muted-foreground mt-1">Real-time control over autonomous clinical agents and intake queue</p>
        </div>
      </div>

      <Tabs defaultValue="agents" className="space-y-4">
        <TabsList data-testid="tabs-agent-control">
          <TabsTrigger value="agents" data-testid="tab-agents">
            <Zap className="h-4 w-4 mr-1" /> Agents
          </TabsTrigger>
          <TabsTrigger value="queue" data-testid="tab-queue">
            <Activity className="h-4 w-4 mr-1" /> Intake Queue
          </TabsTrigger>
          <TabsTrigger value="stats" data-testid="tab-stats">
            <BarChart3 className="h-4 w-4 mr-1" /> Performance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="agents">
          {configQuery.isLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : agentConfigs ? (
            <div className="grid gap-3">
              {Object.entries(agentConfigs).map(([name, cfg]: [string, any]) => (
                <AgentToggleCard
                  key={name}
                  name={name}
                  config={cfg}
                  onToggle={(n, enabled) => toggleMutation.mutate({ name: n, enabled })}
                  isPending={toggleMutation.isPending}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Failed to load agent config</p>
          )}
        </TabsContent>

        <TabsContent value="queue">
          <QueuePanel />
        </TabsContent>

        <TabsContent value="stats">
          <AgentStatsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
