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
import { Loader2, Cpu, Play, ChevronDown, ChevronRight, FileText, Brain, Stethoscope, ClipboardList } from "lucide-react";
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

function priorityColor(p: string) {
  if (p === "high") return "destructive";
  if (p === "medium") return "secondary";
  return "outline";
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
            <Badge
              variant={session.status === "completed" ? "default" : session.status === "active" ? "secondary" : "destructive"}
              className="text-xs"
            >
              {session.status}
            </Badge>
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
                {step.input && (
                  <div className="text-muted-foreground">
                    <span className="font-medium">Input: </span>
                    <span className="font-mono">{JSON.stringify(step.input).slice(0, 120)}</span>
                  </div>
                )}
                {step.output && (
                  <div className="text-muted-foreground">
                    <span className="font-medium">Output: </span>
                    <span className="font-mono">{JSON.stringify(step.output).slice(0, 200)}</span>
                  </div>
                )}
              </div>
            ))}
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

  const sessions = sessionsData?.sessions || [];

  return (
    <div className="p-6 space-y-4" data-testid="page-ms-agent-ops">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Cpu className="h-5 w-5 text-blue-600" />
          <h2 className="text-xl font-semibold">Microsoft Agent Operations</h2>
          <Badge variant="secondary" className="text-xs">Clinical AI Suite</Badge>
        </div>
      </div>

      <Tabs defaultValue="sessions">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="sessions" className="gap-1 text-xs"><Brain className="w-3.5 h-3.5" /> Sessions</TabsTrigger>
          <TabsTrigger value="reasoning" className="gap-1 text-xs"><Stethoscope className="w-3.5 h-3.5" /> Clinical Reasoning</TabsTrigger>
          <TabsTrigger value="review" className="gap-1 text-xs"><ClipboardList className="w-3.5 h-3.5" /> Case Review</TabsTrigger>
          <TabsTrigger value="chart" className="gap-1 text-xs"><FileText className="w-3.5 h-3.5" /> Chart Builder</TabsTrigger>
        </TabsList>

        <TabsContent value="sessions" className="space-y-4 pt-4">
          <div className="flex gap-2">
            <Button size="sm" onClick={() => createSessionMutation.mutate()} disabled={createSessionMutation.isPending} data-testid="button-create-session">
              {createSessionMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Play className="w-4 h-4 mr-1" />}
              New Session
            </Button>
            <Button size="sm" variant="outline" onClick={() => refetch()}>Refresh</Button>
          </div>

          {sessionsLoading ? (
            <div className="flex justify-center py-12" data-testid="status-loading">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="text-empty">No agent sessions yet. Create one to start.</p>
          ) : (
            <div className="space-y-2">
              {sessions.map((s) => <SessionCard key={s.sessionId} session={s} />)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="reasoning" className="space-y-4 pt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Clinical Reasoning Engine</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label>Symptoms (comma-separated)</Label>
                <Input
                  value={symptoms}
                  onChange={(e) => setSymptoms(e.target.value)}
                  placeholder="fever, cough, sore throat, fatigue"
                  data-testid="input-symptoms"
                />
              </div>
              <div className="space-y-1">
                <Label>Patient History (comma-separated)</Label>
                <Input
                  value={history}
                  onChange={(e) => setHistory(e.target.value)}
                  placeholder="hypertension, diabetes, penicillin allergy"
                  data-testid="input-history"
                />
              </div>
              <Button
                onClick={() => reasonMutation.mutate()}
                disabled={!symptoms.trim() || reasonMutation.isPending}
                data-testid="button-run-reasoning"
              >
                {reasonMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Brain className="w-4 h-4 mr-2" />}
                Run Reasoning
              </Button>
            </CardContent>
          </Card>

          {reasoningResult && (
            <Card data-testid="card-reasoning-result">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>Reasoning Output</span>
                  <Badge className="text-xs">{Math.round(reasoningResult.confidence * 100)}% confidence</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Primary Hypothesis</div>
                  <div className="font-semibold text-sm">{reasoningResult.hypothesis}</div>
                  <Progress value={reasoningResult.confidence * 100} className="h-2 mt-2" />
                </div>
                {reasoningResult.evidenceSupporting.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">Supporting Evidence</div>
                    <ul className="list-disc list-inside space-y-0.5">
                      {reasoningResult.evidenceSupporting.map((e, i) => (
                        <li key={i} className="text-xs">{e}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {reasoningResult.evidenceAgainst.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-destructive mb-1">Evidence Against</div>
                    <ul className="list-disc list-inside space-y-0.5">
                      {reasoningResult.evidenceAgainst.map((e, i) => (
                        <li key={i} className="text-xs">{e}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {reasoningResult.nextSteps.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-blue-700 dark:text-blue-400 mb-1">Recommended Next Steps</div>
                    <ul className="list-disc list-inside space-y-0.5">
                      {reasoningResult.nextSteps.map((s, i) => (
                        <li key={i} className="text-xs">{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="review" className="space-y-4 pt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Case Completeness Review</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label>Case ID</Label>
                <Input
                  value={reviewCaseId}
                  onChange={(e) => setReviewCaseId(e.target.value)}
                  placeholder="e.g. case_abc123"
                  data-testid="input-review-case-id"
                />
              </div>
              <Button
                onClick={() => reviewMutation.mutate()}
                disabled={!reviewCaseId.trim() || reviewMutation.isPending}
                data-testid="button-run-review"
              >
                {reviewMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ClipboardList className="w-4 h-4 mr-2" />}
                Review Case
              </Button>
            </CardContent>
          </Card>

          {reviewResult && (
            <Card data-testid="card-review-result">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  Review Suggestions
                  <Badge variant="secondary">{reviewResult.length} items</Badge>
                </CardTitle>
              </CardHeader>
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

        <TabsContent value="chart" className="space-y-4 pt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Clinical Chart Builder</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label>Case ID</Label>
                <Input
                  value={chartCaseId}
                  onChange={(e) => setChartCaseId(e.target.value)}
                  placeholder="e.g. case_abc123"
                  data-testid="input-chart-case-id"
                />
              </div>
              <Button
                onClick={() => chartMutation.mutate()}
                disabled={!chartCaseId.trim() || chartMutation.isPending}
                data-testid="button-build-chart"
              >
                {chartMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
                Build Chart
              </Button>
            </CardContent>
          </Card>

          {chartSections && (
            <Card data-testid="card-chart-result">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Clinical Chart Sections</CardTitle>
              </CardHeader>
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
      </Tabs>
    </div>
  );
}
