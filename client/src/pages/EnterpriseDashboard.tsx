import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Globe, DollarSign, Target, Brain, Shield, TrendingUp,
  Phone, MapPin, Activity, BarChart3, Cpu, Settings
} from "lucide-react";

function DigitalTwinTab() {
  const { toast } = useToast();
  const [twin, setTwin] = useState<any>(null);
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [patients, setPatients] = useState("50");
  const [revenue, setRevenue] = useState("120");
  const [denialRate, setDenialRate] = useState("0.08");

  const fetchTwin = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("GET", "/api/enterprise/digital-twin");
      return res.json();
    },
    onSuccess: (data) => { setTwin(data); toast({ title: "Digital twin loaded" }); }
  });

  const updateTwin = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/enterprise/digital-twin/update", {
        patientsPerDay: Number(patients),
        avgRevenue: Number(revenue),
        denialRate: Number(denialRate)
      });
      return res.json();
    },
    onSuccess: (data) => { setTwin(data); toast({ title: "Twin state updated" }); }
  });

  const runScenarios = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/enterprise/simulation/auto-scenarios", {});
      return res.json();
    },
    onSuccess: (data) => { setScenarios(data); toast({ title: `${data.length} scenarios generated` }); }
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Cpu className="h-4 w-4" /> Digital Twin — Live Clinic Model</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">A real-time virtual mirror of your clinic. Update parameters to see projections change.</p>
          <div className="flex gap-2 mb-4">
            <Button data-testid="button-load-twin" onClick={() => fetchTwin.mutate()} disabled={fetchTwin.isPending}>
              {fetchTwin.isPending ? "Loading..." : "Load Twin State"}
            </Button>
          </div>
          {twin && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-muted p-3 rounded"><div className="text-xs text-muted-foreground">Patients/Day</div><div className="text-lg font-bold" data-testid="text-twin-patients">{twin.state?.patientsPerDay || twin.projectedDailyRevenue}</div></div>
                <div className="bg-muted p-3 rounded"><div className="text-xs text-muted-foreground">Avg Revenue</div><div className="text-lg font-bold">${twin.state?.avgRevenue}</div></div>
                <div className="bg-muted p-3 rounded"><div className="text-xs text-muted-foreground">Denial Rate</div><div className="text-lg font-bold">{((twin.state?.denialRate || 0) * 100).toFixed(1)}%</div></div>
                <div className="bg-muted p-3 rounded"><div className="text-xs text-muted-foreground">Capacity</div><div className="text-lg font-bold">{((twin.state?.capacity || 0) * 100).toFixed(0)}%</div></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded"><div className="text-xs text-muted-foreground">Projected Daily Revenue</div><div className="text-lg font-bold text-green-600" data-testid="text-twin-daily-revenue">${Math.round(twin.projectedDailyRevenue).toLocaleString()}</div></div>
                <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded"><div className="text-xs text-muted-foreground">Projected Monthly Revenue</div><div className="text-lg font-bold text-green-600">${Math.round(twin.projectedMonthlyRevenue).toLocaleString()}</div></div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2 mt-4">
            <div><label className="text-xs">Patients/Day</label><Input data-testid="input-twin-patients" value={patients} onChange={(e) => setPatients(e.target.value)} /></div>
            <div><label className="text-xs">Avg Revenue</label><Input value={revenue} onChange={(e) => setRevenue(e.target.value)} /></div>
            <div><label className="text-xs">Denial Rate</label><Input value={denialRate} onChange={(e) => setDenialRate(e.target.value)} /></div>
          </div>
          <Button data-testid="button-update-twin" className="mt-2" onClick={() => updateTwin.mutate()} disabled={updateTwin.isPending}>Update Twin</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Strategy Tester — Auto Scenarios</CardTitle></CardHeader>
        <CardContent>
          <Button data-testid="button-run-scenarios" onClick={() => runScenarios.mutate()} disabled={runScenarios.isPending}>
            {runScenarios.isPending ? "Generating..." : "Generate Auto Scenarios"}
          </Button>
          {scenarios.length > 0 && (
            <div className="mt-3 space-y-2">
              {scenarios.map((s: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-2 bg-muted rounded text-sm">
                  <div>
                    <span className="font-medium">{s.label}</span>
                    {i === 0 && <Badge className="ml-2 bg-green-100 text-green-800">Best</Badge>}
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-green-600">${s.projectedDailyRevenue?.toLocaleString()}/day</span>
                    <span className="ml-2 text-muted-foreground">${s.projectedMonthlyRevenue?.toLocaleString()}/mo</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AdaptiveControlTab() {
  const { toast } = useToast();
  const [result, setResult] = useState<any>(null);
  const [revenuePerHour, setRevenuePerHour] = useState("1200");
  const [denialRate, setDenialRate] = useState("0.08");
  const [waitTime, setWaitTime] = useState("12");
  const [capacity, setCapacity] = useState("0.7");

  const runCycle = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/enterprise/control/run-cycle", {
        revenuePerHour: Number(revenuePerHour),
        denialRate: Number(denialRate),
        waitTime: Number(waitTime),
        capacity: Number(capacity)
      });
      return res.json();
    },
    onSuccess: (data) => { setResult(data); toast({ title: "Control cycle complete" }); }
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Settings className="h-4 w-4" /> Closed-Loop Adaptive Controller</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">Real-time system that senses, decides, and acts. Adjusts pricing, routing, and intake automatically.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
            <div><label className="text-xs">Revenue/Hour ($)</label><Input data-testid="input-revenue-hour" value={revenuePerHour} onChange={(e) => setRevenuePerHour(e.target.value)} /></div>
            <div><label className="text-xs">Denial Rate</label><Input value={denialRate} onChange={(e) => setDenialRate(e.target.value)} /></div>
            <div><label className="text-xs">Wait Time (min)</label><Input value={waitTime} onChange={(e) => setWaitTime(e.target.value)} /></div>
            <div><label className="text-xs">Capacity</label><Input value={capacity} onChange={(e) => setCapacity(e.target.value)} /></div>
          </div>
          <Button data-testid="button-run-control" onClick={() => runCycle.mutate()} disabled={runCycle.isPending}>
            {runCycle.isPending ? "Processing..." : "Run Control Cycle"}
          </Button>
          {result && (
            <div className="mt-4 space-y-3">
              {result.paused ? (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded border border-red-200">
                  <div className="font-bold text-red-600">System PAUSED</div>
                  {result.warnings?.map((w: string, i: number) => <div key={i} className="text-sm text-red-500">{w}</div>)}
                </div>
              ) : (
                <>
                  {result.scores && (
                    <div className="grid grid-cols-4 gap-2">
                      <div className="bg-muted p-2 rounded text-center"><div className="text-xs">Overall</div><div className="text-lg font-bold" data-testid="text-control-score">{(result.scores.overall * 100).toFixed(0)}%</div></div>
                      <div className="bg-muted p-2 rounded text-center"><div className="text-xs">Revenue</div><div className="text-lg font-bold text-green-600">{(result.scores.revenue * 100).toFixed(0)}%</div></div>
                      <div className="bg-muted p-2 rounded text-center"><div className="text-xs">Safety</div><div className="text-lg font-bold text-blue-600">{(result.scores.safety * 100).toFixed(0)}%</div></div>
                      <div className="bg-muted p-2 rounded text-center"><div className="text-xs">Experience</div><div className="text-lg font-bold text-purple-600">{(result.scores.experience * 100).toFixed(0)}%</div></div>
                    </div>
                  )}
                  {result.action && (
                    <Card>
                      <CardContent className="pt-4">
                        <div className="text-sm font-medium mb-2">Control Actions:</div>
                        <div className="grid grid-cols-3 gap-2 mb-2">
                          <div className="bg-muted p-2 rounded text-center"><div className="text-xs">Pricing Adj</div><div className="font-bold">{((result.action.pricingAdjustment - 1) * 100).toFixed(0)}%</div></div>
                          <div className="bg-muted p-2 rounded text-center"><div className="text-xs">Routing Bias</div><div className="font-bold text-xs">{result.action.routingBias}</div></div>
                          <div className="bg-muted p-2 rounded text-center"><div className="text-xs">Intake Limit</div><div className="font-bold">{(result.action.intakeLimit * 100).toFixed(0)}%</div></div>
                        </div>
                        {result.action.reasoning?.map((r: string, i: number) => (
                          <div key={i} className="text-xs text-muted-foreground">• {r}</div>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function VoiceSwarmTab() {
  const { toast } = useToast();
  const [stats, setStats] = useState<any>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [conversation, setConversation] = useState<Array<{ role: string; text: string }>>([]);
  const [inputText, setInputText] = useState("");

  const fetchStats = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("GET", "/api/enterprise/voice/stats");
      return res.json();
    },
    onSuccess: (data) => { setStats(data); }
  });

  const startCall = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/enterprise/voice/call", { complaint: "sore throat" });
      return res.json();
    },
    onSuccess: (data) => {
      setCallId(data.callId);
      setConversation([{ role: "system", text: data.message }]);
      toast({ title: `Call ${data.status}` });
      fetchStats.mutate();
    }
  });

  const sendMessage = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/enterprise/voice/conversation", { callId, text: inputText });
      return res.json();
    },
    onSuccess: (data) => {
      setConversation(prev => [...prev, { role: "patient", text: inputText }, { role: "agent", text: data.response }]);
      setInputText("");
      if (!data.continue) {
        toast({ title: "Call completed" });
        setCallId(null);
        fetchStats.mutate();
      }
    }
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Phone className="h-4 w-4" /> Voice Swarm — AI Call Center</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">Concurrent AI voice agents handling hundreds of calls simultaneously.</p>
          <div className="flex gap-2 mb-4">
            <Button data-testid="button-voice-stats" onClick={() => fetchStats.mutate()}>Refresh Stats</Button>
            <Button data-testid="button-start-call" onClick={() => startCall.mutate()} disabled={!!callId}>Start Test Call</Button>
          </div>
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="bg-muted p-3 rounded"><div className="text-xs text-muted-foreground">Active Calls</div><div className="text-lg font-bold" data-testid="text-active-calls">{stats.activeCalls}</div></div>
              <div className="bg-muted p-3 rounded"><div className="text-xs text-muted-foreground">Max Capacity</div><div className="text-lg font-bold">{stats.maxCapacity}</div></div>
              <div className="bg-muted p-3 rounded"><div className="text-xs text-muted-foreground">Total Calls</div><div className="text-lg font-bold">{stats.totalCalls}</div></div>
              <div className="bg-muted p-3 rounded"><div className="text-xs text-muted-foreground">Peak Concurrent</div><div className="text-lg font-bold">{stats.peakConcurrent}</div></div>
            </div>
          )}
          {callId && (
            <Card>
              <CardContent className="pt-4">
                <div className="text-sm font-medium mb-2">Active Call: {callId}</div>
                <div className="space-y-2 max-h-48 overflow-y-auto mb-3">
                  {conversation.map((msg, i) => (
                    <div key={i} className={`text-sm p-2 rounded ${msg.role === "patient" ? "bg-blue-50 dark:bg-blue-900/20 ml-8" : "bg-muted mr-8"}`}>
                      <span className="font-medium">{msg.role === "patient" ? "You" : "Agent"}:</span> {msg.text}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input data-testid="input-call-text" value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Type symptoms..." onKeyDown={(e) => e.key === "Enter" && inputText && sendMessage.mutate()} />
                  <Button data-testid="button-send-message" onClick={() => sendMessage.mutate()} disabled={!inputText || sendMessage.isPending}>Send</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function GrowthEngineTab() {
  const { toast } = useToast();
  const [allocation, setAllocation] = useState<any[]>([]);
  const [projection, setProjection] = useState<any>(null);
  const [budget, setBudget] = useState("5000");

  const allocate = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/enterprise/growth/allocate", { budget: Number(budget) });
      return res.json();
    },
    onSuccess: (data) => { setAllocation(data); toast({ title: "Budget allocated across channels" }); }
  });

  const project = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/enterprise/growth/projection", {
        months: 12,
        metrics: { patientsServed: 50, referralsGenerated: 15, repeatRate: 0.3, satisfactionScore: 0.85 }
      });
      return res.json();
    },
    onSuccess: (data) => { setProjection(data); toast({ title: "Growth projection generated" }); }
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Target className="h-4 w-4" /> Patient Acquisition Engine</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">ROI-optimized marketing budget allocation across acquisition channels.</p>
          <div className="flex gap-2 mb-4">
            <div><label className="text-xs">Monthly Budget ($)</label><Input data-testid="input-budget" value={budget} onChange={(e) => setBudget(e.target.value)} /></div>
            <Button data-testid="button-allocate" className="self-end" onClick={() => allocate.mutate()} disabled={allocate.isPending}>Allocate Budget</Button>
          </div>
          {allocation.length > 0 && (
            <div className="space-y-2">
              {allocation.map((ch: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-2 bg-muted rounded text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{ch.channel}</span>
                    <Badge variant="outline">{ch.roi.toFixed(1)}x ROI</Badge>
                  </div>
                  <div className="text-right">
                    <span className="mr-3">${ch.budgetAllocation.toLocaleString()}</span>
                    <span className="text-green-600 font-medium">+${ch.projectedProfit.toLocaleString()} profit</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Growth Flywheel Projection</CardTitle></CardHeader>
        <CardContent>
          <Button data-testid="button-project-growth" onClick={() => project.mutate()} disabled={project.isPending}>
            {project.isPending ? "Projecting..." : "Project 12-Month Growth"}
          </Button>
          {projection && (
            <div className="mt-3 space-y-2">
              {projection.projection?.map((p: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-2 bg-muted rounded text-sm">
                  <span>Month {p.month}</span>
                  <div>
                    <span className="mr-3">{p.patients} patients</span>
                    <span className="font-bold text-green-600">${p.revenue.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ScalingPlaybookTab() {
  const { toast } = useToast();
  const [projections, setProjections] = useState<any[]>([]);

  const project = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/enterprise/scaling/project", {});
      return res.json();
    },
    onSuccess: (data) => { setProjections(data); toast({ title: `${data.length} locations analyzed` }); }
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4" /> Multi-Location Scaling Playbook</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">Project revenue, costs, and viability for expansion across NY State locations.</p>
          <Button data-testid="button-project-expansion" onClick={() => project.mutate()} disabled={project.isPending}>
            {project.isPending ? "Analyzing..." : "Analyze Expansion Targets"}
          </Button>
          {projections.length > 0 && (
            <div className="mt-3 space-y-2">
              {projections.map((p: any, i: number) => (
                <div key={i} className="p-3 bg-muted rounded">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">{p.location}</span>
                    <Badge className={p.viabilityScore > 5 ? "bg-green-100 text-green-800" : p.viabilityScore > 2 ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800"}>
                      Score: {p.viabilityScore}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm mt-2">
                    <div><span className="text-muted-foreground">Daily Rev:</span> <span className="font-medium">${p.projectedDailyRevenue.toLocaleString()}</span></div>
                    <div><span className="text-muted-foreground">Monthly Profit:</span> <span className="font-medium text-green-600">${p.projectedMonthlyProfit.toLocaleString()}</span></div>
                    <div><span className="text-muted-foreground">Break-even:</span> <span className="font-medium">{p.breakEvenDays} days</span></div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{p.recommendation}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CapacityServiceMixTab() {
  const { toast } = useToast();
  const [capacityResult, setCapacityResult] = useState<any>(null);
  const [serviceMix, setServiceMix] = useState<any[]>([]);

  const checkCapacity = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/enterprise/capacity/balance", { load: 0.72, demand: 0.8 });
      return res.json();
    },
    onSuccess: (data) => { setCapacityResult(data); toast({ title: `Capacity: ${data.status}` }); }
  });

  const optimizeMix = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/enterprise/service-mix/optimize", {
        services: [
          { name: "URI/Cough Triage", revenue: 120, cost: 15, volume: 200, satisfaction: 0.9 },
          { name: "UTI Treatment", revenue: 95, cost: 12, volume: 80, satisfaction: 0.85 },
          { name: "Med Refills", revenue: 50, cost: 5, volume: 300, satisfaction: 0.95 },
          { name: "Cardiac Screen", revenue: 250, cost: 40, volume: 30, satisfaction: 0.7 },
          { name: "Mental Health Screen", revenue: 180, cost: 25, volume: 50, satisfaction: 0.75 },
          { name: "Pediatric Triage", revenue: 130, cost: 18, volume: 100, satisfaction: 0.88 }
        ]
      });
      return res.json();
    },
    onSuccess: (data) => { setServiceMix(data); toast({ title: `${data.length} services analyzed` }); }
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" /> Capacity Balancer</CardTitle></CardHeader>
        <CardContent>
          <Button data-testid="button-check-capacity" onClick={() => checkCapacity.mutate()} disabled={checkCapacity.isPending}>Check Capacity Balance</Button>
          {capacityResult && (
            <div className="mt-3 p-3 bg-muted rounded">
              <div className="flex items-center gap-2 mb-2">
                <Badge className={capacityResult.status === "optimal" ? "bg-green-100 text-green-800" : capacityResult.status === "critical" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"}>
                  {capacityResult.status}
                </Badge>
                <span className="text-sm">Efficiency: {(capacityResult.efficiency * 100).toFixed(0)}%</span>
              </div>
              <p className="text-sm" data-testid="text-capacity-action">{capacityResult.action}</p>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Service Mix Optimizer</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">Analyze service lines to determine what to expand, maintain, or reduce.</p>
          <Button data-testid="button-optimize-mix" onClick={() => optimizeMix.mutate()} disabled={optimizeMix.isPending}>Optimize Service Mix</Button>
          {serviceMix.length > 0 && (
            <div className="mt-3 space-y-2">
              {serviceMix.map((s: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-2 bg-muted rounded text-sm">
                  <div>
                    <span className="font-medium">{s.service}</span>
                    <Badge variant="outline" className="ml-2">{s.recommendation}</Badge>
                  </div>
                  <div className="text-right">
                    <span className="mr-2">Margin: ${s.margin}</span>
                    <span className="text-muted-foreground">({s.marginPercent}%)</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EnterpriseOrchestratorTab() {
  const { toast } = useToast();
  const [result, setResult] = useState<any>(null);

  const runAnalysis = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/enterprise/enterprise/full-analysis", {
        budget: 10000,
        services: [
          { name: "URI/Cough", revenue: 120, cost: 15, volume: 200, satisfaction: 0.9 },
          { name: "UTI", revenue: 95, cost: 12, volume: 80, satisfaction: 0.85 },
          { name: "Med Refills", revenue: 50, cost: 5, volume: 300, satisfaction: 0.95 },
        ]
      });
      return res.json();
    },
    onSuccess: (data) => { setResult(data); toast({ title: "Enterprise analysis complete" }); }
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Globe className="h-4 w-4" /> Enterprise Orchestrator — Full Analysis</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">Unified analysis: digital twin + simulation + control + growth + scaling. One-click strategic intelligence.</p>
          <Button data-testid="button-enterprise-analysis" onClick={() => runAnalysis.mutate()} disabled={runAnalysis.isPending} size="lg">
            {runAnalysis.isPending ? "Running Enterprise Analysis..." : "Run Full Enterprise Analysis"}
          </Button>
          {result && (
            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-4 p-3 bg-muted rounded">
                <div>
                  <div className="text-xs text-muted-foreground">Health Grade</div>
                  <div className="text-3xl font-bold" data-testid="text-health-grade">{result.overallHealth?.grade}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Score</div>
                  <div className="text-xl font-bold">{result.overallHealth?.score}/100</div>
                </div>
                <div className="flex-1" />
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Projected Revenue</div>
                  <div className="text-xl font-bold text-green-600">${Math.round(result.projectedRevenue?.daily || 0).toLocaleString()}/day</div>
                  <div className="text-sm text-muted-foreground">${Math.round(result.projectedRevenue?.monthly || 0).toLocaleString()}/mo</div>
                </div>
              </div>

              {result.topStrategy && (
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-sm font-medium mb-1">Top Strategy: {result.topStrategy.label}</div>
                    <div className="text-green-600 font-bold">${result.topStrategy.projectedDailyRevenue?.toLocaleString()}/day projected</div>
                  </CardContent>
                </Card>
              )}

              {result.capacityStatus && (
                <div className="p-3 bg-muted rounded">
                  <div className="text-sm font-medium">Capacity: <Badge variant="outline">{result.capacityStatus.status}</Badge></div>
                  <div className="text-xs text-muted-foreground mt-1">{result.capacityStatus.action}</div>
                </div>
              )}

              {result.expansionTargets?.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-1">Top Expansion Targets:</div>
                  {result.expansionTargets.map((t: any, i: number) => (
                    <div key={i} className="text-sm p-2 bg-muted rounded mt-1">
                      <span className="font-medium">{t.location}</span>: ${t.projectedMonthlyProfit.toLocaleString()}/mo profit — {t.recommendation}
                    </div>
                  ))}
                </div>
              )}

              {result.recommendations?.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-1">Recommendations:</div>
                  {result.recommendations.map((r: string, i: number) => (
                    <div key={i} className="text-sm text-muted-foreground">• {r}</div>
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

export default function EnterpriseDashboard() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" data-testid="heading-enterprise">Enterprise Command Center</h1>
        <p className="text-muted-foreground">Digital twin, simulation, adaptive control, voice swarm, growth engine, and multi-location scaling.</p>
      </div>

      <Tabs defaultValue="orchestrator" data-testid="tabs-enterprise">
        <TabsList className="grid grid-cols-7 w-full mb-4">
          <TabsTrigger value="orchestrator" data-testid="tab-orchestrator"><Globe className="h-3 w-3 mr-1" />Enterprise</TabsTrigger>
          <TabsTrigger value="twin" data-testid="tab-twin"><Cpu className="h-3 w-3 mr-1" />Digital Twin</TabsTrigger>
          <TabsTrigger value="control" data-testid="tab-control"><Settings className="h-3 w-3 mr-1" />Control</TabsTrigger>
          <TabsTrigger value="voice" data-testid="tab-voice"><Phone className="h-3 w-3 mr-1" />Voice</TabsTrigger>
          <TabsTrigger value="growth" data-testid="tab-growth"><Target className="h-3 w-3 mr-1" />Growth</TabsTrigger>
          <TabsTrigger value="scaling" data-testid="tab-scaling"><MapPin className="h-3 w-3 mr-1" />Scaling</TabsTrigger>
          <TabsTrigger value="capacity" data-testid="tab-capacity"><Activity className="h-3 w-3 mr-1" />Capacity</TabsTrigger>
        </TabsList>

        <TabsContent value="orchestrator"><EnterpriseOrchestratorTab /></TabsContent>
        <TabsContent value="twin"><DigitalTwinTab /></TabsContent>
        <TabsContent value="control"><AdaptiveControlTab /></TabsContent>
        <TabsContent value="voice"><VoiceSwarmTab /></TabsContent>
        <TabsContent value="growth"><GrowthEngineTab /></TabsContent>
        <TabsContent value="scaling"><ScalingPlaybookTab /></TabsContent>
        <TabsContent value="capacity"><CapacityServiceMixTab /></TabsContent>
      </Tabs>
    </div>
  );
}
