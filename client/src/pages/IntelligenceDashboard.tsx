import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Brain, TrendingUp, AlertTriangle, DollarSign, Shield, Target, UserCheck, Crosshair } from "lucide-react";

function tierColor(tier: string) {
  if (tier === "elite") return "bg-purple-600 text-white";
  if (tier === "strong") return "bg-blue-600 text-white";
  if (tier === "watch") return "bg-yellow-500 text-black";
  return "bg-red-600 text-white";
}

function severityColor(sev: string) {
  if (sev === "critical") return "bg-red-600 text-white";
  if (sev === "watch") return "bg-yellow-500 text-black";
  return "bg-green-600 text-white";
}

function hardeningColor(status: string) {
  if (status === "critical") return "bg-red-600 text-white";
  if (status === "watch") return "bg-yellow-500 text-black";
  return "bg-green-600 text-white";
}

export default function IntelligenceDashboard() {
  const [activeTab, setActiveTab] = useState("overview");

  const dashboardQuery = useQuery({ queryKey: ["/api/intelligence/dashboard"] });
  const data = dashboardQuery.data as any;

  if (dashboardQuery.isLoading) {
    return <div className="p-6"><p className="text-muted-foreground">Loading intelligence data...</p></div>;
  }

  const rankings = data?.rankings || [];
  const anomalies = data?.anomalies || [];
  const costAnalysis = data?.costAnalysis || {};
  const calibration = data?.calibration || [];
  const hardening = data?.hardening || [];
  const safetyMode = data?.safetyMode || {};
  const recommendations = data?.recommendations || [];
  const threshold = data?.threshold || {};
  const coaching = data?.coaching || [];

  const criticalCount = anomalies.filter((a: any) => a.severity === "critical").length;
  const watchCount = anomalies.filter((a: any) => a.severity === "watch").length;

  return (
    <div className="p-6 space-y-6" data-testid="intelligence-dashboard">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="page-title">Intelligence Layer</h1>
          <p className="text-muted-foreground mt-1">Performance-aware routing, anomaly detection, cost optimization, and adaptive safety</p>
        </div>
        <div className="flex gap-2">
          <Badge className={safetyMode.mode === "strict" ? "bg-red-600 text-white" : safetyMode.mode === "elevated" ? "bg-yellow-500 text-black" : "bg-green-600 text-white"} data-testid="badge-safety-mode">
            Safety: {safetyMode.mode?.toUpperCase()}
          </Badge>
          {criticalCount > 0 && <Badge variant="destructive" data-testid="badge-critical-anomalies">{criticalCount} Critical</Badge>}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-7 w-full">
          <TabsTrigger value="overview" data-testid="tab-overview"><Brain className="w-4 h-4 mr-1" />Overview</TabsTrigger>
          <TabsTrigger value="ranking" data-testid="tab-ranking"><TrendingUp className="w-4 h-4 mr-1" />Ranking</TabsTrigger>
          <TabsTrigger value="anomalies" data-testid="tab-anomalies"><AlertTriangle className="w-4 h-4 mr-1" />Anomalies</TabsTrigger>
          <TabsTrigger value="cost" data-testid="tab-cost"><DollarSign className="w-4 h-4 mr-1" />Cost</TabsTrigger>
          <TabsTrigger value="calibration" data-testid="tab-calibration"><Target className="w-4 h-4 mr-1" />Calibration</TabsTrigger>
          <TabsTrigger value="hardening" data-testid="tab-hardening"><Shield className="w-4 h-4 mr-1" />Hardening</TabsTrigger>
          <TabsTrigger value="coaching" data-testid="tab-coaching"><UserCheck className="w-4 h-4 mr-1" />Coaching</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Safety Mode</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold capitalize" data-testid="stat-safety-mode">{safetyMode.mode}</div>
                <p className="text-xs text-muted-foreground mt-1">Batch Approval: {safetyMode.batchApprovalEnabled ? "Enabled" : "Disabled"}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Avg Cost/Case</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold" data-testid="stat-avg-cost">${costAnalysis.averageCostPerCase}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Anomalies</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="stat-anomaly-count">{criticalCount} Critical / {watchCount} Watch</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Confidence Threshold</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="stat-threshold">{threshold.nextConfidenceThreshold}</div>
                <p className="text-xs text-muted-foreground mt-1">{threshold.action === "tightened" ? "Tightened from " : threshold.action === "loosened" ? "Loosened from " : "Unchanged at "}{threshold.currentConfidenceThreshold}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>AI Recommendations</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {recommendations.map((r: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 p-3 border rounded" data-testid={`recommendation-${i}`}>
                    <Crosshair className="w-4 h-4 mt-0.5 text-blue-500 flex-shrink-0" />
                    <span className="text-sm">{r}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ranking" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Physician Intelligence Rankings</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {rankings.map((r: any) => (
                  <div key={r.physicianId} className="p-4 border rounded space-y-2" data-testid={`physician-rank-${r.physicianId}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{r.physicianId}</span>
                        <Badge className={tierColor(r.tier)}>{r.tier.toUpperCase()}</Badge>
                        <Badge variant="outline">{r.clinicId}</Badge>
                      </div>
                      <span className="text-xl font-bold">{r.intelligenceScore}</span>
                    </div>
                    <Progress value={r.intelligenceScore} className="h-2" />
                    <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground">
                      <span>Review Time: {r.avgReviewTimeSeconds}s</span>
                      <span>Override: {(r.overrideRate * 100).toFixed(1)}%</span>
                      <span>Satisfaction: {r.avgSatisfaction.toFixed(2)}</span>
                      <span>High-Risk: {r.highRiskHandled}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="anomalies" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Real-Time Anomaly Detection</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {anomalies.map((a: any) => (
                  <div key={a.metric} className="p-4 border rounded" data-testid={`anomaly-${a.metric}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold capitalize">{a.metric.replace(/_/g, " ")}</span>
                        <Badge className={severityColor(a.severity)}>{a.severity.toUpperCase()}</Badge>
                        {a.isAnomaly && <Badge variant="destructive">ANOMALY</Badge>}
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-sm">
                      <div><span className="text-muted-foreground">Latest:</span> <strong>{a.latest}</strong></div>
                      <div><span className="text-muted-foreground">Mean:</span> {a.mean}</div>
                      <div><span className="text-muted-foreground">Std Dev:</span> {a.stdDev}</div>
                      <div><span className="text-muted-foreground">Z-Score:</span> <strong className={Math.abs(a.zScore) >= 2 ? "text-red-600" : ""}>{a.zScore}</strong></div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cost" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>Cost Summary</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="text-3xl font-bold" data-testid="cost-avg">${costAnalysis.averageCostPerCase}</div>
                <p className="text-sm text-muted-foreground">Average cost per case</p>
                <p className="text-sm font-medium" data-testid="cost-recommendation">{costAnalysis.recommendation}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Per-Case Breakdown</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {(costAnalysis.cases || []).map((c: any) => (
                    <div key={c.caseId} className="flex items-center justify-between p-2 border rounded text-sm">
                      <div>
                        <span className="font-medium">{c.caseId}</span>
                        <span className="text-muted-foreground ml-2">{c.clinicId}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {c.escalated && <Badge variant="destructive" className="text-xs">Escalated</Badge>}
                        <span className="font-bold">${c.totalCost}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="calibration" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Confidence Calibration by Complaint</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b"><th className="text-left p-2">Complaint</th><th className="text-left p-2">Empirical Accuracy</th><th className="text-left p-2">Avg Raw Confidence</th><th className="text-left p-2">Adjustment</th><th className="text-left p-2">Status</th></tr></thead>
                  <tbody>
                    {calibration.map((c: any) => (
                      <tr key={c.complaint} className="border-b" data-testid={`calibration-${c.complaint}`}>
                        <td className="p-2 font-medium capitalize">{c.complaint.replace(/_/g, " ")}</td>
                        <td className="p-2">{(c.empiricalAccuracy * 100).toFixed(1)}%</td>
                        <td className="p-2">{(c.avgRawConfidence * 100).toFixed(1)}%</td>
                        <td className="p-2">
                          <span className={c.adjustment >= 0 ? "text-green-600" : "text-red-600"}>{c.adjustment >= 0 ? "+" : ""}{(c.adjustment * 100).toFixed(1)}%</span>
                        </td>
                        <td className="p-2">
                          <Badge className={c.adjustment < -0.1 ? "bg-red-500 text-white" : c.adjustment < 0 ? "bg-yellow-500 text-black" : "bg-green-500 text-white"}>
                            {c.adjustment < -0.1 ? "Overconfident" : c.adjustment < 0 ? "Slight Over" : "Calibrated"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hardening" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Complaint-Specific Hardening Plan</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {hardening.map((h: any) => (
                  <div key={h.complaint} className="p-4 border rounded" data-testid={`hardening-${h.complaint}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold capitalize">{h.complaint.replace(/_/g, " ")}</span>
                      <Badge className={hardeningColor(h.status)}>{h.status.toUpperCase()}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-muted-foreground">Accuracy:</span> {(h.accuracy * 100).toFixed(1)}%</div>
                      <div><span className="text-muted-foreground">Escalation Rate:</span> {(h.escalationRate * 100).toFixed(1)}%</div>
                    </div>
                    <p className="text-sm mt-2 text-muted-foreground">{h.action}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="coaching" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Physician Coaching Recommendations</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {coaching.map((c: any) => (
                  <div key={c.physicianId} className="p-4 border rounded" data-testid={`coaching-${c.physicianId}`}>
                    <div className="font-bold mb-2">{c.physicianId}</div>
                    <ul className="space-y-1">
                      {c.tips.map((tip: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="text-blue-500">-</span>
                          <span>{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
