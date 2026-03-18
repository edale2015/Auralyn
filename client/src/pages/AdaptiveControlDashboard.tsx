import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, TrendingUp, DollarSign, Shield, BarChart3, Users, Brain, FileText } from "lucide-react";

export default function AdaptiveControlDashboard() {
  const [loopResult, setLoopResult] = useState<any>(null);
  const [caseMix, setCaseMix] = useState<any[]>([]);
  const [profitability, setProfitability] = useState<any>(null);
  const [simulation, setSimulation] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [reinforcement, setReinforcement] = useState<any[]>([]);
  const [shiftForecast, setShiftForecast] = useState<any[]>([]);
  const [portfolio, setPortfolio] = useState<any>(null);
  const [scenarios, setScenarios] = useState<any>(null);
  const [execSummary, setExecSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAll() {
      try {
        const [loopRes, caseMixRes, profitRes, simRes, reinforceRes, shiftRes, portfolioRes, scenarioRes] = await Promise.all([
          fetch("/api/adaptive-control/loop", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clinicId: "clinicA",
              driftDetected: true,
              anomalySeverity: "watch",
              recentOverrideRate: 0.14,
              recentAccuracy: 0.79,
              avgCostPerCase: 9.4,
              escalationRate: 0.11,
              currentConfidenceThreshold: 0.78
            })
          }).then(r => r.json()),
          fetch("/api/adaptive-control/case-mix", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              rows: [
                { date: "2026-03-12", complaint: "cough", count: 18, avgRiskScore: 2.1 },
                { date: "2026-03-13", complaint: "cough", count: 22, avgRiskScore: 2.5 },
                { date: "2026-03-12", complaint: "dizziness", count: 8, avgRiskScore: 4.3 },
                { date: "2026-03-13", complaint: "dizziness", count: 10, avgRiskScore: 4.7 },
                { date: "2026-03-12", complaint: "sore throat", count: 14, avgRiskScore: 1.8 },
                { date: "2026-03-13", complaint: "sore throat", count: 16, avgRiskScore: 1.9 }
              ]
            })
          }).then(r => r.json()),
          fetch("/api/adaptive-control/profitability", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clinicId: "clinicA",
              totalCases: 3200,
              avgRevenuePerCase: 24,
              avgCostPerCase: 8.8,
              monthlyPlatformFee: 19900
            })
          }).then(r => r.json()),
          fetch("/api/adaptive-control/simulate-thresholds", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              cases: [
                { rawConfidence: 0.91, wasCorrect: true, riskLevel: "LOW" },
                { rawConfidence: 0.82, wasCorrect: true, riskLevel: "LOW" },
                { rawConfidence: 0.69, wasCorrect: false, riskLevel: "MEDIUM" },
                { rawConfidence: 0.77, wasCorrect: true, riskLevel: "MEDIUM" },
                { rawConfidence: 0.58, wasCorrect: false, riskLevel: "HIGH" },
                { rawConfidence: 0.88, wasCorrect: true, riskLevel: "LOW" }
              ],
              strategies: [
                { name: "Conservative", confidenceThreshold: 0.85, batchApprovalEnabled: false },
                { name: "Balanced", confidenceThreshold: 0.78, batchApprovalEnabled: true },
                { name: "Aggressive", confidenceThreshold: 0.7, batchApprovalEnabled: true }
              ]
            })
          }).then(r => r.json()),
          fetch("/api/adaptive-control/reinforcement", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              rows: [
                { physicianId: "dr_smith", complaint: "cough", wasCorrect: true, escalated: false, override: false },
                { physicianId: "dr_smith", complaint: "cough", wasCorrect: true, escalated: false, override: false },
                { physicianId: "dr_jones", complaint: "dizziness", wasCorrect: false, escalated: true, override: true },
                { physicianId: "dr_jones", complaint: "dizziness", wasCorrect: true, escalated: false, override: false },
              ]
            })
          }).then(r => r.json()),
          fetch("/api/adaptive-insights/shift-forecast", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              rows: [
                { hourBlock: "08:00-12:00", expectedCases: 45, avgRiskScore: 2.8 },
                { hourBlock: "12:00-16:00", expectedCases: 38, avgRiskScore: 3.2 },
                { hourBlock: "16:00-20:00", expectedCases: 28, avgRiskScore: 4.1 },
              ]
            })
          }).then(r => r.json()),
          fetch("/api/adaptive-insights/portfolio", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              rows: [
                { clinicId: "clinicA", totalCases: 3200, marginPct: 34.2, overrideRate: 0.08, satisfaction: 4.5 },
                { clinicId: "clinicB", totalCases: 1800, marginPct: 28.1, overrideRate: 0.12, satisfaction: 4.1 },
                { clinicId: "clinicC", totalCases: 4100, marginPct: 41.5, overrideRate: 0.05, satisfaction: 4.7 },
              ]
            })
          }).then(r => r.json()),
          fetch("/api/adaptive-insights/scenario-compare", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              rows: [
                { name: "Current", accuracy: 0.82, costPerCase: 8.8, overrideRate: 0.14 },
                { name: "Strict Mode", accuracy: 0.91, costPerCase: 11.2, overrideRate: 0.06 },
                { name: "Throughput", accuracy: 0.78, costPerCase: 6.5, overrideRate: 0.19 },
              ]
            })
          }).then(r => r.json()),
        ]);

        setLoopResult(loopRes);
        setCaseMix(caseMixRes);
        setProfitability(profitRes);
        setSimulation(simRes);
        setReinforcement(reinforceRes);
        setShiftForecast(shiftRes);
        setPortfolio(portfolioRes);
        setScenarios(scenarioRes);

        const recsRes = await fetch("/api/adaptive-control/recommendations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            safetyMode: loopRes.safetyMode,
            nextConfidenceThreshold: loopRes.nextConfidenceThreshold,
            topCaseMixComplaint: caseMixRes[0]?.complaint,
            marginPct: profitRes.marginPct
          })
        }).then(r => r.json());
        setRecommendations(recsRes.recommendations || []);

        const execRes = await fetch("/api/adaptive-insights/executive-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clinicId: "clinicA",
            totalCases: 3200,
            safetyMode: loopRes.safetyMode,
            marginPct: profitRes.marginPct,
            overrideRate: 0.14,
            topComplaint: caseMixRes[0]?.complaint || "cough"
          })
        }).then(r => r.json());
        setExecSummary(execRes);
      } catch (e) {
        console.error("Failed to load adaptive control data", e);
      } finally {
        setLoading(false);
      }
    }
    loadAll();
  }, []);

  const safetyColor = (mode: string) => {
    if (mode === "strict") return "destructive";
    if (mode === "elevated") return "secondary";
    return "default";
  };

  if (loading) {
    return (
      <div className="p-6" data-testid="adaptive-control-loading">
        <h1 className="text-2xl font-bold mb-4">Adaptive Control Dashboard</h1>
        <p className="text-muted-foreground">Loading adaptive control data...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="adaptive-control-dashboard">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Adaptive Control Dashboard</h1>
        {loopResult && (
          <Badge variant={safetyColor(loopResult.safetyMode)} data-testid="safety-mode-badge">
            {loopResult.safetyMode.toUpperCase()} MODE
          </Badge>
        )}
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex flex-wrap gap-1">
          <TabsTrigger value="overview" data-testid="tab-overview"><Activity className="w-4 h-4 mr-1" />Overview</TabsTrigger>
          <TabsTrigger value="casemix" data-testid="tab-casemix"><BarChart3 className="w-4 h-4 mr-1" />Case Mix</TabsTrigger>
          <TabsTrigger value="profitability" data-testid="tab-profitability"><DollarSign className="w-4 h-4 mr-1" />Profitability</TabsTrigger>
          <TabsTrigger value="simulation" data-testid="tab-simulation"><Shield className="w-4 h-4 mr-1" />Simulation</TabsTrigger>
          <TabsTrigger value="reinforcement" data-testid="tab-reinforcement"><TrendingUp className="w-4 h-4 mr-1" />Reinforcement</TabsTrigger>
          <TabsTrigger value="staffing" data-testid="tab-staffing"><Users className="w-4 h-4 mr-1" />Staffing</TabsTrigger>
          <TabsTrigger value="portfolio" data-testid="tab-portfolio"><Brain className="w-4 h-4 mr-1" />Portfolio</TabsTrigger>
          <TabsTrigger value="executive" data-testid="tab-executive"><FileText className="w-4 h-4 mr-1" />Executive</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {loopResult && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card data-testid="card-safety-mode">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Safety Mode</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold">{loopResult.safetyMode}</p></CardContent>
              </Card>
              <Card data-testid="card-routing-policy">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Routing Policy</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold">{loopResult.routingPolicy}</p></CardContent>
              </Card>
              <Card data-testid="card-confidence-threshold">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Confidence Threshold</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold">{loopResult.nextConfidenceThreshold}</p></CardContent>
              </Card>
              <Card data-testid="card-batch-approval">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Batch Approval</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold">{loopResult.batchApprovalEnabled ? "Enabled" : "Disabled"}</p></CardContent>
              </Card>
            </div>
          )}

          <Card>
            <CardHeader><CardTitle>Recommendations</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-2" data-testid="recommendations-list">
                {recommendations.map((r, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-primary mt-1">&#8226;</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {loopResult && (
            <Card>
              <CardHeader><CardTitle>Recommended Actions</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-1" data-testid="actions-list">
                  {loopResult.recommendedActions?.map((a: string, i: number) => (
                    <li key={i} className="text-sm">{a}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="casemix" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Case Mix Forecast</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3" data-testid="casemix-list">
                {caseMix.map((row: any) => (
                  <div key={row.complaint} className="border rounded-lg p-4">
                    <div className="font-semibold text-lg">{row.complaint}</div>
                    <div className="grid grid-cols-3 gap-2 mt-2 text-sm">
                      <div>Forecast Count: <span className="font-medium">{row.forecastCount}</span></div>
                      <div>Avg Risk: <span className="font-medium">{row.forecastAvgRiskScore}</span></div>
                      <div>Staffing Weight: <span className="font-medium">{row.recommendedStaffingWeight}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profitability" className="space-y-4">
          {profitability && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card data-testid="card-gross-revenue">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Gross Revenue</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold">${profitability.grossRevenue?.toLocaleString()}</p></CardContent>
              </Card>
              <Card data-testid="card-total-cost">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Total Cost</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold">${profitability.totalCost?.toLocaleString()}</p></CardContent>
              </Card>
              <Card data-testid="card-gross-margin">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Gross Margin</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold">${profitability.grossMargin?.toLocaleString()}</p></CardContent>
              </Card>
              <Card data-testid="card-margin-pct">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Margin %</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold">{profitability.marginPct}%</p></CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="simulation" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Threshold Strategy Simulation</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3" data-testid="simulation-list">
                {simulation.map((row: any) => (
                  <div key={row.strategy} className="border rounded-lg p-4">
                    <div className="font-semibold text-lg">{row.strategy}</div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-2 text-sm">
                      <div>Auto Approved: <span className="font-medium">{row.autoApproved}</span></div>
                      <div>Reviewed: <span className="font-medium">{row.mandatoryReviewed}</span></div>
                      <div>Accuracy: <span className="font-medium">{row.estimatedAccuracy}%</span></div>
                      <div>Cost/Case: <span className="font-medium">${row.estimatedCostPerCase}</span></div>
                      <div>Override: <span className="font-medium">{row.estimatedOverrideRate}%</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {scenarios && (
            <Card>
              <CardHeader><CardTitle>Scenario Comparison</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="scenario-comparison">
                  {scenarios.bestAccuracy && (
                    <div className="border rounded-lg p-3">
                      <div className="text-sm text-muted-foreground">Best Accuracy</div>
                      <div className="font-bold">{scenarios.bestAccuracy.name}</div>
                      <div className="text-sm">{(scenarios.bestAccuracy.accuracy * 100).toFixed(1)}%</div>
                    </div>
                  )}
                  {scenarios.bestCost && (
                    <div className="border rounded-lg p-3">
                      <div className="text-sm text-muted-foreground">Best Cost</div>
                      <div className="font-bold">{scenarios.bestCost.name}</div>
                      <div className="text-sm">${scenarios.bestCost.costPerCase}/case</div>
                    </div>
                  )}
                  {scenarios.bestOverride && (
                    <div className="border rounded-lg p-3">
                      <div className="text-sm text-muted-foreground">Lowest Override</div>
                      <div className="font-bold">{scenarios.bestOverride.name}</div>
                      <div className="text-sm">{(scenarios.bestOverride.overrideRate * 100).toFixed(1)}%</div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="reinforcement" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Routing Reinforcement Weights</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3" data-testid="reinforcement-list">
                {reinforcement.map((row: any, i: number) => (
                  <div key={i} className="border rounded-lg p-4 flex justify-between items-center">
                    <div>
                      <div className="font-semibold">{row.physicianId}</div>
                      <div className="text-sm text-muted-foreground">{row.complaint}</div>
                    </div>
                    <div className="text-right">
                      <Badge variant={row.weightAdjustment > 0 ? "default" : row.weightAdjustment < 0 ? "destructive" : "secondary"}>
                        {row.weightAdjustment > 0 ? "+" : ""}{row.weightAdjustment}
                      </Badge>
                      <div className="text-xs text-muted-foreground mt-1">{row.reason}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="staffing" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Shift Staffing Forecast</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3" data-testid="shift-forecast-list">
                {shiftForecast.map((row: any, i: number) => (
                  <div key={i} className="border rounded-lg p-4">
                    <div className="font-semibold">{row.hourBlock}</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-sm">
                      <div>Expected Cases: <span className="font-medium">{row.expectedCases}</span></div>
                      <div>Avg Risk: <span className="font-medium">{row.avgRiskScore}</span></div>
                      <div>Clinicians Needed: <span className="font-medium">{row.recommendedClinicians}</span></div>
                      <div>High-Risk Reviewers: <span className="font-medium">{row.recommendedHighRiskReviewers}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="portfolio" className="space-y-4">
          {portfolio && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card data-testid="card-total-clinics">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Total Clinics</CardTitle></CardHeader>
                  <CardContent><p className="text-2xl font-bold">{portfolio.totalClinics}</p></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Total Cases</CardTitle></CardHeader>
                  <CardContent><p className="text-2xl font-bold">{portfolio.totalCases?.toLocaleString()}</p></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Avg Margin</CardTitle></CardHeader>
                  <CardContent><p className="text-2xl font-bold">{portfolio.avgMargin}%</p></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Avg Satisfaction</CardTitle></CardHeader>
                  <CardContent><p className="text-2xl font-bold">{portfolio.avgSatisfaction}/5</p></CardContent>
                </Card>
              </div>
              <Card>
                <CardHeader><CardTitle>Clinic Breakdown</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3" data-testid="portfolio-clinics">
                    {portfolio.clinics?.map((c: any) => (
                      <div key={c.clinicId} className="border rounded-lg p-4 flex justify-between items-center">
                        <div>
                          <div className="font-semibold">{c.clinicId}</div>
                          <div className="text-sm text-muted-foreground">{c.totalCases} cases</div>
                        </div>
                        <div className="text-right text-sm">
                          <div>Margin: {c.marginPct}%</div>
                          <div>Override: {(c.overrideRate * 100).toFixed(1)}%</div>
                          <div>Satisfaction: {c.satisfaction}/5</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="executive" className="space-y-4">
          {execSummary && (
            <Card>
              <CardHeader><CardTitle>Executive Summary</CardTitle></CardHeader>
              <CardContent>
                <p className="text-lg font-semibold mb-4" data-testid="exec-headline">{execSummary.headline}</p>
                <ul className="space-y-2" data-testid="exec-summary-list">
                  {execSummary.summary?.map((s: string, i: number) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-primary mt-1">&#8226;</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
