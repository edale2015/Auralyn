import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Activity, Brain, CheckCircle, XCircle, FlaskConical, RefreshCw, Stethoscope, AlertTriangle } from "lucide-react";

function riskBadge(level?: string) {
  if (!level) return <Badge data-testid="badge-risk-none" variant="outline">—</Badge>;
  const map: Record<string, string> = {
    critical: "bg-red-600 text-white",
    high:     "bg-orange-500 text-white",
    moderate: "bg-yellow-500 text-black",
    low:      "bg-green-600 text-white",
  };
  return (
    <Badge data-testid={`badge-risk-${level}`} className={map[level] ?? "bg-gray-300"}>
      {level.toUpperCase()}
    </Badge>
  );
}

// ── Workflow Runner ───────────────────────────────────────────────────────────
function WorkflowRunner() {
  const { toast } = useToast();
  const [form, setForm] = useState({
    patientId: "p-demo-001",
    complaint: "cough",
    age:       "35",
    tempF:     "99.1",
    spo2:      "98",
    hr:        "78",
    rr:        "14",
    sbp:       "120",
  });
  const [result, setResult] = useState<any>(null);

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/workflow/run", {
        patientId: form.patientId,
        complaint:  form.complaint,
        age:        Number(form.age),
        vitals: {
          tempF:       Number(form.tempF),
          spo2:        Number(form.spo2),
          hr:          Number(form.hr),
          rr:          Number(form.rr),
          systolicBP:  Number(form.sbp),
        },
      }),
    onSuccess: (data: any) => {
      setResult(data);
      toast({ title: "Workflow complete", description: data.traceSummary?.slice(0, 80) });
    },
    onError: (err: any) => toast({ title: "Workflow error", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Patient ID</label>
          <Input data-testid="input-patientId" value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })} />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Complaint</label>
          <Input data-testid="input-complaint" value={form.complaint} onChange={(e) => setForm({ ...form, complaint: e.target.value })} />
        </div>
        {([["age","Age"],["tempF","Temp °F"],["spo2","SpO₂"],["hr","HR"],["rr","RR"],["sbp","SBP"]] as [keyof typeof form, string][]).map(([k, label]) => (
          <div key={k}>
            <label className="text-xs font-medium text-muted-foreground">{label}</label>
            <Input data-testid={`input-${k}`} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
          </div>
        ))}
      </div>

      <Button data-testid="button-run-workflow" onClick={() => mutate()} disabled={isPending} className="w-full">
        {isPending ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Running…</> : <><Brain className="mr-2 h-4 w-4" />Run 8-Step Clinical Workflow</>}
      </Button>

      {result && (
        <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
          <div className="flex items-center gap-3">
            <Stethoscope className="h-5 w-5 text-primary" />
            <span className="font-semibold text-sm" data-testid="text-diagnosis">{result.diagnosis ?? "—"}</span>
            {riskBadge(result.riskLevel)}
          </div>
          <p className="text-sm text-muted-foreground" data-testid="text-disposition">
            Disposition: <span className="font-medium text-foreground">{result.disposition ?? "—"}</span>
          </p>
          {result.monitoring?.escalationRecommended && (
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm font-medium">
              <AlertTriangle className="h-4 w-4" />
              Vitals escalation flag — deterioration risk detected
            </div>
          )}
          {result.traceSummary && (
            <p className="text-xs text-muted-foreground font-mono break-all" data-testid="text-trace-summary">{result.traceSummary}</p>
          )}
          {result.councilOpinion && (
            <div className="space-y-1">
              <p className="text-xs font-medium">Specialist Council ({result.councilOpinion.votes?.length} votes)</p>
              <p className="text-xs text-muted-foreground">
                Escalation: {result.councilOpinion.consensus?.escalationRecommended ? "Yes" : "No"} |
                Avg confidence: {(result.councilOpinion.consensus?.confidence * 100).toFixed(0)}%
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Golden Cases ──────────────────────────────────────────────────────────────
function GoldenCasePanel() {
  const { toast } = useToast();
  const { data: cases = [] } = useQuery<any[]>({ queryKey: ["/api/golden-cases"] });

  const { mutate: runAll, isPending, data: suiteResult } = useMutation({
    mutationFn: () => apiRequest("POST", "/api/golden-cases/run-all", {}),
    onError:    (err: any) => toast({ title: "Run failed", description: err.message, variant: "destructive" }),
  });

  const suite = suiteResult as any;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{cases.length} registered golden cases</p>
        <Button data-testid="button-run-golden-cases" size="sm" onClick={() => runAll()} disabled={isPending}>
          {isPending ? <RefreshCw className="mr-2 h-3 w-3 animate-spin" /> : <FlaskConical className="mr-2 h-3 w-3" />}
          Run All
        </Button>
      </div>

      {suite && (
        <div className="rounded-lg border p-3 bg-muted/30">
          <div className="flex gap-4 text-sm font-medium mb-3">
            <span className="text-green-600 dark:text-green-400" data-testid="text-golden-passed">✓ {suite.passed} passed</span>
            <span className="text-red-600 dark:text-red-400" data-testid="text-golden-failed">✗ {suite.failed} failed</span>
          </div>
          {suite.results?.map((r: any) => (
            <div key={r.caseId} className="flex items-center gap-2 text-xs py-1 border-b last:border-0" data-testid={`row-golden-${r.caseId}`}>
              {r.passed
                ? <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                : <XCircle   className="h-3.5 w-3.5 text-red-500 shrink-0" />}
              <span className="font-mono">{r.caseId}</span>
              {!r.passed && (
                <span className="text-red-500 truncate">{r.mismatches?.[0]}</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {cases.map((c: any) => (
          <div key={c.id} className="border rounded p-3 text-sm" data-testid={`card-golden-${c.id}`}>
            <div className="flex items-center justify-between">
              <span className="font-medium">{c.title}</span>
              <Badge variant="outline" className="text-xs">{c.complaint}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Tags: {c.tags?.join(", ") ?? "—"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── RLHF Panel ────────────────────────────────────────────────────────────────
function RLHFPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: proposals = [] } = useQuery<any[]>({ queryKey: ["/api/rlhf/proposals"] });
  const { data: feedback  = [] } = useQuery<any[]>({ queryKey: ["/api/rlhf/feedback"] });

  const [fbForm, setFbForm] = useState({
    complaint: "cough", predictedDiagnosis: "Viral URI", finalDiagnosis: "Viral URI",
    physicianAgreement: "true", safetyIssue: "false",
  });

  const { mutate: submitFb, isPending: fbPending } = useMutation({
    mutationFn: () => apiRequest("POST", "/api/rlhf/feedback", {
      ...fbForm,
      physicianAgreement: fbForm.physicianAgreement === "true",
      safetyIssue:        fbForm.safetyIssue === "true",
    }),
    onSuccess: () => {
      toast({ title: "Feedback submitted" });
      queryClient.invalidateQueries({ queryKey: ["/api/rlhf/feedback"] });
    },
    onError: (err: any) => toast({ title: "Feedback error", description: err.message, variant: "destructive" }),
  });

  const { mutate: genProposals, isPending: genPending } = useMutation({
    mutationFn: () => apiRequest("POST", "/api/rlhf/proposals/generate", {}),
    onSuccess: () => {
      toast({ title: "Proposals generated" });
      queryClient.invalidateQueries({ queryKey: ["/api/rlhf/proposals"] });
    },
  });

  const { mutate: reviewProposal } = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("POST", `/api/rlhf/proposals/${id}/review`, { status }),
    onSuccess: () => {
      toast({ title: "Proposal updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/rlhf/proposals"] });
    },
  });

  return (
    <div className="space-y-5">
      <div className="border rounded-lg p-4 space-y-3">
        <p className="text-sm font-medium">Submit Physician Feedback</p>
        <div className="grid grid-cols-2 gap-2">
          {(["complaint","predictedDiagnosis","finalDiagnosis"] as const).map((k) => (
            <div key={k}>
              <label className="text-xs text-muted-foreground capitalize">{k}</label>
              <Input data-testid={`input-fb-${k}`} value={fbForm[k]} onChange={(e) => setFbForm({ ...fbForm, [k]: e.target.value })} />
            </div>
          ))}
          <div>
            <label className="text-xs text-muted-foreground">Physician Agrees?</label>
            <select
              data-testid="select-fb-agreement"
              className="w-full border rounded h-9 px-2 text-sm bg-background"
              value={fbForm.physicianAgreement}
              onChange={(e) => setFbForm({ ...fbForm, physicianAgreement: e.target.value })}
            >
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Safety Issue?</label>
            <select
              data-testid="select-fb-safety"
              className="w-full border rounded h-9 px-2 text-sm bg-background"
              value={fbForm.safetyIssue}
              onChange={(e) => setFbForm({ ...fbForm, safetyIssue: e.target.value })}
            >
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
          </div>
        </div>
        <Button data-testid="button-submit-feedback" size="sm" onClick={() => submitFb()} disabled={fbPending} className="w-full">
          {fbPending ? "Submitting…" : "Submit Feedback"}
        </Button>
        <p className="text-xs text-muted-foreground">{(feedback as any[]).length} total feedback events</p>
      </div>

      <Button data-testid="button-generate-proposals" size="sm" variant="outline" onClick={() => genProposals()} disabled={genPending} className="w-full">
        {genPending ? <RefreshCw className="mr-2 h-3 w-3 animate-spin" /> : null}
        Generate RLHF Improvement Proposals (≥5 events/group required)
      </Button>

      {(proposals as any[]).length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{(proposals as any[]).length} Proposal(s)</p>
          {(proposals as any[]).map((p: any) => (
            <div key={p.id} className="border rounded p-3 text-xs space-y-1" data-testid={`card-proposal-${p.id}`}>
              <div className="flex items-center justify-between">
                <span className="font-mono font-medium">{p.targetKey}</span>
                <Badge variant={p.status === "approved" ? "default" : p.status === "rejected" ? "destructive" : "outline"}>
                  {p.status}
                </Badge>
              </div>
              <p className="text-muted-foreground">{p.reason}</p>
              <p>Evidence: {p.evidenceCount} events | {p.currentValue} → {p.proposedValue}</p>
              {p.status === "pending" && (
                <div className="flex gap-2 mt-1">
                  <Button data-testid={`button-approve-${p.id}`} size="sm" variant="outline" className="h-6 text-xs"
                    onClick={() => reviewProposal({ id: p.id, status: "approved" })}>Approve</Button>
                  <Button data-testid={`button-reject-${p.id}`} size="sm" variant="destructive" className="h-6 text-xs"
                    onClick={() => reviewProposal({ id: p.id, status: "rejected" })}>Reject</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Monitoring Assess ─────────────────────────────────────────────────────────
function MonitoringPanel() {
  const { toast } = useToast();
  const [vitals, setVitals] = useState({ tempF: "98.6", spo2: "98", hr: "72", rr: "14", systolicBP: "120" });
  const [result, setResult] = useState<any>(null);

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/monitoring/assess", {
        vitals: Object.fromEntries(Object.entries(vitals).map(([k, v]) => [k, Number(v)])),
      }),
    onSuccess: (data: any) => setResult(data),
    onError:   (err: any) => toast({ title: "Assessment error", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {(["tempF","spo2","hr","rr","systolicBP"] as const).map((k) => (
          <div key={k}>
            <label className="text-xs text-muted-foreground">{k}</label>
            <Input data-testid={`input-vital-${k}`} value={vitals[k]} onChange={(e) => setVitals({ ...vitals, [k]: e.target.value })} />
          </div>
        ))}
      </div>

      <Button data-testid="button-assess-monitoring" onClick={() => mutate()} disabled={isPending} className="w-full">
        {isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Activity className="mr-2 h-4 w-4" />}
        Assess Deterioration Risk
      </Button>

      {result && (
        <div className="border rounded-lg p-4 bg-muted/30 space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">Deterioration Score:</span>
            <Badge data-testid="text-deterioration-score" className={result.deteriorationScore >= 4 ? "bg-red-600 text-white" : "bg-green-600 text-white"}>
              {result.deteriorationScore}
            </Badge>
            {result.escalationRecommended && (
              <span className="text-red-600 dark:text-red-400 text-sm font-medium flex items-center gap-1" data-testid="text-escalation-flag">
                <AlertTriangle className="h-4 w-4" /> Escalate Now
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground" data-testid="text-reassess-minutes">
            Reassess in: {result.reassessInMinutes} min
          </p>
          {result.alerts?.length > 0 && (
            <div className="space-y-1 mt-2">
              {result.alerts.map((a: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-xs" data-testid={`alert-${a.type}`}>
                  <AlertTriangle className={`h-3 w-3 ${a.severity === "critical" ? "text-red-500" : "text-orange-500"}`} />
                  <span>{a.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MissionControlPhase2() {
  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="heading-mission-control-p2">
          Mission Control — Phase 2
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Medical MCP layer · Clinical workflow engine · Golden cases · RLHF
        </p>
      </div>

      <Tabs defaultValue="workflow">
        <TabsList data-testid="tabs-mission-control">
          <TabsTrigger value="workflow" data-testid="tab-workflow">Clinical Workflow</TabsTrigger>
          <TabsTrigger value="monitoring" data-testid="tab-monitoring">Monitoring</TabsTrigger>
          <TabsTrigger value="golden" data-testid="tab-golden">Golden Cases</TabsTrigger>
          <TabsTrigger value="rlhf" data-testid="tab-rlhf">RLHF</TabsTrigger>
        </TabsList>

        <TabsContent value="workflow">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Brain className="h-4 w-4" /> 8-Step Clinical Workflow Engine
              </CardTitle>
            </CardHeader>
            <CardContent><WorkflowRunner /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monitoring">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4" /> Real-Time Deterioration Assessment
              </CardTitle>
            </CardHeader>
            <CardContent><MonitoringPanel /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="golden">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FlaskConical className="h-4 w-4" /> Golden Case Validation Suite
              </CardTitle>
            </CardHeader>
            <CardContent><GoldenCasePanel /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rlhf">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle className="h-4 w-4" /> Reinforcement Learning from Human Feedback
              </CardTitle>
            </CardHeader>
            <CardContent><RLHFPanel /></CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
