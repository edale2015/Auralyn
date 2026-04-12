import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldCheck, ShieldAlert, FileCheck, RefreshCw, Activity,
  CheckCircle2, XCircle, Lock, AlertTriangle,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function GradeBadge({ grade }: { grade?: string }) {
  const map: Record<string, string> = {
    A: "bg-green-600 text-white",
    B: "bg-blue-600 text-white",
    C: "bg-yellow-500 text-black",
    F: "bg-red-600 text-white",
  };
  return (
    <span
      data-testid={`badge-grade-${grade}`}
      className={`inline-flex items-center justify-center w-10 h-10 rounded-full font-bold text-lg ${map[grade ?? "F"] ?? "bg-gray-300"}`}
    >
      {grade ?? "—"}
    </span>
  );
}

function pct(n: number) { return `${(n * 100).toFixed(1)}%`; }

// ─── FDA Report Panel ─────────────────────────────────────────────────────────
function FDAReportPanel() {
  const { toast } = useToast();

  const { data: report, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/fda/report"],
  });

  const { mutate: runAndReport, isPending } = useMutation({
    mutationFn: () => apiRequest("POST", "/api/fda/run-and-report", {}),
    onSuccess:  () => {
      toast({ title: "FDA validation complete" });
      refetch();
    },
    onError: (err: any) => toast({ title: "Run failed", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button data-testid="button-run-fda" onClick={() => runAndReport()} disabled={isPending || isLoading}>
          {isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <FileCheck className="mr-2 h-4 w-4" />}
          Run Golden Cases + Generate Report
        </Button>
        <Button data-testid="button-refresh-fda" variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {report && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="border rounded-lg p-4 bg-muted/30 flex items-center gap-6">
            <GradeBadge grade={report.readinessGrade} />
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                {report.fdaReady
                  ? <ShieldCheck className="h-5 w-5 text-green-500" />
                  : <ShieldAlert  className="h-5 w-5 text-red-500" />}
                <span className="font-semibold text-sm" data-testid="text-fda-ready">
                  FDA SaMD Class II: {report.fdaReady ? "READY" : "NOT READY"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Accuracy: <strong data-testid="text-fda-accuracy">{pct(report.accuracy)}</strong> &nbsp;|&nbsp;
                {report.passed}/{report.totalCases} passed &nbsp;|&nbsp;
                High-risk failures: <strong data-testid="text-fda-critical">{report.highRiskFailures}</strong>
              </p>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Total Cases",          value: report.totalCases,       id: "total" },
              { label: "Passed",               value: report.passed,           id: "passed" },
              { label: "Failed",               value: report.failed,           id: "failed" },
              { label: "High-Risk Misses",     value: report.highRiskFailures, id: "high-risk" },
              { label: "Accuracy",             value: pct(report.accuracy),    id: "accuracy" },
              { label: "Readiness Grade",      value: report.readinessGrade,   id: "grade" },
            ].map(({ label, value, id }) => (
              <div key={id} className="border rounded p-3 text-center">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-bold mt-1" data-testid={`text-fda-${id}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Critical misses */}
          {report.criticalMisses?.length > 0 && (
            <div className="border border-red-300 dark:border-red-800 rounded p-3 bg-red-50 dark:bg-red-950/30">
              <p className="text-sm font-medium text-red-700 dark:text-red-400 flex items-center gap-2">
                <XCircle className="h-4 w-4" /> Missed ED-Now Dispositions (Critical)
              </p>
              <ul className="mt-1 space-y-0.5">
                {report.criticalMisses.map((id: string) => (
                  <li key={id} className="text-xs text-red-600 dark:text-red-400 font-mono" data-testid={`miss-${id}`}>{id}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommendations */}
          {report.recommendations?.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Recommendations</p>
              {report.recommendations.map((r: string, i: number) => (
                <p key={i} className="text-xs flex items-start gap-1.5" data-testid={`rec-${i}`}>
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-yellow-500" />
                  {r}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {!report && !isLoading && (
        <p className="text-sm text-muted-foreground">No validation runs yet. Click the button above to start.</p>
      )}
    </div>
  );
}

// ─── Audit Hash Chain Panel ───────────────────────────────────────────────────
function HashChainPanel() {
  const { toast } = useToast();

  const { data, isLoading, refetch } = useQuery<any>({
    queryKey:  ["/api/fda/audit-chain/verify"],
    refetchInterval: 15000,
  });

  const { data: chainData, refetch: refetchChain, isFetching: chainFetching } = useQuery<any>({
    queryKey:  ["/api/fda/audit-chain"],
    enabled:   false,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" data-testid="button-verify-chain" onClick={() => refetch()} disabled={isLoading}>
          <Lock className="mr-2 h-3.5 w-3.5" /> Verify Chain Integrity
        </Button>
        <Button variant="outline" size="sm" data-testid="button-view-chain" onClick={() => refetchChain()} disabled={chainFetching}>
          {chainFetching ? <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
          View Full Chain
        </Button>
      </div>

      {data && (
        <div className={`border rounded-lg p-4 flex items-center gap-4 ${data.valid ? "bg-green-50 border-green-300 dark:bg-green-950/30 dark:border-green-800" : "bg-red-50 border-red-300 dark:bg-red-950/30 dark:border-red-800"}`}>
          {data.valid
            ? <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400 shrink-0" />
            : <XCircle      className="h-8 w-8 text-red-600 dark:text-red-400 shrink-0" />}
          <div>
            <p className="font-semibold text-sm" data-testid="text-chain-valid">
              Chain: {data.valid ? "INTACT — No tampering detected" : "COMPROMISED — Hash mismatch detected"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {data.length} records &nbsp;|&nbsp; Latest hash: <span className="font-mono text-xs" data-testid="text-chain-hash">{data.latest?.hash?.slice(0, 16) ?? "—"}…</span>
            </p>
          </div>
        </div>
      )}

      {chainData && (
        <div className="border rounded p-3 max-h-60 overflow-y-auto">
          <p className="text-xs font-medium mb-2">Audit Chain ({chainData.chain?.length} records)</p>
          {chainData.chain?.slice(-10).map((r: any) => (
            <div key={r.id} className="text-xs font-mono py-0.5 flex items-center gap-2 border-b last:border-0" data-testid={`chain-record-${r.id}`}>
              <span className="text-muted-foreground w-6 shrink-0">#{r.id}</span>
              <span className="truncate text-foreground">{r.hash.slice(0, 20)}…</span>
              <span className="text-muted-foreground shrink-0">{(r.data as any)?.step ?? "—"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Drift Detection Panel ────────────────────────────────────────────────────
function DriftPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [complaint, setComplaint] = useState("");
  const [avgConf,   setAvgConf]   = useState("0.85");
  const [avgRisk,   setAvgRisk]   = useState("0.1");

  const { data: globalDrift, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/drift"],
  });

  const { data: specificDrift, refetch: refetchSpecific, isFetching: specificFetching } = useQuery<any>({
    queryKey: ["/api/drift", complaint],
    enabled:  false,
  });

  const { mutate: recordMetric, isPending } = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/drift/record", {
        complaint,
        avgConfidence: Number(avgConf),
        avgRisk:       Number(avgRisk),
      }),
    onSuccess: () => {
      toast({ title: "Drift metric recorded" });
      queryClient.invalidateQueries({ queryKey: ["/api/drift"] });
    },
    onError: (err: any) => toast({ title: "Record failed", description: err.message, variant: "destructive" }),
  });

  function DriftCard({ data, label }: { data: any; label: string }) {
    if (!data) return null;
    return (
      <div className={`border rounded-lg p-4 ${data.drift ? "border-orange-400 bg-orange-50 dark:bg-orange-950/30" : "border-green-300 bg-green-50 dark:bg-green-950/20"}`}>
        <div className="flex items-center gap-2 mb-2">
          {data.drift
            ? <AlertTriangle className="h-4 w-4 text-orange-500" />
            : <CheckCircle2  className="h-4 w-4 text-green-500" />}
          <span className="text-sm font-medium" data-testid={`text-drift-${label}`}>
            {label}: {data.drift ? "DRIFT DETECTED" : "Stable"}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
          <div>Recent avg<br /><strong>{data.recentAvg?.toFixed(3)}</strong></div>
          <div>Older avg<br /><strong>{data.olderAvg?.toFixed(3)}</strong></div>
          <div>Delta<br /><strong>{data.difference?.toFixed(3)}</strong></div>
        </div>
        {data.details && <p className="text-xs mt-2 text-muted-foreground">{data.details}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Record a metric */}
      <div className="border rounded-lg p-4 space-y-3">
        <p className="text-sm font-medium">Record Drift Metric</p>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-xs text-muted-foreground">Complaint</label>
            <Input data-testid="input-drift-complaint" value={complaint} onChange={(e) => setComplaint(e.target.value)} placeholder="e.g. cough" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Avg Confidence</label>
            <Input data-testid="input-drift-confidence" value={avgConf} onChange={(e) => setAvgConf(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Avg Risk (0–1)</label>
            <Input data-testid="input-drift-risk" value={avgRisk} onChange={(e) => setAvgRisk(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button data-testid="button-record-drift" size="sm" onClick={() => recordMetric()} disabled={isPending || !complaint}>
            {isPending ? <RefreshCw className="mr-2 h-3 w-3 animate-spin" /> : <Activity className="mr-2 h-3 w-3" />}
            Record Metric
          </Button>
          <Button data-testid="button-check-complaint-drift" size="sm" variant="outline" onClick={() => refetchSpecific()} disabled={specificFetching || !complaint}>
            Check Complaint Drift
          </Button>
        </div>
      </div>

      {/* Global drift */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium">Global Drift (all complaints)</p>
          <Button data-testid="button-refresh-drift" variant="ghost" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
        <DriftCard data={globalDrift} label="Global" />
      </div>

      {/* Complaint-specific drift */}
      {specificDrift && (
        <div>
          <p className="text-sm font-medium mb-2">Drift for: <span className="font-mono">{complaint}</span></p>
          <DriftCard data={specificDrift} label={complaint} />
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SystemValidationDashboard() {
  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="heading-system-validation">
          System Validation Dashboard
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          FDA SaMD readiness · Immutable audit hash chain · Confidence drift detection
        </p>
      </div>

      <Tabs defaultValue="fda">
        <TabsList data-testid="tabs-validation">
          <TabsTrigger value="fda"    data-testid="tab-fda">FDA Validation</TabsTrigger>
          <TabsTrigger value="chain"  data-testid="tab-chain">Audit Chain</TabsTrigger>
          <TabsTrigger value="drift"  data-testid="tab-drift">Drift Detection</TabsTrigger>
        </TabsList>

        <TabsContent value="fda">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" /> FDA SaMD Class II Validation Engine
              </CardTitle>
            </CardHeader>
            <CardContent><FDAReportPanel /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="chain">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Lock className="h-4 w-4" /> Immutable Audit Hash Chain
              </CardTitle>
            </CardHeader>
            <CardContent><HashChainPanel /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="drift">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4" /> Confidence Drift Detection
              </CardTitle>
            </CardHeader>
            <CardContent><DriftPanel /></CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
