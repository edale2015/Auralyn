import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ClipboardCheck, AlertTriangle, Shield, TrendingUp, CheckCircle, XCircle,
  BarChart3, FileText, Activity, Users, Gauge,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

function BatchReviewTab() {
  const { data, isLoading, refetch } = useQuery<any>({ queryKey: ["/api/batch-review/cases", "pending"] });
  const [selected, setSelected] = useState<string[]>([]);

  const approveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/batch-review/approve", { caseIds: selected });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/batch-review/cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/risk-assessment"] });
      setSelected([]);
    },
  });

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const selectAll = () => {
    if (!data?.cases) return;
    if (selected.length === data.cases.length) setSelected([]);
    else setSelected(data.cases.map((c: any) => c.id));
  };

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Loading pending cases...</div>;

  const riskColor: Record<string, string> = {
    HIGH: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    MEDIUM: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    LOW: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-sm">{data?.pending || 0} Pending Cases</h3>
          <Button variant="outline" size="sm" onClick={selectAll} data-testid="button-select-all">
            {selected.length === (data?.cases?.length || 0) ? "Deselect All" : "Select All"}
          </Button>
        </div>
        <Button
          onClick={() => approveMutation.mutate()}
          disabled={selected.length === 0 || approveMutation.isPending}
          className="bg-green-600 hover:bg-green-700"
          data-testid="button-batch-approve"
        >
          <CheckCircle className="h-4 w-4 mr-1" /> Approve {selected.length > 0 ? `(${selected.length})` : ""}
        </Button>
      </div>

      <div className="space-y-2" data-testid="batch-case-list">
        {data?.cases?.map((c: any, i: number) => (
          <Card key={c.id} className={`cursor-pointer transition-colors ${selected.includes(c.id) ? "border-primary bg-primary/5" : ""}`} data-testid={`batch-case-${i}`}>
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center gap-3">
                <Checkbox checked={selected.includes(c.id)} onCheckedChange={() => toggle(c.id)} data-testid={`checkbox-${i}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{c.patientName}</span>
                    <Badge className={`text-xs ${riskColor[c.riskLevel]}`}>{c.riskLevel}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">{c.chiefComplaint}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-medium">{c.aiSuggestion?.diagnosis}</div>
                  <div className="text-xs text-muted-foreground">{c.aiSuggestion?.disposition} | {((c.aiSuggestion?.confidence || 0) * 100).toFixed(0)}%</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {(!data?.cases || data.cases.length === 0) && (
          <div className="text-center py-8 text-muted-foreground">No pending cases</div>
        )}
      </div>
    </div>
  );
}

function RiskScoringTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/risk-assessment"] });
  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Loading risk assessment...</div>;

  const riskColor: Record<string, string> = {
    HIGH: "text-red-600",
    MEDIUM: "text-yellow-600",
    LOW: "text-green-600",
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold text-red-600" data-testid="text-high-risk">{data?.byRisk?.HIGH || 0}</div>
            <div className="text-xs text-muted-foreground">High Risk</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold text-yellow-600" data-testid="text-medium-risk">{data?.byRisk?.MEDIUM || 0}</div>
            <div className="text-xs text-muted-foreground">Medium Risk</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold text-green-600" data-testid="text-low-risk">{data?.byRisk?.LOW || 0}</div>
            <div className="text-xs text-muted-foreground">Low Risk</div>
          </CardContent>
        </Card>
      </div>

      {data?.highRiskCases?.length > 0 && (
        <Card className="border-red-200 dark:border-red-800">
          <CardHeader><CardTitle className="text-sm text-red-600">High Risk Cases</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2" data-testid="high-risk-list">
              {data.highRiskCases.map((c: any, i: number) => (
                <div key={c.id || i} className="flex items-center gap-3 p-2 rounded bg-red-50 dark:bg-red-950/20" data-testid={`high-risk-${i}`}>
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                  <div className="flex-1">
                    <span className="font-medium text-sm">{c.patient}</span>
                    <span className="text-xs text-muted-foreground ml-2">{c.complaint}</span>
                  </div>
                  <Badge variant="outline" className="text-xs">Score: {c.score}</Badge>
                  <span className="text-sm font-medium">{c.diagnosis}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function OutcomeFeedbackTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/scale/outcomes/stats"] });
  const [aiDiag, setAiDiag] = useState("");
  const [actualDiag, setActualDiag] = useState("");

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/scale/outcomes/submit", {
        caseId: `manual_${Date.now()}`,
        aiDiagnosis: aiDiag,
        actualDiagnosis: actualDiag,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scale/outcomes/stats"] });
      setAiDiag("");
      setActualDiag("");
    },
  });

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Loading outcome stats...</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold" data-testid="text-total-outcomes">{data?.total || 0}</div>
            <div className="text-xs text-muted-foreground">Total Outcomes</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold text-green-600" data-testid="text-accuracy">{((data?.accuracy || 0) * 100).toFixed(1)}%</div>
            <div className="text-xs text-muted-foreground">Accuracy</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold text-green-600">{data?.correct || 0}</div>
            <div className="text-xs text-muted-foreground">Correct</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold text-red-600">{data?.incorrect || 0}</div>
            <div className="text-xs text-muted-foreground">Incorrect</div>
          </CardContent>
        </Card>
      </div>

      <Card className={data?.modelAdjustment === "increase_caution" ? "border-orange-200 dark:border-orange-800" : "border-green-200 dark:border-green-800"}>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4" />
            <span className="font-medium text-sm">Model Adjustment:</span>
            <Badge variant={data?.modelAdjustment === "stable" ? "default" : "destructive"} data-testid="text-model-adjustment">
              {data?.modelAdjustment === "stable" ? "Stable" : "Increase Caution"}
            </Badge>
            <span className="text-xs text-muted-foreground ml-2">Error rate: {((data?.errorRate || 0) * 100).toFixed(1)}%</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Submit Outcome Feedback</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="AI Diagnosis" value={aiDiag} onChange={(e) => setAiDiag(e.target.value)} data-testid="input-ai-diagnosis" />
            <Input placeholder="Actual Diagnosis" value={actualDiag} onChange={(e) => setActualDiag(e.target.value)} data-testid="input-actual-diagnosis" />
          </div>
          <Button onClick={() => submitMutation.mutate()} disabled={!aiDiag || !actualDiag || submitMutation.isPending} data-testid="button-submit-outcome">
            Submit Outcome
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Recent Outcomes</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2" data-testid="outcome-list">
            {data?.recentOutcomes?.map((o: any, i: number) => (
              <div key={o.id || i} className="flex items-center gap-3 p-2 rounded bg-muted/30" data-testid={`outcome-${i}`}>
                {o.correct ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                <span className="text-sm flex-1">AI: {o.aiDiagnosis}</span>
                <span className="text-sm text-muted-foreground">Actual: {o.actualDiagnosis}</span>
                {o.feedback && <span className="text-xs text-orange-500">{o.feedback}</span>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AuditLogTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/batch-review/audit"] });
  const { data: fdaData } = useQuery<any>({ queryKey: ["/api/fda/disclaimer"] });

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Loading audit log...</div>;

  return (
    <div className="space-y-6">
      <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="h-4 w-4 text-blue-600" />
            <span className="font-semibold text-sm text-blue-700 dark:text-blue-300">FDA Compliance</span>
            <Badge variant="outline" className="ml-auto text-xs" data-testid="text-fda-type">{fdaData?.type || "Clinical Decision Support System"}</Badge>
          </div>
          <p className="text-xs text-blue-600 dark:text-blue-400" data-testid="text-fda-disclaimer">
            {fdaData?.disclaimer || "Loading disclaimer..."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Physician Review Audit Log</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2" data-testid="audit-log">
            {data?.auditLog?.map((a: any, i: number) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded bg-muted/30 text-sm" data-testid={`audit-${i}`}>
                <Badge variant={a.override ? "destructive" : "default"} className="text-xs shrink-0">
                  {a.override ? "OVERRIDE" : "APPROVED"}
                </Badge>
                <span className="flex-1">AI: {a.aiSuggestion} → Final: {a.finalDecision}</span>
                <span className="text-xs text-muted-foreground">{a.userId}</span>
              </div>
            ))}
            {(!data?.auditLog || data.auditLog.length === 0) && (
              <div className="text-center py-4 text-muted-foreground">No audit entries yet — approve or override cases to generate audit records</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ClinicalScaleDashboard() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-scale-title">Clinical Scale Stack</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Batch physician review, risk scoring, outcome feedback loop, and FDA-safe audit compliance
        </p>
      </div>

      <Tabs defaultValue="batch" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="batch" data-testid="tab-batch">
            <ClipboardCheck className="h-4 w-4 mr-1" /> Batch Review
          </TabsTrigger>
          <TabsTrigger value="risk" data-testid="tab-risk">
            <AlertTriangle className="h-4 w-4 mr-1" /> Risk Scoring
          </TabsTrigger>
          <TabsTrigger value="outcomes" data-testid="tab-outcomes">
            <TrendingUp className="h-4 w-4 mr-1" /> Outcomes
          </TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-audit">
            <Shield className="h-4 w-4 mr-1" /> Audit & FDA
          </TabsTrigger>
        </TabsList>

        <TabsContent value="batch"><BatchReviewTab /></TabsContent>
        <TabsContent value="risk"><RiskScoringTab /></TabsContent>
        <TabsContent value="outcomes"><OutcomeFeedbackTab /></TabsContent>
        <TabsContent value="audit"><AuditLogTab /></TabsContent>
      </Tabs>
    </div>
  );
}
