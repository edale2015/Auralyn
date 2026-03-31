import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertTriangle, Activity, Brain, CheckCircle2, XCircle, Clock, Shield,
  Play, RotateCcw, TrendingDown, TrendingUp, Minus, GitBranch, Archive,
  Eye, Zap, Lock, FlaskConical, ListChecks, FileText, BarChart3,
  ChevronDown, ChevronUp, RefreshCw, AlertOctagon, BookOpen, Cpu,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SimJob {
  jobId: string;
  status: "queued" | "running" | "complete" | "cancelled" | "error";
  params: { complaint: string; count: number; difficulty: string; label?: string };
  progress: number;
  processedCases: number;
  totalCases: number;
  createdAt: number;
  completedAt?: number;
  summary?: SimSummary;
  learningTriggered: boolean;
}

interface SimSummary {
  accuracy: number;
  safetyAccuracy: number;
  falseReassuranceRate: number;
  er_now_sensitivity: number;
  failed: number;
  totalCases: number;
  failureClusters: Array<{ cluster: string; count: number; suggestedFix?: string }>;
}

interface LearningItem {
  id: string;
  type: string;
  title: string;
  description: string;
  rationale: string;
  affectedComplaints?: string[];
  confidence: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  requiresManualApproval: boolean;
  status: "pending" | "review" | "approved" | "rejected" | "deployed" | "rollback";
  createdAt: number;
  linkedSimRunId?: string;
  reviewedBy?: string;
  reviewNote?: string;
}

interface AuditEntry {
  entryId: string;
  action: string;
  source: string;
  actor?: string;
  itemId?: string;
  detail?: string;
  before?: unknown;
  after?: unknown;
  timestamp: number;
  isoTime: string;
}

interface DriftSnapshot {
  snapshotId: string;
  timestamp: number;
  accuracy: number;
  safetyAccuracy: number;
  falseReassuranceRate: number;
  er_now_sensitivity: number;
  totalCases: number;
  complaint?: string;
}

interface DriftAlert {
  alertId: string;
  level: "watchlist" | "warning" | "critical" | "resolved";
  metric: string;
  delta: number;
  detail: string;
  triggeredAt: number;
}

interface KnowledgeVersion {
  versionId: string;
  label: string;
  createdAt: number;
  createdBy: string;
  reason?: string;
  goldenCaseCount: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(n: number) { return `${Math.round((n ?? 0) * 100)}%`; }
function ago(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}
function fmt(n: number) { return n?.toLocaleString() ?? "—"; }

const RISK_BADGE: Record<string, string> = {
  low:      "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  medium:   "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  high:     "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  critical: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

const STATUS_BADGE: Record<string, string> = {
  pending:  "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  review:   "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  approved: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  deployed: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  rollback: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
};

const ALERT_BADGE: Record<string, string> = {
  watchlist: "bg-blue-100 text-blue-800",
  warning:   "bg-yellow-100 text-yellow-800",
  critical:  "bg-red-100 text-red-800",
  resolved:  "bg-gray-100 text-gray-600",
};

const MODE_META: Record<string, { icon: any; color: string; label: string }> = {
  observe_only:      { icon: Eye,  color: "text-blue-600",   label: "Observe Only" },
  assisted_learning: { icon: Zap,  color: "text-yellow-600", label: "Assisted Learning" },
  controlled_auto:   { icon: Cpu,  color: "text-purple-600", label: "Controlled Auto" },
};

function Metric({ label, value, sub, good, warn }: { label: string; value: string | number; sub?: string; good?: boolean; warn?: boolean }) {
  return (
    <div className="text-center">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-2xl font-bold ${good ? "text-green-600 dark:text-green-400" : warn ? "text-red-600 dark:text-red-400" : ""}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab() {
  const { data: health, refetch } = useQuery<any>({
    queryKey: ["/api/ci/health"],
    refetchInterval: 10000,
  });

  const mode = health?.safetyMode ?? "observe_only";
  const ModeIcon = MODE_META[mode]?.icon ?? Eye;

  return (
    <div className="space-y-6" data-testid="overview-tab">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">System Health Overview</h2>
          <p className="text-sm text-muted-foreground">Real-time status of the autonomous learning and governance system</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()} data-testid="button-refresh-health">
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* Safety Mode Banner */}
      <Card className="border-2 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <ModeIcon className={`h-6 w-6 ${MODE_META[mode]?.color}`} />
            <div>
              <p className="font-semibold">Safety Mode: <span className={MODE_META[mode]?.color}>{MODE_META[mode]?.label}</span></p>
              <p className="text-sm text-muted-foreground">
                {mode === "observe_only" && "System analyzes and suggests only. Zero automated changes. Full human control."}
                {mode === "assisted_learning" && "Suggestions require manual approval. No auto-apply."}
                {mode === "controlled_auto" && "Low-risk adjustments may auto-apply after 24h. High-risk always manual."}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start gap-3">
              <div className="rounded-lg p-2 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-300">
                <FlaskConical className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Sim Runs</p>
                <p className="text-2xl font-bold" data-testid="stat-sim-runs">{health?.simulation?.totalRuns ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Last: {health?.simulation?.lastStatus ?? "—"}
                  {health?.simulation?.lastAccuracy != null && ` · ${pct(health.simulation.lastAccuracy)}`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start gap-3">
              <div className="rounded-lg p-2 bg-yellow-50 dark:bg-yellow-950 text-yellow-600 dark:text-yellow-300">
                <ListChecks className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pending Suggestions</p>
                <p className="text-2xl font-bold" data-testid="stat-pending">{health?.learningQueue?.pending ?? 0}</p>
                {(health?.learningQueue?.highRiskPending ?? 0) > 0 && (
                  <p className="text-xs text-red-600 font-medium">{health.learningQueue.highRiskPending} high-risk</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start gap-3">
              <div className={`rounded-lg p-2 ${(health?.drift?.criticalAlerts ?? 0) > 0 ? "bg-red-50 dark:bg-red-950 text-red-600" : "bg-green-50 dark:bg-green-950 text-green-600"}`}>
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Drift Alerts</p>
                <p className="text-2xl font-bold" data-testid="stat-drift-alerts">{health?.drift?.activeAlerts ?? 0}</p>
                <p className="text-xs text-muted-foreground capitalize">{health?.drift?.trend ?? "stable"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start gap-3">
              <div className="rounded-lg p-2 bg-purple-50 dark:bg-purple-950 text-purple-600 dark:text-purple-300">
                <GitBranch className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Knowledge Versions</p>
                <p className="text-2xl font-bold" data-testid="stat-versions">{health?.versions ?? 0}</p>
                <p className="text-xs text-muted-foreground">{health?.auditEntries ?? 0} audit entries</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {(health?.drift?.criticalAlerts ?? 0) > 0 && (
        <Card className="border-red-300 bg-red-50/50 dark:bg-red-950/20">
          <CardContent className="py-3 flex items-center gap-3">
            <AlertOctagon className="h-5 w-5 text-red-600 flex-shrink-0" />
            <p className="text-sm font-medium text-red-800 dark:text-red-300">
              {health.drift.criticalAlerts} critical drift alert{health.drift.criticalAlerts > 1 ? "s" : ""} require immediate attention. Open the Drift Monitor tab.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Simulation Tab ────────────────────────────────────────────────────────────

function SimulationTab() {
  const { toast } = useToast();
  const [complaint, setComplaint] = useState("all");
  const [count, setCount] = useState("200");
  const [difficulty, setDifficulty] = useState("moderate");
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [showClusters, setShowClusters] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: jobsData, refetch: refetchJobs } = useQuery<any>({
    queryKey: ["/api/ci/sim/jobs"],
    refetchInterval: activeJobId ? 2000 : 10000,
  });

  const { data: statusData } = useQuery<any>({
    queryKey: ["/api/ci/sim/status", activeJobId],
    enabled: !!activeJobId,
    refetchInterval: 1500,
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ci/sim/start", { complaint, count: Number(count), difficulty, mode: "generated" });
      return res.json();
    },
    onSuccess: (data) => {
      setActiveJobId(data.jobId);
      toast({ title: "Simulation started", description: `Job ${data.jobId} — ${fmt(data.totalCases)} cases` });
      queryClient.invalidateQueries({ queryKey: ["/api/ci/sim/jobs"] });
    },
    onError: () => toast({ title: "Start failed", variant: "destructive" }),
  });

  const recordDriftMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await apiRequest("POST", `/api/ci/sim/record-drift/${jobId}`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Drift snapshot recorded" });
      queryClient.invalidateQueries({ queryKey: ["/api/ci/drift/timeline"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ci/drift/stats"] });
    },
  });

  useEffect(() => {
    if (!activeJobId) return;
    if (statusData?.status === "complete" || statusData?.status === "error" || statusData?.status === "cancelled") {
      setActiveJobId(null);
      refetchJobs();
      queryClient.invalidateQueries({ queryKey: ["/api/ci/learning/queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ci/health"] });
    }
  }, [statusData?.status]);

  const jobs: SimJob[] = jobsData?.jobs ?? [];
  const activeJob = activeJobId ? jobs.find(j => j.jobId === activeJobId) : null;

  function viewJob(job: SimJob) {
    setSelectedJob(selectedJob?.jobId === job.jobId ? null : job);
  }

  return (
    <div className="space-y-5" data-testid="simulation-tab">
      {/* Config Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-blue-600" /> Run Simulation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <Label className="text-xs">Complaint</Label>
              <Select value={complaint} onValueChange={setComplaint}>
                <SelectTrigger data-testid="select-sim-complaint" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Complaints</SelectItem>
                  <SelectItem value="cough">Cough</SelectItem>
                  <SelectItem value="chest_pain">Chest Pain</SelectItem>
                  <SelectItem value="headache">Headache</SelectItem>
                  <SelectItem value="dizziness">Dizziness</SelectItem>
                  <SelectItem value="sore_throat">Sore Throat</SelectItem>
                  <SelectItem value="fever">Fever</SelectItem>
                  <SelectItem value="ear_pain">Ear Pain</SelectItem>
                  <SelectItem value="breathlessness">Breathlessness</SelectItem>
                  <SelectItem value="shoulder_pain">Shoulder Pain</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Case Count (10–100,000)</Label>
              <Input
                data-testid="input-sim-count"
                type="number" min={10} max={100000} value={count}
                onChange={e => setCount(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Difficulty</Label>
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger data-testid="select-sim-difficulty" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                data-testid="button-start-sim"
                className="w-full"
                onClick={() => startMutation.mutate()}
                disabled={startMutation.isPending || !!activeJobId}
              >
                <Play className="h-4 w-4 mr-2" />
                {startMutation.isPending ? "Starting…" : activeJobId ? "Running…" : "Start"}
              </Button>
            </div>
          </div>
          {activeJobId && statusData && (
            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium">{fmt(statusData.processedCases)} / {fmt(statusData.totalCases)}</span>
              </div>
              <Progress value={statusData.progress} className="h-2" data-testid="progress-sim" />
              <p className="text-xs text-muted-foreground capitalize">{statusData.status}…</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Job List */}
      <div className="space-y-3">
        {jobs.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No simulation runs yet. Configure and start a simulation above.</p>
        )}
        {jobs.map(job => (
          <Card key={job.jobId} className={`cursor-pointer transition-colors ${selectedJob?.jobId === job.jobId ? "ring-2 ring-blue-500" : "hover:bg-muted/30"}`}>
            <CardContent className="py-3">
              <div className="flex items-center justify-between gap-3" onClick={() => viewJob(job)}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    job.status === "complete"   ? "bg-green-500"
                    : job.status === "running"  ? "bg-blue-500 animate-pulse"
                    : job.status === "queued"   ? "bg-yellow-500"
                    : "bg-gray-400"
                  }`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" data-testid={`text-job-title-${job.jobId}`}>
                      {job.params.label ?? `${job.params.complaint} · ${fmt(job.totalCases)} cases · ${job.params.difficulty}`}
                    </p>
                    <p className="text-xs text-muted-foreground">{ago(job.createdAt)} · {job.status}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {job.status === "complete" && job.summary && (
                    <div className="flex gap-3 text-xs">
                      <span className={job.summary.accuracy >= 0.8 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                        Acc {pct(job.summary.accuracy)}
                      </span>
                      <span className={job.summary.falseReassuranceRate > 0.05 ? "text-red-600 font-medium" : "text-muted-foreground"}>
                        FR {pct(job.summary.falseReassuranceRate)}
                      </span>
                    </div>
                  )}
                  {job.status === "running" && (
                    <Progress value={job.progress} className="h-1.5 w-20" />
                  )}
                  {job.status === "complete" && !job.learningTriggered && (
                    <Badge variant="outline" className="text-xs">suggestions pending</Badge>
                  )}
                  {selectedJob?.jobId === job.jobId ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
              </div>

              {/* Expanded Detail */}
              {selectedJob?.jobId === job.jobId && job.summary && (
                <div className="mt-4 pt-3 border-t space-y-4">
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                    <Metric label="Accuracy"       value={pct(job.summary.accuracy)}             good={job.summary.accuracy >= 0.8}  warn={job.summary.accuracy < 0.7} />
                    <Metric label="Safety Acc"     value={pct(job.summary.safetyAccuracy)}        good={job.summary.safetyAccuracy >= 0.9} warn={job.summary.safetyAccuracy < 0.85} />
                    <Metric label="False Reassur." value={pct(job.summary.falseReassuranceRate)}  warn={job.summary.falseReassuranceRate > 0.05} />
                    <Metric label="ER Sensitivity" value={pct(job.summary.er_now_sensitivity)}    good={job.summary.er_now_sensitivity >= 0.95} warn={job.summary.er_now_sensitivity < 0.9} />
                    <Metric label="Failed Cases"   value={fmt(job.summary.failed)} />
                    <Metric label="Total Cases"    value={fmt(job.summary.totalCases)} />
                  </div>

                  {job.summary.failureClusters.length > 0 && (
                    <div>
                      <button
                        onClick={() => setShowClusters(!showClusters)}
                        className="text-xs font-medium text-blue-600 hover:underline flex items-center gap-1"
                        data-testid="button-toggle-clusters"
                      >
                        {showClusters ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        {job.summary.failureClusters.length} failure cluster{job.summary.failureClusters.length > 1 ? "s" : ""}
                      </button>
                      {showClusters && (
                        <div className="mt-2 space-y-2">
                          {job.summary.failureClusters.map((c, i) => (
                            <div key={i} className="rounded-md border bg-muted/20 p-3 text-xs">
                              <div className="flex items-center justify-between mb-1">
                                <code className="font-mono text-xs bg-muted px-1 rounded">{c.cluster}</code>
                                <Badge variant="secondary">{c.count} cases</Badge>
                              </div>
                              {c.suggestedFix && <p className="text-muted-foreground">{c.suggestedFix}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      size="sm" variant="outline"
                      onClick={() => recordDriftMutation.mutate(job.jobId)}
                      disabled={recordDriftMutation.isPending}
                      data-testid={`button-record-drift-${job.jobId}`}
                    >
                      <Activity className="h-3.5 w-3.5 mr-1" /> Record Drift Snapshot
                    </Button>
                    {job.learningTriggered && (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Learning suggestions generated
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Learning Queue Tab ────────────────────────────────────────────────────────

function LearningQueueTab() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");

  const { data: queueData, refetch } = useQuery<any>({
    queryKey: ["/api/ci/learning/queue", statusFilter],
    queryFn: async () => {
      const url = statusFilter === "all" ? "/api/ci/learning/queue" : `/api/ci/learning/queue?status=${statusFilter}`;
      const res = await apiRequest("GET", url);
      return res.json();
    },
  });

  const { data: stats } = useQuery<any>({
    queryKey: ["/api/ci/learning/queue/stats"],
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const res = await apiRequest("POST", `/api/ci/learning/queue/${id}/approve`, { reviewedBy: "admin", note });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Suggestion approved" });
      queryClient.invalidateQueries({ queryKey: ["/api/ci/learning/queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ci/learning/queue/stats"] });
      setExpandedId(null);
      setReviewNote("");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const res = await apiRequest("POST", `/api/ci/learning/queue/${id}/reject`, { reviewedBy: "admin", note });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Suggestion rejected" });
      queryClient.invalidateQueries({ queryKey: ["/api/ci/learning/queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ci/learning/queue/stats"] });
      setExpandedId(null);
      setReviewNote("");
    },
  });

  const deployMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/ci/learning/queue/${id}/deploy`, { deployedBy: "admin" });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Suggestion deployed" });
      queryClient.invalidateQueries({ queryKey: ["/api/ci/learning/queue"] });
    },
  });

  const items: LearningItem[] = queueData?.items ?? [];
  const counts = queueData?.counts ?? {};

  return (
    <div className="space-y-5" data-testid="learning-queue-tab">
      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-4 md:grid-cols-6 gap-3">
          {[
            { label: "Total", value: stats.total },
            { label: "Pending", value: stats.pending, color: "text-yellow-600" },
            { label: "Approved", value: stats.approved, color: "text-green-600" },
            { label: "Rejected", value: stats.rejected, color: "text-red-600" },
            { label: "Deployed", value: stats.deployed, color: "text-purple-600" },
            { label: "High Risk", value: stats.highRiskPending, color: stats.highRiskPending > 0 ? "text-red-600 font-bold" : "" },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="py-3 text-center">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className={`text-xl font-bold ${s.color ?? ""}`} data-testid={`stat-lq-${s.label.toLowerCase().replace(" ", "-")}`}>{s.value ?? 0}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {["all", "pending", "review", "approved", "rejected", "deployed"].map(s => (
          <Button
            key={s}
            variant={statusFilter === s ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(s)}
            data-testid={`button-filter-${s}`}
            className="capitalize"
          >
            {s}{counts[s] > 0 && ` (${counts[s]})`}
          </Button>
        ))}
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Items */}
      <div className="space-y-3">
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            {statusFilter === "pending" ? "No pending suggestions. Run a simulation to generate recommendations." : "No items match this filter."}
          </p>
        )}
        {items.map(item => (
          <Card key={item.id} className={`transition-all ${expandedId === item.id ? "ring-2 ring-blue-400" : ""}`}>
            <CardContent className="py-3">
              <div
                className="flex items-start justify-between gap-3 cursor-pointer"
                onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="mt-0.5">
                    {item.status === "approved" && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                    {item.status === "rejected"  && <XCircle    className="h-4 w-4 text-red-500" />}
                    {item.status === "deployed"  && <Zap         className="h-4 w-4 text-purple-600" />}
                    {(item.status === "pending" || item.status === "review") && <Clock className="h-4 w-4 text-yellow-600" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium" data-testid={`text-suggestion-title-${item.id}`}>{item.title}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge className={`text-xs ${STATUS_BADGE[item.status]}`}>{item.status}</Badge>
                      <Badge className={`text-xs ${RISK_BADGE[item.riskLevel]}`}>{item.riskLevel} risk</Badge>
                      <Badge variant="outline" className="text-xs">{item.type.replace(/_/g, " ")}</Badge>
                      {item.affectedComplaints?.slice(0, 2).map(c => (
                        <Badge key={c} variant="secondary" className="text-xs">{c}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-muted-foreground">conf {pct(item.confidence)}</span>
                  {expandedId === item.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </div>

              {expandedId === item.id && (
                <div className="mt-4 space-y-3 border-t pt-3">
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                  {item.rationale && (
                    <div className="rounded-md bg-muted/40 p-3 text-xs">
                      <p className="font-medium mb-1">Rationale</p>
                      <p className="text-muted-foreground">{item.rationale}</p>
                    </div>
                  )}
                  {item.reviewNote && (
                    <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 p-3 text-xs">
                      <p className="font-medium">Review note by {item.reviewedBy}</p>
                      <p className="text-muted-foreground">{item.reviewNote}</p>
                    </div>
                  )}
                  {(item.status === "pending" || item.status === "review") && (
                    <div className="space-y-2">
                      <Textarea
                        placeholder="Review note (optional)"
                        value={reviewNote}
                        onChange={e => setReviewNote(e.target.value)}
                        rows={2}
                        className="text-sm"
                        data-testid={`textarea-review-note-${item.id}`}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700"
                          onClick={() => approveMutation.mutate({ id: item.id, note: reviewNote })}
                          disabled={approveMutation.isPending}
                          data-testid={`button-approve-${item.id}`}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                        </Button>
                        <Button
                          size="sm" variant="destructive"
                          onClick={() => rejectMutation.mutate({ id: item.id, note: reviewNote })}
                          disabled={rejectMutation.isPending}
                          data-testid={`button-reject-${item.id}`}
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                        </Button>
                      </div>
                    </div>
                  )}
                  {item.status === "approved" && (
                    <Button
                      size="sm" variant="outline"
                      onClick={() => deployMutation.mutate(item.id)}
                      disabled={deployMutation.isPending}
                      data-testid={`button-deploy-${item.id}`}
                    >
                      <Zap className="h-3.5 w-3.5 mr-1" /> Deploy
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Drift Monitor Tab ─────────────────────────────────────────────────────────

function DriftMonitorTab() {
  const { toast } = useToast();

  const { data: driftStats }  = useQuery<any>({ queryKey: ["/api/ci/drift/stats"],    refetchInterval: 10000 });
  const { data: alertData }   = useQuery<any>({ queryKey: ["/api/ci/drift/alerts"],   refetchInterval: 10000 });
  const { data: timelineData } = useQuery<any>({ queryKey: ["/api/ci/drift/timeline"] });

  const resolveAlert = useMutation({
    mutationFn: async (alertId: string) => {
      const res = await apiRequest("POST", `/api/ci/drift/alerts/${alertId}/resolve`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Alert resolved" });
      queryClient.invalidateQueries({ queryKey: ["/api/ci/drift/alerts"] });
    },
  });

  const alerts: DriftAlert[] = alertData?.active ?? [];
  const timeline: DriftSnapshot[] = timelineData?.timeline ?? [];

  const trendIcon = driftStats?.accuracyTrend === "improving" ? TrendingUp
    : driftStats?.accuracyTrend === "degrading" ? TrendingDown : Minus;
  const TrendIcon = trendIcon;

  return (
    <div className="space-y-5" data-testid="drift-tab">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 text-center">
            <p className="text-xs text-muted-foreground">Baseline Accuracy</p>
            <p className="text-2xl font-bold" data-testid="stat-baseline-accuracy">{pct(driftStats?.baselineAccuracy ?? 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 text-center">
            <p className="text-xs text-muted-foreground">Latest Accuracy</p>
            <p className="text-2xl font-bold" data-testid="stat-latest-accuracy">{driftStats?.latestAccuracy ? pct(driftStats.latestAccuracy) : "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 text-center">
            <p className="text-xs text-muted-foreground">Trend</p>
            <div className="flex items-center justify-center gap-1 mt-1">
              <TrendIcon className={`h-5 w-5 ${driftStats?.accuracyTrend === "improving" ? "text-green-600" : driftStats?.accuracyTrend === "degrading" ? "text-red-600" : "text-gray-400"}`} />
              <p className="text-lg font-semibold capitalize">{driftStats?.accuracyTrend ?? "—"}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 text-center">
            <p className="text-xs text-muted-foreground">Active Alerts</p>
            <p className={`text-2xl font-bold ${(driftStats?.criticalAlerts ?? 0) > 0 ? "text-red-600" : (driftStats?.activeAlerts ?? 0) > 0 ? "text-yellow-600" : "text-green-600"}`} data-testid="stat-active-alerts">
              {driftStats?.activeAlerts ?? 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Active Alerts</h3>
          {alerts.map(alert => (
            <Card key={alert.alertId} className={`border-l-4 ${alert.level === "critical" ? "border-l-red-500" : alert.level === "warning" ? "border-l-yellow-500" : "border-l-blue-400"}`}>
              <CardContent className="py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <AlertTriangle className={`h-4 w-4 flex-shrink-0 ${alert.level === "critical" ? "text-red-600" : alert.level === "warning" ? "text-yellow-600" : "text-blue-500"}`} />
                  <div>
                    <p className="text-sm font-medium" data-testid={`text-alert-${alert.alertId}`}>{alert.detail}</p>
                    <p className="text-xs text-muted-foreground">{alert.metric} · {ago(alert.triggeredAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={`text-xs ${ALERT_BADGE[alert.level]}`}>{alert.level}</Badge>
                  <Button
                    size="sm" variant="ghost" className="h-7 text-xs"
                    onClick={() => resolveAlert.mutate(alert.alertId)}
                    data-testid={`button-resolve-alert-${alert.alertId}`}
                  >
                    Resolve
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {alerts.length === 0 && (
        <Card className="border-green-200 bg-green-50/50 dark:bg-green-950/20">
          <CardContent className="py-3 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <p className="text-sm text-green-800 dark:text-green-300">No active drift alerts. System accuracy is within acceptable bounds.</p>
          </CardContent>
        </Card>
      )}

      {/* Timeline Table */}
      {timeline.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Accuracy Timeline ({timeline.length} snapshots)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 px-3">Time</th>
                  <th className="text-right py-2 px-3">Accuracy</th>
                  <th className="text-right py-2 px-3">Safety</th>
                  <th className="text-right py-2 px-3">False Reassurance</th>
                  <th className="text-right py-2 px-3">ER Sensitivity</th>
                  <th className="text-right py-2 px-3">Cases</th>
                </tr>
              </thead>
              <tbody>
                {timeline.map((snap, i) => (
                  <tr key={snap.snapshotId} className={`border-b hover:bg-muted/30 ${i === 0 ? "font-medium" : ""}`}>
                    <td className="py-2 px-3 text-muted-foreground">{ago(snap.timestamp)}</td>
                    <td className={`py-2 px-3 text-right ${snap.accuracy >= 0.8 ? "text-green-600" : snap.accuracy < 0.7 ? "text-red-600" : ""}`}>{pct(snap.accuracy)}</td>
                    <td className="py-2 px-3 text-right">{pct(snap.safetyAccuracy)}</td>
                    <td className={`py-2 px-3 text-right ${snap.falseReassuranceRate > 0.05 ? "text-red-600 font-medium" : ""}`}>{pct(snap.falseReassuranceRate)}</td>
                    <td className={`py-2 px-3 text-right ${snap.er_now_sensitivity < 0.9 ? "text-red-600" : ""}`}>{pct(snap.er_now_sensitivity)}</td>
                    <td className="py-2 px-3 text-right">{fmt(snap.totalCases)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {timeline.length === 0 && driftStats?.totalSnapshots === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">
          No drift snapshots yet. Run a simulation and click "Record Drift Snapshot" to start monitoring.
        </p>
      )}
    </div>
  );
}

// ─── Audit Trail Tab ───────────────────────────────────────────────────────────

function AuditTrailTab() {
  const [search, setSearch] = useState("");

  const { data: auditData, refetch } = useQuery<any>({
    queryKey: ["/api/ci/audit/log"],
    refetchInterval: 15000,
  });

  const { data: auditStats } = useQuery<any>({
    queryKey: ["/api/ci/audit/stats"],
  });

  const entries: AuditEntry[] = auditData?.entries ?? [];
  const filtered = search
    ? entries.filter(e => e.action.includes(search) || (e.detail ?? "").toLowerCase().includes(search.toLowerCase()) || (e.actor ?? "").toLowerCase().includes(search.toLowerCase()))
    : entries;

  const ACTION_COLOR: Record<string, string> = {
    suggestion_created:  "text-blue-600",
    suggestion_approved: "text-green-600",
    suggestion_rejected: "text-red-600",
    suggestion_deployed: "text-purple-600",
    safety_mode_changed: "text-yellow-600",
    drift_alert_triggered: "text-red-600",
    version_snapshot:    "text-indigo-600",
    version_rollback:    "text-orange-600",
    simulation_run:      "text-gray-600",
  };

  return (
    <div className="space-y-5" data-testid="audit-tab">
      {auditStats && (
        <div className="flex flex-wrap gap-3">
          {Object.entries(auditStats).map(([action, count]) => (
            <div key={action} className="bg-muted/40 rounded-md px-3 py-1.5 text-xs">
              <span className="text-muted-foreground">{action.replace(/_/g, " ")}</span>
              <span className="ml-2 font-semibold">{count as number}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          placeholder="Filter by action, actor, or detail…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="text-sm"
          data-testid="input-audit-search"
        />
        <Button variant="ghost" size="icon" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-1">
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No audit entries yet. Every governance action will be logged here.
          </p>
        )}
        {filtered.map(entry => (
          <div key={entry.entryId} className="flex items-start gap-3 text-xs py-2 border-b hover:bg-muted/20 rounded px-2" data-testid={`audit-entry-${entry.entryId}`}>
            <span className="text-muted-foreground w-28 flex-shrink-0 pt-0.5">{ago(entry.timestamp)}</span>
            <span className={`font-medium w-40 flex-shrink-0 ${ACTION_COLOR[entry.action] ?? "text-gray-600"}`}>
              {entry.action.replace(/_/g, " ")}
            </span>
            <div className="min-w-0 flex-1">
              {entry.actor && <span className="text-muted-foreground mr-2">by {entry.actor}</span>}
              {entry.detail && <span>{entry.detail}</span>}
            </div>
            <Badge variant="outline" className="text-xs flex-shrink-0">{entry.source}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Versions Tab ─────────────────────────────────────────────────────────────

function VersionsTab() {
  const { toast } = useToast();
  const [newLabel, setNewLabel] = useState("");
  const [newReason, setNewReason] = useState("");
  const [diffFrom, setDiffFrom] = useState("");
  const [diffTo, setDiffTo] = useState("");
  const [diffResult, setDiffResult] = useState<any>(null);

  const { data: versionsData, refetch } = useQuery<any>({
    queryKey: ["/api/ci/versions"],
  });

  const snapshotMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ci/versions/snapshot", { label: newLabel, reason: newReason });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Snapshot created", description: data.label });
      setNewLabel(""); setNewReason("");
      queryClient.invalidateQueries({ queryKey: ["/api/ci/versions"] });
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: async ({ versionId, reason }: { versionId: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/ci/versions/rollback/${versionId}`, { reason });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: data.ok ? "Rollback logged" : "Rollback failed", description: data.detail });
    },
  });

  const diffMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("GET", `/api/ci/versions/diff/${diffFrom}/${diffTo}`);
      return res.json();
    },
    onSuccess: (data) => setDiffResult(data),
  });

  const versions: KnowledgeVersion[] = versionsData?.versions ?? [];

  return (
    <div className="space-y-5" data-testid="versions-tab">
      {/* Create Snapshot */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Archive className="h-4 w-4 text-indigo-600" /> Create Knowledge Snapshot
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input
              placeholder="Version label (e.g. v2.4-shoulder-fix)"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              data-testid="input-version-label"
            />
            <Input
              placeholder="Reason (optional)"
              value={newReason}
              onChange={e => setNewReason(e.target.value)}
              data-testid="input-version-reason"
            />
            <Button
              onClick={() => snapshotMutation.mutate()}
              disabled={!newLabel || snapshotMutation.isPending}
              data-testid="button-create-snapshot"
            >
              <Archive className="h-4 w-4 mr-2" />
              {snapshotMutation.isPending ? "Saving…" : "Create Snapshot"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Diff Tool */}
      {versions.length >= 2 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-blue-600" /> Compare Versions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label className="text-xs">From</Label>
                <Select value={diffFrom} onValueChange={setDiffFrom}>
                  <SelectTrigger data-testid="select-diff-from" className="mt-1">
                    <SelectValue placeholder="Select version" />
                  </SelectTrigger>
                  <SelectContent>
                    {versions.map(v => (
                      <SelectItem key={v.versionId} value={v.versionId}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label className="text-xs">To</Label>
                <Select value={diffTo} onValueChange={setDiffTo}>
                  <SelectTrigger data-testid="select-diff-to" className="mt-1">
                    <SelectValue placeholder="Select version" />
                  </SelectTrigger>
                  <SelectContent>
                    {versions.map(v => (
                      <SelectItem key={v.versionId} value={v.versionId}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => diffMutation.mutate()}
                disabled={!diffFrom || !diffTo || diffMutation.isPending}
                data-testid="button-diff-versions"
              >
                Compare
              </Button>
            </div>
            {diffResult && (
              <div className="mt-3">
                <p className="text-xs font-medium mb-2">{diffResult.summary}</p>
                {diffResult.changedKeys?.length === 0 && (
                  <p className="text-xs text-muted-foreground">No changes between these versions.</p>
                )}
                {diffResult.changedKeys?.map((ch: any) => (
                  <div key={ch.key} className="flex items-center gap-2 text-xs py-1 border-b">
                    <code className="font-mono bg-muted px-1 rounded">{ch.key}</code>
                    <span className="text-red-500">{String(ch.before ?? "—")}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="text-green-600">{String(ch.after ?? "—")}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Version List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{versions.length} Snapshots</h3>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
        {versions.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No snapshots yet. Create one to start tracking knowledge versions.</p>
        )}
        {versions.map((v, i) => (
          <Card key={v.versionId}>
            <CardContent className="py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${i === 0 ? "bg-indigo-500" : "bg-gray-300"}`} />
                <div>
                  <p className="text-sm font-medium" data-testid={`text-version-label-${v.versionId}`}>{v.label}</p>
                  <p className="text-xs text-muted-foreground">{ago(v.createdAt)} by {v.createdBy} {v.reason && `· ${v.reason}`}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {i === 0 && <Badge variant="secondary" className="text-xs">current</Badge>}
                <Badge variant="outline" className="text-xs">{v.goldenCaseCount} golden cases</Badge>
                <Button
                  size="sm" variant="outline" className="text-xs h-7"
                  onClick={() => rollbackMutation.mutate({ versionId: v.versionId, reason: "Manual rollback from console" })}
                  disabled={i === 0 || rollbackMutation.isPending}
                  data-testid={`button-rollback-${v.versionId}`}
                >
                  <RotateCcw className="h-3 w-3 mr-1" /> Rollback
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Safety Modes Tab ──────────────────────────────────────────────────────────

function SafetyModesTab() {
  const { toast } = useToast();
  const [reason, setReason] = useState("");

  const { data: modesData, refetch } = useQuery<any>({
    queryKey: ["/api/ci/safety-modes"],
  });

  const setModeMutation = useMutation({
    mutationFn: async (mode: string) => {
      const res = await apiRequest("POST", "/api/ci/safety-modes/set", { mode, reason });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: `Safety mode set to ${data.state?.mode}` });
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["/api/ci/safety-modes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ci/health"] });
    },
    onError: () => toast({ title: "Mode change failed", variant: "destructive" }),
  });

  const current = modesData?.current?.mode ?? "observe_only";
  const modes = modesData?.all ?? [];

  const MODE_ICONS: Record<string, { icon: any; color: string; bg: string; border: string }> = {
    observe_only:      { icon: Eye,  color: "text-blue-600",   bg: "bg-blue-50 dark:bg-blue-950/30",   border: "border-blue-200 dark:border-blue-800" },
    assisted_learning: { icon: Zap,  color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-950/30", border: "border-yellow-200 dark:border-yellow-800" },
    controlled_auto:   { icon: Cpu,  color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-950/30", border: "border-purple-200 dark:border-purple-800" },
  };

  const CONSTRAINTS: Record<string, string[]> = {
    observe_only: [
      "All suggestions visible but read-only",
      "No automated changes of any kind",
      "Manual deploy required for every suggestion",
      "Simulation and analysis fully active",
    ],
    assisted_learning: [
      "All suggestions surface in approval queue",
      "Manual approval required for every change",
      "Red flags, medications, pediatric, pregnancy always need physician",
      "No auto-apply under any circumstances",
    ],
    controlled_auto: [
      "Low-risk weight adjustments (<0.3 score) may auto-apply after 24h",
      "Requires no physician rejection during the 24h window",
      "Red flags, medications, pediatric, pregnancy ALWAYS manual",
      "Complete audit trail for every auto-applied change",
    ],
  };

  return (
    <div className="space-y-5" data-testid="safety-modes-tab">
      <div>
        <h2 className="text-base font-semibold">System Safety Mode</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Safety modes control how much autonomy the learning system has. Changes are logged to the audit trail and require a reason.
        </p>
      </div>

      <div>
        <Label className="text-xs">Reason for mode change (required for escalation)</Label>
        <Input
          className="mt-1 max-w-lg"
          placeholder="e.g. Initiating pilot learning phase after physician review"
          value={reason}
          onChange={e => setReason(e.target.value)}
          data-testid="input-mode-change-reason"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {modes.map((mode: any) => {
          const meta = MODE_ICONS[mode.mode];
          const Icon = meta?.icon ?? Eye;
          const isActive = mode.active;
          const constraints = CONSTRAINTS[mode.mode] ?? [];
          return (
            <Card
              key={mode.mode}
              className={`transition-all ${isActive ? `ring-2 ring-offset-2 ring-${meta?.color?.replace("text-", "")} ${meta?.bg} ${meta?.border}` : "hover:border-gray-300"}`}
            >
              <CardContent className="pt-5 pb-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-5 w-5 ${meta?.color}`} />
                    <h3 className="font-semibold text-sm capitalize">{mode.mode.replace(/_/g, " ")}</h3>
                  </div>
                  {isActive && <Badge className="text-xs bg-green-100 text-green-800">Active</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mb-3">{mode.description}</p>
                <ul className="space-y-1.5 mb-4">
                  {constraints.map((c, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs">
                      <CheckCircle2 className="h-3 w-3 text-muted-foreground flex-shrink-0 mt-0.5" />
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  size="sm"
                  variant={isActive ? "secondary" : "outline"}
                  className="w-full"
                  disabled={isActive || setModeMutation.isPending || (mode.mode !== "observe_only" && !reason)}
                  onClick={() => setModeMutation.mutate(mode.mode)}
                  data-testid={`button-set-mode-${mode.mode}`}
                >
                  {isActive ? (
                    <><Lock className="h-3.5 w-3.5 mr-1" /> Currently Active</>
                  ) : (
                    <><Shield className="h-3.5 w-3.5 mr-1" /> Activate</>
                  )}
                </Button>
                {mode.mode !== "observe_only" && !reason && !isActive && (
                  <p className="text-xs text-muted-foreground text-center mt-2">Enter a reason above to activate</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {modesData?.current && (
        <Card className="bg-muted/30">
          <CardContent className="py-3">
            <p className="text-xs font-medium text-muted-foreground">Current mode set by</p>
            <p className="text-sm">{modesData.current.setBy} · {ago(modesData.current.setAt)}</p>
            {modesData.current.reason && <p className="text-xs text-muted-foreground mt-1">"{modesData.current.reason}"</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function AutonomousLearningConsolePage() {
  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6" data-testid="autonomous-learning-console">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Brain className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold">Autonomous Learning Console</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Self-testing, self-learning, and governance system — 100% human oversight required for all clinical changes
          </p>
        </div>
        <Badge variant="outline" className="border-blue-300 text-blue-700 dark:text-blue-300">
          <Shield className="h-3 w-3 mr-1" /> Physician-Gated
        </Badge>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full justify-start flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="overview"  className="text-xs" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="simulation" className="text-xs" data-testid="tab-simulation">Simulation</TabsTrigger>
          <TabsTrigger value="learning"  className="text-xs" data-testid="tab-learning">Learning Queue</TabsTrigger>
          <TabsTrigger value="drift"     className="text-xs" data-testid="tab-drift">Drift Monitor</TabsTrigger>
          <TabsTrigger value="audit"     className="text-xs" data-testid="tab-audit">Audit Trail</TabsTrigger>
          <TabsTrigger value="versions"  className="text-xs" data-testid="tab-versions">Versions</TabsTrigger>
          <TabsTrigger value="safety"    className="text-xs" data-testid="tab-safety">Safety Modes</TabsTrigger>
        </TabsList>

        <TabsContent value="overview"   className="mt-4"><OverviewTab /></TabsContent>
        <TabsContent value="simulation" className="mt-4"><SimulationTab /></TabsContent>
        <TabsContent value="learning"   className="mt-4"><LearningQueueTab /></TabsContent>
        <TabsContent value="drift"      className="mt-4"><DriftMonitorTab /></TabsContent>
        <TabsContent value="audit"      className="mt-4"><AuditTrailTab /></TabsContent>
        <TabsContent value="versions"   className="mt-4"><VersionsTab /></TabsContent>
        <TabsContent value="safety"     className="mt-4"><SafetyModesTab /></TabsContent>
      </Tabs>
    </div>
  );
}
