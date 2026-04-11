import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Brain, Activity, FileSearch, Code, GitMerge, BookOpen, Upload, ChevronDown, ChevronRight, CheckCircle, XCircle, Clock, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type TaskType = "general" | "research" | "kb_audit" | "code_review" | "workflow_upgrade" | "article_compare";

interface RunResult {
  ok: boolean;
  session_id: string;
  task_type: TaskType;
  final_text: string;
  artifacts: string[];
  structured_output: Record<string, unknown>;
  raw: Record<string, unknown>;
  parsed?: Record<string, unknown>;
  error?: string;
}

interface RunRecord {
  id: string;
  task_type: TaskType;
  prompt: string;
  result: RunResult;
  at: string;
}

const TASK_META: Record<TaskType, { label: string; icon: JSX.Element; color: string }> = {
  general:          { label: "General",          icon: <Brain className="w-4 h-4" />,       color: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" },
  research:         { label: "Research",          icon: <BookOpen className="w-4 h-4" />,    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  kb_audit:         { label: "KB Audit",          icon: <FileSearch className="w-4 h-4" />,  color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  code_review:      { label: "Code Review",       icon: <Code className="w-4 h-4" />,        color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  workflow_upgrade: { label: "Workflow Upgrade",  icon: <GitMerge className="w-4 h-4" />,   color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  article_compare:  { label: "Article Compare",   icon: <Upload className="w-4 h-4" />,      color: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" },
};

function TaskBadge({ type }: { type: TaskType }) {
  const m = TASK_META[type];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${m.color}`} data-testid={`badge-task-${type}`}>
      {m.icon}{m.label}
    </span>
  );
}

function RunCard({ run, idx }: { run: RunRecord; idx: number }) {
  const [open, setOpen] = useState(false);
  const structured = run.result.parsed || run.result.structured_output;
  const hasStructured = Object.keys(structured).length > 0;
  const artCount = run.result.artifacts?.length ?? 0;

  return (
    <Card className="border border-border/60" data-testid={`card-run-${idx}`}>
      <CardHeader className="py-3 px-4 cursor-pointer" onClick={() => setOpen(p => !p)}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {open ? <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />}
            {run.result.ok
              ? <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
              : <XCircle className="w-4 h-4 text-red-500 shrink-0" />
            }
            <TaskBadge type={run.task_type} />
            <span className="text-sm text-muted-foreground truncate">{run.prompt.slice(0, 80)}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />{run.at}
            {artCount > 0 && <Badge variant="outline" className="text-xs">{artCount} artifact{artCount !== 1 ? "s" : ""}</Badge>}
          </div>
        </div>
      </CardHeader>
      {open && (
        <CardContent className="pt-0 px-4 pb-4 space-y-3">
          {run.result.final_text && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Agent Response</p>
              <pre className="text-sm bg-muted/50 rounded p-3 whitespace-pre-wrap max-h-64 overflow-y-auto" data-testid={`text-response-${idx}`}>{run.result.final_text}</pre>
            </div>
          )}
          {hasStructured && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Structured Output</p>
              <pre className="text-xs bg-muted/50 rounded p-3 whitespace-pre-wrap max-h-64 overflow-y-auto" data-testid={`text-structured-${idx}`}>{JSON.stringify(structured, null, 2)}</pre>
            </div>
          )}
          {artCount > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Artifacts</p>
              <div className="flex flex-wrap gap-1">
                {run.result.artifacts.map((a, i) => (
                  <Badge key={i} variant="secondary" className="text-xs font-mono" data-testid={`badge-artifact-${idx}-${i}`}>{a.split("/").pop()}</Badge>
                ))}
              </div>
            </div>
          )}
          {!run.result.ok && run.result.raw?.error && (
            <p className="text-sm text-red-600 dark:text-red-400" data-testid={`text-error-${idx}`}>{String(run.result.raw.error)}</p>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default function DeepAgentDashboard() {
  const { toast } = useToast();
  const [taskType, setTaskType] = useState<TaskType>("general");
  const [sessionId, setSessionId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [articleText, setArticleText] = useState("");
  const [moduleName, setModuleName] = useState("");
  const [runs, setRuns] = useState<RunRecord[]>([]);

  const needsArticle = taskType === "article_compare" || taskType === "kb_audit";

  const runMutation = useMutation({
    mutationFn: async () => {
      const sid = sessionId.trim() || `${taskType}-${Date.now()}`;
      let endpoint = "/api/deep-agent/run";
      let body: Record<string, unknown> = {
        session_id: sid,
        task_type: taskType,
        user_prompt: prompt,
        write_artifacts: true,
      };

      if (taskType === "article_compare") {
        endpoint = "/api/deep-agent/article-compare";
        body = { sessionId: sid, articleText, currentModuleName: moduleName, currentSystemSummary: "", additionalContext: {} };
      } else if (taskType === "kb_audit") {
        endpoint = "/api/deep-agent/kb-audit";
        body = { sessionId: sid, sourceText: articleText, moduleName };
      } else if (taskType === "workflow_upgrade") {
        endpoint = "/api/deep-agent/workflow-upgrade";
        body = { sessionId: sid, description: prompt, targetOutcome: moduleName };
      } else if (taskType === "code_review") {
        endpoint = "/api/deep-agent/code-review";
        body = { sessionId: sid, files: [], moduleName, architectureContext: prompt };
      } else if (taskType === "research") {
        endpoint = "/api/deep-agent/research";
        body = { sessionId: sid, topic: prompt };
      }

      return await apiRequest(endpoint, { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: (result: RunResult) => {
      const record: RunRecord = {
        id: `${Date.now()}`,
        task_type: taskType,
        prompt: needsArticle ? (articleText.slice(0, 120) || prompt) : prompt,
        result,
        at: new Date().toLocaleTimeString(),
      };
      setRuns(prev => [record, ...prev]);
      if (result.ok) {
        toast({ title: "Agent run complete", description: `Session ${result.session_id}` });
      } else {
        toast({ title: "Agent returned error", description: String(result.raw?.error || "Check response"), variant: "destructive" });
      }
    },
    onError: (err: any) => {
      toast({ title: "Request failed", description: err.message || "Unknown error", variant: "destructive" });
    },
  });

  const upgradeFromArticleMutation = useMutation({
    mutationFn: async () => {
      if (!articleText.trim()) throw new Error("Article text required");
      return await apiRequest("/api/deep-agent/upgrade-from-article", {
        method: "POST",
        body: JSON.stringify({
          articleText,
          moduleName: moduleName || "unspecified",
          currentKbSummary: {},
          currentFlowSummary: {},
          currentArchitectureSummary: {},
        }),
      });
    },
    onSuccess: (result: RunResult) => {
      const record: RunRecord = {
        id: `${Date.now()}`,
        task_type: "kb_audit",
        prompt: articleText.slice(0, 120),
        result,
        at: new Date().toLocaleTimeString(),
      };
      setRuns(prev => [record, ...prev]);
      toast({ title: "Upgrade analysis complete" });
    },
    onError: (err: any) => {
      toast({ title: "Upgrade analysis failed", description: err.message, variant: "destructive" });
    },
  });

  const isPending = runMutation.isPending || upgradeFromArticleMutation.isPending;

  return (
    <div className="min-h-screen bg-background p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Brain className="w-7 h-7 text-violet-500" />
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Deep Agent</h1>
          <p className="text-sm text-muted-foreground">Autonomous KB audit · Code review · Article-to-upgrade analysis</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <Card className="p-4">
          <p className="text-2xl font-bold text-violet-500" data-testid="text-runs-count">{runs.length}</p>
          <p className="text-xs text-muted-foreground">Total Runs</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold text-green-500" data-testid="text-success-count">{runs.filter(r => r.result.ok).length}</p>
          <p className="text-xs text-muted-foreground">Succeeded</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold text-amber-500" data-testid="text-artifact-count">{runs.reduce((s, r) => s + (r.result.artifacts?.length ?? 0), 0)}</p>
          <p className="text-xs text-muted-foreground">Artifacts</p>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Activity className="w-4 h-4" />New Agent Run</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Task Type</label>
              <Select value={taskType} onValueChange={v => setTaskType(v as TaskType)}>
                <SelectTrigger data-testid="select-task-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(TASK_META) as [TaskType, typeof TASK_META[TaskType]][]).map(([k, m]) => (
                    <SelectItem key={k} value={k} data-testid={`option-task-${k}`}>
                      <span className="flex items-center gap-2">{m.icon}{m.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Session ID (optional)</label>
              <Input
                placeholder={`${taskType}-session`}
                value={sessionId}
                onChange={e => setSessionId(e.target.value)}
                data-testid="input-session-id"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Module / Target Name</label>
            <Input
              placeholder="e.g. chest_pain, billing, scheduling"
              value={moduleName}
              onChange={e => setModuleName(e.target.value)}
              data-testid="input-module-name"
            />
          </div>

          {!needsArticle && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Prompt</label>
              <Textarea
                rows={4}
                placeholder="Describe what you want the agent to do..."
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                data-testid="textarea-prompt"
              />
            </div>
          )}

          {needsArticle && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Article / Source Text</label>
              <Textarea
                rows={6}
                placeholder="Paste article, clinical guideline, spec, or any source material..."
                value={articleText}
                onChange={e => setArticleText(e.target.value)}
                data-testid="textarea-article"
              />
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={() => runMutation.mutate()}
              disabled={isPending || (!prompt.trim() && !articleText.trim())}
              data-testid="button-run-agent"
            >
              {runMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Brain className="w-4 h-4 mr-2" />}
              Run Agent
            </Button>
            {needsArticle && (
              <Button
                variant="outline"
                onClick={() => upgradeFromArticleMutation.mutate()}
                disabled={isPending || !articleText.trim()}
                data-testid="button-upgrade-from-article"
              >
                {upgradeFromArticleMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                Full Upgrade Analysis
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {runs.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold" data-testid="text-runs-heading">Recent Runs</h2>
            <Button variant="ghost" size="sm" onClick={() => setRuns([])} data-testid="button-clear-runs">Clear</Button>
          </div>
          {runs.map((run, i) => <RunCard key={run.id} run={run} idx={i} />)}
        </div>
      )}

      {runs.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Brain className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-sm text-muted-foreground">No runs yet. Submit a task above to get started.</p>
            <p className="text-xs text-muted-foreground mt-1">The Deep Agent sidecar must be running at <code className="bg-muted px-1 rounded">DEEP_AGENT_URL</code></p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
