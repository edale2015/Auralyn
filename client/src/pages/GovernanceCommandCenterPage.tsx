import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ShieldCheck, FileText, Activity, BarChart3, AlertTriangle, CheckCircle,
  XCircle, Download, RefreshCw, Loader2, Scale, TrendingUp, TrendingDown,
  Landmark, ClipboardCheck, AlertCircle, Info, Clock, User, Zap, Brain,
} from "lucide-react";

// ─── Shared helpers ────────────────────────────────────────────────────────────
function StatBox({ label, value, sub, color = "text-foreground" }: {
  label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="bg-muted/30 rounded-md p-3 space-y-0.5">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={cn("text-base font-bold font-mono", color)}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function SectionHeader({ icon: Icon, title, badge }: { icon: any; title: string; badge?: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
      <Icon size={14} className="text-primary/70" />
      <span className="text-xs font-semibold">{title}</span>
      {badge && <Badge variant="outline" className="ml-auto text-[9px] h-4 px-1.5">{badge}</Badge>}
    </div>
  );
}

function riskColor(level: string) {
  if (level === "high") return "text-red-400";
  if (level === "medium") return "text-yellow-400";
  return "text-green-400";
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 1: Audit Trail
// ─────────────────────────────────────────────────────────────────────────────
function AuditTrailTab() {
  const { toast } = useToast();
  const [filter, setFilter] = useState("all");

  const eventsQ = useQuery({
    queryKey: ["/api/governance/audit-events"],
    queryFn: () => apiRequest("GET", "/api/governance/audit-events").then(r => r.json()),
  });

  const reportMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/governance/audit-report", {}).then(r => r.json()),
    onSuccess: d => {
      if (d.ok) toast({ title: "Audit Report Generated", description: `${d.report.summary.total_changes} events summarised.` });
    },
  });

  const events: any[] = eventsQ.data?.events ?? [];
  const filtered = filter === "all" ? events : events.filter((e: any) => e.type === filter || e.source === filter);

  const sourceColor = (s: string) => s === "system" ? "text-blue-400" : s === "clinician" ? "text-purple-400" : "text-emerald-400";
  const typeColor = (t: string) => t === "override" ? "text-red-400" : t === "change" ? "text-yellow-400" : t === "learning" ? "text-emerald-400" : "text-muted-foreground";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <StatBox label="Total Events" value={events.length} color="text-blue-400" />
        <StatBox label="System Changes" value={events.filter((e: any) => e.source === "system").length} />
        <StatBox label="Clinician Changes" value={events.filter((e: any) => e.source === "clinician").length} color="text-purple-400" />
        <StatBox label="Override Events" value={events.filter((e: any) => e.type === "override").length}
          color={events.filter((e: any) => e.type === "override").length > 5 ? "text-red-400" : "text-green-400"} />
      </div>

      <Card className="border border-border/50">
        <SectionHeader icon={FileText} title="Audit Event Log" badge="Immutable" />
        <div className="p-3 flex gap-2 border-b border-border/30">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="h-7 text-xs w-40" data-testid="select-audit-filter">
              <SelectValue placeholder="Filter events" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Events</SelectItem>
              <SelectItem value="decision">Decisions</SelectItem>
              <SelectItem value="change">Changes</SelectItem>
              <SelectItem value="learning">Learning</SelectItem>
              <SelectItem value="override">Overrides</SelectItem>
              <SelectItem value="system">System Source</SelectItem>
              <SelectItem value="clinician">Clinician Source</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={reportMut.isPending}
            onClick={() => reportMut.mutate()} data-testid="button-generate-audit-report">
            {reportMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <ClipboardCheck size={11} />}
            Generate Report
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 ml-auto" onClick={() => eventsQ.refetch()} data-testid="button-refresh-audit">
            <RefreshCw size={11} /> Refresh
          </Button>
        </div>

        {eventsQ.isLoading ? (
          <div className="p-8 flex justify-center"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="divide-y divide-border/20 max-h-96 overflow-y-auto">
            {filtered.slice(0, 40).map((evt: any, i: number) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2 hover:bg-muted/20 transition-colors" data-testid={`audit-event-${i}`}>
                <span className={cn("text-[10px] font-mono uppercase w-16 shrink-0", typeColor(evt.type))}>{evt.type}</span>
                <span className="text-xs flex-1 truncate">{evt.entity} <span className="text-muted-foreground text-[10px]">#{evt.entity_id}</span></span>
                <span className={cn("text-[10px] shrink-0", sourceColor(evt.source))}>{evt.source}</span>
                <span className="text-[10px] text-muted-foreground shrink-0 w-20 text-right">
                  {evt.created_at ? new Date(evt.created_at).toLocaleDateString() : "—"}
                </span>
              </div>
            ))}
            {filtered.length === 0 && <div className="p-8 text-center text-xs text-muted-foreground">No events found</div>}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 2: Policy Optimization
// ─────────────────────────────────────────────────────────────────────────────
function PolicyOptimizationTab() {
  const { toast } = useToast();
  const [selectedPolicy, setSelectedPolicy] = useState("triage");
  const [result, setResult] = useState<any>(null);

  const policyQ = useQuery({
    queryKey: ["/api/governance/policy"],
    queryFn: () => apiRequest("GET", "/api/governance/policy").then(r => r.json()),
  });

  const optimizeMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/governance/policy/optimize", { policyName: selectedPolicy }).then(r => r.json()),
    onSuccess: d => {
      if (d.ok) { setResult(d); toast({ title: "Policy Optimized", description: d.message }); }
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const policies: any[] = policyQ.data?.policies ?? [];
  const updates: any[] = policyQ.data?.updates ?? [];
  const currentPolicy = policies.find(p => p.policy_name === selectedPolicy);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Card className="border border-border/50">
          <SectionHeader icon={Zap} title="Policy State" badge="Live" />
          <div className="p-4 space-y-3">
            <div className="flex gap-2 items-center">
              <Select value={selectedPolicy} onValueChange={setSelectedPolicy}>
                <SelectTrigger className="h-7 text-xs" data-testid="select-policy-name">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {policies.map(p => <SelectItem key={p.policy_name} value={p.policy_name}>{p.policy_name}</SelectItem>)}
                  {policies.length === 0 && <SelectItem value="triage">triage</SelectItem>}
                </SelectContent>
              </Select>
              <Button size="sm" className="h-7 text-xs gap-1" disabled={optimizeMut.isPending}
                onClick={() => optimizeMut.mutate()} data-testid="button-optimize-policy">
                {optimizeMut.isPending ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
                Optimize
              </Button>
            </div>

            {currentPolicy && (
              <div className="space-y-2">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Parameters</div>
                <div className="bg-muted/20 rounded-md p-2 space-y-1 max-h-40 overflow-y-auto">
                  {Object.entries(currentPolicy.parameters ?? {}).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-[11px]">
                      <span className="text-muted-foreground font-mono">{k}</span>
                      <span className="font-mono font-medium">{String(v)}</span>
                    </div>
                  ))}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-2">Performance</div>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(currentPolicy.performance ?? {}).map(([k, v]) => (
                    <div key={k} className="bg-muted/20 rounded p-1.5">
                      <div className="text-[9px] text-muted-foreground">{k.replace(/_/g, " ")}</div>
                      <div className="text-xs font-mono font-semibold">{String(v)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card className="border border-border/50">
          <SectionHeader icon={Brain} title="Optimization Result" />
          <div className="p-4">
            {!result && !optimizeMut.isPending && (
              <div className="text-center py-8 text-xs text-muted-foreground">
                Select a policy and click Optimize to see recommendations
              </div>
            )}
            {result && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  {result.safeToApply
                    ? <CheckCircle size={14} className="text-green-400" />
                    : <AlertTriangle size={14} className="text-yellow-400" />}
                  <span className="text-xs font-medium">{result.safeToApply ? "Applied Automatically" : "Requires Approval"}</span>
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {result.changes?.map((c: string, i: number) => (
                    <div key={i} className="flex gap-2 text-[11px] bg-muted/20 rounded p-2">
                      <TrendingUp size={11} className="text-emerald-400 shrink-0 mt-0.5" />
                      <span>{c}</span>
                    </div>
                  ))}
                  {result.requiresApproval?.length > 0 && result.requiresApproval.map((c: string, i: number) => (
                    <div key={i} className="flex gap-2 text-[11px] bg-yellow-500/10 rounded p-2 border border-yellow-500/20">
                      <AlertTriangle size={11} className="text-yellow-400 shrink-0 mt-0.5" />
                      <span className="text-yellow-300">{c}</span>
                    </div>
                  ))}
                </div>
                <div className="text-[10px] text-muted-foreground italic">{result.message}</div>
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card className="border border-border/50">
        <SectionHeader icon={Clock} title="Recent Policy Changes" badge={`${updates.length} updates`} />
        <div className="divide-y divide-border/20 max-h-48 overflow-y-auto">
          {updates.slice(0, 10).map((u: any, i: number) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2" data-testid={`policy-update-${i}`}>
              <span className="text-xs flex-1 font-medium">{u.policy_name}</span>
              <Badge variant="outline" className={cn("text-[9px] h-4 px-1.5",
                u.status === "approved" ? "border-green-500/30 text-green-400" :
                u.status === "requires_approval" ? "border-yellow-500/30 text-yellow-400" :
                "border-blue-500/30 text-blue-400")}>{u.status}</Badge>
              <span className="text-[10px] text-muted-foreground">{u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}</span>
            </div>
          ))}
          {updates.length === 0 && <div className="p-6 text-center text-xs text-muted-foreground">No policy updates yet — run optimizer to generate recommendations</div>}
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 3: FDA Submission Package
// ─────────────────────────────────────────────────────────────────────────────
function FDAPackageTab() {
  const { toast } = useToast();
  const [pkg, setPkg] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const r = await apiRequest("GET", "/api/governance/fda-package").then(r => r.json());
      if (r.ok) setPkg(r.package);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  };

  const download = () => {
    if (!pkg) return;
    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `fda_package_${pkg.version}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Card className="border border-border/50">
        <SectionHeader icon={ShieldCheck} title="FDA SaMD Submission Package" badge="Class II" />
        <div className="p-4 space-y-3">
          <div className="flex gap-2">
            <Button size="sm" className="h-8 text-xs gap-1.5" onClick={generate} disabled={loading} data-testid="button-generate-fda-package">
              {loading ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
              Generate Package
            </Button>
            {pkg && (
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={download} data-testid="button-download-fda-package">
                <Download size={12} /> Download JSON
              </Button>
            )}
          </div>

          {!pkg && !loading && (
            <div className="bg-muted/20 rounded-lg p-6 text-center space-y-2">
              <ShieldCheck size={32} className="mx-auto text-muted-foreground/40" />
              <div className="text-xs text-muted-foreground">Click Generate to build a submission-ready FDA SaMD package</div>
              <div className="text-[10px] text-muted-foreground">Includes: intended use, system description, validation metrics, risk analysis, audit summary</div>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center p-8 gap-2">
              <Loader2 size={18} className="animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">Building FDA package…</span>
            </div>
          )}

          {pkg && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <StatBox label="Version" value={pkg.version} color="text-blue-400" />
                <StatBox label="Device Class" value={pkg.device_class?.split(" ")[0] ?? "II"} />
                <StatBox label="Risk Level" value={pkg.risk_classification?.includes("Moderate") ? "Moderate" : "Low"} color="text-yellow-400" />
              </div>

              <div>
                <div className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wide">Intended Use</div>
                <div className="text-xs bg-muted/20 rounded p-2">{pkg.intended_use}</div>
              </div>

              <div>
                <div className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wide">Validation Metrics</div>
                <div className="grid grid-cols-4 gap-2">
                  {Object.entries(pkg.validation_metrics ?? {}).filter(([k]) => !["denial_rate","collection_rate","avg_reimbursement"].includes(k)).map(([k, v]) => (
                    <div key={k} className="bg-muted/20 rounded p-2">
                      <div className="text-[9px] text-muted-foreground">{k.replace(/_/g, " ")}</div>
                      <div className="text-xs font-mono font-semibold">{typeof v === "number" ? (v > 1 ? v : (v * 100).toFixed(1) + "%") : String(v)}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wide">Risk Analysis — {pkg.risk_analysis?.overall_risk}</div>
                <div className="space-y-1">
                  {pkg.risk_analysis?.hazards?.map((h: any) => (
                    <div key={h.id} className="flex gap-2 text-[11px] bg-muted/20 rounded p-2">
                      <Badge variant="outline" className="text-[9px] shrink-0">{h.id}</Badge>
                      <div className="flex-1">
                        <span className="font-medium">{h.description}</span>
                        <span className="text-muted-foreground"> — {h.mitigation}</span>
                      </div>
                      <Badge variant="outline" className={cn("text-[9px] shrink-0 h-4",
                        h.residual_risk === "Low" ? "border-green-500/30 text-green-400" : "border-yellow-500/30 text-yellow-400")}>
                        {h.residual_risk}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wide">Pipeline Layers</div>
                <div className="flex flex-wrap gap-1">
                  {pkg.system_description?.pipeline_layers?.map((l: string) => (
                    <Badge key={l} variant="outline" className="text-[9px]">{l}</Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 4: Quality & Payer Reports (HEDIS)
// ─────────────────────────────────────────────────────────────────────────────
function QualityPayerTab() {
  const { toast } = useToast();
  const [view, setView] = useState<"hedis" | "payer">("hedis");

  const hedisQ = useQuery({
    queryKey: ["/api/governance/quality-report"],
    queryFn: () => apiRequest("GET", "/api/governance/quality-report").then(r => r.json()),
  });

  const payerQ = useQuery({
    queryKey: ["/api/governance/payer-report"],
    queryFn: () => apiRequest("GET", "/api/governance/payer-report").then(r => r.json()),
  });

  const report = hedisQ.data?.report;
  const payerData = payerQ.data;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button size="sm" variant={view === "hedis" ? "default" : "outline"} className="h-7 text-xs"
          onClick={() => setView("hedis")} data-testid="button-view-hedis">HEDIS Quality</Button>
        <Button size="sm" variant={view === "payer" ? "default" : "outline"} className="h-7 text-xs"
          onClick={() => setView("payer")} data-testid="button-view-payer">Payer Intelligence</Button>
      </div>

      {view === "hedis" && (
        <div className="space-y-3">
          {hedisQ.isLoading ? <div className="flex justify-center p-8"><Loader2 size={20} className="animate-spin" /></div> : report && (
            <>
              <div className="grid grid-cols-4 gap-3">
                <StatBox label="Overall Grade" value={report.grade}
                  color={report.grade === "A" ? "text-green-400" : report.grade === "B" ? "text-blue-400" : report.grade === "C" ? "text-yellow-400" : "text-red-400"} />
                <StatBox label="HEDIS Pass Rate" value={`${report.pass_rate}%`}
                  color={report.pass_rate >= 80 ? "text-green-400" : "text-yellow-400"} />
                <StatBox label="Total Encounters" value={report.total_encounters || "N/A"} />
                <StatBox label="Payer Ready" value={report.payer_ready ? "YES" : "PENDING"}
                  color={report.payer_ready ? "text-green-400" : "text-yellow-400"} />
              </div>

              <Card className="border border-border/50">
                <SectionHeader icon={ClipboardCheck} title="HEDIS Quality Metrics" badge={report.period} />
                <div className="divide-y divide-border/20">
                  {report.metrics?.map((m: any) => (
                    <div key={m.id} className="flex items-center gap-3 px-4 py-3" data-testid={`hedis-metric-${m.id}`}>
                      <div className="shrink-0">
                        {m.status === "PASS" ? <CheckCircle size={14} className="text-green-400" />
                          : m.status === "WARN" ? <AlertTriangle size={14} className="text-yellow-400" />
                          : <XCircle size={14} className="text-red-400" />}
                      </div>
                      <div className="flex-1">
                        <div className="text-xs font-medium">{m.name}</div>
                        <div className="text-[10px] text-muted-foreground">{m.description}</div>
                      </div>
                      <div className="text-right shrink-0 space-y-0.5">
                        <div className="text-xs font-mono font-bold">{(m.rate * 100).toFixed(1)}%</div>
                        <div className="text-[10px] text-muted-foreground">Bench: {(m.benchmark * 100).toFixed(0)}%</div>
                      </div>
                      <div className="w-24 h-2 bg-muted/30 rounded-full overflow-hidden shrink-0">
                        <div className={cn("h-full rounded-full transition-all",
                          m.rate >= m.benchmark ? "bg-green-500" : m.rate >= m.benchmark * 0.9 ? "bg-yellow-500" : "bg-red-500")}
                          style={{ width: `${Math.min(100, m.rate * 100)}%` }} />
                      </div>
                      <Badge variant="outline" className={cn("text-[9px] h-4 px-1.5 shrink-0",
                        m.status === "PASS" ? "border-green-500/30 text-green-400" :
                        m.status === "WARN" ? "border-yellow-500/30 text-yellow-400" :
                        "border-red-500/30 text-red-400")}>{m.status}</Badge>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}
        </div>
      )}

      {view === "payer" && (
        <div className="space-y-3">
          {payerQ.isLoading ? <div className="flex justify-center p-8"><Loader2 size={20} className="animate-spin" /></div> : payerData && (
            <>
              <div className="grid grid-cols-4 gap-3">
                <StatBox label="Total Visits" value={payerData.overall?.total_visits?.toLocaleString() ?? "—"} />
                <StatBox label="Best Payer" value={payerData.overall?.best_payer ?? "—"} color="text-green-400" />
                <StatBox label="Avg Denial Rate" value={`${((payerData.overall?.avg_denial_rate ?? 0) * 100).toFixed(1)}%`}
                  color={(payerData.overall?.avg_denial_rate ?? 0) < 0.10 ? "text-green-400" : "text-yellow-400"} />
                <StatBox label="Total Net Revenue" value={`$${((payerData.overall?.total_net_revenue ?? 0) / 1000).toFixed(0)}K`} color="text-blue-400" />
              </div>

              <Card className="border border-border/50">
                <SectionHeader icon={Landmark} title="Payer Performance Matrix" badge="Monthly" />
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/30">
                        {["Payer","Volume","Avg Cost","Denial Rate","Outcome Score","Net Revenue","Strategy"].map(h => (
                          <th key={h} className="text-left px-3 py-2 text-[10px] text-muted-foreground font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                      {payerData.payers?.map((p: any) => (
                        <tr key={p.payer} className="hover:bg-muted/20 transition-colors" data-testid={`payer-row-${p.payer.toLowerCase()}`}>
                          <td className="px-3 py-2 font-medium">{p.payer}</td>
                          <td className="px-3 py-2 font-mono">{p.visitVolume}</td>
                          <td className="px-3 py-2 font-mono">${p.avg_cost}</td>
                          <td className={cn("px-3 py-2 font-mono", p.denial_rate < 0.08 ? "text-green-400" : "text-yellow-400")}>
                            {(p.denial_rate * 100).toFixed(1)}%
                          </td>
                          <td className="px-3 py-2 font-mono">{(p.outcome_score * 100).toFixed(0)}%</td>
                          <td className="px-3 py-2 font-mono text-blue-400">${(p.net_revenue / 1000).toFixed(0)}K</td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className="text-[9px]">{p.recommended_strategy}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 5: Malpractice Risk Scoring
// ─────────────────────────────────────────────────────────────────────────────
function MalpracticeRiskTab() {
  const { toast } = useToast();
  const [form, setForm] = useState({ caseId: "", clinicianId: "DR-001", redFlagMissed: false, uncertainty: "0.2", overrideUsed: false });
  const [scoreResult, setScoreResult] = useState<any>(null);

  const riskQ = useQuery({
    queryKey: ["/api/governance/malpractice"],
    queryFn: () => apiRequest("GET", "/api/governance/malpractice").then(r => r.json()),
  });

  const scoreMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/governance/malpractice/score", {
      caseId: form.caseId || `MANUAL-${Date.now()}`,
      clinicianId: form.clinicianId,
      redFlagMissed: form.redFlagMissed,
      uncertainty: parseFloat(form.uncertainty),
      overrideUsed: form.overrideUsed,
    }).then(r => r.json()),
    onSuccess: d => { if (d.ok) { setScoreResult(d); riskQ.refetch(); } },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const scores: any[] = riskQ.data?.scores ?? [];
  const stats = riskQ.data?.stats ?? {};

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatBox label="Total Scored" value={scores.length} />
        <StatBox label="High Risk Cases" value={stats.highRiskCount ?? 0}
          color={(stats.highRiskCount ?? 0) > 0 ? "text-red-400" : "text-green-400"} />
        <StatBox label="Avg Risk Score" value={`${((stats.avgScore ?? 0) * 100).toFixed(1)}%`}
          color={(stats.avgScore ?? 0) > 0.4 ? "text-yellow-400" : "text-green-400"} />
      </div>

      {stats.criticalAlert && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <AlertCircle size={14} className="text-red-400 shrink-0" />
          <span className="text-xs text-red-300">⚠ Critical Alert: {stats.highRiskCount} high-risk cases detected — immediate clinical review recommended</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Card className="border border-border/50">
          <SectionHeader icon={Scale} title="Score New Case" />
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[10px]">Case ID (optional)</Label>
                <Input value={form.caseId} onChange={e => setForm(f => ({ ...f, caseId: e.target.value }))}
                  placeholder="e.g. CASE-1042" className="h-7 text-xs" data-testid="input-case-id" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Clinician ID</Label>
                <Input value={form.clinicianId} onChange={e => setForm(f => ({ ...f, clinicianId: e.target.value }))}
                  placeholder="DR-001" className="h-7 text-xs" data-testid="input-clinician-id-mal" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Diagnostic Uncertainty (0-1)</Label>
              <Input type="number" min="0" max="1" step="0.05" value={form.uncertainty}
                onChange={e => setForm(f => ({ ...f, uncertainty: e.target.value }))}
                className="h-7 text-xs" data-testid="input-uncertainty" />
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={form.redFlagMissed}
                  onChange={e => setForm(f => ({ ...f, redFlagMissed: e.target.checked }))}
                  data-testid="check-red-flag-missed" />
                Red Flag Missed
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={form.overrideUsed}
                  onChange={e => setForm(f => ({ ...f, overrideUsed: e.target.checked }))}
                  data-testid="check-override-used" />
                Override Used
              </label>
            </div>
            <Button size="sm" className="w-full h-8 text-xs gap-1.5" disabled={scoreMut.isPending}
              onClick={() => scoreMut.mutate()} data-testid="button-score-malpractice">
              {scoreMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Scale size={12} />}
              Score Case
            </Button>

            {scoreResult && (
              <div className="bg-muted/20 rounded-md p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className={cn("text-lg font-bold font-mono", riskColor(scoreResult.riskLevel))}>
                    {(scoreResult.riskScore * 100).toFixed(1)}%
                  </span>
                  <Badge variant="outline" className={cn("text-[10px]", riskColor(scoreResult.riskLevel))}>
                    {scoreResult.riskLevel} risk
                  </Badge>
                </div>
                <div className="space-y-1">
                  {scoreResult.drivers?.map((d: string, i: number) => (
                    <div key={i} className="text-[11px] flex gap-1.5 text-muted-foreground">
                      <AlertTriangle size={10} className={cn("mt-0.5 shrink-0", riskColor(scoreResult.riskLevel))} />
                      {d}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card className="border border-border/50">
          <SectionHeader icon={AlertTriangle} title="Risk Score History" badge={`${scores.length} cases`} />
          <div className="divide-y divide-border/20 max-h-80 overflow-y-auto">
            {scores.slice(0, 15).map((s: any, i: number) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2" data-testid={`malpractice-score-${i}`}>
                <div className={cn("w-2 h-2 rounded-full shrink-0",
                  s.risk_level === "high" ? "bg-red-400" : s.risk_level === "medium" ? "bg-yellow-400" : "bg-green-400")} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-mono truncate">{s.case_id}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{(s.drivers ?? []).slice(0, 2).join(" · ")}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className={cn("text-xs font-bold font-mono", riskColor(s.risk_level))}>
                    {(parseFloat(s.risk_score) * 100).toFixed(0)}%
                  </div>
                  <div className="text-[9px] text-muted-foreground">{s.clinician_id}</div>
                </div>
              </div>
            ))}
            {scores.length === 0 && (
              <div className="p-8 text-center text-xs text-muted-foreground">No risk scores yet — score a case to populate history</div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
export default function GovernanceCommandCenterPage() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      <div className="px-6 py-4 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-3">
          <ShieldCheck size={20} className="text-primary" />
          <div>
            <h1 className="text-lg font-bold" data-testid="heading-governance">Governance Command Center</h1>
            <p className="text-xs text-muted-foreground">Audit automation · Policy optimization · FDA packaging · HEDIS quality · Malpractice risk</p>
          </div>
          <div className="ml-auto flex gap-2">
            <Badge variant="outline" className="text-[10px] border-green-500/30 text-green-400">HIPAA Compliant</Badge>
            <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-400">21 CFR Part 11</Badge>
            <Badge variant="outline" className="text-[10px] border-purple-500/30 text-purple-400">SaMD Class II</Badge>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <Tabs defaultValue="audit" className="space-y-4">
          <TabsList className="h-8 text-xs">
            <TabsTrigger value="audit" className="text-xs h-6 px-3" data-testid="tab-audit">
              <FileText size={11} className="mr-1.5" /> Audit Trail
            </TabsTrigger>
            <TabsTrigger value="policy" className="text-xs h-6 px-3" data-testid="tab-policy">
              <Zap size={11} className="mr-1.5" /> Policy Optimization
            </TabsTrigger>
            <TabsTrigger value="fda" className="text-xs h-6 px-3" data-testid="tab-fda">
              <ShieldCheck size={11} className="mr-1.5" /> FDA Package
            </TabsTrigger>
            <TabsTrigger value="quality" className="text-xs h-6 px-3" data-testid="tab-quality">
              <BarChart3 size={11} className="mr-1.5" /> Quality & Payer
            </TabsTrigger>
            <TabsTrigger value="malpractice" className="text-xs h-6 px-3" data-testid="tab-malpractice">
              <Scale size={11} className="mr-1.5" /> Malpractice Risk
            </TabsTrigger>
          </TabsList>

          <TabsContent value="audit"><AuditTrailTab /></TabsContent>
          <TabsContent value="policy"><PolicyOptimizationTab /></TabsContent>
          <TabsContent value="fda"><FDAPackageTab /></TabsContent>
          <TabsContent value="quality"><QualityPayerTab /></TabsContent>
          <TabsContent value="malpractice"><MalpracticeRiskTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
