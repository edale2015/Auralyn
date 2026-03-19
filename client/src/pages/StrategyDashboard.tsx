import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Globe, DollarSign, Target, Brain, Shield, FileText, TrendingUp, AlertTriangle } from "lucide-react";

function MetaOrchestratorTab() {
  const { toast } = useToast();
  const [result, setResult] = useState<any>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/strategy/meta-orchestrator", {
        services: [
          { name: "URI/Cough", avgRevenue: 120, demand: 0.8, capacity: 0.6, denialRate: 0.05 },
          { name: "UTI", avgRevenue: 95, demand: 0.7, capacity: 0.4, denialRate: 0.03 },
          { name: "Cardiac Eval", avgRevenue: 250, demand: 0.5, capacity: 0.85, denialRate: 0.18 },
          { name: "Refills", avgRevenue: 50, demand: 0.9, capacity: 0.3, denialRate: 0.02 },
        ],
        payers: [
          { payer: "medicare", revenuePerEncounter: 90, denialRate: 0.08, volume: 500 },
          { payer: "aetna", revenuePerEncounter: 130, denialRate: 0.04, volume: 200 },
          { payer: "united", revenuePerEncounter: 85, denialRate: 0.15, volume: 150 },
          { payer: "cigna", revenuePerEncounter: 110, denialRate: 0.06, volume: 100 },
        ],
        load: 0.65,
        demand: 0.75,
        budget: 10000,
        channels: [
          { name: "Google Ads", costPerPatient: 40, conversionRate: 0.2, avgRevenue: 120 },
          { name: "Facebook", costPerPatient: 25, conversionRate: 0.15, avgRevenue: 90 },
          { name: "Referral", costPerPatient: 10, conversionRate: 0.5, avgRevenue: 150 },
          { name: "SEO/Organic", costPerPatient: 5, conversionRate: 0.08, avgRevenue: 100 },
        ],
        claims: [
          { revenue: 120, paid: true }, { revenue: 95, paid: true }, { revenue: 250, paid: false },
          { revenue: 130, paid: true }, { revenue: 90, paid: true }, { revenue: 110, paid: true },
        ],
      });
      return res.json();
    },
    onSuccess: (data) => { setResult(data); toast({ title: "Strategy analysis complete" }); },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Brain className="h-4 w-4" /> CEO Agent — Meta Orchestrator</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">Run a complete strategic analysis: service lines, payer network, capacity, marketing channels, and revenue.</p>
          <Button data-testid="button-run-orchestrator" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Analyzing..." : "Run Full Strategy Analysis"}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <>
          <Card className="border-primary">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Overall Strategy</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold" data-testid="text-overall-strategy">{result.overallStrategy}</p>
              <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                <span>Capacity: <Badge variant={result.capacityStatus.status === "overloaded" ? "destructive" : result.capacityStatus.status === "underutilized" ? "secondary" : "default"}>{result.capacityStatus.status}</Badge></span>
                {result.businessMetrics && <span>Revenue: ${result.businessMetrics.revenue} | Margin: {(result.businessMetrics.margin * 100).toFixed(0)}%</span>}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Service Line Actions</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {result.clinicPlan?.map((s: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-sm" data-testid={`service-${s.service}`}>
                      <span>{s.service}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant={s.action === "expand" ? "default" : s.action === "fix_billing" ? "destructive" : s.action === "increase_pricing" ? "secondary" : "outline"}>
                          {s.action.replace("_", " ")}
                        </Badge>
                        <span className="text-xs text-muted-foreground">Score: {s.score}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Payer Network</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {result.networkPlan?.map((p: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="capitalize">{p.payer}</span>
                      <Badge variant={p.strategy === "expand" ? "default" : p.strategy === "reduce" || p.strategy === "drop" ? "destructive" : "secondary"}>
                        {p.strategy}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {result.channelAllocation && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Marketing Channel ROI</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {result.channelAllocation.map((c: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span>{c.channel}</span>
                        <div className="text-right">
                          <span className="font-medium">{c.roi}x ROI</span>
                          <span className="text-xs text-muted-foreground ml-2">${c.allocation} budget</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {result.businessMetrics && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Business Metrics</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Revenue</span><span className="font-semibold text-green-600">${result.businessMetrics.revenue}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Profit</span><span>${result.businessMetrics.profit}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Margin</span><span>{(result.businessMetrics.margin * 100).toFixed(0)}%</span></div>
                    <p className="text-xs text-muted-foreground mt-2">{result.businessMetrics.strategy}</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function DynamicPricingTab() {
  const { toast } = useToast();
  const [basePrice, setBasePrice] = useState("150");
  const [demand, setDemand] = useState("0.7");
  const [capacity, setCapacity] = useState("0.6");
  const [result, setResult] = useState<any>(null);

  const mutation = useMutation({
    mutationFn: async (body: any) => { const res = await apiRequest("POST", "/api/strategy/dynamic-price", body); return res.json(); },
    onSuccess: (data) => { setResult(data); toast({ title: `Price: $${data.finalPrice}` }); },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><DollarSign className="h-4 w-4" /> Dynamic Pricing Engine</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
            <div>
              <label className="text-xs text-muted-foreground">Base Price ($)</label>
              <Input data-testid="input-base-price" type="number" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Demand (0-1)</label>
              <Input data-testid="input-demand" type="number" step="0.1" value={demand} onChange={(e) => setDemand(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Capacity (0-1)</label>
              <Input data-testid="input-capacity" type="number" step="0.1" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button data-testid="button-calculate-price" className="w-full" onClick={() => mutation.mutate({ basePrice: Number(basePrice), demandLevel: Number(demand), capacityUtilization: Number(capacity), payerType: "cash", timeOfDay: "normal" })} disabled={mutation.isPending}>
                Calculate
              </Button>
            </div>
          </div>
          {result && (
            <div className="p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-4 mb-2">
                <div>
                  <p className="text-3xl font-bold text-green-600" data-testid="text-final-price">${result.finalPrice}</p>
                  <p className="text-xs text-muted-foreground">Base: ${result.basePrice} × {result.multiplier}x</p>
                </div>
              </div>
              <div className="space-y-1">
                {result.adjustments.map((a: string, i: number) => (
                  <p key={i} className="text-sm text-muted-foreground">{a}</p>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TrustScoreTab() {
  const { toast } = useToast();
  const { data: scores } = useQuery<Record<string, any>>({ queryKey: ["/api/strategy/trust/scores"] });
  const [complaint, setComplaint] = useState("");

  const updateMutation = useMutation({
    mutationFn: async (success: boolean) => { const res = await apiRequest("POST", "/api/strategy/trust/update", { complaint, success }); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/strategy/trust/scores"] }); toast({ title: "Trust score updated" }); },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Target className="h-4 w-4" /> Trust Score System</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">Each complaint type earns autonomy through consistent accuracy. Score must reach 85% with 10+ cases for auto-handling.</p>
          <div className="flex gap-2 mb-4">
            <Input data-testid="input-trust-complaint" placeholder="Complaint (e.g. sore throat)" value={complaint} onChange={(e) => setComplaint(e.target.value)} className="max-w-xs" />
            <Button data-testid="button-trust-success" variant="default" size="sm" onClick={() => updateMutation.mutate(true)} disabled={!complaint || updateMutation.isPending}>+ Success</Button>
            <Button data-testid="button-trust-fail" variant="destructive" size="sm" onClick={() => updateMutation.mutate(false)} disabled={!complaint || updateMutation.isPending}>- Failure</Button>
          </div>

          {scores && Object.keys(scores).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(scores).map(([key, entry]: [string, any]) => (
                <div key={key} className="flex items-center justify-between p-3 rounded-lg border" data-testid={`trust-entry-${key}`}>
                  <div>
                    <span className="font-medium capitalize">{key}</span>
                    <span className="text-xs text-muted-foreground ml-2">({entry.totalCases} cases, {entry.successfulCases} successful)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${entry.score * 100}%`, backgroundColor: entry.score >= 0.85 ? "#22c55e" : entry.score >= 0.5 ? "#f59e0b" : "#ef4444" }} />
                    </div>
                    <span className="text-sm font-medium w-12 text-right">{(entry.score * 100).toFixed(0)}%</span>
                    <Badge variant={entry.score >= 0.85 && entry.totalCases >= 10 ? "default" : "secondary"}>
                      {entry.score >= 0.85 && entry.totalCases >= 10 ? "Auto" : "Review"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No trust data yet. Record outcomes to build trust scores.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DisagreementTab() {
  const { data: analysis } = useQuery<any>({ queryKey: ["/api/strategy/disagreement/analysis"] });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> AI vs Physician Disagreements</CardTitle></CardHeader>
        <CardContent>
          {analysis ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 rounded-lg bg-muted/50">
                  <p className="text-3xl font-bold" data-testid="text-total-disagreements">{analysis.totalDisagreements}</p>
                  <p className="text-xs text-muted-foreground">Total Disagreements</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-muted/50">
                  <p className="text-3xl font-bold">{(analysis.avgAiConfidenceOnError * 100).toFixed(0)}%</p>
                  <p className="text-xs text-muted-foreground">Avg AI Confidence on Error</p>
                </div>
              </div>
              {analysis.topMismatches?.length > 0 ? (
                <div>
                  <p className="text-sm font-medium mb-2">Top Mismatch Patterns</p>
                  {analysis.topMismatches.map((m: any, i: number) => (
                    <div key={i} className="flex justify-between text-sm p-2 rounded border mb-1">
                      <span>{m.pattern}</span>
                      <Badge variant="secondary">{m.count}x</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No disagreement patterns detected yet.</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Loading disagreement data...</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TelehealthTab() {
  const { toast } = useToast();
  const [soapResult, setSoapResult] = useState<any>(null);

  const soapMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/strategy/telehealth/soap", {
        symptoms: "Sore throat x3 days, mild fever, no difficulty swallowing",
        diagnosis: "Acute pharyngitis (J06.9)",
        plan: "Rapid strep test recommended, symptomatic care with acetaminophen, follow up if worsening",
      });
      return res.json();
    },
    onSuccess: (data) => { setSoapResult(data); toast({ title: "SOAP note generated" }); },
  });

  const { data: signoffs } = useQuery<any[]>({ queryKey: ["/api/strategy/telehealth/signoff-log"] });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4" /> Telehealth Compliance</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <Card className="border-green-200">
              <CardContent className="pt-4">
                <p className="text-sm font-medium">Consent Gate</p>
                <p className="text-xs text-muted-foreground">Blocks patients who haven't provided telehealth consent</p>
              </CardContent>
            </Card>
            <Card className="border-blue-200">
              <CardContent className="pt-4">
                <p className="text-sm font-medium">Location Check</p>
                <p className="text-xs text-muted-foreground">Validates NY state licensure before proceeding</p>
              </CardContent>
            </Card>
            <Card className="border-purple-200">
              <CardContent className="pt-4">
                <p className="text-sm font-medium">Audit Trail</p>
                <p className="text-xs text-muted-foreground">Immutable physician sign-off records</p>
              </CardContent>
            </Card>
          </div>

          <Button data-testid="button-generate-soap" onClick={() => soapMutation.mutate()} disabled={soapMutation.isPending}>
            {soapMutation.isPending ? "Generating..." : "Generate Sample SOAP Note"}
          </Button>

          {soapResult && (
            <pre className="mt-4 p-4 bg-muted rounded-lg text-sm whitespace-pre-wrap" data-testid="text-soap-note">{soapResult.note}</pre>
          )}
        </CardContent>
      </Card>

      {signoffs && signoffs.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Recent Physician Sign-offs</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1">
              {signoffs.slice(-5).reverse().map((s: any, i: number) => (
                <div key={i} className="flex justify-between text-sm">
                  <span>Case {s.caseId}</span>
                  <Badge variant={s.action === "approved" ? "default" : s.action === "rejected" ? "destructive" : "secondary"}>{s.action}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DailyReportTab() {
  const { toast } = useToast();
  const [report, setReport] = useState<any>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/strategy/daily-report", {
        encounters: [
          { confidence: 0.92, escalated: false, revenue: 120, complaint: "sore throat", autoHandled: true },
          { confidence: 0.88, escalated: false, revenue: 95, complaint: "cough", autoHandled: true },
          { confidence: 0.55, escalated: true, revenue: 250, complaint: "chest pain", autoHandled: false },
          { confidence: 0.85, escalated: false, revenue: 90, complaint: "sore throat", autoHandled: true },
          { confidence: 0.78, escalated: false, revenue: 80, complaint: "uti", autoHandled: true },
          { confidence: 0.45, escalated: true, revenue: 200, complaint: "shortness of breath", autoHandled: false },
          { confidence: 0.91, escalated: false, revenue: 50, complaint: "refill", autoHandled: true },
          { confidence: 0.82, escalated: false, revenue: 110, complaint: "ear pain", autoHandled: true },
        ],
      });
      return res.json();
    },
    onSuccess: (data) => { setReport(data); toast({ title: "Daily report generated" }); },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> Daily Operations Report</CardTitle></CardHeader>
        <CardContent>
          <Button data-testid="button-generate-report" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Generating..." : "Generate Sample Daily Report"}
          </Button>
        </CardContent>
      </Card>

      {report && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4 text-center"><p className="text-3xl font-bold" data-testid="text-total-patients">{report.totalPatients}</p><p className="text-xs text-muted-foreground">Total Patients</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><p className="text-3xl font-bold text-green-600">${report.revenue}</p><p className="text-xs text-muted-foreground">Revenue</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><p className="text-3xl font-bold">{report.avgConfidence}</p><p className="text-xs text-muted-foreground">Avg Confidence</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><p className="text-3xl font-bold">{report.autoHandleRate}%</p><p className="text-xs text-muted-foreground">Auto-Handled</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><p className="text-3xl font-bold text-orange-500">{report.escalationRate}%</p><p className="text-xs text-muted-foreground">Escalation Rate</p></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><p className="text-3xl font-bold">${report.avgRevenuePerPatient}</p><p className="text-xs text-muted-foreground">Avg Revenue/Patient</p></CardContent></Card>
          <Card className="col-span-2"><CardContent className="pt-4">
            <p className="text-sm font-medium mb-2">Top Complaints</p>
            {report.topComplaints?.map((c: any, i: number) => (
              <div key={i} className="flex justify-between text-sm"><span className="capitalize">{c.complaint}</span><span>{c.count}</span></div>
            ))}
          </CardContent></Card>
        </div>
      )}
    </div>
  );
}

export default function StrategyDashboard() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="heading-strategy">
            <Globe className="h-6 w-6" /> Strategy Command Center
          </h1>
          <p className="text-sm text-muted-foreground">Multi-payer routing, dynamic pricing, trust scoring, and operational intelligence</p>
        </div>
        <Badge variant="outline" className="flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Revenue Intelligence</Badge>
      </div>

      <Tabs defaultValue="orchestrator" data-testid="tabs-strategy">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="orchestrator" data-testid="tab-orchestrator">CEO Agent</TabsTrigger>
          <TabsTrigger value="pricing" data-testid="tab-pricing">Pricing</TabsTrigger>
          <TabsTrigger value="trust" data-testid="tab-trust">Trust Scores</TabsTrigger>
          <TabsTrigger value="disagreements" data-testid="tab-disagreements">Disagreements</TabsTrigger>
          <TabsTrigger value="telehealth" data-testid="tab-telehealth">Telehealth</TabsTrigger>
          <TabsTrigger value="report" data-testid="tab-report">Daily Report</TabsTrigger>
        </TabsList>
        <TabsContent value="orchestrator"><MetaOrchestratorTab /></TabsContent>
        <TabsContent value="pricing"><DynamicPricingTab /></TabsContent>
        <TabsContent value="trust"><TrustScoreTab /></TabsContent>
        <TabsContent value="disagreements"><DisagreementTab /></TabsContent>
        <TabsContent value="telehealth"><TelehealthTab /></TabsContent>
        <TabsContent value="report"><DailyReportTab /></TabsContent>
      </Tabs>
    </div>
  );
}
