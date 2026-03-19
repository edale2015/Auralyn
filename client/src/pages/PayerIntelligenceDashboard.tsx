import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DollarSign, TrendingUp, Shield, Activity, Brain, Building2, BarChart3, Zap } from "lucide-react";

function PayerStatsTab() {
  const { data: payers } = useQuery<Array<{ id: string; name: string }>>({ queryKey: ["/api/payer-intelligence/payers"] });
  const { data: stats } = useQuery<Record<string, any>>({ queryKey: ["/api/payer-intelligence/payer-stats"] });
  const { data: leverage } = useQuery<any[]>({ queryKey: ["/api/payer-intelligence/contract-leverage"] });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {payers?.map((p) => {
          const s = stats?.[p.id];
          return (
            <Card key={p.id} data-testid={`payer-card-${p.id}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{p.name}</CardTitle>
              </CardHeader>
              <CardContent>
                {s ? (
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Claims</span>
                      <span className="font-medium">{s.totalClaims}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Denial Rate</span>
                      <Badge variant={s.denialRate > 0.15 ? "destructive" : s.denialRate > 0.05 ? "secondary" : "default"}>
                        {(s.denialRate * 100).toFixed(1)}%
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Revenue</span>
                      <span className="font-semibold text-green-600">${s.totalRevenue.toLocaleString()}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No claims data yet</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {leverage && leverage.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Contract Leverage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {leverage.map((l, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg border" data-testid={`leverage-${l.payer}`}>
                  <div>
                    <span className="font-medium capitalize">{l.payer}</span>
                    <p className="text-sm text-muted-foreground">{l.recommendation}</p>
                  </div>
                  <Badge variant={l.leverage === "high" ? "default" : l.leverage === "medium" ? "secondary" : "outline"}>
                    {l.leverage} leverage
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FullFlowTab() {
  const { toast } = useToast();
  const [icd, setIcd] = useState("J06.9");
  const [cpt, setCpt] = useState("99214");
  const [payer, setPayer] = useState("medicare");
  const [result, setResult] = useState<any>(null);

  const mutation = useMutation({
    mutationFn: async (body: any) => {
      const res = await apiRequest("POST", "/api/payer-intelligence/full-flow", body);
      return res.json();
    },
    onSuccess: (data) => {
      setResult(data);
      toast({ title: "Analysis complete" });
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Brain className="h-4 w-4" /> Payer-Optimized Claim Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
            <Input data-testid="input-icd" value={icd} onChange={(e) => setIcd(e.target.value)} placeholder="ICD-10" />
            <Input data-testid="input-cpt" value={cpt} onChange={(e) => setCpt(e.target.value)} placeholder="CPT" />
            <Select value={payer} onValueChange={setPayer}>
              <SelectTrigger data-testid="select-payer"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="medicare">Medicare</SelectItem>
                <SelectItem value="aetna">Aetna</SelectItem>
                <SelectItem value="united">UnitedHealthcare</SelectItem>
                <SelectItem value="cigna">Cigna</SelectItem>
                <SelectItem value="bcbs">BCBS</SelectItem>
                <SelectItem value="humana">Humana</SelectItem>
                <SelectItem value="medicaid">Medicaid</SelectItem>
                <SelectItem value="self_pay">Self-Pay</SelectItem>
              </SelectContent>
            </Select>
            <Button data-testid="button-analyze" onClick={() => mutation.mutate({ icd10: icd, cpt, payer, complexity: 0.6, clinicalNote: { hpi: "Patient presents with symptoms", assessment: "Clinical assessment completed", plan: "Treatment plan documented" } })} disabled={mutation.isPending}>
              {mutation.isPending ? "Analyzing..." : "Run Full Analysis"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card data-testid="result-payer-opt">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Payer Optimization</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-2">Payer: {result.payerOptimization.payerName}</p>
              {result.payerOptimization.changes.length > 0 ? (
                <ul className="space-y-1">{result.payerOptimization.changes.map((c: string, i: number) => (
                  <li key={i} className="text-sm flex items-center gap-1"><Zap className="h-3 w-3 text-yellow-500" />{c}</li>
                ))}</ul>
              ) : <p className="text-sm text-green-600">No adjustments needed</p>}
              {result.payerOptimization.warnings?.length > 0 && (
                <div className="mt-2">{result.payerOptimization.warnings.map((w: string, i: number) => (
                  <p key={i} className="text-sm text-orange-500">{w}</p>
                ))}</div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="result-denial">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Denial Prediction V2</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl font-bold">{(result.denialPrediction.riskScore * 100).toFixed(0)}%</span>
                <Badge variant={result.denialPrediction.riskLevel === "critical" ? "destructive" : result.denialPrediction.riskLevel === "high" ? "destructive" : result.denialPrediction.riskLevel === "medium" ? "secondary" : "default"}>
                  {result.denialPrediction.riskLevel}
                </Badge>
              </div>
              {result.denialPrediction.factors?.slice(0, 3).map((f: any, i: number) => (
                <p key={i} className="text-xs text-muted-foreground">{f.factor}: {f.detail}</p>
              ))}
            </CardContent>
          </Card>

          <Card data-testid="result-autofix">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Auto-Fix</CardTitle></CardHeader>
            <CardContent>
              {result.autoFix.applied ? (
                <div>
                  <p className="text-sm text-green-600 mb-1">Risk reduced: {(result.autoFix.originalRisk * 100).toFixed(0)}% → {(result.autoFix.estimatedNewRisk * 100).toFixed(0)}%</p>
                  <ul className="space-y-1">{result.autoFix.fixes.map((f: string, i: number) => (
                    <li key={i} className="text-sm">{f}</li>
                  ))}</ul>
                </div>
              ) : <p className="text-sm text-green-600">No fixes needed — low denial risk</p>}
            </CardContent>
          </Card>

          <Card data-testid="result-best-payer">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Best Payer Recommendation</CardTitle></CardHeader>
            <CardContent>
              <p className="text-lg font-semibold capitalize mb-1">{result.bestPayer.payer}</p>
              <p className="text-sm text-muted-foreground">Expected value: ${result.bestPayer.expectedValue}</p>
              <div className="mt-2 space-y-1">
                {result.bestPayer.allOptions.slice(0, 4).map((o: any, i: number) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="capitalize">{o.payer}</span>
                    <span className={i === 0 ? "font-semibold text-green-600" : "text-muted-foreground"}>${o.expectedValue}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function ContractSimulationTab() {
  const { toast } = useToast();
  const [simResult, setSimResult] = useState<any[]>([]);

  const simMutation = useMutation({
    mutationFn: async () => {
      const encounters = [
        { icd10: "J06.9", cpt: "99213" },
        { icd10: "J06.9", cpt: "99214" },
        { icd10: "R10.9", cpt: "99213" },
        { icd10: "I10", cpt: "99214" },
        { icd10: "E11.9", cpt: "99215" },
      ];
      const res = await apiRequest("POST", "/api/payer-intelligence/simulate-contracts", { encounters });
      return res.json();
    },
    onSuccess: (data) => {
      setSimResult(data);
      toast({ title: "Simulation complete" });
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Contract Revenue Simulation</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">Simulate projected revenue across 5 sample encounters for each payer contract.</p>
          <Button data-testid="button-simulate" onClick={() => simMutation.mutate()} disabled={simMutation.isPending}>
            {simMutation.isPending ? "Simulating..." : "Run Simulation"}
          </Button>
        </CardContent>
      </Card>

      {simResult.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {simResult.sort((a, b) => b.netRevenue - a.netRevenue).map((s) => (
            <Card key={s.payer} data-testid={`sim-result-${s.payer}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm capitalize">{s.payer}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Gross Revenue</span>
                    <span className="font-medium">${s.projectedRevenue.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Net Revenue</span>
                    <span className="font-semibold text-green-600">${s.netRevenue.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Avg/Encounter</span>
                    <span>${s.avgPerEncounter}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Denial Rate</span>
                    <Badge variant={s.expectedDenialRate > 0.15 ? "destructive" : "secondary"}>
                      {(s.expectedDenialRate * 100).toFixed(1)}%
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ClinicLearningTab() {
  const { toast } = useToast();
  const { data: clinics, isLoading } = useQuery<any[]>({ queryKey: ["/api/payer-intelligence/clinics"] });

  const registerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/payer-intelligence/clinics/register", {
        id: `clinic-${Date.now()}`,
        name: "Demo Clinic",
        type: "urgent_care",
        preferences: { triageAggression: "moderate", erReferralThreshold: 0.7, autoSubmitEnabled: false },
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payer-intelligence/clinics"] });
      toast({ title: "Clinic registered" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2"><Building2 className="h-5 w-5" /> Per-Clinic AI Tuning</h3>
        <Button data-testid="button-register-clinic" variant="outline" onClick={() => registerMutation.mutate()} disabled={registerMutation.isPending}>
          Register Demo Clinic
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading clinics...</p>
      ) : clinics && clinics.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {clinics.map((c) => (
            <Card key={c.id} data-testid={`clinic-card-${c.id}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{c.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type</span>
                    <Badge variant="outline">{c.type.replace("_", " ")}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Triage Mode</span>
                    <span>{c.preferences.triageAggression}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Cases</span>
                    <span>{c.stats.totalCases}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Accuracy</span>
                    <span>{c.stats.totalCases > 0 ? `${Math.round((c.stats.correctDiagnoses / c.stats.totalCases) * 100)}%` : "N/A"}</span>
                  </div>
                  {Object.keys(c.weights).length > 0 && (
                    <div className="pt-2">
                      <p className="text-xs text-muted-foreground mb-1">Learned Weights:</p>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(c.weights).slice(0, 5).map(([dx, w]: [string, any]) => (
                          <Badge key={dx} variant={w > 0 ? "default" : "destructive"} className="text-xs">{dx}: {w > 0 ? "+" : ""}{w}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No clinics registered yet. Register a clinic to start per-clinic AI tuning.</p>
      )}
    </div>
  );
}

function ScalingTab() {
  const { toast } = useToast();
  const { data: status } = useQuery<any>({ queryKey: ["/api/payer-intelligence/scaling/status"] });

  const startMutation = useMutation({
    mutationFn: async () => { const res = await apiRequest("POST", "/api/payer-intelligence/scaling/start", {}); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/payer-intelligence/scaling/status"] }); toast({ title: "Auto-scaler started" }); },
  });

  const stopMutation = useMutation({
    mutationFn: async () => { const res = await apiRequest("POST", "/api/payer-intelligence/scaling/stop", {}); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/payer-intelligence/scaling/status"] }); toast({ title: "Auto-scaler stopped" }); },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" /> Auto-Scaling Engine</CardTitle>
        </CardHeader>
        <CardContent>
          {status && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold capitalize" data-testid="text-current-tier">{status.currentTier}</p>
                  <p className="text-xs text-muted-foreground">Current Tier</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold" data-testid="text-concurrency">{status.concurrency}</p>
                  <p className="text-xs text-muted-foreground">Workers</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold" data-testid="text-queued">{status.queued}</p>
                  <p className="text-xs text-muted-foreground">Queued</p>
                </div>
                <div className="text-center">
                  <Badge variant={status.running ? "default" : "secondary"} data-testid="badge-scaler-status">
                    {status.running ? "Running" : "Stopped"}
                  </Badge>
                  <p className="text-xs text-muted-foreground mt-1">Scaler Status</p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button data-testid="button-start-scaler" onClick={() => startMutation.mutate()} disabled={status.running || startMutation.isPending} variant="default" size="sm">
                  Start Auto-Scaler
                </Button>
                <Button data-testid="button-stop-scaler" onClick={() => stopMutation.mutate()} disabled={!status.running || stopMutation.isPending} variant="outline" size="sm">
                  Stop
                </Button>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Scaling Tiers</p>
                <div className="space-y-1">
                  {status.tiers?.map((t: any, i: number) => (
                    <div key={i} className={`flex justify-between text-sm p-2 rounded ${t.label === status.currentTier ? "bg-primary/10 font-medium" : ""}`}>
                      <span>{t.label} ({t.minQueued}+ queued)</span>
                      <span>{t.concurrency} workers</span>
                    </div>
                  ))}
                </div>
              </div>

              {status.recentScaling?.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Recent Scaling Events</p>
                  {status.recentScaling.slice(-5).map((e: any, i: number) => (
                    <div key={i} className="text-xs text-muted-foreground">
                      {new Date(e.timestamp).toLocaleTimeString()} — {e.fromTier} → {e.toTier} ({e.queued} queued, {e.concurrency} workers)
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SelfImproveTab() {
  const { toast } = useToast();
  const { data: logData } = useQuery<any[]>({ queryKey: ["/api/payer-intelligence/self-improve/log"] });
  const { data: thresholds } = useQuery<Record<string, any>>({ queryKey: ["/api/payer-intelligence/self-improve/thresholds"] });

  const runMutation = useMutation({
    mutationFn: async () => { const res = await apiRequest("POST", "/api/payer-intelligence/self-improve/run", {}); return res.json(); },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/payer-intelligence/self-improve/log"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payer-intelligence/self-improve/thresholds"] });
      toast({ title: `Self-improvement: ${data.count} actions taken` });
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Brain className="h-4 w-4" /> Self-Improving Agent Intelligence</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Button data-testid="button-self-improve" onClick={() => runMutation.mutate()} disabled={runMutation.isPending}>
              {runMutation.isPending ? "Evaluating..." : "Run Self-Improvement Cycle"}
            </Button>
          </div>

          {thresholds && Object.keys(thresholds).length > 0 && (
            <div className="mb-4">
              <p className="text-sm font-medium mb-2">Agent Threshold Adjustments</p>
              {Object.entries(thresholds).map(([agent, t]) => (
                <div key={agent} className="text-sm flex justify-between">
                  <span className="capitalize">{agent}</span>
                  <span>Conservatism: +{(t as any).conservatism?.toFixed(1) ?? 0}</span>
                </div>
              ))}
            </div>
          )}

          <div>
            <p className="text-sm font-medium mb-2">Improvement Log</p>
            {logData && logData.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {logData.slice(-10).reverse().map((entry, i) => (
                  <div key={i} className="text-sm p-2 rounded border">
                    <div className="flex items-center justify-between mb-1">
                      <Badge variant={entry.action === "escalation_recommended" ? "destructive" : "secondary"}>{entry.action}</Badge>
                      <span className="text-xs text-muted-foreground">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-xs">{entry.reason}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No improvement actions recorded yet.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function PayerIntelligenceDashboard() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="heading-payer-intelligence">
            <DollarSign className="h-6 w-6" /> Payer Intelligence Center
          </h1>
          <p className="text-sm text-muted-foreground">Payer optimization, denial prediction, contract simulation, and AI self-improvement</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="flex items-center gap-1"><Shield className="h-3 w-3" /> HIPAA Compliant</Badge>
        </div>
      </div>

      <Tabs defaultValue="flow" data-testid="tabs-payer-intelligence">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="flow" data-testid="tab-flow">Full Flow</TabsTrigger>
          <TabsTrigger value="payers" data-testid="tab-payers">Payer Stats</TabsTrigger>
          <TabsTrigger value="simulation" data-testid="tab-simulation">Contracts</TabsTrigger>
          <TabsTrigger value="clinics" data-testid="tab-clinics">Clinics</TabsTrigger>
          <TabsTrigger value="scaling" data-testid="tab-scaling">Scaling</TabsTrigger>
          <TabsTrigger value="self-improve" data-testid="tab-self-improve">Self-Improve</TabsTrigger>
        </TabsList>
        <TabsContent value="flow"><FullFlowTab /></TabsContent>
        <TabsContent value="payers"><PayerStatsTab /></TabsContent>
        <TabsContent value="simulation"><ContractSimulationTab /></TabsContent>
        <TabsContent value="clinics"><ClinicLearningTab /></TabsContent>
        <TabsContent value="scaling"><ScalingTab /></TabsContent>
        <TabsContent value="self-improve"><SelfImproveTab /></TabsContent>
      </Tabs>
    </div>
  );
}
