import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Activity, AlertTriangle, CheckCircle, Clock, GitCompare, Hash, Minus, Plus, RefreshCw, Search, Star, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";

type TraceSummary = {
  runId: string;
  caseId: string;
  scenarioId: string | null;
  chiefComplaint: string;
  isTest: boolean;
  disposition: string;
  redFlags: string[];
  scores: Record<string, number>;
  stopReason: string;
  stepCount: number;
  eventCount: number;
  normalizedHash: string;
  createdAt: string;
  llmConfig?: { enabled?: boolean; toneProfile?: string };
};

type TraceStep = {
  step: number;
  actor: string;
  action: { type: string; [key: string]: unknown };
  inputsUsed: string[];
  outputs: Record<string, unknown>;
  ruleRefs: string[];
};

type TraceEvent = {
  type: string;
  ruleId?: string;
  severity: "info" | "warn" | "error";
  message?: string;
};

type FullTrace = {
  runId: string;
  caseId: string;
  scenarioId: string | null;
  chiefComplaint: string;
  isTest: boolean;
  sheetEnv: string;
  rulesetHash: string;
  commitSha: string;
  stopReason: string;
  steps: TraceStep[];
  events: TraceEvent[];
  normalized: {
    disposition: string;
    dx: string[];
    scores: Record<string, number>;
    redFlags: string[];
  };
  normalizedHash: string;
  createdAt: string;
};

type CompareFailure = {
  code: string;
  path: string;
  details?: string;
  baseline?: unknown;
  candidate?: unknown;
};

type StepDiff = {
  step: number;
  status: "same" | "changed" | "added" | "removed";
  baseline?: { actionType: string; ruleRefs: string[]; outputKeys: string[] };
  candidate?: { actionType: string; ruleRefs: string[]; outputKeys: string[] };
  changes?: string[];
};

type CompareResult = {
  ok: boolean;
  pass: boolean;
  hardFailures: CompareFailure[];
  softFailures: CompareFailure[];
  summary: { hard: number; soft: number };
  stepDiff: StepDiff[];
  baselineRunId: string;
  candidateRunId: string;
};

function dispositionColor(disp: string): string {
  if (disp.includes("ed") || disp.includes("urgent")) return "text-red-600 dark:text-red-400";
  if (disp.includes("routine")) return "text-yellow-600 dark:text-yellow-400";
  if (disp.includes("self_care") || disp.includes("home")) return "text-green-600 dark:text-green-400";
  return "text-muted-foreground";
}

function severityVariant(sev: string): "default" | "secondary" | "destructive" | "outline" {
  if (sev === "error") return "destructive";
  if (sev === "warn") return "secondary";
  return "outline";
}

function actionIcon(type: string) {
  if (type === "COMPUTE_SCORE") return <Hash className="w-3.5 h-3.5" />;
  if (type === "FLAG_RED_FLAG") return <AlertTriangle className="w-3.5 h-3.5" />;
  if (type === "SET_DISPOSITION") return <CheckCircle className="w-3.5 h-3.5" />;
  if (type === "STOP") return <X className="w-3.5 h-3.5" />;
  return <Activity className="w-3.5 h-3.5" />;
}

function stepDiffColor(status: string): string {
  if (status === "changed") return "bg-yellow-50 dark:bg-yellow-900/20 border-l-2 border-yellow-400";
  if (status === "added") return "bg-green-50 dark:bg-green-900/20 border-l-2 border-green-400";
  if (status === "removed") return "bg-red-50 dark:bg-red-900/20 border-l-2 border-red-400";
  return "bg-muted/30";
}

function TraceDiffView({ baseRunId, candRunId, onBack }: { baseRunId: string; candRunId: string; onBack: () => void }) {
  const { data, isLoading, error } = useQuery<CompareResult>({
    queryKey: ["/api/traces/compare", baseRunId, candRunId],
  });

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4">
        <Button variant="ghost" onClick={onBack} data-testid="button-back-diff">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <p className="text-destructive mt-4">Failed to load comparison: {String(error)}</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="ghost" onClick={onBack} data-testid="button-back-diff">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <h2 className="text-lg font-semibold" data-testid="text-diff-title">Trace Diff</h2>
        <Badge variant={data.pass ? "secondary" : "destructive"} data-testid="badge-diff-result">
          {data.pass ? "PASS" : "FAIL"}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Baseline</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="font-mono text-sm" data-testid="text-baseline-id">{baseRunId.slice(0, 8)}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Candidate</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="font-mono text-sm" data-testid="text-candidate-id">{candRunId.slice(0, 8)}</span>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3 flex-wrap" data-testid="text-diff-summary">
              <span className="text-sm">Hard fails: <strong className={data.summary.hard > 0 ? "text-red-600 dark:text-red-400" : ""}>{data.summary.hard}</strong></span>
              <span className="text-sm">Soft fails: <strong className={data.summary.soft > 0 ? "text-yellow-600 dark:text-yellow-400" : ""}>{data.summary.soft}</strong></span>
            </div>
          </CardContent>
        </Card>
      </div>

      {data.hardFailures.length > 0 && (
        <Card className="border-red-200 dark:border-red-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Hard Failures ({data.hardFailures.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.hardFailures.map((f, idx) => (
                <div key={idx} className="p-2 rounded-md bg-red-50 dark:bg-red-900/20" data-testid={`hard-fail-${idx}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="destructive" className="text-xs">{f.code}</Badge>
                    <span className="text-xs text-muted-foreground font-mono">{f.path}</span>
                  </div>
                  {f.details && <p className="text-sm mt-1">{f.details}</p>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {data.softFailures.length > 0 && (
        <Card className="border-yellow-200 dark:border-yellow-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-yellow-600 dark:text-yellow-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Soft Failures ({data.softFailures.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.softFailures.map((f, idx) => (
                <div key={idx} className="p-2 rounded-md bg-yellow-50 dark:bg-yellow-900/20" data-testid={`soft-fail-${idx}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="text-xs">{f.code}</Badge>
                    <span className="text-xs text-muted-foreground font-mono">{f.path}</span>
                  </div>
                  {f.details && <p className="text-sm mt-1">{f.details}</p>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Step-by-Step Diff ({data.stepDiff.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[500px]">
            <div className="space-y-1">
              {data.stepDiff.map((sd) => (
                <div key={sd.step} className={`flex items-start gap-3 p-3 rounded-md ${stepDiffColor(sd.status)}`} data-testid={`diff-step-${sd.step}`}>
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-muted shrink-0 text-xs font-mono">
                    {sd.step}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={sd.status === "same" ? "outline" : sd.status === "changed" ? "secondary" : sd.status === "added" ? "default" : "destructive"} className="text-xs">
                        {sd.status === "same" ? "=" : sd.status === "changed" ? "~" : sd.status === "added" ? "+" : "-"}
                      </Badge>
                      {sd.baseline && (
                        <span className="font-mono text-sm">{sd.baseline.actionType}</span>
                      )}
                      {sd.status === "changed" && sd.candidate && sd.baseline?.actionType !== sd.candidate.actionType && (
                        <>
                          <span className="text-muted-foreground text-xs">-&gt;</span>
                          <span className="font-mono text-sm">{sd.candidate.actionType}</span>
                        </>
                      )}
                      {sd.status === "added" && sd.candidate && (
                        <span className="font-mono text-sm">{sd.candidate.actionType}</span>
                      )}
                    </div>
                    {sd.changes && sd.changes.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {sd.changes.map((c, ci) => (
                          <p key={ci} className="text-xs text-muted-foreground">{c}</p>
                        ))}
                      </div>
                    )}
                    {sd.baseline && sd.baseline.ruleRefs.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {sd.baseline.ruleRefs.map(r => (
                          <Badge key={r} variant="outline" className="text-xs">{r}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

const REVIEW_REASONS = [
  "too many questions",
  "missed key question",
  "tone annoyed patient",
  "premature escalation",
  "not empathic enough",
  "incorrect disposition",
  "excellent flow",
  "other",
];

function QualityReviewPanel({ runId }: { runId: string }) {
  const [selectedReason, setSelectedReason] = useState<string>("");

  const { data: reviewData, isLoading } = useQuery<{ ok: boolean; review: { rating: string; reason?: string; reviewedAt: string } | null }>({
    queryKey: ["/api/traces", runId, "review"],
  });

  const submitReview = useMutation({
    mutationFn: async (rating: string) => {
      const body: Record<string, string> = { rating };
      if (selectedReason) body.reason = selectedReason;
      return apiRequest("POST", `/api/traces/${runId}/review`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/traces", runId, "review"] });
    },
  });

  const existing = reviewData?.review;

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Star className="w-4 h-4" />
          Quality Review
        </CardTitle>
        {existing && (
          <Badge
            variant={existing.rating === "great" ? "default" : existing.rating === "bad" ? "destructive" : "secondary"}
            data-testid="badge-existing-review"
          >
            {existing.rating.toUpperCase()}
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-full" />
        ) : existing ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground" data-testid="text-review-info">
              Reviewed {new Date(existing.reviewedAt).toLocaleString()}
              {existing.reason && ` — "${existing.reason}"`}
            </p>
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                variant={existing.rating === "great" ? "default" : "outline"}
                onClick={() => submitReview.mutate("great")}
                disabled={submitReview.isPending}
                data-testid="button-review-great"
              >
                <ThumbsUp className="w-3.5 h-3.5 mr-1" />
                Great
              </Button>
              <Button
                size="sm"
                variant={existing.rating === "ok" ? "default" : "outline"}
                onClick={() => submitReview.mutate("ok")}
                disabled={submitReview.isPending}
                data-testid="button-review-ok"
              >
                OK
              </Button>
              <Button
                size="sm"
                variant={existing.rating === "bad" ? "destructive" : "outline"}
                onClick={() => submitReview.mutate("bad")}
                disabled={submitReview.isPending}
                data-testid="button-review-bad"
              >
                <ThumbsDown className="w-3.5 h-3.5 mr-1" />
                Bad
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">How was this run?</p>
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                onClick={() => submitReview.mutate("great")}
                disabled={submitReview.isPending}
                data-testid="button-review-great"
              >
                <ThumbsUp className="w-3.5 h-3.5 mr-1" />
                Great
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => submitReview.mutate("ok")}
                disabled={submitReview.isPending}
                data-testid="button-review-ok"
              >
                OK
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => submitReview.mutate("bad")}
                disabled={submitReview.isPending}
                data-testid="button-review-bad"
              >
                <ThumbsDown className="w-3.5 h-3.5 mr-1" />
                Bad
              </Button>
            </div>
            <Select value={selectedReason} onValueChange={setSelectedReason}>
              <SelectTrigger className="w-[250px]" data-testid="select-review-reason">
                <SelectValue placeholder="Optional: add a reason" />
              </SelectTrigger>
              <SelectContent>
                {REVIEW_REASONS.map(r => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TraceDetail({ runId, onBack }: { runId: string; onBack: () => void }) {
  const { data, isLoading, error } = useQuery<{ ok: boolean; trace: FullTrace }>({
    queryKey: ["/api/traces", runId],
  });

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !data?.trace) {
    return (
      <div className="p-4">
        <Button variant="ghost" onClick={onBack} data-testid="button-back-traces">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <p className="text-destructive mt-4">Failed to load trace: {String(error)}</p>
      </div>
    );
  }

  const trace = data.trace;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="ghost" onClick={onBack} data-testid="button-back-traces">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <span className="font-mono text-sm text-muted-foreground" data-testid="text-runid">{trace.runId}</span>
        {trace.isTest && <Badge variant="secondary">Test</Badge>}
        {trace.scenarioId && <Badge variant="outline">{trace.scenarioId}</Badge>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Disposition</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-lg font-semibold ${dispositionColor(trace.normalized.disposition)}`} data-testid="text-disposition">
              {trace.normalized.disposition}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Complaint</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold" data-testid="text-complaint">{trace.chiefComplaint}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Scores</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.entries(trace.normalized.scores).length > 0 ? (
              <div className="flex gap-2 flex-wrap" data-testid="text-scores">
                {Object.entries(trace.normalized.scores).map(([k, v]) => (
                  <Badge key={k} variant="outline">{k}: {v}</Badge>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">None</p>
            )}
          </CardContent>
        </Card>
      </div>

      {trace.normalized.redFlags.length > 0 && (
        <Card className="border-red-200 dark:border-red-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Red Flags
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 flex-wrap" data-testid="text-redflags">
              {trace.normalized.redFlags.map(f => (
                <Badge key={f} variant="destructive">{f}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {trace.normalized.dx.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Diagnoses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 flex-wrap" data-testid="text-diagnoses">
              {trace.normalized.dx.map(d => (
                <Badge key={d} variant="secondary">{d}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium">Steps ({trace.steps.length})</CardTitle>
          <div className="flex gap-2 text-xs text-muted-foreground flex-wrap">
            <span>Stop: {trace.stopReason}</span>
            <span>Env: {trace.sheetEnv}</span>
            <span>Hash: {trace.normalizedHash.slice(0, 8)}</span>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[500px]">
            <div className="space-y-2">
              {trace.steps.map((step, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 rounded-md bg-muted/30" data-testid={`step-${step.step}`}>
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted shrink-0">
                    {actionIcon(step.action.type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground">#{step.step}</span>
                      <Badge variant="outline" className="text-xs">{step.actor}</Badge>
                      <span className="font-mono text-sm font-medium">{step.action.type}</span>
                      {step.ruleRefs.map(r => (
                        <Badge key={r} variant="secondary" className="text-xs">{r}</Badge>
                      ))}
                    </div>
                    {step.inputsUsed.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Inputs: {step.inputsUsed.join(", ")}
                      </p>
                    )}
                    {Object.keys(step.outputs).length > 0 && (
                      <pre className="text-xs mt-1 p-2 rounded bg-muted overflow-x-auto">
                        {JSON.stringify(step.outputs, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {trace.events.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Events ({trace.events.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {trace.events.map((evt, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm" data-testid={`event-${idx}`}>
                  <Badge variant={severityVariant(evt.severity)} className="text-xs">{evt.severity}</Badge>
                  <span className="font-mono">{evt.type}</span>
                  {evt.ruleId && <span className="text-muted-foreground text-xs">[{evt.ruleId}]</span>}
                  {evt.message && <span className="text-muted-foreground text-xs truncate">{evt.message}</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <QualityReviewPanel runId={trace.runId} />

      <div className="text-xs text-muted-foreground flex gap-4 flex-wrap">
        <span>Created: {new Date(trace.createdAt).toLocaleString()}</span>
        <span>Commit: {trace.commitSha}</span>
        <span>Ruleset: {trace.rulesetHash}</span>
      </div>
    </div>
  );
}

export default function TraceViewer() {
  const [, navigate] = useLocation();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [complaintFilter, setComplaintFilter] = useState<string>("all");
  const [llmFilter, setLlmFilter] = useState<string>("all");
  const [compareMode, setCompareMode] = useState(false);
  const [baselineRunId, setBaselineRunId] = useState<string | null>(null);
  const [candidateRunId, setCandidateRunId] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);

  const { data, isLoading, error, refetch } = useQuery<{ ok: boolean; traces: TraceSummary[]; count: number }>({
    queryKey: ["/api/traces"],
  });

  if (showDiff && baselineRunId && candidateRunId) {
    return (
      <TraceDiffView
        baseRunId={baselineRunId}
        candRunId={candidateRunId}
        onBack={() => {
          setShowDiff(false);
          setBaselineRunId(null);
          setCandidateRunId(null);
          setCompareMode(false);
        }}
      />
    );
  }

  if (selectedRunId && !compareMode) {
    return <TraceDetail runId={selectedRunId} onBack={() => setSelectedRunId(null)} />;
  }

  const traces = data?.traces ?? [];
  const complaints = [...new Set(traces.map(t => t.chiefComplaint))];
  const filtered = traces.filter(t => {
    if (complaintFilter !== "all" && t.chiefComplaint !== complaintFilter) return false;
    if (llmFilter !== "all") {
      if (llmFilter === "llm_on" && t.llmConfig?.enabled !== true) return false;
      if (llmFilter === "llm_off" && t.llmConfig?.enabled !== false) return false;
      if (llmFilter.startsWith("tone_")) {
        const tone = llmFilter.replace("tone_", "");
        if (t.llmConfig?.toneProfile !== tone) return false;
      }
    }
    if (searchText) {
      const s = searchText.toLowerCase();
      return (
        t.runId.toLowerCase().includes(s) ||
        t.caseId.toLowerCase().includes(s) ||
        (t.scenarioId?.toLowerCase().includes(s) ?? false) ||
        t.disposition.toLowerCase().includes(s) ||
        t.chiefComplaint.toLowerCase().includes(s)
      );
    }
    return true;
  });

  const handleTraceClick = (runId: string) => {
    if (!compareMode) {
      setSelectedRunId(runId);
      return;
    }
    if (!baselineRunId) {
      setBaselineRunId(runId);
    } else if (!candidateRunId && runId !== baselineRunId) {
      setCandidateRunId(runId);
    }
  };

  const canRunDiff = compareMode && baselineRunId && candidateRunId;

  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold" data-testid="text-page-title">Agent Trace Viewer</h1>
          <p className="text-sm text-muted-foreground">Step-by-step agent flight recorder</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={compareMode ? "default" : "outline"}
            onClick={() => {
              setCompareMode(!compareMode);
              setBaselineRunId(null);
              setCandidateRunId(null);
            }}
            data-testid="button-compare-mode"
          >
            <GitCompare className="w-4 h-4 mr-2" />
            {compareMode ? "Exit Compare" : "Compare"}
          </Button>
          <Button variant="outline" onClick={() => navigate("/dashboard")} data-testid="button-dashboard">
            Dashboard
          </Button>
          <Button variant="outline" onClick={() => refetch()} data-testid="button-refresh">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {compareMode && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex-1 min-w-[150px]">
                <p className="text-xs text-muted-foreground mb-1">Baseline</p>
                <p className="font-mono text-sm" data-testid="text-compare-baseline">
                  {baselineRunId ? baselineRunId.slice(0, 8) : "Click a trace to select..."}
                </p>
              </div>
              <div className="flex-1 min-w-[150px]">
                <p className="text-xs text-muted-foreground mb-1">Candidate</p>
                <p className="font-mono text-sm" data-testid="text-compare-candidate">
                  {candidateRunId ? candidateRunId.slice(0, 8) : baselineRunId ? "Click another trace..." : "Select baseline first"}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                {canRunDiff && (
                  <Button onClick={() => setShowDiff(true)} data-testid="button-run-diff">
                    Run Diff
                  </Button>
                )}
                {(baselineRunId || candidateRunId) && (
                  <Button
                    variant="outline"
                    onClick={() => { setBaselineRunId(null); setCandidateRunId(null); }}
                    data-testid="button-clear-selection"
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by ID, scenario, disposition..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            className="pl-9"
            data-testid="input-search"
          />
        </div>
        <Select value={complaintFilter} onValueChange={setComplaintFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-complaint">
            <SelectValue placeholder="All complaints" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All complaints</SelectItem>
            {complaints.map(c => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={llmFilter} onValueChange={setLlmFilter}>
          <SelectTrigger className="w-[160px]" data-testid="select-llm-filter">
            <SelectValue placeholder="LLM variant" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All variants</SelectItem>
            <SelectItem value="llm_on">LLM on</SelectItem>
            <SelectItem value="llm_off">LLM off</SelectItem>
            <SelectItem value="tone_empathetic">Empathetic</SelectItem>
            <SelectItem value="tone_concise">Concise</SelectItem>
            <SelectItem value="tone_pediatric">Pediatric</SelectItem>
            <SelectItem value="tone_elderly">Elderly</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}

      {error && (
        <Card>
          <CardContent className="p-4">
            <p className="text-destructive">Failed to load traces. Make sure you are logged in as a provider.</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && filtered.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <Activity className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              {traces.length === 0
                ? "No traces yet. Run a scenario via WhatsApp (!scenario run <id>) or the test API to generate traces."
                : "No traces match your filters."}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {filtered.map(trace => {
          const isBaseline = compareMode && baselineRunId === trace.runId;
          const isCandidate = compareMode && candidateRunId === trace.runId;
          const selectionClass = isBaseline
            ? "ring-2 ring-blue-400"
            : isCandidate
            ? "ring-2 ring-purple-400"
            : "";

          return (
            <Card
              key={trace.runId}
              className={`cursor-pointer hover-elevate ${selectionClass}`}
              onClick={() => handleTraceClick(trace.runId)}
              data-testid={`card-trace-${trace.runId}`}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    {compareMode && (
                      <span className="text-xs font-medium">
                        {isBaseline && <Badge variant="outline">Baseline</Badge>}
                        {isCandidate && <Badge variant="outline">Candidate</Badge>}
                      </span>
                    )}
                    <span className="font-mono text-sm font-medium">{trace.runId.slice(0, 8)}</span>
                    {trace.isTest && <Badge variant="secondary">Test</Badge>}
                    {trace.scenarioId && <Badge variant="outline">{trace.scenarioId}</Badge>}
                    <Badge variant="outline">{trace.chiefComplaint}</Badge>
                    {trace.llmConfig?.enabled === true && (
                      <Badge variant="secondary" className="text-xs">LLM on</Badge>
                    )}
                    {trace.llmConfig?.enabled === false && (
                      <Badge variant="outline" className="text-xs">LLM off</Badge>
                    )}
                    {trace.llmConfig?.toneProfile && (
                      <Badge variant="outline" className="text-xs">{trace.llmConfig.toneProfile}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-medium text-sm ${dispositionColor(trace.disposition)}`}>
                      {trace.disposition}
                    </span>
                    {trace.redFlags.length > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        {trace.redFlags.length} flag{trace.redFlags.length > 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>
                </div>
                <Separator className="my-2" />
                <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1">
                    <Activity className="w-3 h-3" />
                    {trace.stepCount} steps
                  </span>
                  {Object.entries(trace.scores).map(([k, v]) => (
                    <span key={k}>{k}: {v}</span>
                  ))}
                  <span>{trace.stopReason}</span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(trace.createdAt).toLocaleString()}
                  </span>
                  <span className="font-mono">{trace.normalizedHash.slice(0, 8)}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
