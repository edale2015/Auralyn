import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Brain, Activity, AlertTriangle, Shield, RefreshCw,
  CheckCircle, XCircle, BarChart3, Target, Zap, Play,
  Search, Network, Eye, TrendingUp, HeartPulse, Microscope,
} from "lucide-react";

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900 dark:text-red-200",
  HIGH: "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900 dark:text-orange-200",
  MODERATE: "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900 dark:text-yellow-200",
  LOW: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900 dark:text-blue-200",
};

const FIX_TYPE_COLORS: Record<string, string> = {
  RULE_ADD: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  RED_FLAG_ADD: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  QUESTION_ADD: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  ESCALATION_THRESHOLD: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  RULE_MODIFY: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  approved: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  applied: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
};

function StatCard({ icon: Icon, label, value, sub, color = "blue" }: any) {
  const colors: Record<string, string> = {
    blue: "text-blue-600 bg-blue-50 dark:bg-blue-950 dark:text-blue-300",
    green: "text-green-600 bg-green-50 dark:bg-green-950 dark:text-green-300",
    orange: "text-orange-600 bg-orange-50 dark:bg-orange-950 dark:text-orange-300",
    red: "text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-300",
    purple: "text-purple-600 bg-purple-50 dark:bg-purple-950 dark:text-purple-300",
  };
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start gap-3">
          <div className={`rounded-lg p-2 ${colors[color]}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OverviewPanel() {
  const { data, isLoading } = useQuery({ queryKey: ["/api/physician/overview"] });
  const overview = data as any;

  if (isLoading) return <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (!overview) return <p className="text-muted-foreground">No data. Seed demo data first.</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={BarChart3} label="Total Feedback" value={overview.feedbackStats?.total ?? 0} color="blue" />
        <StatCard icon={Target} label="Diagnosis Accuracy" value={`${overview.feedbackStats?.diagnosisAccuracy ?? "N/A"}%`} color="green" />
        <StatCard icon={Shield} label="Triage Accuracy" value={`${overview.feedbackStats?.triageAccuracy ?? "N/A"}%`} color="purple" />
        <StatCard icon={AlertTriangle} label="Critical Misses" value={overview.feedbackStats?.criticalMisses ?? 0} color="red" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Brain} label="Errors Detected" value={overview.errorSummary?.total ?? 0} color="orange" />
        <StatCard icon={Zap} label="Pending Fixes" value={overview.fixCounts?.pending ?? 0} sub={`${overview.fixCounts?.total ?? 0} total`} color="purple" />
        <StatCard icon={Activity} label="Case Memory" value={overview.memoryStats?.totalCases ?? 0} sub={`${overview.memoryStats?.uniqueComplaints ?? 0} complaints`} color="green" />
        <StatCard icon={RefreshCw} label="Cycles Run" value={overview.cycleCount ?? 0} color="blue" />
      </div>

      {overview.errorSummary?.worstComplaints?.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-500" /> Top Problem Complaints</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {overview.errorSummary.worstComplaints.map((wc: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-md bg-muted/50" data-testid={`worst-complaint-${i}`}>
                  <span className="font-medium">{wc.complaint.replace(/_/g, " ")}</span>
                  <div className="flex gap-2">
                    {wc.criticalCount > 0 && <Badge variant="destructive">{wc.criticalCount} critical</Badge>}
                    <Badge variant="secondary">{wc.errorCount} errors</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FeedbackPanel() {
  const { data, isLoading } = useQuery({ queryKey: ["/api/physician/feedback/logs"] });
  const logs = (data as any)?.logs ?? [];

  if (isLoading) return <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Feedback Logs ({logs.length})</h3>
      {logs.length === 0 ? (
        <p className="text-muted-foreground">No feedback logs yet. Seed demo data to populate.</p>
      ) : (
        <div className="space-y-3">
          {logs.map((log: any, i: number) => (
            <Card key={i} data-testid={`feedback-log-${i}`}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">{log.complaint?.replace(/_/g, " ")}</p>
                    <p className="text-sm text-muted-foreground">Case: {log.caseId}</p>
                  </div>
                  <div className="text-right text-sm">
                    <p>
                      Predicted: <span className="font-medium">{log.predictedDiagnosis}</span>
                      {log.predictedDiagnosis !== log.actualDiagnosis && (
                        <span className="text-red-500 ml-1">→ {log.actualDiagnosis}</span>
                      )}
                    </p>
                    <p>
                      Triage: <span className="font-medium">{log.predictedTriage}</span>
                      {log.predictedTriage !== log.actualTriage && (
                        <span className="text-red-500 ml-1">→ {log.actualTriage}</span>
                      )}
                    </p>
                  </div>
                </div>
                {log.missingSignals?.length > 0 && (
                  <div className="mt-2 flex gap-1 flex-wrap">
                    {log.missingSignals.map((s: string, j: number) => (
                      <Badge key={j} variant="outline" className="text-xs">{s}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ErrorDetectionPanel() {
  const { data, isLoading } = useQuery({ queryKey: ["/api/physician/errors/detect"] });
  const errData = data as any;

  if (isLoading) return <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  const errors = errData?.errors ?? [];
  const summary = errData?.summary;

  return (
    <div className="space-y-4">
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard icon={AlertTriangle} label="Total Errors" value={summary.total} color="red" />
          <StatCard icon={XCircle} label="Critical" value={summary.critical} color="red" />
          <StatCard icon={AlertTriangle} label="High" value={summary.high} color="orange" />
          <StatCard icon={Activity} label="Moderate" value={summary.moderate} color="blue" />
          <StatCard icon={CheckCircle} label="Low" value={summary.low} color="green" />
        </div>
      )}

      <h3 className="text-lg font-semibold">Detected Errors ({errors.length})</h3>
      <div className="space-y-3">
        {errors.map((err: any, i: number) => (
          <Card key={i} className={`border-l-4 ${err.severity === "CRITICAL" ? "border-l-red-500" : err.severity === "HIGH" ? "border-l-orange-500" : "border-l-yellow-500"}`} data-testid={`error-${i}`}>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className={SEVERITY_COLORS[err.severity]}>{err.severity}</Badge>
                    <span className="font-semibold">{err.complaint?.replace(/_/g, " ")}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {err.diagnosisError && <span className="mr-2">Dx: {err.predictedDiagnosis} → {err.actualDiagnosis}</span>}
                    {err.triageError && <span>Triage: {err.predictedTriage} → {err.actualTriage}</span>}
                  </p>
                </div>
              </div>
              {err.missingSignals?.length > 0 && (
                <div className="mt-2 flex gap-1 flex-wrap">
                  {err.missingSignals.map((s: string, j: number) => (
                    <Badge key={j} variant="outline" className="text-xs text-red-600">{s}</Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function SelfImprovePanel() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: fixesData, isLoading } = useQuery({ queryKey: ["/api/physician/fixes"] });
  const fixes = (fixesData as any)?.fixes ?? [];
  const counts = (fixesData as any)?.counts;

  const runCycleMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/physician/cycle/run"),
    onSuccess: async (res) => {
      const result = await res.json();
      toast({ title: "Improvement cycle complete", description: `${result.errors?.length ?? 0} errors, ${result.fixes?.length ?? 0} fixes generated` });
      qc.invalidateQueries({ queryKey: ["/api/physician/fixes"] });
      qc.invalidateQueries({ queryKey: ["/api/physician/overview"] });
      qc.invalidateQueries({ queryKey: ["/api/physician/errors/detect"] });
      qc.invalidateQueries({ queryKey: ["/api/physician/feedback/logs"] });
    },
    onError: (e: any) => toast({ title: "Cycle failed", description: e.message, variant: "destructive" }),
  });

  const updateFixMut = useMutation({
    mutationFn: ({ fixId, status }: { fixId: string; status: string }) =>
      apiRequest("PATCH", `/api/physician/fixes/${fixId}`, { status }),
    onSuccess: () => {
      toast({ title: "Fix updated" });
      qc.invalidateQueries({ queryKey: ["/api/physician/fixes"] });
      qc.invalidateQueries({ queryKey: ["/api/physician/overview"] });
    },
    onError: (e: any) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Self-Improvement Engine</h3>
        <Button data-testid="button-run-improvement" onClick={() => runCycleMut.mutate()} disabled={runCycleMut.isPending}>
          {runCycleMut.isPending ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Running...</> : <><Zap className="h-4 w-4 mr-2" /> Run Improvement Cycle</>}
        </Button>
      </div>

      {counts && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={Target} label="Total Fixes" value={counts.total} color="blue" />
          <StatCard icon={AlertTriangle} label="Pending" value={counts.pending} color="orange" />
          <StatCard icon={CheckCircle} label="Approved" value={counts.approved} color="green" />
          <StatCard icon={XCircle} label="Rejected" value={counts.rejected} color="red" />
        </div>
      )}

      <div className="space-y-3">
        {fixes.length === 0 ? (
          <p className="text-muted-foreground">No fixes generated yet. Run an improvement cycle.</p>
        ) : (
          fixes.map((fix: any, i: number) => (
            <Card key={fix.id || i} className={`border-l-4 ${fix.severity === "CRITICAL" ? "border-l-red-500" : fix.severity === "HIGH" ? "border-l-orange-500" : "border-l-yellow-500"}`} data-testid={`fix-${i}`}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={FIX_TYPE_COLORS[fix.type] || "bg-gray-100 text-gray-700"}>{fix.type?.replace(/_/g, " ")}</Badge>
                      <Badge className={SEVERITY_COLORS[fix.severity]}>{fix.severity}</Badge>
                      <Badge className={STATUS_COLORS[fix.status]}>{fix.status}</Badge>
                    </div>
                    <p className="font-medium text-sm">{fix.suggestion}</p>
                    <p className="text-xs text-muted-foreground mt-1">{fix.rationale}</p>
                    <p className="text-xs text-muted-foreground mt-1">Confidence: {(fix.confidence * 100).toFixed(0)}% · Complaint: {fix.complaint?.replace(/_/g, " ")}</p>
                  </div>
                  {fix.status === "pending" && (
                    <div className="flex gap-2 ml-4">
                      <Button data-testid={`button-approve-fix-${i}`} size="sm" variant="outline" className="text-green-600 hover:bg-green-50" onClick={() => updateFixMut.mutate({ fixId: fix.id, status: "approved" })} disabled={updateFixMut.isPending}>
                        <CheckCircle className="h-4 w-4 mr-1" /> Approve
                      </Button>
                      <Button data-testid={`button-reject-fix-${i}`} size="sm" variant="outline" className="text-red-600 hover:bg-red-50" onClick={() => updateFixMut.mutate({ fixId: fix.id, status: "rejected" })} disabled={updateFixMut.isPending}>
                        <XCircle className="h-4 w-4 mr-1" /> Reject
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

function CaseMemoryPanel() {
  const [searchComplaint, setSearchComplaint] = useState("chest_pain");
  const [searchSymptoms, setSearchSymptoms] = useState("chest_tightness,sob");
  const [results, setResults] = useState<any[]>([]);
  const { toast } = useToast();

  const { data: memStats } = useQuery({ queryKey: ["/api/physician/memory/stats"] });
  const stats = memStats as any;

  const searchMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/physician/memory/similar", {
      complaint: searchComplaint,
      symptoms: searchSymptoms.split(",").map(s => s.trim()).filter(Boolean),
    }),
    onSuccess: async (res) => {
      const data = await res.json();
      setResults(data.results ?? []);
      toast({ title: `Found ${data.total ?? 0} similar cases` });
    },
    onError: (e: any) => toast({ title: "Search failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard icon={Brain} label="Cases in Memory" value={stats?.totalCases ?? 0} color="purple" />
        <StatCard icon={Activity} label="Unique Complaints" value={stats?.uniqueComplaints ?? 0} color="blue" />
        <StatCard icon={Network} label="Similarity Search" value="Jaccard" sub="Symptom-based matching" color="green" />
      </div>

      {stats?.byComplaint && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Memory Distribution</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.byComplaint).map(([complaint, count]: [string, any]) => (
                <Badge key={complaint} variant="secondary">{complaint.replace(/_/g, " ")}: {count}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Search className="h-4 w-4" /> Find Similar Cases</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Complaint</label>
              <Input data-testid="input-search-complaint" value={searchComplaint} onChange={e => setSearchComplaint(e.target.value)} placeholder="e.g. chest_pain" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Symptoms (comma-separated)</label>
              <Input data-testid="input-search-symptoms" value={searchSymptoms} onChange={e => setSearchSymptoms(e.target.value)} placeholder="e.g. chest_tightness,sob" />
            </div>
          </div>
          <Button data-testid="button-search-similar" onClick={() => searchMut.mutate()} disabled={searchMut.isPending} className="w-full">
            {searchMut.isPending ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Searching...</> : <><Search className="h-4 w-4 mr-2" /> Search Similar Cases</>}
          </Button>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold">Results ({results.length})</h3>
          {results.map((r: any, i: number) => (
            <Card key={i} data-testid={`similar-case-${i}`}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{r.case?.diagnosis} · <Badge variant="outline">{r.case?.triage}</Badge></p>
                    <p className="text-sm text-muted-foreground">Symptoms: {r.case?.symptoms?.join(", ")}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-blue-600">{(r.score * 100).toFixed(0)}%</p>
                    <p className="text-xs text-muted-foreground">Similarity</p>
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

const NODE_COLORS: Record<string, string> = {
  input: "#3b82f6",
  question: "#8b5cf6",
  modifier: "#f59e0b",
  rule: "#ef4444",
  cluster: "#10b981",
  decision: "#dc2626",
  engine: "#6b7280",
  output: "#059669",
  safety: "#f97316",
};

function ExplainabilityPanel() {
  const { data, isLoading } = useQuery({ queryKey: ["/api/physician/explain/demo"] });
  const graph = data as any;

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const drawGraph = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !graph?.nodes) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);

    const w = rect.width;
    const h = rect.height;

    ctx.fillStyle = "#fafafa";
    ctx.fillRect(0, 0, w, h);

    const nodes = graph.nodes;
    const edges = graph.edges;

    const positions: Record<string, { x: number; y: number }> = {};
    const centerX = w / 2;
    const centerY = h / 2;

    const complaintNode = nodes.find((n: any) => n.id === "complaint");
    const finalNode = nodes.find((n: any) => n.id === "final");
    const questionNodes = nodes.filter((n: any) => n.type === "question");
    const modifierNodes = nodes.filter((n: any) => n.type === "modifier");
    const ruleNodes = nodes.filter((n: any) => n.type === "rule");
    const clusterNodes = nodes.filter((n: any) => n.type === "cluster");

    if (complaintNode) positions[complaintNode.id] = { x: centerX, y: 40 };
    if (finalNode) positions[finalNode.id] = { x: centerX, y: h - 50 };

    const layoutRow = (nodeList: any[], yPos: number) => {
      const count = nodeList.length;
      const spacing = Math.min(160, (w - 80) / Math.max(count, 1));
      const startX = centerX - ((count - 1) * spacing) / 2;
      nodeList.forEach((n: any, i: number) => {
        positions[n.id] = { x: startX + i * spacing, y: yPos };
      });
    };

    layoutRow(questionNodes, 130);
    layoutRow(modifierNodes, 220);
    layoutRow(ruleNodes, 310);
    layoutRow(clusterNodes, 400);

    edges.forEach((edge: any) => {
      const from = positions[edge.source];
      const to = positions[edge.target];
      if (!from || !to) return;

      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.strokeStyle = "#d1d5db";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      ctx.beginPath();
      ctx.moveTo(to.x, to.y);
      ctx.lineTo(to.x - 8 * Math.cos(angle - 0.4), to.y - 8 * Math.sin(angle - 0.4));
      ctx.lineTo(to.x - 8 * Math.cos(angle + 0.4), to.y - 8 * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fillStyle = "#9ca3af";
      ctx.fill();
    });

    nodes.forEach((node: any) => {
      const pos = positions[node.id];
      if (!pos) return;

      const color = node.color || NODE_COLORS[node.type] || "#6b7280";
      const radius = node.id === "complaint" || node.id === "final" ? 28 : 20;

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();

      const label = node.label.length > 25 ? node.label.slice(0, 22) + "..." : node.label;
      ctx.fillStyle = "#374151";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(label, pos.x, pos.y + radius + 14);
    });

    const types = [...new Set(nodes.map((n: any) => n.type))];
    ctx.font = "10px sans-serif";
    ctx.textAlign = "left";
    types.forEach((type: any, i: number) => {
      const y = h - 20;
      const x = 20 + i * 90;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = NODE_COLORS[type] || "#6b7280";
      ctx.fill();
      ctx.fillStyle = "#6b7280";
      ctx.fillText(type, x + 10, y + 4);
    });
  }, [graph]);

  useEffect(() => {
    drawGraph();
  }, [drawGraph]);

  if (isLoading) return <div className="flex justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (!graph) return <p className="text-muted-foreground">No graph data available.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2"><Network className="h-5 w-5" /> Decision Explainability Graph</h3>
        <Badge variant="secondary">{graph.nodes?.length ?? 0} nodes · {graph.edges?.length ?? 0} edges</Badge>
      </div>

      <Card>
        <CardContent className="pt-4">
          <canvas ref={canvasRef} data-testid="explainability-canvas" className="w-full rounded-lg border" style={{ height: 520 }} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Graph Nodes</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {graph.nodes?.map((node: any, i: number) => (
              <div key={i} className="flex items-center gap-2 p-2 rounded bg-muted/50">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: node.color || NODE_COLORS[node.type] || "#6b7280" }} />
                <span className="text-xs">{node.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SimulationPanel() {
  const { toast } = useToast();
  const [simResult, setSimResult] = useState<any>(null);

  const runMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/coverage/simulate-all", { runs: 50 }),
    onSuccess: async (res) => {
      const data = await res.json();
      setSimResult(data);
      toast({ title: "Simulation complete", description: `${data.totalRuns ?? 0} cases simulated` });
    },
    onError: (e: any) => toast({ title: "Simulation failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Mass Simulation</h3>
        <Button data-testid="button-run-simulation" onClick={() => runMut.mutate()} disabled={runMut.isPending}>
          {runMut.isPending ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Running...</> : <><Play className="h-4 w-4 mr-2" /> Run Simulation</>}
        </Button>
      </div>

      {simResult && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={Target} label="Total Runs" value={simResult.totalRuns ?? 0} color="blue" />
            <StatCard icon={TrendingUp} label="Escalation Rate" value={`${((simResult.escalationRate ?? 0) * 100).toFixed(1)}%`} color="orange" />
            <StatCard icon={AlertTriangle} label="Under-Triage" value={simResult.underTriageCount ?? 0} color="red" />
            <StatCard icon={Shield} label="Over-Triage" value={simResult.overTriageCount ?? 0} color="green" />
          </div>

          {simResult.dispositionBreakdown && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Disposition Breakdown</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(simResult.dispositionBreakdown).map(([disp, count]: [string, any]) => (
                    <Badge key={disp} variant="secondary">{disp}: {count}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {simResult.topFailures?.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-500" /> Top Failures</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {simResult.topFailures.map((f: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded bg-muted/50" data-testid={`sim-failure-${i}`}>
                      <span className="text-sm">{f.complaint?.replace(/_/g, " ") ?? f.pack ?? "Unknown"}</span>
                      <Badge variant="destructive">{f.count ?? f.failures ?? 0} failures</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export default function PhysicianDashboard() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const seedMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/physician/seed"),
    onSuccess: async (res) => {
      const data = await res.json();
      toast({ title: "Demo data seeded", description: `${data.feedbackCount ?? 0} feedback + ${data.memoryCount ?? 0} memory cases` });
      qc.invalidateQueries({ queryKey: ["/api/physician/overview"] });
      qc.invalidateQueries({ queryKey: ["/api/physician/feedback/logs"] });
      qc.invalidateQueries({ queryKey: ["/api/physician/errors/detect"] });
      qc.invalidateQueries({ queryKey: ["/api/physician/memory/stats"] });
    },
    onError: (e: any) => toast({ title: "Seed failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3" data-testid="text-physician-title">
            <HeartPulse className="h-8 w-8 text-red-500" />
            Physician Control Center
          </h1>
          <p className="text-muted-foreground mt-1">Clinical Intelligence Dashboard — Monitor, Analyze, Improve</p>
        </div>
        <Button data-testid="button-seed-demo" variant="outline" onClick={() => seedMut.mutate()} disabled={seedMut.isPending}>
          {seedMut.isPending ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Seeding...</> : <><Microscope className="h-4 w-4 mr-2" /> Seed Demo Data</>}
        </Button>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="grid w-full grid-cols-3 md:grid-cols-7">
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="feedback" data-testid="tab-feedback">Feedback</TabsTrigger>
          <TabsTrigger value="errors" data-testid="tab-errors">Errors</TabsTrigger>
          <TabsTrigger value="improve" data-testid="tab-improve">Self-Improve</TabsTrigger>
          <TabsTrigger value="memory" data-testid="tab-memory">Case Memory</TabsTrigger>
          <TabsTrigger value="explain" data-testid="tab-explain">Explainability</TabsTrigger>
          <TabsTrigger value="simulate" data-testid="tab-simulate">Simulation</TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><OverviewPanel /></TabsContent>
        <TabsContent value="feedback"><FeedbackPanel /></TabsContent>
        <TabsContent value="errors"><ErrorDetectionPanel /></TabsContent>
        <TabsContent value="improve"><SelfImprovePanel /></TabsContent>
        <TabsContent value="memory"><CaseMemoryPanel /></TabsContent>
        <TabsContent value="explain"><ExplainabilityPanel /></TabsContent>
        <TabsContent value="simulate"><SimulationPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
