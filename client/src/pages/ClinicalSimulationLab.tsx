import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FlaskConical, Play, RotateCcw, TrendingUp, AlertTriangle,
  CheckCircle2, XCircle, Activity, Lightbulb, BarChart3
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const COMPLAINTS = ["cough", "chest_pain", "headache", "dizziness", "sore_throat", "fever", "ear_pain", "breathlessness"];
const DIFFICULTIES = ["easy", "moderate", "hard"];

const dispositionColor: Record<string, string> = {
  er_now: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  urgent_care: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  self_care: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
};

function pct(n: number) {
  return `${Math.round((n || 0) * 100)}%`;
}

function ScoreBar({ value, max = 100, color = "bg-blue-500" }: { value: number; max?: number; color?: string }) {
  return (
    <div className="w-full bg-muted rounded-full h-2 mt-1">
      <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
    </div>
  );
}

export default function ClinicalSimulationLab() {
  const { toast } = useToast();
  const [complaint, setComplaint] = useState("cough");
  const [count, setCount] = useState(25);
  const [difficulty, setDifficulty] = useState("moderate");
  const [selectedRun, setSelectedRun] = useState<any>(null);

  const { data: runs = [], refetch: refetchRuns } = useQuery<any[]>({
    queryKey: ["/api/simulation-lab/runs"],
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/simulation-lab/run", { complaint, count, difficulty });
      return res.json();
    },
    onSuccess: (data) => {
      setSelectedRun(data);
      queryClient.invalidateQueries({ queryKey: ["/api/simulation-lab/runs"] });
      toast({ title: "Simulation complete", description: `${data.summary.totalCases} cases evaluated` });
    },
    onError: () => {
      toast({ title: "Simulation failed", variant: "destructive" });
    },
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/simulation-lab/runs");
    },
    onSuccess: () => {
      setSelectedRun(null);
      queryClient.invalidateQueries({ queryKey: ["/api/simulation-lab/runs"] });
      toast({ title: "Run history cleared" });
    },
  });

  const summary = selectedRun?.summary;
  const results = selectedRun?.results ?? [];
  const failureBreakdown = selectedRun?.failureBreakdown ?? {};
  const improvements = selectedRun?.improvement?.improvements ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <FlaskConical className="h-7 w-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold">Clinical Simulation Laboratory</h1>
          <p className="text-sm text-muted-foreground">Run synthetic case batches to benchmark clinical reasoning accuracy</p>
        </div>
      </div>

      {/* Control Panel */}
      <Card>
        <CardHeader><CardTitle className="text-base">Simulation Controls</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1">
              <Label>Complaint</Label>
              <Select value={complaint} onValueChange={setComplaint}>
                <SelectTrigger className="w-40" data-testid="select-complaint">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPLAINTS.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Case Count</Label>
              <Input
                type="number"
                min={1}
                max={500}
                value={count}
                onChange={e => setCount(Number(e.target.value))}
                className="w-28"
                data-testid="input-case-count"
              />
            </div>

            <div className="space-y-1">
              <Label>Difficulty</Label>
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger className="w-36" data-testid="select-difficulty">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIFFICULTIES.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending}
              className="gap-2"
              data-testid="button-run-simulation"
            >
              <Play className="h-4 w-4" />
              {runMutation.isPending ? "Running…" : "Run Simulation"}
            </Button>

            {(runs as any[]).length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => clearMutation.mutate()}
                disabled={clearMutation.isPending}
                className="gap-2"
                data-testid="button-clear-runs"
              >
                <RotateCcw className="h-4 w-4" /> Clear History
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">Total Cases</div>
              <div className="text-3xl font-bold mt-1">{summary.totalCases}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">Disposition Accuracy</div>
              <div className={`text-3xl font-bold mt-1 ${summary.dispositionAccuracy >= 0.9 ? "text-green-600" : summary.dispositionAccuracy >= 0.75 ? "text-yellow-600" : "text-red-600"}`}>
                {pct(summary.dispositionAccuracy)}
              </div>
              <ScoreBar value={summary.dispositionAccuracy * 100} color={summary.dispositionAccuracy >= 0.9 ? "bg-green-500" : "bg-yellow-500"} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">Diagnosis Accuracy</div>
              <div className={`text-3xl font-bold mt-1 ${summary.diagnosisAccuracy >= 0.75 ? "text-green-600" : "text-yellow-600"}`}>
                {pct(summary.diagnosisAccuracy)}
              </div>
              <ScoreBar value={summary.diagnosisAccuracy * 100} color="bg-blue-500" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">Red Flag Miss Rate</div>
              <div className={`text-3xl font-bold mt-1 ${summary.redFlagMissRate > 0.02 ? "text-red-600" : "text-green-600"}`}>
                {pct(summary.redFlagMissRate)}
              </div>
              <ScoreBar value={summary.redFlagMissRate * 100} max={20} color={summary.redFlagMissRate > 0.02 ? "bg-red-500" : "bg-green-500"} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Results Tabs */}
      {selectedRun && (
        <Tabs defaultValue="results">
          <TabsList>
            <TabsTrigger value="results" data-testid="tab-results">Case Results</TabsTrigger>
            <TabsTrigger value="failures" data-testid="tab-failures">Failure Analysis</TabsTrigger>
            <TabsTrigger value="improvements" data-testid="tab-improvements">Improvements</TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history">Run History</TabsTrigger>
          </TabsList>

          {/* Case Results Table */}
          <TabsContent value="results">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  {results.length} Cases — Run {selectedRun.runId}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        {["Case ID", "Expected", "Predicted", "Disp OK", "Diag OK", "Score", "RF Miss"].map(h => (
                          <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((row: any) => (
                        <tr key={row.caseId} className="border-b hover:bg-muted/20">
                          <td className="px-3 py-1.5 font-mono text-xs">{row.caseId.slice(-10)}</td>
                          <td className="px-3 py-1.5">
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${dispositionColor[row.expectedDisposition]}`}>
                              {row.expectedDisposition}
                            </span>
                          </td>
                          <td className="px-3 py-1.5">
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${dispositionColor[row.predictedDisposition]}`}>
                              {row.predictedDisposition}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            {row.dispositionCorrect
                              ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600 inline" />
                              : <XCircle className="h-3.5 w-3.5 text-red-600 inline" />}
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            {row.diagnosisMatch
                              ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600 inline" />
                              : <XCircle className="h-3.5 w-3.5 text-muted-foreground inline" />}
                          </td>
                          <td className="px-3 py-1.5 font-semibold">
                            <span className={row.score >= 80 ? "text-green-600" : row.score >= 60 ? "text-yellow-600" : "text-red-600"}>
                              {row.score}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            {row.redFlagMiss && <AlertTriangle className="h-3.5 w-3.5 text-red-600 inline" />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Failure Analysis */}
          <TabsContent value="failures">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Object.keys(failureBreakdown).length === 0 ? (
                <Card className="col-span-2">
                  <CardContent className="pt-6 text-center text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
                    No failures detected in this run
                  </CardContent>
                </Card>
              ) : (
                Object.entries(failureBreakdown)
                  .sort((a: any, b: any) => b[1] - a[1])
                  .map(([category, cnt]: any) => (
                    <Card key={category} className={category === "missed_red_flag" ? "border-red-400 dark:border-red-700" : ""}>
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className={`h-4 w-4 ${category === "missed_red_flag" ? "text-red-600" : "text-yellow-600"}`} />
                            <span className="font-medium text-sm capitalize">{category.replace(/_/g, " ")}</span>
                          </div>
                          <Badge variant={category === "missed_red_flag" ? "destructive" : "secondary"}>{cnt} cases</Badge>
                        </div>
                        <ScoreBar value={cnt} max={summary?.totalCases ?? 100} color={category === "missed_red_flag" ? "bg-red-500" : "bg-yellow-500"} />
                        <div className="text-xs text-muted-foreground mt-1">
                          {pct(cnt / (summary?.totalCases ?? 1))} of cases
                        </div>
                      </CardContent>
                    </Card>
                  ))
              )}
            </div>
          </TabsContent>

          {/* Improvements */}
          <TabsContent value="improvements">
            {improvements.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  No improvement actions generated — system performing within target thresholds
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {improvements.map((imp: any, i: number) => (
                  <Card key={i} className={imp.priority === "critical" ? "border-red-400 dark:border-red-700" : ""}>
                    <CardContent className="pt-4">
                      <div className="flex items-start gap-3">
                        <Lightbulb className={`h-4 w-4 mt-0.5 flex-shrink-0 ${imp.priority === "critical" ? "text-red-600" : imp.priority === "high" ? "text-orange-500" : "text-blue-500"}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{imp.suggestion}</span>
                            <Badge variant={imp.priority === "critical" ? "destructive" : "secondary"} className="text-xs">
                              {imp.priority}
                            </Badge>
                            {imp.engine && <Badge variant="outline" className="text-xs font-mono">{imp.engine}</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Action: <span className="font-mono">{imp.action}</span> · Impact: {imp.estimatedImpact}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Run History */}
          <TabsContent value="history">
            <Card>
              <CardContent className="pt-4">
                {(runs as any[]).length === 0 ? (
                  <div className="text-center text-muted-foreground py-6">No previous runs</div>
                ) : (
                  <div className="space-y-2">
                    {(runs as any[]).map((run: any) => (
                      <div
                        key={run.runId}
                        className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors ${selectedRun?.runId === run.runId ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" : ""}`}
                        onClick={() => setSelectedRun(run)}
                        data-testid={`row-run-${run.runId}`}
                      >
                        <div>
                          <div className="font-mono text-xs text-muted-foreground">{run.runId}</div>
                          <div className="text-sm font-medium capitalize mt-0.5">
                            {run.complaint?.replace(/_/g, " ")} · {run.difficulty} · {run.summary?.totalCases} cases
                          </div>
                        </div>
                        <div className="text-right text-xs text-muted-foreground">
                          <div className={`font-semibold ${(run.summary?.dispositionAccuracy ?? 0) >= 0.9 ? "text-green-600" : "text-yellow-600"}`}>
                            {pct(run.summary?.dispositionAccuracy ?? 0)} disp accuracy
                          </div>
                          <div>{new Date(run.createdAt).toLocaleTimeString()}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* No run yet */}
      {!selectedRun && !runMutation.isPending && (
        <Card>
          <CardContent className="pt-10 pb-10 text-center">
            <FlaskConical className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-muted-foreground">Configure a complaint and case count above, then click Run Simulation.</p>
          </CardContent>
        </Card>
      )}

      {runMutation.isPending && (
        <Card>
          <CardContent className="pt-10 pb-10 text-center">
            <Activity className="h-12 w-12 text-blue-500 mx-auto mb-3 animate-pulse" />
            <p className="text-muted-foreground">Running {count} synthetic cases for <strong>{complaint.replace(/_/g, " ")}</strong>…</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
