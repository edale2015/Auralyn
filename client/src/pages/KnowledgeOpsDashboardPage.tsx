import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart3, Database, AlertTriangle, CheckCircle, RefreshCw,
  Shield, Activity, FileText, Stethoscope, Pill, BookOpen, Search,
  TrendingUp, Info, Clock, ExternalLink, Brain, Zap, XCircle,
  AlertCircle, ChevronDown, ChevronRight,
} from "lucide-react";
import { Link } from "wouter";
import { ROUTES } from "@/routes/routeRegistry";
import { useState } from "react";

function StatCard({ icon: Icon, label, value, sub, color = "blue", href }: any) {
  const colorMap: Record<string, string> = {
    blue: "border-blue-200 dark:border-blue-800",
    green: "border-green-200 dark:border-green-800",
    red: "border-red-200 dark:border-red-800",
    yellow: "border-yellow-200 dark:border-yellow-800",
    purple: "border-purple-200 dark:border-purple-800",
  };
  const iconColor: Record<string, string> = {
    blue: "text-blue-600", green: "text-green-600", red: "text-red-600",
    yellow: "text-yellow-600", purple: "text-purple-600",
  };
  return (
    <Card className={`border-l-4 ${colorMap[color]}`}>
      <CardContent className="p-4 flex items-center gap-4">
        <div className="p-2 rounded-lg bg-muted/50">
          <Icon className={`h-6 w-6 ${iconColor[color]}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-sm text-muted-foreground">{label}</div>
          {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
        </div>
        {href && (
          <Link href={href}>
            <Button size="sm" variant="ghost"><ExternalLink className="h-4 w-4" /></Button>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

// ── Knowledge Health Panel ───────────────────────────────────────────────────

function CoverageGapList({ label, items, fixHref, icon: Icon = AlertTriangle }: {
  label: string; items: { complaintId: string; label: string }[]; fixHref: string; icon?: any;
}) {
  const [expanded, setExpanded] = useState(false);
  const ok = items.length === 0;
  return (
    <div className={`rounded-lg border p-3 ${ok ? "border-green-200 bg-green-50 dark:bg-green-950/30" : "border-red-200 bg-red-50 dark:bg-red-950/30"}`}>
      <button
        className="w-full flex items-center justify-between gap-2 text-left"
        onClick={() => setExpanded(e => !e)}
        data-testid={`coverage-gap-${label.replace(/\s+/g, "-").toLowerCase()}`}
      >
        <div className="flex items-center gap-2">
          {ok
            ? <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
            : <Icon className="h-4 w-4 text-red-600 shrink-0" />
          }
          <span className="text-sm font-medium">{label}</span>
          {!ok && <Badge className="bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 text-xs">{items.length}</Badge>}
        </div>
        {!ok && (expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />)}
      </button>
      {!ok && expanded && (
        <div className="mt-2 space-y-1">
          {items.map(i => (
            <div key={i.complaintId} className="flex items-center justify-between text-xs">
              <span className="font-mono text-muted-foreground">{i.complaintId}</span>
              <span>{i.label}</span>
            </div>
          ))}
          <Link href={fixHref}>
            <Button size="sm" variant="link" className="text-xs p-0 h-auto mt-1">Fix in KB Admin →</Button>
          </Link>
        </div>
      )}
    </div>
  );
}

function KnowledgeHealthPanel() {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/kb/health"],
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-12 animate-pulse bg-muted/40 rounded-lg" />
        ))}
      </div>
    );
  }
  if (!data) return <div className="text-sm text-muted-foreground">Health data unavailable</div>;

  const { bayesian, rules, coverage, pctKbDriven, pctFallback } = data;
  const isKbDriven = bayesian?.source === "KB_DB";

  return (
    <div className="space-y-5">
      {/* Bayesian source status */}
      <div className={`rounded-lg border p-4 flex items-start gap-3 ${isKbDriven ? "border-green-300 bg-green-50 dark:bg-green-950/30" : "border-red-300 bg-red-50 dark:bg-red-950/30"}`}>
        <Brain className={`h-5 w-5 mt-0.5 shrink-0 ${isKbDriven ? "text-green-600" : "text-red-600"}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">Bayesian Engine Source</span>
            <Badge className={isKbDriven ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200" : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"}>
              {bayesian?.source ?? "UNKNOWN"}
            </Badge>
            <Badge variant="outline" className="text-xs">{bayesian?.priorCount ?? 0} priors active</Badge>
          </div>
          {bayesian?.activatedAt && (
            <div className="text-xs text-muted-foreground mt-1">Activated: {new Date(bayesian.activatedAt).toLocaleString()}</div>
          )}
          {!isKbDriven && bayesian?.fallbackReason && (
            <div className="text-xs text-red-700 dark:text-red-300 mt-1 font-mono">{bayesian.fallbackReason}</div>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* KB coverage bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium flex items-center gap-1.5">
            <Zap className="h-4 w-4 text-yellow-500" /> Diagnosis Rules Coverage
          </span>
          <span className="text-muted-foreground">
            <span className="text-green-700 font-semibold">{rules?.diagnosisRulesWithLikelihoods ?? 0}</span>
            {" / "}
            <span>{rules?.diagnosisRulesTotal ?? 0}</span>
            {" have featureLikelihoods"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Progress value={pctKbDriven ?? 0} className="flex-1 h-3" />
          <span className="text-sm font-semibold w-14 text-right">
            <span className="text-green-700">{pctKbDriven ?? 0}%</span> KB
          </span>
        </div>
        <div className="text-xs text-muted-foreground">
          {rules?.diagnosisRulesMissingLikelihoods ?? 0} rules without featureLikelihoods — they will NOT be used by the Bayesian engine.
          {rules?.bayesianPriors != null && (
            <span className="ml-1 text-blue-600">{rules.bayesianPriors} are Bayesian priors (complaintId=bayesian_global).</span>
          )}
        </div>
      </div>

      {/* Rules missing likelihoods — sample */}
      {(rules?.diagnosisRulesMissingLikelihoods ?? 0) > 0 && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-950/30 p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-4 w-4 text-yellow-600 shrink-0" />
            <span className="text-sm font-semibold text-yellow-800 dark:text-yellow-200">
              {rules.diagnosisRulesMissingLikelihoods} rules missing featureLikelihoods (sample of up to 20):
            </span>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {(rules.missingLikelihoodsSample ?? []).map((r: any) => (
              <div key={r.ruleId} className="flex items-center gap-2 text-xs font-mono">
                <span className="text-muted-foreground w-32 truncate shrink-0">{r.ruleId}</span>
                <span className="text-yellow-800 dark:text-yellow-200 truncate">{r.diagnosisLabel}</span>
                <span className="text-muted-foreground shrink-0">[{r.complaintId}]</span>
              </div>
            ))}
          </div>
          <div className="text-xs text-yellow-700 dark:text-yellow-300 mt-2">
            To add featureLikelihoods: KB Admin → Diagnosis Rules → edit rule → set probability weights per symptom.
          </div>
        </div>
      )}

      {/* Coverage gaps */}
      <div className="space-y-2">
        <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Coverage Gaps</div>
        <CoverageGapList
          label="Complaints without red flag rules"
          items={coverage?.complaintsWithoutRedFlags ?? []}
          fixHref={ROUTES.KNOWLEDGE_BASE}
          icon={Shield}
        />
        <CoverageGapList
          label="Complaints without treatment rules"
          items={coverage?.complaintsWithoutTreatments ?? []}
          fixHref={ROUTES.KNOWLEDGE_BASE}
          icon={Pill}
        />
        <CoverageGapList
          label="Complaints without approved golden cases"
          items={coverage?.complaintsWithoutGoldenCases ?? []}
          fixHref={ROUTES.GOLDEN_CASES}
          icon={XCircle}
        />
        <CoverageGapList
          label="Complaints without disposition rules"
          items={coverage?.complaintsWithoutDisposition ?? []}
          fixHref={ROUTES.KNOWLEDGE_BASE}
          icon={FileText}
        />
      </div>
    </div>
  );
}

// ── Audit Report Panel ────────────────────────────────────────────────────────

function AuditReportPanel() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/kb/audit-report"] });
  const [showTrace, setShowTrace] = useState(false);

  if (isLoading) return <div className="text-sm text-muted-foreground animate-pulse">Loading audit report…</div>;
  if (!data) return null;

  const { summary, hardcodedLogicInventory, exampleTrace } = data;

  const riskColor = (risk: string) =>
    risk === "high" ? "text-red-600" : risk === "medium" ? "text-yellow-600" : "text-green-600";

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          { label: "Diagnosis engine KB-driven", ok: summary.diagnosisEngineKbDriven },
          { label: "All priors from DB", ok: summary.allPriorsFromDB },
          { label: "CSV does NOT affect live differential", ok: !summary.csvAffectsRuntimeDifferential },
        ].map(item => (
          <div key={item.label} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${item.ok ? "border-green-200 bg-green-50 dark:bg-green-950/30" : "border-red-200 bg-red-50 dark:bg-red-950/30"}`}>
            {item.ok
              ? <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
              : <XCircle className="h-4 w-4 text-red-600 shrink-0" />
            }
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      {/* Hardcoded inventory */}
      <div className="space-y-2">
        <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Remaining Hardcoded Logic</div>
        {(hardcodedLogicInventory ?? []).map((item: any) => (
          <div key={item.id} className="rounded-lg border border-border p-3 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <span className="font-mono text-xs font-semibold">{item.id}</span>
              <Badge className={`text-xs shrink-0 ${item.risk === "high" ? "bg-red-100 text-red-800" : item.risk === "medium" ? "bg-yellow-100 text-yellow-800" : "bg-green-100 text-green-800"}`}>
                {item.risk} risk
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground font-mono">{item.location}</div>
            <div className="text-xs">{item.description}</div>
            <div className="text-xs">
              <span className="font-medium">Status: </span>
              <span className={item.status.startsWith("INACTIVE") ? "text-green-700 dark:text-green-400" : "text-orange-700 dark:text-orange-400"}>
                {item.status}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              <span className="font-medium">Fix: </span>{item.remediation}
            </div>
          </div>
        ))}
      </div>

      {/* Example trace */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 p-3">
        <button
          className="flex items-center gap-2 text-sm font-semibold text-blue-800 dark:text-blue-200 w-full text-left"
          onClick={() => setShowTrace(t => !t)}
        >
          <Brain className="h-4 w-4" />
          KB Row → Diagnosis → Treatment → Disposition Example Trace
          {showTrace ? <ChevronDown className="h-4 w-4 ml-auto" /> : <ChevronRight className="h-4 w-4 ml-auto" />}
        </button>
        {showTrace && (
          <ol className="mt-3 space-y-1.5">
            {(exampleTrace?.steps ?? []).map((s: string, i: number) => (
              <li key={i} className="text-xs font-mono text-blue-800 dark:text-blue-200 leading-relaxed">{s}</li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

// ── Source Map Table ──────────────────────────────────────────────────────────

function SourceMapTable() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/kb/audit/source-map"],
  });

  if (isLoading) return <div className="text-center py-6 text-muted-foreground">Loading source map…</div>;
  if (!data) return null;

  const STATUS_CLASS = (editable: boolean) => editable
    ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
    : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";

  return (
    <div className="space-y-4">
      <div className={`rounded-lg border p-3 flex items-start gap-3 ${data.sheetsStatus.configured ? "border-green-300 bg-green-50 dark:bg-green-950" : "border-yellow-300 bg-yellow-50 dark:bg-yellow-950"}`}>
        <Info className="h-5 w-5 mt-0.5 flex-shrink-0 text-yellow-600" />
        <div>
          <div className="font-semibold text-sm">Google Sheets Status</div>
          <div className="text-sm text-muted-foreground mt-0.5">
            {data.sheetsStatus.configured ? "Active" : `Not configured — ${data.sheetsStatus.reason}`}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {data.sheetsStatus.activeAtRuntime ? "Sheets are active at runtime." : `Fallback: ${data.sheetsStatus.fallback}`}
          </div>
        </div>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {["Domain", "Current Source", "App-Editable", "CSV Fallback", "Hardcoded?", "Notes"].map(h => (
                <th key={h} className="text-left p-3 font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {(data.domains || []).map((d: any) => (
              <tr key={d.domain} className="hover:bg-muted/30">
                <td className="p-3 font-medium whitespace-nowrap">{d.domain}</td>
                <td className="p-3 text-xs font-mono">{d.source}</td>
                <td className="p-3">
                  <Badge className={STATUS_CLASS(d.editable)}>{d.editable ? "Yes" : "No"}</Badge>
                </td>
                <td className="p-3 text-xs text-muted-foreground">{d.csvFallback ?? "—"}</td>
                <td className="p-3 text-xs text-orange-600">{d.hardcoded ?? "—"}</td>
                <td className="p-3 text-xs text-muted-foreground max-w-[200px]">{d.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.hardcodedStillActive?.length > 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950 p-4">
          <div className="font-semibold text-sm text-orange-800 dark:text-orange-200 mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Hardcoded Medical Logic Still Active
          </div>
          <ul className="space-y-1">
            {data.hardcodedStillActive.map((item: string) => (
              <li key={item} className="text-xs text-orange-700 dark:text-orange-300 font-mono">{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Recent Changes ────────────────────────────────────────────────────────────

function RecentChanges() {
  const { data: rows = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/kb/changes?limit=20"],
  });

  const ACTION_COLORS: Record<string, string> = {
    create: "bg-green-100 text-green-800", update: "bg-blue-100 text-blue-800",
    delete: "bg-red-100 text-red-800", clone: "bg-purple-100 text-purple-800",
  };

  if (isLoading) return <div className="text-center py-4 text-muted-foreground">Loading…</div>;
  if (rows.length === 0) return <div className="text-center py-4 text-muted-foreground">No changes yet. Seed and edit knowledge to see the log.</div>;

  return (
    <div className="space-y-2">
      {rows.map((r: any) => (
        <div key={r.id} className="flex items-center gap-3 text-sm py-1.5 border-b last:border-b-0">
          <span className="text-xs text-muted-foreground whitespace-nowrap">{new Date(r.createdAt).toLocaleTimeString()}</span>
          <Badge className={ACTION_COLORS[r.action] ?? ""}>{r.action}</Badge>
          <Badge variant="outline" className="text-xs">{r.domain}</Badge>
          <span className="font-mono text-xs truncate flex-1">{r.recordId}</span>
          <span className="text-xs text-muted-foreground">{r.changedBy}</span>
        </div>
      ))}
    </div>
  );
}

// ── Pipeline Entry Points ─────────────────────────────────────────────────────

function PipelineEntryPoints() {
  const { data } = useQuery<any>({ queryKey: ["/api/kb/audit/source-map"] });
  if (!data) return null;
  const { verified = [], needsAudit = [] } = data.canonicalPipelineEntryPoints ?? {};
  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm font-medium text-green-700 dark:text-green-300 mb-2 flex items-center gap-1">
          <CheckCircle className="h-4 w-4" /> Verified canonical entry points
        </div>
        <div className="space-y-1">
          {verified.map((ep: string) => (
            <div key={ep} className="font-mono text-xs bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200 px-3 py-1.5 rounded">{ep}</div>
          ))}
        </div>
      </div>
      <div>
        <div className="text-sm font-medium text-yellow-700 dark:text-yellow-300 mb-2 flex items-center gap-1">
          <AlertTriangle className="h-4 w-4" /> Needs pipeline audit
        </div>
        <div className="space-y-1">
          {needsAudit.map((ep: string) => (
            <div key={ep} className="font-mono text-xs bg-yellow-50 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-200 px-3 py-1.5 rounded">{ep}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function KnowledgeOpsDashboardPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: stats, isLoading, refetch } = useQuery<any>({ queryKey: ["/api/kb/stats"] });

  const seed = useMutation({
    mutationFn: () => apiRequest("POST", "/api/kb/seed"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/kb"] });
      qc.invalidateQueries({ queryKey: ["/api/kb/health"] });
      qc.invalidateQueries({ queryKey: ["/api/kb/audit-report"] });
      toast({ title: "Seeded", description: "Knowledge base populated from existing data." });
    },
    onError: (e: any) => toast({ title: "Seed failed", description: e.message, variant: "destructive" }),
  });

  const reload = useMutation({
    mutationFn: () => apiRequest("POST", "/api/kb/cache-reload"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/kb/health"] });
      qc.invalidateQueries({ queryKey: ["/api/kb/audit-report"] });
      qc.invalidateQueries({ queryKey: ["/api/kb/cache-status"] });
      toast({ title: "Cache reloaded", description: "All clinical rules refreshed from DB." });
    },
    onError: () => toast({ title: "Reload failed", variant: "destructive" }),
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-blue-600" /> Knowledge Ops Dashboard
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Health, coverage, and source-of-truth metrics for the clinical knowledge base</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {stats?.complaints === 0 && (
            <Button onClick={() => seed.mutate()} disabled={seed.isPending} className="bg-amber-600 hover:bg-amber-700 text-white">
              <RefreshCw className="h-4 w-4 mr-1" /> Seed Knowledge Base
            </Button>
          )}
          <Button variant="outline" onClick={() => reload.mutate()} disabled={reload.isPending} data-testid="button-reload-cache">
            <RefreshCw className={`h-4 w-4 mr-1 ${reload.isPending ? "animate-spin" : ""}`} /> Reload Cache
          </Button>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh Stats
          </Button>
          <Link href={ROUTES.KNOWLEDGE_BASE}>
            <Button><Database className="h-4 w-4 mr-1" /> Open KB Admin</Button>
          </Link>
        </div>
      </div>

      {/* Stats row */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <Card key={i}><CardContent className="p-4 h-20 animate-pulse bg-muted/30" /></Card>)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={BookOpen} label="Active Complaints" value={stats?.activeComplaints ?? 0} sub={`of ${stats?.complaints ?? 0} total`} color="blue" href={ROUTES.KNOWLEDGE_BASE} />
          <StatCard icon={Shield} label="Approved Golden Cases" value={stats?.approvedGoldenCases ?? 0} sub={`of ${stats?.goldenCases ?? 0} total`} color="green" href={ROUTES.KNOWLEDGE_BASE} />
          <StatCard icon={AlertTriangle} label="Red Flag Rules" value={stats?.redFlags ?? 0} color="red" href={ROUTES.KNOWLEDGE_BASE} />
          <StatCard icon={Activity} label="Modifier Rules" value={stats?.modifiers ?? 0} color="purple" href={ROUTES.KNOWLEDGE_BASE} />
          <StatCard icon={Stethoscope} label="Diagnosis Rules" value={stats?.diagnosisRules ?? 0} color="blue" href={ROUTES.KNOWLEDGE_BASE} />
          <StatCard icon={Pill} label="Treatment Rules" value={stats?.treatmentRules ?? 0} color="green" href={ROUTES.KNOWLEDGE_BASE} />
          <StatCard icon={FileText} label="Disposition Rules" value={stats?.dispositionRules ?? 0} color="yellow" href={ROUTES.KNOWLEDGE_BASE} />
          <StatCard icon={Database} label="Knowledge Changes" value={stats?.knowledgeChanges ?? 0} sub="in audit log" color="purple" href={ROUTES.KNOWLEDGE_BASE} />
        </div>
      )}

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Knowledge Health Panel (NEW) ── */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-blue-600" /> Knowledge Health Panel
                <Badge variant="outline" className="ml-2 text-xs">Phase 2</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <KnowledgeHealthPanel />
            </CardContent>
          </Card>
        </div>

        {/* ── Audit Report ── */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-purple-600" /> Hardcoded Logic Audit Report
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AuditReportPanel />
            </CardContent>
          </Card>
        </div>

        {/* Source of Truth Map */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" /> Source-of-Truth Audit Map
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SourceMapTable />
            </CardContent>
          </Card>
        </div>

        {/* Recent Changes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" /> Recent Knowledge Changes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RecentChanges />
          </CardContent>
        </Card>

        {/* Pipeline Entry Points */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" /> Pipeline Entry Point Audit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PipelineEntryPoints />
          </CardContent>
        </Card>

        {/* Coverage Health Checklist */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" /> Coverage Health Checklist
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { label: "All active complaints have at least 1 golden case", ok: (stats?.approvedGoldenCases ?? 0) >= (stats?.activeComplaints ?? 0), fix: "Add golden cases in KB Admin → Golden Cases" },
                { label: "Red flag rules exist for all complaints", ok: (stats?.redFlags ?? 0) > 0, fix: "Add red flag rules in KB Admin → Red Flags" },
                { label: "Disposition rules cover all complaints", ok: (stats?.dispositionRules ?? 0) > 0, fix: "Add disposition rules in KB Admin → Disposition" },
                { label: "Treatment rules available", ok: (stats?.treatmentRules ?? 0) > 0, fix: "Add treatment rules in KB Admin → Treatment" },
                { label: "Diagnosis rules seeded", ok: (stats?.diagnosisRules ?? 0) > 0, fix: "Add or seed diagnosis rules" },
                { label: "Workup rules configured", ok: (stats?.workupRules ?? 0) > 0, fix: "Add workup rules in KB Admin → Workup Rules" },
                { label: "Modifier rules active", ok: (stats?.modifiers ?? 0) > 0, fix: "Seed modifiers in KB Admin" },
                { label: "Plan templates available", ok: (stats?.planTemplates ?? 0) > 0, fix: "Add plan templates in KB Admin → Plan Templates" },
              ].map(item => (
                <div key={item.label} className={`flex items-start gap-3 p-3 rounded-lg border ${item.ok ? "border-green-200 bg-green-50 dark:bg-green-950" : "border-red-200 bg-red-50 dark:bg-red-950"}`}>
                  {item.ok ? <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" /> : <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />}
                  <div>
                    <div className="text-sm font-medium">{item.label}</div>
                    {!item.ok && <div className="text-xs text-muted-foreground mt-0.5">Fix: {item.fix}</div>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* How-to guide */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" /> How to Add a New Complaint (No Code Required)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {[
                { n: 1, step: "Complaint Registry", desc: "Add the new complaint with ID, system, aliases, and scoring module." },
                { n: 2, step: "Core Questions", desc: "Add complaint-specific questions — set type, required status, and order." },
                { n: 3, step: "Modifiers", desc: "Configure modifier rules (pregnancy, CKD, penicillin allergy, etc.)." },
                { n: 4, step: "Red Flag Rules", desc: "Define HARD/SOFT triggers that escalate to ER_NOW or URGENT." },
                { n: 5, step: "Workup Rules", desc: "Add lab, imaging, and bedside test rules with modifier-aware overrides." },
                { n: 6, step: "Diagnosis Rules", desc: "Add differentials with base probabilities AND featureLikelihoods (required for Bayesian engine)." },
                { n: 7, step: "Treatment Rules", desc: "Add first-line and alternative medications with dosing and allergy adjustments." },
                { n: 8, step: "Disposition Rules", desc: "Define when each disposition fires — connect to red flag results and scores." },
                { n: 9, step: "Plan Templates", desc: "Add discharge text, home care instructions, return precautions." },
                { n: 10, step: "Golden Cases", desc: "Add ≥3 golden cases per complaint (one per severity/modifier). Set status to Approved." },
                { n: 11, step: "Simulation", desc: "Learning Console → Simulation — run 100+ cases and inspect failures." },
              ].map(item => (
                <div key={item.n} className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">{item.n}</div>
                  <div>
                    <span className="font-semibold text-sm">{item.step}</span>
                    <span className="text-sm text-muted-foreground ml-2">{item.desc}</span>
                  </div>
                </div>
              ))}
            </ol>
            <div className="mt-4">
              <Link href={ROUTES.KNOWLEDGE_BASE}>
                <Button className="w-full">Open Knowledge Base Admin <ExternalLink className="h-4 w-4 ml-2" /></Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
