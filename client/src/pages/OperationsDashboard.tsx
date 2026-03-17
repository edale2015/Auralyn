import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Activity, AlertTriangle, Users, Clock, TrendingDown,
  Shield, BarChart3, CheckCircle, XCircle, ArrowUpDown,
  Zap, Link, RefreshCw
} from "lucide-react";

function getAuthHeaders() {
  const token = localStorage.getItem("app_auth_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function OpsOverviewTab() {
  const { data: snapshot, isLoading } = useQuery<any>({
    queryKey: ["/api/ops/snapshot"],
  });

  if (isLoading) return <div className="p-6 text-muted-foreground" data-testid="loading-ops">Loading operations data...</div>;
  if (!snapshot) return <div className="p-6">No data available</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card data-testid="card-total-cases">
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Total Cases</div>
            <div className="text-3xl font-bold">{snapshot.totals?.totalCases || 0}</div>
          </CardContent>
        </Card>
        <Card data-testid="card-pending-cases">
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Pending</div>
            <div className="text-3xl font-bold text-yellow-600">{snapshot.totals?.pendingCases || 0}</div>
          </CardContent>
        </Card>
        <Card data-testid="card-escalated-cases">
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Escalated</div>
            <div className="text-3xl font-bold text-red-600">{snapshot.totals?.escalatedCases || 0}</div>
          </CardContent>
        </Card>
        <Card data-testid="card-reviewed-cases">
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Reviewed</div>
            <div className="text-3xl font-bold text-green-600">{snapshot.totals?.reviewedCases || 0}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><BarChart3 className="w-4 h-4" /> Rates</CardTitle></CardHeader>
          <CardContent className="space-y-2" data-testid="card-rates">
            <div className="flex justify-between"><span className="text-sm text-muted-foreground">Review Rate</span><span className="font-semibold">{((snapshot.rates?.reviewRate || 0) * 100).toFixed(1)}%</span></div>
            <div className="flex justify-between"><span className="text-sm text-muted-foreground">Override Rate</span><span className="font-semibold">{((snapshot.rates?.overrideRate || 0) * 100).toFixed(1)}%</span></div>
            <div className="flex justify-between"><span className="text-sm text-muted-foreground">Escalation Rate</span><span className="font-semibold">{((snapshot.rates?.escalationRate || 0) * 100).toFixed(1)}%</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Clock className="w-4 h-4" /> Performance</CardTitle></CardHeader>
          <CardContent className="space-y-2" data-testid="card-performance">
            <div className="flex justify-between"><span className="text-sm text-muted-foreground">Avg Review Time</span><span className="font-semibold">{snapshot.performance?.avgReviewSeconds || 0}s</span></div>
            <div className="flex justify-between"><span className="text-sm text-muted-foreground">Satisfaction</span><span className="font-semibold">{snapshot.performance?.satisfactionAverage?.toFixed(1) || 0} / 5</span></div>
            <div className="flex justify-between"><span className="text-sm text-muted-foreground">Avg Confidence</span><span className="font-semibold">{((snapshot.performance?.avgConfidence || 0) * 100).toFixed(1)}%</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Users className="w-4 h-4" /> Physicians</CardTitle></CardHeader>
          <CardContent className="space-y-2" data-testid="card-physicians">
            <div className="flex justify-between"><span className="text-sm text-muted-foreground">Active</span><span className="font-semibold">{snapshot.physicians?.active || 0} / {snapshot.physicians?.total || 0}</span></div>
            <div className="flex justify-between"><span className="text-sm text-muted-foreground">Load</span><span className="font-semibold">{snapshot.physicians?.totalLoad || 0} / {snapshot.physicians?.totalCapacity || 0}</span></div>
            <div className="flex justify-between"><span className="text-sm text-muted-foreground">Utilization</span><span className="font-semibold">{((snapshot.physicians?.utilizationRate || 0) * 100).toFixed(1)}%</span></div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Shield className="w-4 h-4" /> SLA Compliance</CardTitle></CardHeader>
        <CardContent data-testid="card-sla">
          <div className="flex items-center gap-6">
            <div>
              <span className="text-sm text-muted-foreground">Within SLA: </span>
              <span className="font-semibold text-green-600">{snapshot.sla?.withinSLA || 0}</span>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Breached: </span>
              <span className="font-semibold text-red-600">{snapshot.sla?.breachedSLA || 0}</span>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Compliance: </span>
              <span className="font-semibold">{((snapshot.sla?.slaComplianceRate || 0) * 100).toFixed(1)}%</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PhysicianRoutingTab() {
  const { toast } = useToast();
  const [clinicId, setClinicId] = useState("clinic_a");
  const [complaint, setComplaint] = useState("Sore throat and fever");
  const [riskLevel, setRiskLevel] = useState("MEDIUM");
  const [routingResult, setRoutingResult] = useState<any>(null);

  const { data: physData } = useQuery<any>({ queryKey: ["/api/ops/physicians", clinicId], queryFn: () => fetch(`/api/ops/physicians?clinicId=${clinicId}`, { headers: getAuthHeaders() }).then(r => r.json()) });

  const routeMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/ops/route-case", { clinicId, complaint, riskLevel }),
    onSuccess: async (res) => { const data = await res.json(); setRoutingResult(data); queryClient.invalidateQueries({ queryKey: ["/api/ops/physicians"] }); toast({ title: "Case Routed", description: data.routingReason }); },
  });

  const physicians = physData?.physicians || [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ArrowUpDown className="w-5 h-5" /> Route a Case</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium">Clinic</label>
              <Select value={clinicId} onValueChange={setClinicId}>
                <SelectTrigger data-testid="select-clinic"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="clinic_a">Clinic A</SelectItem><SelectItem value="clinic_b">Clinic B</SelectItem></SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Risk Level</label>
              <Select value={riskLevel} onValueChange={setRiskLevel}>
                <SelectTrigger data-testid="select-risk"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="LOW">LOW</SelectItem><SelectItem value="MEDIUM">MEDIUM</SelectItem><SelectItem value="HIGH">HIGH</SelectItem></SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Complaint</label>
              <input className="w-full border rounded px-3 py-2 text-sm" value={complaint} onChange={(e) => setComplaint(e.target.value)} data-testid="input-complaint" />
            </div>
          </div>
          <Button onClick={() => routeMut.mutate()} disabled={routeMut.isPending} data-testid="button-route-case"><Zap className="w-4 h-4 mr-2" /> Route Case</Button>
          {routingResult && (
            <Card className="bg-muted/50 mt-4" data-testid="routing-result">
              <CardContent className="pt-4 space-y-1">
                <div className="font-semibold text-lg">{routingResult.assignedPhysicianName || "Unassigned"}</div>
                <div className="text-sm text-muted-foreground">{routingResult.routingReason}</div>
                <div className="text-sm">Score: {routingResult.score} · Candidates: {routingResult.candidatesEvaluated}</div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Users className="w-5 h-5" /> Physician Roster — {clinicId}</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {physicians.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between border rounded p-3" data-testid={`physician-${p.id}`}>
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-sm text-muted-foreground">{p.role} · {p.specialties.join(", ")}</div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={p.active ? "default" : "secondary"}>{p.active ? "Active" : "Inactive"}</Badge>
                  {p.canReviewHighRisk && <Badge variant="destructive" className="text-xs">HIGH RISK OK</Badge>}
                  <div className="text-sm font-mono">{p.currentLoad}/{p.maxConcurrent}</div>
                  <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${(p.currentLoad / p.maxConcurrent) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function EscalationQueueTab() {
  const { toast } = useToast();
  const { data: queueData, isLoading } = useQuery<any>({ queryKey: ["/api/ops/queue"] });

  const escalateMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/ops/escalate"),
    onSuccess: async (res) => { const d = await res.json(); toast({ title: "Escalation Scan Complete", description: `Scanned ${d.scanned}, escalated ${d.escalatedCount}` }); queryClient.invalidateQueries({ queryKey: ["/api/ops/queue"] }); queryClient.invalidateQueries({ queryKey: ["/api/ops/snapshot"] }); },
  });

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading queue...</div>;
  const queue = queueData?.queue || [];
  const stats = queueData?.stats || {};

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><div className="text-sm text-muted-foreground">Total</div><div className="text-2xl font-bold">{stats.total || 0}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-sm text-muted-foreground">Pending</div><div className="text-2xl font-bold text-yellow-600">{stats.pending || 0}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-sm text-muted-foreground">Escalated</div><div className="text-2xl font-bold text-red-600">{stats.escalated || 0}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-sm text-muted-foreground">Reviewed</div><div className="text-2xl font-bold text-green-600">{stats.reviewed || 0}</div></CardContent></Card>
      </div>

      <div className="flex gap-2">
        <Button onClick={() => escalateMut.mutate()} variant="destructive" disabled={escalateMut.isPending} data-testid="button-escalation-scan">
          <AlertTriangle className="w-4 h-4 mr-2" /> Run Escalation Scan
        </Button>
        <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/ops/queue"] })} data-testid="button-refresh-queue">
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ArrowUpDown className="w-5 h-5" /> Priority Queue (sorted by urgency)</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {queue.map((c: any) => {
              const ageMin = Math.floor((Date.now() - c.createdAt) / 60000);
              const slaBreached = ageMin > c.slaMinutes;
              return (
                <div key={c.id} className={`flex items-center justify-between border rounded p-3 ${slaBreached ? "border-red-300 bg-red-50 dark:bg-red-950/20" : ""}`} data-testid={`queue-case-${c.id}`}>
                  <div className="flex-1">
                    <div className="font-medium">{c.patientName}</div>
                    <div className="text-sm text-muted-foreground">{c.complaint}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={c.riskLevel === "HIGH" ? "destructive" : c.riskLevel === "MEDIUM" ? "default" : "secondary"}>{c.riskLevel}</Badge>
                    <Badge variant={c.status === "escalated" ? "destructive" : c.status === "reviewed" ? "outline" : "secondary"}>{c.status}</Badge>
                    <div className="text-sm font-mono w-16 text-right">{(c.confidence * 100).toFixed(0)}%</div>
                    <div className={`text-sm font-mono w-16 text-right ${slaBreached ? "text-red-600 font-bold" : ""}`}>{ageMin}m / {c.slaMinutes}m</div>
                    <div className="text-sm font-mono w-12 text-right text-muted-foreground">P{c.priority}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DriftMonitorTab() {
  const { data: drift, isLoading } = useQuery<any>({ queryKey: ["/api/ops/drift"] });
  const { data: complaints } = useQuery<any>({ queryKey: ["/api/ops/complaint-analytics"] });

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading drift analysis...</div>;

  const complaintList = complaints?.complaints || [];

  return (
    <div className="space-y-6">
      {drift && (
        <Card data-testid="card-drift-result">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5" /> Outcome Drift Monitor
              {drift.driftDetected && <Badge variant="destructive">DRIFT DETECTED</Badge>}
              {!drift.driftDetected && <Badge variant="outline" className="text-green-600">STABLE</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><div className="text-sm text-muted-foreground">Baseline Accuracy</div><div className="text-2xl font-bold">{(drift.baselineAccuracy * 100).toFixed(1)}%</div><div className="text-xs text-muted-foreground">{drift.baselineSize} cases</div></div>
              <div><div className="text-sm text-muted-foreground">Recent Accuracy</div><div className="text-2xl font-bold">{(drift.recentAccuracy * 100).toFixed(1)}%</div><div className="text-xs text-muted-foreground">{drift.recentSize} cases</div></div>
              <div><div className="text-sm text-muted-foreground">Delta</div><div className={`text-2xl font-bold ${drift.delta > 0 ? "text-red-600" : "text-green-600"}`}>{drift.delta > 0 ? "-" : "+"}{(Math.abs(drift.delta) * 100).toFixed(1)}%</div></div>
              <div><div className="text-sm text-muted-foreground">Severity</div><Badge variant={drift.severity === "severe" ? "destructive" : drift.severity === "moderate" ? "default" : "secondary"} className="mt-1">{drift.severity?.toUpperCase()}</Badge></div>
            </div>
            <div className="bg-muted/50 rounded p-3 text-sm"><strong>Recommended:</strong> {drift.recommendedAction}</div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5" /> Per-Complaint Performance</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {complaintList.map((c: any) => (
              <div key={c.complaint} className="flex items-center justify-between border rounded p-3" data-testid={`complaint-${c.complaint.toLowerCase().replace(/\s/g, "-")}`}>
                <div className="flex items-center gap-3">
                  <Badge variant={c.status === "critical" ? "destructive" : c.status === "warning" ? "default" : "secondary"}>{c.status}</Badge>
                  <span className="font-medium">{c.complaint}</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span>{c.total} cases</span>
                  <span className={c.accuracy < 0.7 ? "text-red-600 font-semibold" : ""}>{(c.accuracy * 100).toFixed(1)}% accuracy</span>
                  <span>{(c.escalationRate * 100).toFixed(1)}% escalation</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AuditChainTab() {
  const { data: auditData, isLoading } = useQuery<any>({ queryKey: ["/api/ops/audit-chain"] });
  const { data: verifyData } = useQuery<any>({ queryKey: ["/api/ops/audit-chain/verify"] });

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading audit chain...</div>;

  const chain = auditData?.chain || [];
  const summary = auditData?.summary || {};

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card><CardContent className="pt-4"><div className="text-sm text-muted-foreground">Chain Length</div><div className="text-2xl font-bold">{summary.length || 0}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-sm text-muted-foreground">Approvals</div><div className="text-2xl font-bold text-green-600">{summary.actions?.approve || 0}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-sm text-muted-foreground">Overrides</div><div className="text-2xl font-bold text-yellow-600">{summary.actions?.override || 0}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-sm text-muted-foreground">Escalations</div><div className="text-2xl font-bold text-red-600">{summary.actions?.escalate || 0}</div></CardContent></Card>
        <Card data-testid="card-integrity">
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Integrity</div>
            <div className="flex items-center gap-2 mt-1">
              {verifyData?.valid ? <CheckCircle className="w-5 h-5 text-green-600" /> : <XCircle className="w-5 h-5 text-red-600" />}
              <span className={`font-bold ${verifyData?.valid ? "text-green-600" : "text-red-600"}`}>{verifyData?.valid ? "VERIFIED" : "BROKEN"}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Link className="w-5 h-5" /> Immutable Audit Chain</CardTitle>
          {summary.latestHash && <div className="text-xs font-mono text-muted-foreground mt-1">Latest: {summary.latestHash?.slice(0, 16)}...</div>}
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {chain.map((entry: any) => (
              <div key={entry.index} className="border rounded p-3 space-y-1" data-testid={`audit-entry-${entry.index}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">#{entry.index}</span>
                    <Badge variant={entry.action === "override" ? "default" : entry.action === "escalate" ? "destructive" : "secondary"}>{entry.action}</Badge>
                    <span className="font-medium">{entry.caseId}</span>
                    <span className="text-sm text-muted-foreground">by {entry.userId}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(entry.timestamp).toLocaleString()}</span>
                </div>
                <div className="text-xs font-mono text-muted-foreground">Hash: {entry.hash.slice(0, 24)}... → Prev: {entry.previousHash.slice(0, 16)}...</div>
                {entry.payload && (
                  <div className="text-xs text-muted-foreground">{JSON.stringify(entry.payload).slice(0, 120)}</div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ApprovalRulesTab() {
  const [testInput, setTestInput] = useState({ riskLevel: "LOW", confidence: 0.85, hasSafetyAlerts: false, disposition: "home_care" });
  const [result, setResult] = useState<any>(null);

  const checkMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/ops/approval-check", testInput),
    onSuccess: async (res) => { setResult(await res.json()); },
  });

  const actionColors: Record<string, string> = {
    auto_approve: "text-green-600",
    eligible_for_batch: "text-blue-600",
    mandatory_review: "text-yellow-600",
    escalate: "text-red-600",
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Shield className="w-5 h-5" /> Approval Rules Engine</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium">Risk Level</label>
              <Select value={testInput.riskLevel} onValueChange={(v) => setTestInput({ ...testInput, riskLevel: v })}>
                <SelectTrigger data-testid="select-test-risk"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="LOW">LOW</SelectItem><SelectItem value="MEDIUM">MEDIUM</SelectItem><SelectItem value="HIGH">HIGH</SelectItem></SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Confidence</label>
              <input type="number" min="0" max="1" step="0.05" className="w-full border rounded px-3 py-2 text-sm" value={testInput.confidence} onChange={(e) => setTestInput({ ...testInput, confidence: parseFloat(e.target.value) || 0 })} data-testid="input-confidence" />
            </div>
            <div>
              <label className="text-sm font-medium">Disposition</label>
              <Select value={testInput.disposition} onValueChange={(v) => setTestInput({ ...testInput, disposition: v })}>
                <SelectTrigger data-testid="select-disposition"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="home_care">Home Care</SelectItem><SelectItem value="follow_up">Follow Up</SelectItem><SelectItem value="urgent_now">Urgent Now</SelectItem><SelectItem value="er_now">ER Now</SelectItem></SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Safety Alerts</label>
              <Select value={testInput.hasSafetyAlerts ? "yes" : "no"} onValueChange={(v) => setTestInput({ ...testInput, hasSafetyAlerts: v === "yes" })}>
                <SelectTrigger data-testid="select-safety"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="no">None</SelectItem><SelectItem value="yes">Present</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={() => checkMut.mutate()} disabled={checkMut.isPending} data-testid="button-check-approval"><Shield className="w-4 h-4 mr-2" /> Check Approval</Button>
          {result && (
            <Card className="bg-muted/50 mt-4" data-testid="approval-result">
              <CardContent className="pt-4 space-y-2">
                <div className={`text-xl font-bold ${actionColors[result.action] || ""}`}>{result.action?.replace(/_/g, " ").toUpperCase()}</div>
                <div className="text-sm">{result.reason}</div>
                <div className="flex gap-3 text-sm">
                  <Badge variant={result.requiresPhysician ? "default" : "secondary"}>{result.requiresPhysician ? "Physician Required" : "No Physician Needed"}</Badge>
                  <Badge variant={result.urgency === "critical" ? "destructive" : result.urgency === "high" ? "default" : "secondary"}>{result.urgency}</Badge>
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Approval Rules Reference</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2"><Badge variant="destructive">ESCALATE</Badge> HIGH risk, ER/urgent disposition</div>
            <div className="flex items-center gap-2"><Badge>MANDATORY REVIEW</Badge> Safety alerts, confidence {"<"} 60%</div>
            <div className="flex items-center gap-2"><Badge variant="secondary">BATCH ELIGIBLE</Badge> Medium risk or confidence 60-75%</div>
            <div className="flex items-center gap-2"><Badge variant="outline">AUTO APPROVE</Badge> Low risk, high confidence, no alerts</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function OperationsDashboard() {
  const [tab, setTab] = useState("overview");

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3" data-testid="text-page-title">
          <Activity className="w-8 h-8 text-primary" /> Operations Dashboard
        </h1>
        <p className="text-muted-foreground mt-1">Live system operations — physician routing, escalation queue, drift monitoring, audit chain</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-6 w-full max-w-3xl">
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="routing" data-testid="tab-routing">Routing</TabsTrigger>
          <TabsTrigger value="queue" data-testid="tab-queue">Queue & SLA</TabsTrigger>
          <TabsTrigger value="drift" data-testid="tab-drift">Drift</TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-audit">Audit Chain</TabsTrigger>
          <TabsTrigger value="rules" data-testid="tab-rules">Rules</TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><OpsOverviewTab /></TabsContent>
        <TabsContent value="routing"><PhysicianRoutingTab /></TabsContent>
        <TabsContent value="queue"><EscalationQueueTab /></TabsContent>
        <TabsContent value="drift"><DriftMonitorTab /></TabsContent>
        <TabsContent value="audit"><AuditChainTab /></TabsContent>
        <TabsContent value="rules"><ApprovalRulesTab /></TabsContent>
      </Tabs>
    </div>
  );
}
