import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  RefreshCw, CheckCircle2, XCircle, Activity, FlaskConical,
  AlertTriangle, BarChart3, Package,
} from "lucide-react";

export default function CoverageDashboard() {
  const [coverage, setCoverage] = useState<any[]>([]);
  const [simulation, setSimulation] = useState<any | null>(null);
  const [generatedPacks, setGeneratedPacks] = useState<any[]>([]);
  const [loadingCoverage, setLoadingCoverage] = useState(false);
  const [loadingSim, setLoadingSim] = useState(false);
  const [loadingPacks, setLoadingPacks] = useState(false);
  const [simCount, setSimCount] = useState(500);

  async function loadCoverage() {
    setLoadingCoverage(true);
    try {
      const res = await fetch("/api/coverage/coverage");
      const json = await res.json();
      setCoverage(json.coverage || []);
    } finally {
      setLoadingCoverage(false);
    }
  }

  async function runSimulation() {
    setLoadingSim(true);
    try {
      const res = await fetch("/api/coverage/simulate-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ n: simCount }),
      });
      const json = await res.json();
      setSimulation(json);
    } finally {
      setLoadingSim(false);
    }
  }

  async function loadGeneratedPacks() {
    setLoadingPacks(true);
    try {
      const res = await fetch("/api/coverage/generated-packs");
      const json = await res.json();
      setGeneratedPacks(json.packs || []);
    } finally {
      setLoadingPacks(false);
    }
  }

  useEffect(() => {
    loadCoverage();
  }, []);

  const totalSystems = coverage.length;
  const completeSystems = coverage.filter((c: any) => c.status === "COMPLETE").length;
  const completionPct = totalSystems > 0 ? Math.round((completeSystems / totalSystems) * 100) : 0;

  return (
    <div className="p-6" data-testid="coverage-dashboard-page">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Clinical System Coverage</h1>
        <p className="text-muted-foreground">Full visibility into system completeness, simulation, and pack generation</p>
      </div>

      <Tabs defaultValue="coverage">
        <TabsList className="mb-4">
          <TabsTrigger value="coverage" data-testid="tab-coverage">
            <BarChart3 className="w-4 h-4 mr-1" /> Coverage
          </TabsTrigger>
          <TabsTrigger value="simulation" data-testid="tab-simulation">
            <FlaskConical className="w-4 h-4 mr-1" /> Mass Simulation
          </TabsTrigger>
          <TabsTrigger value="packs" data-testid="tab-packs">
            <Package className="w-4 h-4 mr-1" /> Generated Packs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="coverage">
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Card>
              <CardContent className="pt-6 text-center">
                <div className="text-3xl font-bold" data-testid="text-total-systems">{totalSystems}</div>
                <p className="text-sm text-muted-foreground">Total Systems</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <div className="text-3xl font-bold text-green-500" data-testid="text-complete-systems">{completeSystems}</div>
                <p className="text-sm text-muted-foreground">Complete</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center mb-2">
                  <span className="text-3xl font-bold" data-testid="text-completion-pct">{completionPct}%</span>
                </div>
                <Progress value={completionPct} className="h-2" />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">System Coverage Matrix</CardTitle>
                <Button variant="outline" size="sm" onClick={loadCoverage} disabled={loadingCoverage} data-testid="button-refresh-coverage">
                  <RefreshCw className={`w-4 h-4 mr-1 ${loadingCoverage ? "animate-spin" : ""}`} /> Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-3">System</th>
                      <th className="text-center py-2 px-3">Complaints</th>
                      <th className="text-center py-2 px-3">Modifiers</th>
                      <th className="text-center py-2 px-3">Questions</th>
                      <th className="text-center py-2 px-3">Rules</th>
                      <th className="text-center py-2 px-3">Plans</th>
                      <th className="text-center py-2 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coverage.map((row: any) => (
                      <tr key={row.system} className="border-b hover:bg-muted/50" data-testid={`row-system-${row.system}`}>
                        <td className="py-2 px-3 font-medium capitalize">{row.system}</td>
                        <td className="text-center py-2 px-3">{row.complaints}</td>
                        <td className="text-center py-2 px-3">
                          {row.modifiers ? <CheckCircle2 className="w-4 h-4 text-green-500 inline" /> : <XCircle className="w-4 h-4 text-red-400 inline" />}
                        </td>
                        <td className="text-center py-2 px-3">
                          {row.questions ? <CheckCircle2 className="w-4 h-4 text-green-500 inline" /> : <XCircle className="w-4 h-4 text-red-400 inline" />}
                        </td>
                        <td className="text-center py-2 px-3">
                          {row.rules ? <CheckCircle2 className="w-4 h-4 text-green-500 inline" /> : <XCircle className="w-4 h-4 text-red-400 inline" />}
                        </td>
                        <td className="text-center py-2 px-3">
                          {row.plans ? <CheckCircle2 className="w-4 h-4 text-green-500 inline" /> : <XCircle className="w-4 h-4 text-red-400 inline" />}
                        </td>
                        <td className="text-center py-2 px-3">
                          <Badge variant={row.status === "COMPLETE" ? "default" : "destructive"} className="text-xs">
                            {row.status}
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

        <TabsContent value="simulation">
          <Card className="mb-4">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Mass Simulation Engine</CardTitle>
                <div className="flex items-center gap-3">
                  <label className="text-sm text-muted-foreground">Runs:</label>
                  <input
                    type="number"
                    value={simCount}
                    onChange={e => setSimCount(Number(e.target.value))}
                    className="w-24 border rounded px-2 py-1 text-sm"
                    min={10}
                    max={2000}
                    data-testid="input-sim-count"
                  />
                  <Button onClick={runSimulation} disabled={loadingSim} data-testid="button-run-simulation">
                    <FlaskConical className={`w-4 h-4 mr-1 ${loadingSim ? "animate-spin" : ""}`} />
                    {loadingSim ? "Running..." : "Run Simulation"}
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>

          {simulation && (
            <>
              <div className="grid grid-cols-4 gap-4 mb-4">
                <Card>
                  <CardContent className="pt-6 text-center">
                    <div className="text-2xl font-bold" data-testid="text-total-runs">{simulation.totalRuns}</div>
                    <p className="text-xs text-muted-foreground">Total Runs</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6 text-center">
                    <div className="text-2xl font-bold text-red-500" data-testid="text-escalation-rate">
                      {(simulation.escalationRate * 100).toFixed(1)}%
                    </div>
                    <p className="text-xs text-muted-foreground">Escalation Rate</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6 text-center">
                    <div className="text-2xl font-bold text-yellow-500" data-testid="text-review-rate">
                      {(simulation.reviewRate * 100).toFixed(1)}%
                    </div>
                    <p className="text-xs text-muted-foreground">Review Rate</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6 text-center">
                    <div className="flex justify-center gap-4">
                      <div>
                        <div className="text-lg font-bold text-orange-500" data-testid="text-under-triage">{simulation.underTriageCount}</div>
                        <p className="text-[10px] text-muted-foreground">Under-triage</p>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-blue-500" data-testid="text-over-triage">{simulation.overTriageCount}</div>
                        <p className="text-[10px] text-muted-foreground">Over-triage</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Disposition Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {Object.entries(simulation.dispositionBreakdown || {}).sort((a: any, b: any) => b[1] - a[1]).map(([disp, count]: [string, any]) => (
                        <div key={disp} className="flex items-center justify-between text-sm" data-testid={`text-disp-${disp}`}>
                          <span className="capitalize">{disp.replace(/_/g, " ")}</span>
                          <div className="flex items-center gap-2">
                            <Progress value={(count / simulation.totalRuns) * 100} className="w-24 h-2" />
                            <span className="text-xs text-muted-foreground w-12 text-right">{count}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-orange-500" /> Top Failures
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {simulation.topFailures?.length > 0 ? (
                      <div className="space-y-2">
                        {simulation.topFailures.map((f: string, i: number) => (
                          <div key={i} className="text-sm p-2 bg-red-500/5 rounded border border-red-500/20">
                            {f}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">No high-escalation packs detected</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Per-Pack Results</CardTitle>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-3">Pack</th>
                        <th className="text-center py-2 px-3">Runs</th>
                        <th className="text-center py-2 px-3">Escalation</th>
                        <th className="text-center py-2 px-3">Review</th>
                        <th className="text-center py-2 px-3">Avg Red Flags</th>
                        <th className="text-center py-2 px-3">Avg Risk Delta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {simulation.perPack?.map((p: any) => (
                        <tr key={p.packId} className="border-b" data-testid={`row-pack-sim-${p.packId}`}>
                          <td className="py-2 px-3 font-medium">{p.packTitle}</td>
                          <td className="text-center py-2 px-3">{p.runs}</td>
                          <td className="text-center py-2 px-3">
                            <Badge variant={p.escalationRate > 0.5 ? "destructive" : "secondary"} className="text-xs">
                              {(p.escalationRate * 100).toFixed(0)}%
                            </Badge>
                          </td>
                          <td className="text-center py-2 px-3">{(p.reviewRate * 100).toFixed(0)}%</td>
                          <td className="text-center py-2 px-3">{p.avgRedFlags.toFixed(1)}</td>
                          <td className="text-center py-2 px-3">{p.avgRiskDelta.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </>
          )}

          {!simulation && !loadingSim && (
            <Card>
              <CardContent className="py-16 text-center">
                <FlaskConical className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Run a simulation to stress-test all complaint packs with random patient answers</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="packs">
          <Card className="mb-4">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Auto-Generated Pack View</CardTitle>
                <Button variant="outline" size="sm" onClick={loadGeneratedPacks} disabled={loadingPacks} data-testid="button-load-packs">
                  <RefreshCw className={`w-4 h-4 mr-1 ${loadingPacks ? "animate-spin" : ""}`} /> Load Packs
                </Button>
              </div>
            </CardHeader>
          </Card>

          {generatedPacks.length > 0 ? (
            <div className="grid grid-cols-2 gap-4">
              {generatedPacks.map((pack: any) => (
                <Card key={pack.id} data-testid={`card-pack-${pack.id}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">{pack.title}</CardTitle>
                      <Badge variant="outline" className="text-xs capitalize">{pack.system}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-3">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Completeness</span>
                        <span className="font-medium">{pack.completeness}%</span>
                      </div>
                      <Progress value={pack.completeness} className="h-2" />
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="flex items-center gap-1">
                        {pack.hasQuestions ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <XCircle className="w-3 h-3 text-red-400" />}
                        <span>Questions ({pack.questions?.length || 0})</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {pack.hasModifiers ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <XCircle className="w-3 h-3 text-red-400" />}
                        <span>Modifiers ({pack.modifiers?.length || 0})</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {pack.hasAlgorithms ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <XCircle className="w-3 h-3 text-red-400" />}
                        <span>Algorithms ({pack.algorithms?.length || 0})</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-16 text-center">
                <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Click "Load Packs" to view auto-generated pack assembly from all data sources</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
