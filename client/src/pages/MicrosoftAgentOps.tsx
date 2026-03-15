import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Loader2, Cpu, Play, ChevronDown, ChevronRight, FileText,
  Brain, Stethoscope, ClipboardList, Zap, History, Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Step = { agentId: string; action: string; input: unknown; output?: unknown; timestamp: string };
type Session = { sessionId: string; steps: Step[]; status: string; createdAt: string };

interface ReasoningResult {
  hypothesis: string;
  confidence: number;
  evidenceSupporting: string[];
  evidenceAgainst: string[];
  nextSteps: string[];
}

interface ReviewSuggestion {
  area: string;
  suggestion: string;
  priority: "low" | "medium" | "high";
}

interface ChartSection {
  title: string;
  content: string;
}

interface AsyncJob {
  jobId: string;
  type: "reason" | "chart";
  status: "pending" | "running" | "complete" | "error";
  result?: unknown;
  error?: string;
  startedAt: string;
  completedAt?: string;
  input: unknown;
}

interface ChainHistoryRun {
  id: string;
  type: "tool" | "chain";
  tool?: string;
  steps?: Array<{ tool: string; input: unknown }>;
  result: unknown;
  latencyMs: number;
  error?: string;
  timestamp: string | null;
}

function priorityColor(p: string) {
  if (p === "high") return "destructive";
  if (p === "medium") return "secondary";
  return "outline";
}

function jobStatusBadge(status: AsyncJob["status"]) {
  const variant = status === "complete" ? "default" : status === "error" ? "destructive" : "secondary";
  const label = status === "pending" ? "Queued" : status === "running" ? "Running…" : status === "complete" ? "Complete" : "Error";
  return <Badge variant={variant} className="text-xs">{label}</Badge>;
}

function SessionCard({ session }: { session: Session }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card data-testid={`session-${session.sessionId}`} className="border">
      <CardContent className="pt-4">
        <button className="w-full flex items-start justify-between gap-3 text-left" onClick={() => setExpanded(!expanded)}>
          <div>
            <div className="text-xs font-mono text-muted-foreground">{session.sessionId}</div>
            <div className="text-xs mt-1 text-muted-foreground">{session.steps.length} steps · {new Date(session.createdAt).toLocaleString()}</div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={session.status === "completed" ? "default" : session.status === "active" ? "secondary" : "destructive"} className="text-xs">{session.status}</Badge>
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </div>
        </button>
        {expanded && session.steps.length > 0 && (
          <div className="mt-4 space-y-2 border-t pt-3">
            {session.steps.map((step, i) => (
              <div key={i} className="bg-muted/30 rounded-md p-3 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold font-mono">{step.agentId} → {step.action}</span>
                  <span className="text-muted-foreground">{new Date(step.timestamp).toLocaleTimeString()}</span>
                </div>
                {step.input && <div className="text-muted-foreground"><span className="font-medium">Input: </span><span className="font-mono">{JSON.stringify(step.input).slice(0, 120)}</span></div>}
                {step.output && <div className="text-muted-foreground"><span className="font-medium">Output: </span><span className="font-mono">{JSON.stringify(step.output).slice(0, 200)}</span></div>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ChainHistoryCard({ run }: { run: ChainHistoryRun }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card data-testid={`chain-run-${run.id}`} className="border">
      <CardContent className="pt-4">
        <button className="w-full flex items-start justify-between gap-3 text-left" onClick={() => setExpanded(!expanded)}>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Badge variant="outline" className="text-xs shrink-0">{run.type}</Badge>
            <span className="text-xs font-mono truncate">{run.tool ?? `chain (${run.steps?.length ?? 0} steps)`}</span>
            {run.error && <Badge variant="destructive" className="text-xs shrink-0">Error</Badge>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground font-mono">{run.latencyMs}ms</span>
            <span className="text-xs text-muted-foreground">{run.timestamp ? new Date(run.timestamp).toLocaleTimeString() : "—"}</span>
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </div>
        </button>
        {expanded && (
          <div className="mt-3 border-t pt-3 space-y-2">
            {run.error && <p className="text-xs text-destructive font-mono">{run.error}</p>}
            {run.steps && run.steps.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">Chain steps:</div>
                {run.steps.map((s, i) => (
                  <div key={i} className="bg-muted/30 rounded p-2 text-xs font-mono">
                    {i + 1}. {s.tool} — {JSON.stringify(s.input).slice(0, 80)}
                  </div>
                ))}
              </div>
            )}
            {run.result != null && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">Output:</div>
                <pre className="bg-muted/30 rounded p-2 text-xs font-mono overflow-x-auto whitespace-pre-wrap">{JSON.stringify(run.result, null, 2).slice(0, 600)}</pre>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function MicrosoftAgentOps() {
  const { authFetch } = useAuth();
  const { toast } = useToast();

  const { data: sessionsData, isLoading: sessionsLoading, refetch } = useQuery<{ sessions: Session[] }>({
    queryKey: ["/api/msAgentTasks/sessions"],
  });

  const createSessionMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/msAgentTasks/sessions", { method: "POST" });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Session created" });
      queryClient.invalidateQueries({ queryKey: ["/api/msAgentTasks/sessions"] });
    },
  });

  // ── Sync reasoning ─────────────────────────────────────────────────────
  const [symptoms, setSymptoms] = useState("");
  const [history, setHistory] = useState("");
  const [reasoningResult, setReasoningResult] = useState<ReasoningResult | null>(null);

  const reasonMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/msAgentTasks/reason", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symptoms: symptoms.split(",").map((s) => s.trim()).filter(Boolean),
          history: history.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      });
      return res.json() as Promise<ReasoningResult>;
    },
    onSuccess: (data) => setReasoningResult(data),
    onError: (e: any) => toast({ title: "Reasoning failed", description: e?.message, variant: "destructive" }),
  });

  // ── Async reasoning with job polling ──────────────────────────────────
  const [asyncJobId, setAsyncJobId] = useState<string | null>(null);
  const [asyncResult, setAsyncResult] = useState<ReasoningResult | null>(null);

  const asyncReasonMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/msAgentTasks/reason/async", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symptoms: symptoms.split(",").map((s) => s.trim()).filter(Boolean),
          history: history.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      });
      return res.json() as Promise<{ jobId: string; status: string }>;
    },
    onSuccess: (data) => {
      setAsyncJobId(data.jobId);
      setAsyncResult(null);
      toast({ title: "Async job queued", description: `Job ID: ${data.jobId.slice(0, 20)}…` });
    },
    onError: (e: any) => toast({ title: "Failed to queue job", description: e?.message, variant: "destructive" }),
  });

  const { data: jobData } = useQuery<AsyncJob>({
    queryKey: ["/api/msAgentTasks/jobs", asyncJobId],
    queryFn: async () => {
      const res = await authFetch(`/api/msAgentTasks/jobs/${asyncJobId}`);
      return res.json();
    },
    enabled: !!asyncJobId,
    refetchInterval: (q) => {
      const status = (q.state.data as AsyncJob | undefined)?.status;
      return status === "complete" || status === "error" ? false : 2000;
    },
    staleTime: 0,
  });

  if (jobData?.status === "complete" && jobData.result && asyncResult === null) {
    setAsyncResult(jobData.result as ReasoningResult);
  }

  // ── Other agents ───────────────────────────────────────────────────────
  const [reviewCaseId, setReviewCaseId] = useState("");
  const [reviewResult, setReviewResult] = useState<ReviewSuggestion[] | null>(null);

  const reviewMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch(`/api/msAgentTasks/review/${reviewCaseId}`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      return json.suggestions as ReviewSuggestion[];
    },
    onSuccess: (data) => setReviewResult(data),
    onError: (e: any) => toast({ title: "Review failed", description: e?.message, variant: "destructive" }),
  });

  const [chartCaseId, setChartCaseId] = useState("");
  const [chartSections, setChartSections] = useState<ChartSection[] | null>(null);

  const chartMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch(`/api/msAgentTasks/chart/${chartCaseId}`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      return json.sections as ChartSection[];
    },
    onSuccess: (data) => setChartSections(data),
    onError: (e: any) => toast({ title: "Chart build failed", description: e?.message, variant: "destructive" }),
  });

  // ── LangChain chain history ────────────────────────────────────────────
  const { data: historyData, isLoading: historyLoading, refetch: refetchHistory } = useQuery<{ count: number; history: ChainHistoryRun[] }>({
    queryKey: ["/api/langchain/history"],
    refetchInterval: 30_000,
  });

  const sessions = sessionsData?.sessions || [];
  const chainHistory = historyData?.history || [];

  return (
    <div className="p-4 sm:p-6 space-y-4" data-testid="page-ms-agent-ops">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Cpu className="h-5 w-5 text-blue-600" />
          <h2 className="text-xl font-semibold">Microsoft Agent Operations</h2>
          <Badge variant="secondary" className="text-xs">Clinical AI Suite</Badge>
        </div>
      </div>

      <Tabs defaultValue="sessions">
        <TabsList className="flex-wrap h-auto gap-0.5">
          <TabsTrigger value="sessions" className="gap-1 text-xs"><Brain className="w-3.5 h-3.5" /> Sessions</TabsTrigger>
          <TabsTrigger value="reasoning" className="gap-1 text-xs"><Stethoscope className="w-3.5 h-3.5" /> Clinical Reasoning</TabsTrigger>
          <TabsTrigger value="review" className="gap-1 text-xs"><ClipboardList className="w-3.5 h-3.5" /> Case Review</TabsTrigger>
          <TabsTrigger value="chart" className="gap-1 text-xs"><FileText className="w-3.5 h-3.5" /> Chart Builder</TabsTrigger>
          <TabsTrigger value="history" className="gap-1 text-xs"><History className="w-3.5 h-3.5" /> Chain History</TabsTrigger>
        </TabsList>

        {/* ── Sessions ── */}
        <TabsContent value="sessions" className="space-y-4 pt-4">
          <div className="flex gap-2">
            <Button size="sm" onClick={() => createSessionMutation.mutate()} disabled={createSessionMutation.isPending} data-testid="button-create-session">
              {createSessionMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Play className="w-4 h-4 mr-1" />}
              New Session
            </Button>
            <Button size="sm" variant="outline" onClick={() => refetch()}>Refresh</Button>
          </div>
          {sessionsLoading ? (
            <div className="flex justify-center py-12" data-testid="status-loading"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="text-empty">No agent sessions yet. Create one to start.</p>
          ) : (
            <div className="space-y-2">{sessions.map((s) => <SessionCard key={s.sessionId} session={s} />)}</div>
          )}
        </TabsContent>

        {/* ── Clinical Reasoning ── */}
        <TabsContent value="reasoning" className="space-y-4 pt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Clinical Reasoning Engine (GPT-4o)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label>Symptoms (comma-separated)</Label>
                <Input value={symptoms} onChange={(e) => setSymptoms(e.target.value)} placeholder="fever, cough, sore throat, fatigue" data-testid="input-symptoms" />
              </div>
              <div className="space-y-1">
                <Label>Patient History (comma-separated)</Label>
                <Input value={history} onChange={(e) => setHistory(e.target.value)} placeholder="hypertension, diabetes, penicillin allergy" data-testid="input-history" />
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button onClick={() => reasonMutation.mutate()} disabled={!symptoms.trim() || reasonMutation.isPending} data-testid="button-run-reasoning">
                  {reasonMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Brain className="w-4 h-4 mr-2" />}
                  Run (Sync)
                </Button>
                <Button variant="outline" onClick={() => asyncReasonMutation.mutate()} disabled={!symptoms.trim() || asyncReasonMutation.isPending} data-testid="button-run-reasoning-async">
                  {asyncReasonMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
                  Run Async (GPT-4o Background)
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Async job status */}
          {asyncJobId && jobData && (
            <Card data-testid="card-async-job">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-mono text-muted-foreground truncate">{asyncJobId}</div>
                  {jobStatusBadge(jobData.status)}
                </div>
                {(jobData.status === "pending" || jobData.status === "running") && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> GPT-4o is processing in the background…
                  </div>
                )}
                {jobData.status === "error" && (
                  <p className="text-xs text-destructive">{jobData.error}</p>
                )}
                {jobData.completedAt && (
                  <p className="text-xs text-muted-foreground mt-1">
                    <Clock className="inline w-3 h-3 mr-1" />
                    Completed at {new Date(jobData.completedAt).toLocaleTimeString()}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Display sync or async result */}
          {(reasoningResult || asyncResult) && (() => {
            const r = asyncResult ?? reasoningResult!;
            return (
              <Card data-testid="card-reasoning-result">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>Reasoning Output {asyncResult ? <Badge variant="outline" className="text-xs ml-2">Async</Badge> : null}</span>
                    <Badge className="text-xs">{Math.round(r.confidence * 100)}% confidence</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Primary Hypothesis</div>
                    <div className="font-semibold text-sm">{r.hypothesis}</div>
                    <Progress value={r.confidence * 100} className="h-2 mt-2" />
                  </div>
                  {r.evidenceSupporting.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">Supporting Evidence</div>
                      <ul className="list-disc list-inside space-y-0.5">{r.evidenceSupporting.map((e, i) => <li key={i} className="text-xs">{e}</li>)}</ul>
                    </div>
                  )}
                  {r.evidenceAgainst.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-destructive mb-1">Evidence Against</div>
                      <ul className="list-disc list-inside space-y-0.5">{r.evidenceAgainst.map((e, i) => <li key={i} className="text-xs">{e}</li>)}</ul>
                    </div>
                  )}
                  {r.nextSteps.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-blue-700 dark:text-blue-400 mb-1">Recommended Next Steps</div>
                      <ul className="list-disc list-inside space-y-0.5">{r.nextSteps.map((s, i) => <li key={i} className="text-xs">{s}</li>)}</ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}
        </TabsContent>

        {/* ── Case Review ── */}
        <TabsContent value="review" className="space-y-4 pt-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Case Completeness Review</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label>Case ID</Label>
                <Input value={reviewCaseId} onChange={(e) => setReviewCaseId(e.target.value)} placeholder="e.g. case_abc123" data-testid="input-review-case-id" />
              </div>
              <Button onClick={() => reviewMutation.mutate()} disabled={!reviewCaseId.trim() || reviewMutation.isPending} data-testid="button-run-review">
                {reviewMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ClipboardList className="w-4 h-4 mr-2" />}
                Review Case
              </Button>
            </CardContent>
          </Card>
          {reviewResult && (
            <Card data-testid="card-review-result">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2">Review Suggestions <Badge variant="secondary">{reviewResult.length} items</Badge></CardTitle></CardHeader>
              <CardContent>
                {reviewResult.length === 0 ? (
                  <p className="text-sm text-green-600 font-medium">Case appears complete — no issues found.</p>
                ) : (
                  <div className="space-y-2">
                    {reviewResult.map((s, i) => (
                      <div key={i} className="flex items-start gap-3 p-2 rounded-md border" data-testid={`review-item-${i}`}>
                        <Badge variant={priorityColor(s.priority) as any} className="text-xs shrink-0 mt-0.5">{s.priority}</Badge>
                        <div>
                          <div className="text-xs font-medium font-mono">{s.area}</div>
                          <div className="text-xs text-muted-foreground">{s.suggestion}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Chart Builder ── */}
        <TabsContent value="chart" className="space-y-4 pt-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Clinical Chart Builder (GPT-4o)</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label>Case ID</Label>
                <Input value={chartCaseId} onChange={(e) => setChartCaseId(e.target.value)} placeholder="e.g. case_abc123" data-testid="input-chart-case-id" />
              </div>
              <Button onClick={() => chartMutation.mutate()} disabled={!chartCaseId.trim() || chartMutation.isPending} data-testid="button-build-chart">
                {chartMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
                Build Chart
              </Button>
            </CardContent>
          </Card>
          {chartSections && (
            <Card data-testid="card-chart-result">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Clinical Chart Sections</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {chartSections.map((s, i) => (
                  <div key={i} className="border-l-2 border-primary pl-3 space-y-0.5">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{s.title}</div>
                    <div className="text-sm">{s.content}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Chain History (T005) ── */}
        <TabsContent value="history" className="space-y-4 pt-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">LangChain Run History</span>
              {historyData && (
                <Badge variant="secondary" className="text-xs">{historyData.count} runs</Badge>
              )}
            </div>
            <Button size="sm" variant="outline" onClick={() => refetchHistory()} data-testid="button-refresh-history">
              Refresh
            </Button>
          </div>

          {historyLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : chainHistory.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground" data-testid="text-history-empty">
              No chain runs recorded yet. Use the LangChain API to execute tools or chain sequences.
            </div>
          ) : (
            <div className="space-y-2">
              {chainHistory.map((run) => <ChainHistoryCard key={run.id} run={run} />)}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
