import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Activity, AlertTriangle, CheckCircle, Clock, FileText, MessageSquare, Shield, Zap } from "lucide-react";

function riskColor(level: string) {
  if (level === "critical") return "bg-red-900 text-white";
  if (level === "high") return "bg-red-500 text-white";
  if (level === "medium") return "bg-yellow-500 text-black";
  return "bg-green-500 text-white";
}

function statusColor(status: string) {
  if (status === "approved") return "bg-green-600 text-white";
  if (status === "auto_resolved") return "bg-blue-500 text-white";
  if (status === "escalated") return "bg-red-600 text-white";
  if (status === "needs_review") return "bg-yellow-500 text-black";
  return "bg-gray-500 text-white";
}

export default function SmartIntakeDashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [selectedCases, setSelectedCases] = useState<string[]>([]);
  const [intakeMessage, setIntakeMessage] = useState("");
  const { toast } = useToast();

  const allCasesQuery = useQuery({ queryKey: ["/api/smart-intake/all-cases"] });
  const reviewQueueQuery = useQuery({ queryKey: ["/api/smart-intake/review-queue"] });
  const outcomeAnalyticsQuery = useQuery({ queryKey: ["/api/smart-intake/outcomes/analytics"] });
  const auditLogQuery = useQuery({ queryKey: ["/api/smart-intake/audit-log"] });

  const caseDetailQuery = useQuery({
    queryKey: ["/api/smart-intake/case", selectedCaseId],
    queryFn: () => fetch(`/api/smart-intake/case/${selectedCaseId}`).then((r) => r.json()),
    enabled: !!selectedCaseId,
  });

  const batchApproveMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/smart-intake/batch-approve", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/smart-intake/all-cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/smart-intake/review-queue"] });
      setSelectedCases([]);
      toast({ title: "Batch action completed" });
    },
  });

  const approveAllSafeMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/smart-intake/approve-all-safe", { physicianId: "admin_reviewer" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/smart-intake/all-cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/smart-intake/review-queue"] });
      toast({ title: "All safe cases approved" });
    },
  });

  const webIntakeMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/smart-intake/web-intake", data).then((r) => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/smart-intake/all-cases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/smart-intake/review-queue"] });
      setIntakeMessage("");
      toast({ title: `Case created: ${data.caseId}`, description: `Risk: ${data.riskLevel}, Status: ${data.queueStatus}` });
    },
  });

  const allCases = (allCasesQuery.data as any)?.cases || [];
  const byStatus = (allCasesQuery.data as any)?.byStatus || {};
  const reviewQueue = (reviewQueueQuery.data as any) || [];
  const analytics = outcomeAnalyticsQuery.data as any;
  const auditLog = (auditLogQuery.data as any) || [];
  const caseDetail = caseDetailQuery.data as any;

  function toggleCase(id: string) {
    setSelectedCases((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <div className="p-6 space-y-6" data-testid="smart-intake-dashboard">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="page-title">Smart Intake Pipeline</h1>
          <p className="text-muted-foreground mt-1">AI-powered triage from WhatsApp/SMS/Web to physician review</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="text-sm" data-testid="badge-total-cases">{allCases.length} Total Cases</Badge>
          <Badge variant="outline" className="text-sm bg-yellow-100" data-testid="badge-pending-review">{byStatus.needs_review || 0} Pending Review</Badge>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-6 w-full">
          <TabsTrigger value="overview" data-testid="tab-overview"><Activity className="w-4 h-4 mr-1" />Overview</TabsTrigger>
          <TabsTrigger value="queue" data-testid="tab-queue"><Clock className="w-4 h-4 mr-1" />Review Queue</TabsTrigger>
          <TabsTrigger value="intake" data-testid="tab-intake"><MessageSquare className="w-4 h-4 mr-1" />Submit Intake</TabsTrigger>
          <TabsTrigger value="outcomes" data-testid="tab-outcomes"><CheckCircle className="w-4 h-4 mr-1" />Outcomes</TabsTrigger>
          <TabsTrigger value="case-detail" data-testid="tab-case-detail"><FileText className="w-4 h-4 mr-1" />Case Detail</TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-audit"><Shield className="w-4 h-4 mr-1" />Audit Log</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Cases</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold" data-testid="stat-total">{allCases.length}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Auto-Resolved</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-blue-600" data-testid="stat-auto-resolved">{byStatus.auto_resolved || 0}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Needs Review</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-yellow-600" data-testid="stat-needs-review">{byStatus.needs_review || 0}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Approved</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-green-600" data-testid="stat-approved">{byStatus.approved || 0}</div></CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle>All Cases (Priority-Sorted)</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b"><th className="text-left p-2">Priority</th><th className="text-left p-2">Complaint</th><th className="text-left p-2">Source</th><th className="text-left p-2">Age</th><th className="text-left p-2">Risk</th><th className="text-left p-2">Confidence</th><th className="text-left p-2">Disposition</th><th className="text-left p-2">Status</th><th className="text-left p-2">Reason</th></tr></thead>
                  <tbody>
                    {allCases.map((c: any) => (
                      <tr key={c.id} className="border-b hover:bg-muted/50 cursor-pointer" onClick={() => { setSelectedCaseId(c.id); setActiveTab("case-detail"); }} data-testid={`case-row-${c.id}`}>
                        <td className="p-2 font-mono">{c.queuePriority}</td>
                        <td className="p-2 font-medium">{c.chiefComplaint}</td>
                        <td className="p-2"><Badge variant="outline">{c.source}</Badge></td>
                        <td className="p-2">{c.age ?? "-"}</td>
                        <td className="p-2"><Badge className={riskColor(c.riskLevel)}>{c.riskLevel.toUpperCase()}</Badge></td>
                        <td className="p-2">{Math.round(c.confidenceScore * 100)}%</td>
                        <td className="p-2">{c.proposedDisposition}</td>
                        <td className="p-2"><Badge className={statusColor(c.queueStatus)}>{c.queueStatus}</Badge></td>
                        <td className="p-2 text-xs text-muted-foreground">{c.reviewReason || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="queue" className="space-y-4">
          <div className="flex gap-2 items-center">
            <Button onClick={() => approveAllSafeMutation.mutate()} disabled={approveAllSafeMutation.isPending} variant="default" data-testid="button-approve-all-safe">
              <Zap className="w-4 h-4 mr-1" />Approve All Safe
            </Button>
            <Button onClick={() => batchApproveMutation.mutate({ caseIds: selectedCases, physicianId: "admin_reviewer", action: "approve" })} disabled={selectedCases.length === 0 || batchApproveMutation.isPending} data-testid="button-batch-approve">
              <CheckCircle className="w-4 h-4 mr-1" />Approve Selected ({selectedCases.length})
            </Button>
            <Button variant="destructive" onClick={() => batchApproveMutation.mutate({ caseIds: selectedCases, physicianId: "admin_reviewer", action: "escalate", overridePlanNote: "Escalated from batch review" })} disabled={selectedCases.length === 0 || batchApproveMutation.isPending} data-testid="button-batch-escalate">
              <AlertTriangle className="w-4 h-4 mr-1" />Escalate Selected
            </Button>
          </div>

          <Card>
            <CardHeader><CardTitle>Physician Review Queue</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b"><th className="p-2" /><th className="text-left p-2">Priority</th><th className="text-left p-2">Complaint</th><th className="text-left p-2">Age</th><th className="text-left p-2">Risk</th><th className="text-left p-2">Confidence</th><th className="text-left p-2">Disposition</th><th className="text-left p-2">Reason</th></tr></thead>
                  <tbody>
                    {reviewQueue.map((c: any) => (
                      <tr key={c.id} className="border-b hover:bg-muted/50" data-testid={`queue-row-${c.id}`}>
                        <td className="p-2" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={selectedCases.includes(c.id)} onChange={() => toggleCase(c.id)} data-testid={`checkbox-${c.id}`} />
                        </td>
                        <td className="p-2 font-mono">{c.queuePriority}</td>
                        <td className="p-2 font-medium cursor-pointer underline" onClick={() => { setSelectedCaseId(c.id); setActiveTab("case-detail"); }}>{c.chiefComplaint}</td>
                        <td className="p-2">{c.age ?? "-"}</td>
                        <td className="p-2"><Badge className={riskColor(c.riskLevel)}>{c.riskLevel.toUpperCase()}</Badge></td>
                        <td className="p-2">{Math.round(c.confidenceScore * 100)}%</td>
                        <td className="p-2">{c.proposedDisposition}</td>
                        <td className="p-2 text-xs">{c.reviewReason || "-"}</td>
                      </tr>
                    ))}
                    {reviewQueue.length === 0 && <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">No cases pending review</td></tr>}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="intake" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Submit Web Intake</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">Simulate a patient message (like WhatsApp/SMS). The Smart Intake Engine will parse symptoms, score risk, generate a treatment plan, and route to the queue.</p>
              <Textarea value={intakeMessage} onChange={(e) => setIntakeMessage(e.target.value)} placeholder="e.g. I'm a 34 year old male with a cough for 3 days and mild fever" rows={4} data-testid="input-intake-message" />
              <Button onClick={() => webIntakeMutation.mutate({ message: intakeMessage, source: "web" })} disabled={!intakeMessage.trim() || webIntakeMutation.isPending} data-testid="button-submit-intake">
                <MessageSquare className="w-4 h-4 mr-1" />Process Intake
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Webhook Endpoints</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><strong>Twilio/WhatsApp:</strong> <code className="bg-muted px-2 py-1 rounded">POST /api/smart-intake/webhook/twilio</code></p>
              <p><strong>Web Intake:</strong> <code className="bg-muted px-2 py-1 rounded">POST /api/smart-intake/web-intake</code></p>
              <p className="text-muted-foreground">Both endpoints accept patient messages and automatically parse, score, plan, and queue them.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="outcomes" className="space-y-4">
          {analytics && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Outcomes</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold" data-testid="stat-total-outcomes">{analytics.totalOutcomes}</div></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Average NPS</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold" data-testid="stat-avg-nps">{analytics.averageNps}</div></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Worsening Rate</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-red-600" data-testid="stat-worsening-rate">{analytics.worseningRate}%</div></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">ER Visit Rate</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-orange-600" data-testid="stat-er-rate">{analytics.erVisitRate}%</div></CardContent></Card>
            </div>
          )}
          {analytics?.byType && (
            <Card>
              <CardHeader><CardTitle>Outcomes by Type</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(analytics.byType).map(([type, count]: [string, any]) => (
                    <div key={type} className="flex items-center justify-between p-2 border rounded">
                      <span className="font-medium capitalize">{type.replace(/_/g, " ")}</span>
                      <Badge variant="secondary">{count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="case-detail" className="space-y-4">
          {!caseDetail && <p className="text-muted-foreground">Select a case from Overview or Review Queue to see details.</p>}
          {caseDetail && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader><CardTitle>Case {caseDetail.id}</CardTitle></CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p><strong>Patient:</strong> {caseDetail.patientId}</p>
                    <p><strong>Source:</strong> <Badge variant="outline">{caseDetail.source}</Badge></p>
                    <p><strong>Complaint:</strong> {caseDetail.chiefComplaint}</p>
                    <p><strong>Age:</strong> {caseDetail.age ?? "-"} | <strong>Sex:</strong> {caseDetail.sex ?? "-"}</p>
                    <p><strong>Duration:</strong> {caseDetail.symptomDuration ?? "-"}</p>
                    <p><strong>Risk:</strong> <Badge className={riskColor(caseDetail.riskLevel)}>{caseDetail.riskLevel.toUpperCase()}</Badge> (Score: {caseDetail.riskScore})</p>
                    <p><strong>Confidence:</strong> {Math.round(caseDetail.confidenceScore * 100)}%</p>
                    <p><strong>Disposition:</strong> {caseDetail.proposedDisposition}</p>
                    <p><strong>Status:</strong> <Badge className={statusColor(caseDetail.queueStatus)}>{caseDetail.queueStatus}</Badge></p>
                    {caseDetail.reviewReason && <p><strong>Review Reason:</strong> {caseDetail.reviewReason}</p>}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Differential Diagnosis</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {(caseDetail.differential || []).map((d: any) => (
                      <div key={d.diagnosis} className="flex items-center justify-between p-2 border rounded">
                        <span className="text-sm">{d.diagnosis.replace(/_/g, " ")}</span>
                        <Badge variant="secondary">{Math.round(d.probability * 100)}%</Badge>
                      </div>
                    ))}
                    {caseDetail.redFlags?.length > 0 && (
                      <div className="mt-4">
                        <p className="font-semibold text-red-600 mb-1">Red Flags:</p>
                        {caseDetail.redFlags.map((f: string) => <Badge key={f} variant="destructive" className="mr-1">{f}</Badge>)}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
              {caseDetail.proposedPlan && (
                <Card>
                  <CardHeader><CardTitle>Treatment Plan</CardTitle></CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <p><strong>Summary:</strong> {caseDetail.proposedPlan.summary}</p>
                    <p><strong>Diagnosis:</strong> {caseDetail.proposedPlan.diagnosisLabel}</p>
                    {caseDetail.proposedPlan.meds?.length > 0 && (
                      <div><strong>Medications:</strong>
                        <ul className="list-disc pl-6 mt-1">{caseDetail.proposedPlan.meds.map((m: any) => <li key={m.name}>{m.name} {m.dose} — {m.instructions}</li>)}</ul>
                      </div>
                    )}
                    {caseDetail.proposedPlan.homeCare?.length > 0 && (
                      <div><strong>Home Care:</strong>
                        <ul className="list-disc pl-6 mt-1">{caseDetail.proposedPlan.homeCare.map((h: string) => <li key={h}>{h}</li>)}</ul>
                      </div>
                    )}
                    {caseDetail.proposedPlan.returnPrecautions?.length > 0 && (
                      <div><strong>Return Precautions:</strong>
                        <ul className="list-disc pl-6 mt-1">{caseDetail.proposedPlan.returnPrecautions.map((r: string) => <li key={r}>{r}</li>)}</ul>
                      </div>
                    )}
                    <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded border">
                      <strong>Patient Message:</strong> {caseDetail.proposedPlan.patientMessage}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="audit" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Intake Audit Log ({auditLog.length} entries)</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {auditLog.slice().reverse().map((entry: any, i: number) => (
                  <div key={i} className="p-3 border rounded text-sm">
                    <div className="flex justify-between">
                      <Badge variant="outline">{entry.event}</Badge>
                      <span className="text-xs text-muted-foreground">{new Date(entry.at).toLocaleString()}</span>
                    </div>
                    <p className="mt-1"><strong>Actor:</strong> {entry.actor} | <strong>Entity:</strong> {entry.entityId}</p>
                  </div>
                ))}
                {auditLog.length === 0 && <p className="text-muted-foreground text-center">No audit entries yet</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
