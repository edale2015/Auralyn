import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import {
  Bot, Brain, FileText, Layers, ListChecks, ShieldCheck,
  Play, CheckCircle, XCircle, Clock, Activity, TrendingUp,
  Users, Zap, BarChart3, Eye, RefreshCw
} from "lucide-react";

function IntakeTab() {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [income, setIncome] = useState("");
  const [children, setChildren] = useState("");
  const [householdSize, setHouseholdSize] = useState("");
  const [result, setResult] = useState<any>(null);

  const process = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/operator/process", {
        text,
        userData: {
          income: income || undefined,
          children: children || undefined,
          householdSize: householdSize || undefined,
          state: "NY"
        }
      });
      return res.json();
    },
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/operator/jobs"] });
      toast({ title: "Request processed", description: `${data.eligibility?.filter((e: any) => e.eligible).length || 0} programs matched` });
    }
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Bot className="h-4 w-4" /> Autonomous Intake</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Describe what help is needed. The AI will determine eligible programs, create execution plans, and queue jobs for processing.
          </p>
          <Textarea
            data-testid="input-operator-text"
            placeholder='e.g. "I lost my job, have 2 kids, need food assistance and healthcare"'
            value={text}
            onChange={e => setText(e.target.value)}
            className="mb-3"
          />
          <div className="grid grid-cols-3 gap-2 mb-3">
            <Input data-testid="input-income" placeholder="Monthly Income" value={income} onChange={e => setIncome(e.target.value)} />
            <Input data-testid="input-children" placeholder="Children" value={children} onChange={e => setChildren(e.target.value)} />
            <Input data-testid="input-household" placeholder="Household Size" value={householdSize} onChange={e => setHouseholdSize(e.target.value)} />
          </div>
          <Button data-testid="button-process-intake" onClick={() => process.mutate()} disabled={process.isPending || !text}>
            {process.isPending ? "Processing..." : "Process Request"}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Intent Analysis</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div><span className="text-muted-foreground">Goal:</span> <Badge variant="outline">{result.intent?.goal}</Badge></div>
                <div><span className="text-muted-foreground">Category:</span> <Badge>{result.intent?.category}</Badge></div>
                <div><span className="text-muted-foreground">Urgency:</span> <Badge variant={result.intent?.urgency === "high" ? "destructive" : "secondary"}>{result.intent?.urgency}</Badge></div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Eligibility Results</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {result.eligibility?.map((e: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-2 border rounded" data-testid={`eligibility-result-${i}`}>
                    <div className="flex items-center gap-2">
                      {e.eligible ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-400" />}
                      <span className="font-medium text-sm">{e.program}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {e.estimatedBenefit && <span className="text-xs text-green-600">{e.estimatedBenefit}</span>}
                      <Badge variant={e.eligible ? "default" : "secondary"}>{Math.round(e.confidence * 100)}% confidence</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {result.recommendations?.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Recommendations</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-1">
                  {result.recommendations.map((r: string, i: number) => (
                    <li key={i} className="text-sm flex items-start gap-2"><Zap className="h-3 w-3 mt-1 text-yellow-500" />{r}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {result.jobs?.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Jobs Created</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {result.jobs.map((j: any) => (
                    <div key={j.id} className="flex items-center justify-between text-sm p-2 bg-muted/30 rounded">
                      <span>{j.program}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{j.steps?.length} steps</Badge>
                        <Badge>{j.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function JobQueueTab() {
  const { toast } = useToast();
  const { data: jobs, refetch } = useQuery<any[]>({ queryKey: ["/api/operator/jobs"] });

  const executeJob = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await apiRequest("POST", `/api/operator/jobs/${jobId}/execute`);
      return res.json();
    },
    onSuccess: () => {
      refetch();
      toast({ title: "Job executed" });
    }
  });

  const clearCompleted = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/operator/jobs/clear");
    },
    onSuccess: () => {
      refetch();
      toast({ title: "Cleared completed jobs" });
    }
  });

  const statusIcon = (status: string) => {
    switch (status) {
      case "queued": return <Clock className="h-4 w-4 text-gray-400" />;
      case "running": return <Play className="h-4 w-4 text-blue-500" />;
      case "completed": return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "failed": return <XCircle className="h-4 w-4 text-red-500" />;
      case "paused": return <ShieldCheck className="h-4 w-4 text-yellow-500" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><ListChecks className="h-4 w-4" /> Job Queue</CardTitle>
            <div className="flex gap-2">
              <Button data-testid="button-refresh-jobs" variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-3 w-3 mr-1" /> Refresh
              </Button>
              <Button data-testid="button-clear-jobs" variant="outline" size="sm" onClick={() => clearCompleted.mutate()}>
                Clear Done
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!jobs || jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No jobs in queue. Process an intake request to create jobs.</p>
          ) : (
            <div className="space-y-3">
              {jobs.map((job: any) => (
                <div key={job.id} className="border rounded-lg p-3" data-testid={`job-card-${job.id}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {statusIcon(job.status)}
                      <span className="font-medium text-sm">{job.program}</span>
                      <Badge variant={job.status === "completed" ? "default" : job.status === "failed" ? "destructive" : "secondary"}>
                        {job.status}
                      </Badge>
                    </div>
                    {job.status === "queued" && (
                      <Button data-testid={`button-execute-${job.id}`} size="sm" onClick={() => executeJob.mutate(job.id)}>
                        <Play className="h-3 w-3 mr-1" /> Execute
                      </Button>
                    )}
                  </div>
                  <div className="space-y-1">
                    {job.steps?.map((step: any) => (
                      <div key={step.id} className="flex items-center justify-between text-xs pl-4">
                        <span className="text-muted-foreground">{step.description}</span>
                        <Badge variant={step.status === "completed" ? "default" : step.status === "needs_approval" ? "destructive" : "outline"} className="text-xs">
                          {step.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                  {job.result?.confirmationId && (
                    <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 rounded text-xs">
                      Confirmation: <span className="font-mono font-bold">{job.result.confirmationId}</span>
                    </div>
                  )}
                  {job.error && (
                    <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-xs text-red-600">{job.error}</div>
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

function ReviewTab() {
  const { toast } = useToast();
  const { data: jobs, refetch } = useQuery<any[]>({ queryKey: ["/api/operator/jobs"] });

  const pendingJobs = jobs?.filter(j => j.status === "paused" || j.steps?.some((s: any) => s.status === "needs_approval")) || [];

  const approveStep = useMutation({
    mutationFn: async ({ jobId, stepId }: { jobId: string; stepId: number }) => {
      const res = await apiRequest("POST", `/api/operator/jobs/${jobId}/approve/${stepId}`);
      return res.json();
    },
    onSuccess: () => {
      refetch();
      toast({ title: "Step approved" });
    }
  });

  const rejectStep = useMutation({
    mutationFn: async ({ jobId, stepId }: { jobId: string; stepId: number }) => {
      const res = await apiRequest("POST", `/api/operator/jobs/${jobId}/reject/${stepId}`, { reason: "Rejected by reviewer" });
      return res.json();
    },
    onSuccess: () => {
      refetch();
      toast({ title: "Step rejected" });
    }
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Eye className="h-4 w-4" /> Human-in-the-Loop Review</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Sensitive steps require human approval before execution. Review and approve or reject steps below.
          </p>
          {pendingJobs.length === 0 ? (
            <p className="text-sm text-center py-4 text-muted-foreground">No steps pending review.</p>
          ) : (
            <div className="space-y-4">
              {pendingJobs.map((job: any) => (
                <div key={job.id} className="border rounded-lg p-3" data-testid={`review-job-${job.id}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldCheck className="h-4 w-4 text-yellow-500" />
                    <span className="font-medium text-sm">{job.program}</span>
                    <Badge variant="secondary">Awaiting Review</Badge>
                  </div>
                  {job.steps?.filter((s: any) => s.status === "needs_approval").map((step: any) => (
                    <div key={step.id} className="flex items-center justify-between p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded mb-1">
                      <span className="text-sm">{step.description}</span>
                      <div className="flex gap-1">
                        <Button data-testid={`button-approve-${job.id}-${step.id}`} size="sm" variant="default" onClick={() => approveStep.mutate({ jobId: job.id, stepId: step.id })}>
                          <CheckCircle className="h-3 w-3 mr-1" /> Approve
                        </Button>
                        <Button data-testid={`button-reject-${job.id}-${step.id}`} size="sm" variant="destructive" onClick={() => rejectStep.mutate({ jobId: job.id, stepId: step.id })}>
                          <XCircle className="h-3 w-3 mr-1" /> Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TemplatesTab() {
  const { data: templates } = useQuery<any[]>({ queryKey: ["/api/operator/templates"] });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> Workflow Template Library</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Pre-built automation templates for common benefit programs, insurance workflows, and government applications.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {templates?.map((t: any, i: number) => (
              <div key={i} className="border rounded-lg p-3" data-testid={`template-card-${i}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm">{t.program}</span>
                  <Badge variant="outline">{t.stepCount} steps</Badge>
                </div>
                <p className="text-xs text-muted-foreground">Goal: {t.goal}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LearningTab() {
  const { data: stats } = useQuery<any>({ queryKey: ["/api/operator/learning/stats"] });
  const { data: patterns } = useQuery<any[]>({ queryKey: ["/api/operator/learning/patterns"] });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Brain className="h-4 w-4" /> Self-Learning Engine</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            The system learns from every execution — tracking success rates, durations, and error patterns to improve over time.
          </p>
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="border rounded p-2 text-center">
                <p className="text-2xl font-bold">{stats.totalLogs}</p>
                <p className="text-xs text-muted-foreground">Steps Logged</p>
              </div>
              <div className="border rounded p-2 text-center">
                <p className="text-2xl font-bold">{stats.patternsLearned}</p>
                <p className="text-xs text-muted-foreground">Patterns Learned</p>
              </div>
              <div className="border rounded p-2 text-center">
                <p className="text-2xl font-bold">{Math.round((stats.overallSuccessRate || 0) * 100)}%</p>
                <p className="text-xs text-muted-foreground">Success Rate</p>
              </div>
              <div className="border rounded p-2 text-center">
                <p className="text-2xl font-bold">{stats.uniquePrograms}</p>
                <p className="text-xs text-muted-foreground">Programs</p>
              </div>
            </div>
          )}
          {stats?.programStats?.length > 0 && (
            <div className="space-y-2 mb-4">
              <h4 className="text-sm font-medium">Per-Program Performance</h4>
              {stats.programStats.map((p: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-2 border rounded text-sm">
                  <span>{p.program}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{p.totalSteps} steps</span>
                    <Badge variant={p.successRate > 0.8 ? "default" : "secondary"}>{Math.round(p.successRate * 100)}%</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {patterns && patterns.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Learned Patterns</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {patterns.slice(0, 20).map((p: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-sm p-2 border rounded" data-testid={`pattern-${i}`}>
                  <span className="font-mono text-xs">{p.step}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{p.totalAttempts} attempts</span>
                    <span className="text-xs">{Math.round(p.avgDuration * 10) / 10}s avg</span>
                    <Badge variant={p.successRate > 0.8 ? "default" : p.successRate > 0.5 ? "secondary" : "destructive"}>
                      {Math.round(p.successRate * 100)}%
                    </Badge>
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

function BatchTab() {
  const { toast } = useToast();
  const { data: stats } = useQuery<any>({ queryKey: ["/api/operator/jobs/stats"] });
  const [batchSize, setBatchSize] = useState("5");

  const createBatch = useMutation({
    mutationFn: async () => {
      const programs = ["SNAP", "Medicaid", "WIC", "Section 8 / Housing Assistance", "Unemployment Insurance"];
      const items = Array.from({ length: Number(batchSize) }, (_, i) => ({
        program: programs[i % programs.length],
        userData: {
          firstName: `User_${i + 1}`,
          lastName: "Batch",
          income: String(1000 + Math.floor(Math.random() * 2000)),
          householdSize: String(1 + Math.floor(Math.random() * 5))
        },
        steps: [
          { id: 1, action: "navigate", description: `Open ${programs[i % programs.length]} portal`, requiresApproval: false },
          { id: 2, action: "fill", description: "Fill application form", requiresApproval: false },
          { id: 3, action: "verify", description: "Verify data", requiresApproval: true },
          { id: 4, action: "click", description: "Submit", requiresApproval: true }
        ]
      }));
      const res = await apiRequest("POST", "/api/operator/jobs/batch", { items });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/operator/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/operator/jobs/stats"] });
      toast({ title: `Batch created: ${data.length} jobs` });
    }
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Layers className="h-4 w-4" /> Batch Processing</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">Process multiple applications simultaneously. Create batch jobs for bulk processing.</p>
          {stats && (
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
              <div className="border rounded p-2 text-center">
                <p className="text-lg font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <div className="border rounded p-2 text-center">
                <p className="text-lg font-bold text-gray-500">{stats.queued}</p>
                <p className="text-xs text-muted-foreground">Queued</p>
              </div>
              <div className="border rounded p-2 text-center">
                <p className="text-lg font-bold text-blue-500">{stats.running}</p>
                <p className="text-xs text-muted-foreground">Running</p>
              </div>
              <div className="border rounded p-2 text-center">
                <p className="text-lg font-bold text-yellow-500">{stats.paused}</p>
                <p className="text-xs text-muted-foreground">Paused</p>
              </div>
              <div className="border rounded p-2 text-center">
                <p className="text-lg font-bold text-green-500">{stats.completed}</p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </div>
              <div className="border rounded p-2 text-center">
                <p className="text-lg font-bold text-red-500">{stats.failed}</p>
                <p className="text-xs text-muted-foreground">Failed</p>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <Input data-testid="input-batch-size" type="number" value={batchSize} onChange={e => setBatchSize(e.target.value)} className="w-24" />
            <Button data-testid="button-create-batch" onClick={() => createBatch.mutate()} disabled={createBatch.isPending}>
              {createBatch.isPending ? "Creating..." : "Create Batch Jobs"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function EligibilityTab() {
  const { toast } = useToast();
  const [income, setIncome] = useState("");
  const [householdSize, setHouseholdSize] = useState("");
  const [children, setChildren] = useState("");
  const [employed, setEmployed] = useState("true");
  const [pregnant, setPregnant] = useState("false");
  const [results, setResults] = useState<any[]>([]);

  const check = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/operator/check-eligibility", {
        income: Number(income) || undefined,
        householdSize: Number(householdSize) || undefined,
        children: Number(children) || undefined,
        employed: employed === "false" ? false : true,
        pregnant: pregnant === "true",
        state: "NY"
      });
      return res.json();
    },
    onSuccess: (data) => {
      setResults(data);
      toast({ title: `${data.filter((d: any) => d.eligible).length} programs eligible` });
    }
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Eligibility Screener</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">Check eligibility across all benefit programs based on household profile.</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
            <Input data-testid="input-elig-income" placeholder="Monthly Income" value={income} onChange={e => setIncome(e.target.value)} />
            <Input data-testid="input-elig-household" placeholder="Household Size" value={householdSize} onChange={e => setHouseholdSize(e.target.value)} />
            <Input data-testid="input-elig-children" placeholder="Children" value={children} onChange={e => setChildren(e.target.value)} />
          </div>
          <div className="flex gap-4 mb-3 text-sm">
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={employed === "false"} onChange={e => setEmployed(e.target.checked ? "false" : "true")} />
              Currently Unemployed
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={pregnant === "true"} onChange={e => setPregnant(e.target.checked ? "true" : "false")} />
              Pregnant
            </label>
          </div>
          <Button data-testid="button-check-eligibility" onClick={() => check.mutate()} disabled={check.isPending}>
            {check.isPending ? "Checking..." : "Check Eligibility"}
          </Button>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Eligibility Results</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {results.map((r: any, i: number) => (
                <div key={i} className="border rounded-lg p-3" data-testid={`elig-result-${i}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      {r.eligible ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-400" />}
                      <span className="font-medium">{r.program}</span>
                    </div>
                    <Badge variant={r.eligible ? "default" : "secondary"}>{Math.round(r.confidence * 100)}%</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mb-1">{r.reason}</p>
                  {r.estimatedBenefit && <p className="text-xs text-green-600">Est. benefit: {r.estimatedBenefit}</p>}
                  {r.missingData?.length > 0 && (
                    <p className="text-xs text-yellow-600">Missing: {r.missingData.join(", ")}</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function OperatorDashboard() {
  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-operator-title">
            <Bot className="h-6 w-6" /> Autonomous Operator
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-powered form automation across government benefits, insurance, and healthcare portals
          </p>
        </div>

        <Tabs defaultValue="intake">
          <TabsList className="grid grid-cols-3 md:grid-cols-7 mb-4">
            <TabsTrigger value="intake" data-testid="tab-intake"><Bot className="h-3 w-3 mr-1" />Intake</TabsTrigger>
            <TabsTrigger value="queue" data-testid="tab-queue"><ListChecks className="h-3 w-3 mr-1" />Queue</TabsTrigger>
            <TabsTrigger value="review" data-testid="tab-review"><Eye className="h-3 w-3 mr-1" />Review</TabsTrigger>
            <TabsTrigger value="eligibility" data-testid="tab-eligibility"><Users className="h-3 w-3 mr-1" />Eligibility</TabsTrigger>
            <TabsTrigger value="templates" data-testid="tab-templates"><FileText className="h-3 w-3 mr-1" />Templates</TabsTrigger>
            <TabsTrigger value="batch" data-testid="tab-batch"><Layers className="h-3 w-3 mr-1" />Batch</TabsTrigger>
            <TabsTrigger value="learning" data-testid="tab-learning"><Brain className="h-3 w-3 mr-1" />Learning</TabsTrigger>
          </TabsList>

          <TabsContent value="intake"><IntakeTab /></TabsContent>
          <TabsContent value="queue"><JobQueueTab /></TabsContent>
          <TabsContent value="review"><ReviewTab /></TabsContent>
          <TabsContent value="eligibility"><EligibilityTab /></TabsContent>
          <TabsContent value="templates"><TemplatesTab /></TabsContent>
          <TabsContent value="batch"><BatchTab /></TabsContent>
          <TabsContent value="learning"><LearningTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
