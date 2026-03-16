import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Shield, CheckCircle, XCircle, Clock, AlertTriangle, Activity,
  GitBranch, MessageSquare, Play, Search, RotateCcw, Rocket,
} from "lucide-react";

function riskColor(risk: string) {
  if (risk === "critical") return "destructive";
  if (risk === "high") return "destructive";
  if (risk === "medium") return "default";
  return "secondary";
}

function severityColor(sev: string) {
  if (sev === "critical") return "text-red-600 bg-red-50 dark:bg-red-950";
  if (sev === "high") return "text-orange-600 bg-orange-50 dark:bg-orange-950";
  if (sev === "medium") return "text-yellow-600 bg-yellow-50 dark:bg-yellow-950";
  return "text-green-600 bg-green-50 dark:bg-green-950";
}

function PanelGovernanceQueue() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<string>("all");

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/governance/queue", filter],
    queryFn: () =>
      fetch(`/api/governance/queue${filter !== "all" ? `?status=${filter}` : ""}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("app_auth_token")}` },
      }).then((r) => r.json()),
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("POST", `/api/governance/review/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/governance/queue"] });
      toast({ title: "Review submitted" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-governance-filter">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Items</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        {data?.stats && (
          <div className="flex gap-2 ml-auto text-sm">
            <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />{data.stats.pending} pending</Badge>
            <Badge variant="outline"><CheckCircle className="w-3 h-3 mr-1" />{data.stats.approved} approved</Badge>
            <Badge variant="outline"><XCircle className="w-3 h-3 mr-1" />{data.stats.rejected} rejected</Badge>
          </div>
        )}
      </div>

      {isLoading && <p className="text-muted-foreground">Loading queue...</p>}

      {data?.items?.length === 0 && (
        <p className="text-muted-foreground text-sm" data-testid="text-no-governance-items">
          No governance items found. Changes submitted through the ingestion pipeline will appear here for review.
        </p>
      )}

      {data?.items?.map((item: any) => (
        <Card key={item.id} data-testid={`governance-item-${item.id}`}>
          <CardContent className="pt-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant={riskColor(item.risk)}>{item.risk} risk</Badge>
                  <Badge variant={item.status === "approved" ? "default" : item.status === "rejected" ? "destructive" : "outline"}>
                    {item.status}
                  </Badge>
                  <span className="text-sm font-medium">{item.sheet}</span>
                </div>
                {item.reason && <p className="text-sm text-muted-foreground">{item.reason}</p>}
                <p className="text-xs text-muted-foreground">
                  {new Date(item.timestamp).toLocaleString()}
                  {item.reviewedBy && ` · Reviewed by ${item.reviewedBy}`}
                </p>
              </div>
              {item.status === "pending" && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid={`button-approve-${item.id}`}
                    disabled={reviewMutation.isPending}
                    onClick={() => reviewMutation.mutate({ id: item.id, status: "approved" })}
                  >
                    <CheckCircle className="w-3 h-3 mr-1" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    data-testid={`button-reject-${item.id}`}
                    disabled={reviewMutation.isPending}
                    onClick={() => reviewMutation.mutate({ id: item.id, status: "rejected" })}
                  >
                    <XCircle className="w-3 h-3 mr-1" /> Reject
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function PanelRegressionTest() {
  const { toast } = useToast();
  const [result, setResult] = useState<any>(null);

  const runTest = useMutation({
    mutationFn: () =>
      fetch("/api/governance/regression-test", {
        headers: { Authorization: `Bearer ${localStorage.getItem("app_auth_token")}` },
      }).then((r) => r.json()),
    onSuccess: (data) => {
      setResult(data);
      toast({ title: data.passed ? "All tests passed" : `${data.failures} failures detected` });
    },
    onError: () => toast({ title: "Regression test failed", variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Play className="w-5 h-5" />Protocol Regression Testing
        </CardTitle>
        <CardDescription>
          Run simulations against the current knowledge graph to detect protocol regressions
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          onClick={() => runTest.mutate()}
          disabled={runTest.isPending}
          data-testid="button-run-regression"
        >
          {runTest.isPending ? "Running simulations..." : "Run Regression Test"}
        </Button>

        {result && (
          <div className="space-y-3 mt-4">
            <div className="flex items-center gap-3">
              <Badge variant={result.passed ? "default" : "destructive"} data-testid="badge-regression-result">
                {result.passed ? "PASSED" : "FAILED"}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {result.total} simulations, {result.failures} failures ({result.duration}ms)
              </span>
            </div>
            {result.failureDetails?.length > 0 && (
              <div className="space-y-2">
                {result.failureDetails.map((f: any, i: number) => (
                  <div key={i} className="p-2 rounded border bg-red-50 dark:bg-red-950 text-sm">
                    <span className="font-medium">{f.gap}</span>: {f.recommendation}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PanelRiskMonitor() {
  const { toast } = useToast();
  const [metrics, setMetrics] = useState({
    redFlagAccuracy: "0.97",
    erDispositionRate: "0.08",
    overallAccuracy: "0.91",
    selfCareRate: "0.45",
    questionCompletionRate: "0.85",
    escalationRate: "0.15",
  });
  const [alerts, setAlerts] = useState<any[]>([]);

  const analyze = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/governance/risk-analysis", {
        redFlagAccuracy: parseFloat(metrics.redFlagAccuracy),
        erDispositionRate: parseFloat(metrics.erDispositionRate),
        overallAccuracy: parseFloat(metrics.overallAccuracy),
        selfCareRate: parseFloat(metrics.selfCareRate),
        questionCompletionRate: parseFloat(metrics.questionCompletionRate),
        escalationRate: parseFloat(metrics.escalationRate),
      }).then((r) => r.json()),
    onSuccess: (data) => {
      setAlerts(data.alerts || []);
      toast({ title: data.alertCount === 0 ? "No risk alerts" : `${data.alertCount} risk alerts detected` });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />Clinical Risk Monitor
        </CardTitle>
        <CardDescription>
          Analyze clinical metrics for dangerous trends and threshold violations
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {Object.entries(metrics).map(([key, val]) => (
            <div key={key}>
              <label className="text-xs text-muted-foreground block mb-1">
                {key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={val}
                data-testid={`input-metric-${key}`}
                onChange={(e) => setMetrics((prev) => ({ ...prev, [key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <Button onClick={() => analyze.mutate()} disabled={analyze.isPending} data-testid="button-analyze-risk">
          {analyze.isPending ? "Analyzing..." : "Analyze Risk"}
        </Button>

        {alerts.length > 0 && (
          <div className="space-y-2 mt-3">
            {alerts.map((alert: any, i: number) => (
              <div key={i} className={`p-3 rounded-lg text-sm ${severityColor(alert.severity)}`} data-testid={`alert-risk-${i}`}>
                <div className="flex items-center gap-2 font-medium">
                  <Badge variant={riskColor(alert.severity)} className="text-xs">{alert.severity}</Badge>
                  {alert.category}
                </div>
                <p className="mt-1">{alert.message}</p>
                {alert.threshold != null && (
                  <p className="text-xs mt-1 opacity-75">Threshold: {alert.threshold} | Actual: {alert.actual}</p>
                )}
              </div>
            ))}
          </div>
        )}
        {alerts.length === 0 && analyze.isSuccess && (
          <p className="text-sm text-green-600" data-testid="text-no-risk-alerts">All metrics within safe thresholds</p>
        )}
      </CardContent>
    </Card>
  );
}

function PanelConsistencyCheck() {
  const { toast } = useToast();
  const [result, setResult] = useState<any>(null);

  const check = useMutation({
    mutationFn: () =>
      fetch("/api/governance/consistency-check", {
        headers: { Authorization: `Bearer ${localStorage.getItem("app_auth_token")}` },
      }).then((r) => r.json()),
    onSuccess: (data) => {
      setResult(data);
      toast({
        title: data.ok ? "Knowledge graph is consistent" : `${data.problems.length} consistency issues found`,
      });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="w-5 h-5" />Knowledge Consistency Engine
        </CardTitle>
        <CardDescription>
          Check the knowledge graph for contradictions, dangling edges, and unsafe mappings
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={() => check.mutate()} disabled={check.isPending} data-testid="button-check-consistency">
          {check.isPending ? "Checking..." : "Run Consistency Check"}
        </Button>

        {result && (
          <div className="space-y-3">
            <Badge variant={result.ok ? "default" : "destructive"} data-testid="badge-consistency-result">
              {result.ok ? "CONSISTENT" : "ISSUES FOUND"}
            </Badge>
            {result.problems?.length > 0 && (
              <div className="space-y-2">
                {result.problems.map((p: any, i: number) => (
                  <div key={i} className={`p-2 rounded border text-sm ${severityColor(p.severity)}`}>
                    <Badge variant={riskColor(p.severity)} className="text-xs mr-2">{p.severity}</Badge>
                    <span className="font-medium">{p.category}</span>: {p.message}
                  </div>
                ))}
              </div>
            )}
            {result.problems?.length === 0 && (
              <p className="text-sm text-green-600" data-testid="text-no-consistency-issues">
                No issues detected in the knowledge graph
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PanelPhysicianFeedback() {
  const { toast } = useToast();
  const [caseId, setCaseId] = useState("");
  const [correction, setCorrection] = useState("");
  const [category, setCategory] = useState("other");
  const [severity, setSeverity] = useState("medium");

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/governance/feedback"],
    queryFn: () =>
      fetch("/api/governance/feedback?limit=20", {
        headers: { Authorization: `Bearer ${localStorage.getItem("app_auth_token")}` },
      }).then((r) => r.json()),
  });

  const submit = useMutation({
    mutationFn: () => apiRequest("POST", "/api/governance/feedback", { caseId, correction, category, severity }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/governance/feedback"] });
      toast({ title: "Feedback recorded" });
      setCaseId("");
      setCorrection("");
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />Physician Feedback
        </CardTitle>
        <CardDescription>Record and track clinical corrections from physicians</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Case ID</label>
            <Input
              value={caseId}
              onChange={(e) => setCaseId(e.target.value)}
              placeholder="case-123"
              data-testid="input-feedback-caseid"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Category</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger data-testid="select-feedback-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="disposition">Disposition</SelectItem>
                  <SelectItem value="diagnosis">Diagnosis</SelectItem>
                  <SelectItem value="question">Question</SelectItem>
                  <SelectItem value="protocol">Protocol</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Severity</label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger data-testid="select-feedback-severity"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <Textarea
          value={correction}
          onChange={(e) => setCorrection(e.target.value)}
          placeholder="Describe the clinical correction..."
          data-testid="input-feedback-correction"
        />
        <Button
          onClick={() => submit.mutate()}
          disabled={submit.isPending || !caseId || !correction}
          data-testid="button-submit-feedback"
        >
          Record Feedback
        </Button>

        {isLoading && <p className="text-muted-foreground text-sm">Loading feedback...</p>}

        {data?.items?.length > 0 && (
          <div className="space-y-2 mt-4 border-t pt-4" data-testid="feedback-list">
            <h4 className="text-sm font-medium" data-testid="text-feedback-count">Recent Feedback ({data.stats?.total || 0} total)</h4>
            {data.items.map((f: any) => (
              <div key={f.id} className="p-2 border rounded text-sm" data-testid={`feedback-item-${f.id}`}>
                <div className="flex items-center gap-2">
                  <Badge variant={riskColor(f.severity)} className="text-xs">{f.severity}</Badge>
                  <Badge variant="outline" className="text-xs">{f.category}</Badge>
                  <Badge variant="outline" className="text-xs">{f.status}</Badge>
                  <span className="text-xs text-muted-foreground ml-auto">{f.physician}</span>
                </div>
                <p className="mt-1">{f.correction}</p>
                <p className="text-xs text-muted-foreground mt-1">Case: {f.caseId}</p>
              </div>
            ))}
          </div>
        )}
        {data?.items?.length === 0 && (
          <p className="text-sm text-muted-foreground" data-testid="text-no-feedback">No physician feedback recorded yet</p>
        )}
      </CardContent>
    </Card>
  );
}

function PanelDeployment() {
  const { toast } = useToast();
  const [label, setLabel] = useState("");

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/governance/versions"],
    queryFn: () =>
      fetch("/api/governance/versions", {
        headers: { Authorization: `Bearer ${localStorage.getItem("app_auth_token")}` },
      }).then((r) => r.json()),
  });

  const deploy = useMutation({
    mutationFn: () => apiRequest("POST", "/api/governance/deploy", { config: {}, label: label || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/governance/versions"] });
      toast({ title: "New version deployed" });
      setLabel("");
    },
  });

  const rollback = useMutation({
    mutationFn: (versionId: string) => apiRequest("POST", "/api/governance/rollback", { versionId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/governance/versions"] });
      toast({ title: "Rollback complete" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Rocket className="w-5 h-5" />Deployment Manager
        </CardTitle>
        <CardDescription>
          Version control for clinical configuration — deploy new versions or rollback safely
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {data?.current && (
          <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
            <p className="text-sm font-medium text-green-800 dark:text-green-200">
              Active Version: {data.current.id} — {data.current.label}
            </p>
            <p className="text-xs text-green-600 dark:text-green-400">
              Deployed: {new Date(data.current.timestamp).toLocaleString()}
              {data.current.deployedBy && ` by ${data.current.deployedBy}`}
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Deployment label (optional)"
            data-testid="input-deploy-label"
          />
          <Button onClick={() => deploy.mutate()} disabled={deploy.isPending} data-testid="button-deploy">
            <Rocket className="w-4 h-4 mr-1" />Deploy
          </Button>
        </div>

        {isLoading && <p className="text-muted-foreground text-sm">Loading versions...</p>}

        {data?.versions?.length > 0 && (
          <div className="space-y-2 border-t pt-4">
            <h4 className="text-sm font-medium">Version History</h4>
            {data.versions.map((v: any) => (
              <div key={v.id} className="flex items-center justify-between p-2 border rounded text-sm" data-testid={`version-${v.id}`}>
                <div>
                  <span className="font-medium">{v.id}</span>
                  <span className="text-muted-foreground ml-2">{v.label}</span>
                  <Badge variant={v.status === "active" ? "default" : "outline"} className="ml-2 text-xs">
                    {v.status}
                  </Badge>
                </div>
                {v.status !== "active" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={rollback.isPending}
                    onClick={() => rollback.mutate(v.id)}
                    data-testid={`button-rollback-${v.id}`}
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />Rollback
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ClinicalGovernancePage() {
  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <Shield className="w-7 h-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-governance-title">Clinical Governance Layer</h1>
          <p className="text-muted-foreground text-sm">
            Review, approve, and deploy clinical configuration changes safely
          </p>
        </div>
      </div>

      <Tabs defaultValue="queue" className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="queue" data-testid="tab-governance-queue">
            <GitBranch className="w-4 h-4 mr-1" />Queue
          </TabsTrigger>
          <TabsTrigger value="regression" data-testid="tab-governance-regression">
            <Play className="w-4 h-4 mr-1" />Regression
          </TabsTrigger>
          <TabsTrigger value="risk" data-testid="tab-governance-risk">
            <AlertTriangle className="w-4 h-4 mr-1" />Risk
          </TabsTrigger>
          <TabsTrigger value="consistency" data-testid="tab-governance-consistency">
            <Search className="w-4 h-4 mr-1" />Consistency
          </TabsTrigger>
          <TabsTrigger value="feedback" data-testid="tab-governance-feedback">
            <MessageSquare className="w-4 h-4 mr-1" />Feedback
          </TabsTrigger>
          <TabsTrigger value="deployment" data-testid="tab-governance-deployment">
            <Rocket className="w-4 h-4 mr-1" />Deployment
          </TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="mt-6">
          <PanelGovernanceQueue />
        </TabsContent>
        <TabsContent value="regression" className="mt-6">
          <PanelRegressionTest />
        </TabsContent>
        <TabsContent value="risk" className="mt-6">
          <PanelRiskMonitor />
        </TabsContent>
        <TabsContent value="consistency" className="mt-6">
          <PanelConsistencyCheck />
        </TabsContent>
        <TabsContent value="feedback" className="mt-6">
          <PanelPhysicianFeedback />
        </TabsContent>
        <TabsContent value="deployment" className="mt-6">
          <PanelDeployment />
        </TabsContent>
      </Tabs>
    </div>
  );
}
