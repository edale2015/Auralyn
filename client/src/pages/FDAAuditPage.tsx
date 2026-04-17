import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ShieldCheck, ShieldAlert, FileText, Link2, AlertTriangle,
  Download, RefreshCw, ChevronDown, ChevronUp, CheckCircle,
  XCircle, Clock, Layers, BookOpen, Activity, Globe
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ComplianceControl {
  id:       string;
  label?:   string;
  section?: string;
  status:   "COMPLIANT" | "IN_PROGRESS" | "N/A";
  evidence?: string;
  notes?:   string;
}

interface ChainReport {
  algorithm:   string;
  length:      number;
  integrity:   "VALID" | "BROKEN";
  lastEntryId: string;
  verifiedAt:  string;
}

interface AuditEvent {
  id:           string;
  encounter_id: string;
  patient_id:   string;
  clinic_id:    string;
  confidence:   number;
  flagged:      boolean;
  created_at:   string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBadge(s: string) {
  if (s === "COMPLIANT")    return <Badge className="bg-emerald-900 text-emerald-200 text-xs shrink-0">COMPLIANT</Badge>;
  if (s === "IN_PROGRESS")  return <Badge className="bg-amber-900 text-amber-200 text-xs shrink-0">IN PROGRESS</Badge>;
  return                           <Badge className="bg-slate-700 text-slate-400 text-xs shrink-0">N/A</Badge>;
}

function scoreBar(pass: number, total: number, color: string) {
  const pct = total > 0 ? Math.round((pass / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-400 w-16 text-right">{pass}/{total} ({pct}%)</span>
    </div>
  );
}

// ── Controls accordion ────────────────────────────────────────────────────────

function ControlList({ controls }: { controls: ComplianceControl[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      {controls.map(c => (
        <div key={c.id} className="border border-slate-800 rounded">
          <button
            data-testid={`control-row-${c.id.replace(".", "-")}`}
            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-800/50 transition-colors"
            onClick={() => setOpen(open === c.id ? null : c.id)}
          >
            {statusBadge(c.status)}
            <span className="text-xs font-mono text-slate-500 w-14 shrink-0">{c.id}</span>
            <span className="text-xs text-slate-300 flex-1 min-w-0 truncate">{c.label ?? c.section}</span>
            {open === c.id ? <ChevronUp className="w-3.5 h-3.5 text-slate-500 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
          </button>
          {open === c.id && (
            <div className="px-3 pb-2 text-xs text-slate-400 border-t border-slate-800 pt-2">
              {c.evidence ?? c.notes}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FDAAuditPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"summary" | "part11" | "part820" | "iber" | "events" | "chain">("summary");

  const summary = useQuery<any>({ queryKey: ["/api/fda-audit/summary"] });
  const part11  = useQuery<any>({ queryKey: ["/api/fda-audit/part11"],  enabled: activeTab === "part11" });
  const part820 = useQuery<any>({ queryKey: ["/api/fda-audit/part820"], enabled: activeTab === "part820" });
  const iber    = useQuery<any>({ queryKey: ["/api/fda-audit/iber"],    enabled: activeTab === "iber" });
  const chain   = useQuery<any>({ queryKey: ["/api/fda-audit/chain"],   enabled: activeTab === "chain" });
  const events  = useQuery<any>({ queryKey: ["/api/fda-audit/events"],  enabled: activeTab === "events" });
  const anomalies = useQuery<any>({ queryKey: ["/api/fda-audit/anomalies"] });

  const exportMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/fda-audit/export", {}),
    onSuccess:  () => toast({ title: "Export generated", description: "FDA audit package ready for download." }),
    onError:    (e: any) => toast({ title: "Export failed", description: e?.message ?? "Unknown error", variant: "destructive" }),
  });

  const tabs = [
    { id: "summary", label: "Summary",   icon: ShieldCheck },
    { id: "part11",  label: "Part 11",   icon: FileText },
    { id: "part820", label: "Part 820",  icon: Layers },
    { id: "iber",    label: "IBER",      icon: BookOpen },
    { id: "events",  label: "Audit Log", icon: Activity },
    { id: "chain",   label: "Chain",     icon: Link2 },
  ] as const;

  const s = summary.data?.summary;
  const anoms: AuditEvent[] = anomalies.data?.anomalies ?? [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 lg:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-400" />
            FDA Audit — 21 CFR Part 11 / Part 820
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Auralyn SaMD · De Novo Pathway · {s?.submissionStatus ?? "Loading…"}
          </p>
        </div>
        <Button
          data-testid="button-export-fda"
          size="sm"
          className="bg-blue-700 hover:bg-blue-800 text-white gap-1.5"
          disabled={exportMutation.isPending}
          onClick={() => exportMutation.mutate()}
        >
          <Download className="w-3.5 h-3.5" />
          {exportMutation.isPending ? "Generating…" : "Export Package"}
        </Button>
      </div>

      {/* Anomaly banner */}
      {anoms.length > 0 && (
        <div className="mb-4 flex items-center gap-2 bg-amber-950 border border-amber-800 rounded px-3 py-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="text-xs text-amber-300">
            {anoms.length} audit anomal{anoms.length === 1 ? "y" : "ies"} detected (low confidence or flagged) — review required.
          </span>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 mb-4 flex-wrap">
        {tabs.map(t => (
          <button
            key={t.id}
            data-testid={`tab-${t.id}`}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeTab === t.id
                ? "bg-slate-700 text-white"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Summary ── */}
      {activeTab === "summary" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Submission status */}
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Globe className="w-4 h-4 text-blue-400" /> Regulatory Submission
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {summary.isLoading ? (
                <div className="flex items-center gap-2 text-slate-500 text-xs"><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading…</div>
              ) : (
                <>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Pathway</span>
                    <span className="text-slate-200 font-medium">{s?.regulatoryPathway}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Status</span>
                    <Badge className="bg-blue-900 text-blue-200 text-xs">{s?.submissionStatus}</Badge>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Q-Sub Number</span>
                    <span className="text-slate-300 font-mono">{s?.qsubNumber}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Adverse Events</span>
                    <span className="text-emerald-400 font-bold">{s?.adverseEvents ?? 0}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Part 11 score */}
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <FileText className="w-4 h-4 text-purple-400" /> 21 CFR Part 11
              </CardTitle>
            </CardHeader>
            <CardContent>
              {summary.isLoading ? (
                <p className="text-xs text-slate-500">Loading…</p>
              ) : (
                <>
                  <p className="text-2xl font-bold text-emerald-400">{s?.part11Compliant}</p>
                  <p className="text-xs text-slate-500 mb-2">controls compliant</p>
                  {scoreBar(
                    Number(s?.part11Compliant?.split("/")[0] ?? 0),
                    Number(s?.part11Compliant?.split("/")[1] ?? 1),
                    "bg-emerald-500"
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Part 820 score */}
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" /> 21 CFR Part 820 QSR
              </CardTitle>
            </CardHeader>
            <CardContent>
              {summary.isLoading ? (
                <p className="text-xs text-slate-500">Loading…</p>
              ) : (
                <>
                  <p className="text-2xl font-bold text-cyan-400">{s?.part820Compliant}</p>
                  <p className="text-xs text-slate-500 mb-2">controls compliant</p>
                  {scoreBar(
                    Number(s?.part820Compliant?.split("/")[0] ?? 0),
                    Number(s?.part820Compliant?.split("/")[1] ?? 1),
                    "bg-cyan-500"
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Chain integrity */}
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Link2 className="w-4 h-4 text-amber-400" /> Audit Chain
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {summary.isLoading ? <p className="text-xs text-slate-500">Loading…</p> : (
                <>
                  <div className="flex items-center gap-2">
                    {s?.chainIntegrity === "VALID"
                      ? <CheckCircle className="w-5 h-5 text-emerald-400" />
                      : <XCircle className="w-5 h-5 text-red-400" />}
                    <span className={`text-sm font-bold ${s?.chainIntegrity === "VALID" ? "text-emerald-400" : "text-red-400"}`}>
                      {s?.chainIntegrity}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">{s?.totalAuditEvents?.toLocaleString()} events · SHA-256</p>
                  <p className="text-xs text-slate-600 font-mono truncate">{s?.lastChainVerified?.slice(0, 20)}</p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Clinical evidence */}
          <Card className="bg-slate-900 border-slate-800 md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Activity className="w-4 h-4 text-rose-400" /> Clinical Evidence (NYC Pilot)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {summary.isLoading ? <p className="text-xs text-slate-500">Loading…</p> : (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Sites", value: summary.data?.clinical?.sites },
                    { label: "Patients", value: summary.data?.clinical?.patients?.toLocaleString() },
                    { label: "Adverse Events", value: summary.data?.clinical?.adverseEvents ?? 0 },
                    { label: "Triage Accuracy", value: summary.data?.clinical?.triageAccuracy },
                    { label: "Sensitivity", value: summary.data?.clinical?.sensitivity },
                    { label: "Specificity", value: summary.data?.clinical?.specificity },
                  ].map(m => (
                    <div key={m.label} data-testid={`clinical-stat-${m.label.toLowerCase().replace(/ /g, "-")}`}>
                      <p className="text-xs text-slate-500">{m.label}</p>
                      <p className="text-base font-bold text-slate-200">{m.value ?? "—"}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Part 11 ── */}
      {activeTab === "part11" && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-slate-200">
                21 CFR Part 11 — Electronic Records &amp; Signatures
              </CardTitle>
              {part11.data && (
                <div className="text-xs text-slate-400">
                  {part11.data.score.compliant}/{part11.data.score.total} compliant
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {part11.isLoading
              ? <p className="text-xs text-slate-500">Loading…</p>
              : <ControlList controls={part11.data?.controls ?? []} />}
          </CardContent>
        </Card>
      )}

      {/* ── Part 820 ── */}
      {activeTab === "part820" && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-slate-200">
                21 CFR Part 820 — Quality System Regulation
              </CardTitle>
              {part820.data && (
                <div className="text-xs text-slate-400">
                  {part820.data.score.compliant}/{part820.data.score.total} compliant
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {part820.isLoading
              ? <p className="text-xs text-slate-500">Loading…</p>
              : <ControlList controls={part820.data?.controls ?? []} />}
          </CardContent>
        </Card>
      )}

      {/* ── IBER ── */}
      {activeTab === "iber" && (
        <div className="space-y-4">
          {iber.isLoading && <p className="text-xs text-slate-500">Loading…</p>}
          {iber.data && (() => {
            const d = iber.data.iber;
            return (
              <>
                <Card className="bg-slate-900 border-slate-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-blue-400" /> {d.programName}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {[
                        ["Regulatory Pathway",  d.regulatoryPathway],
                        ["Submission Status",   d.submissionStatus],
                        ["Q-Sub Number",        d.qsubNumber],
                        ["Target Decision",     d.targetDecision],
                        ["Software Class",      d.softwareClass],
                      ].map(([k, v]) => (
                        <div key={k as string} data-testid={`iber-stat-${(k as string).toLowerCase().replace(/ /g, "-")}`}>
                          <p className="text-slate-500">{k}</p>
                          <p className="text-slate-200 font-medium">{v}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-slate-400 pt-1 border-t border-slate-800 mt-2">
                      <span className="text-slate-500">Intended Use: </span>{d.intendedUse}
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-slate-900 border-slate-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-slate-200">Special Controls</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1">
                      {d.specialControls.map((sc: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                          {sc}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </>
            );
          })()}
        </div>
      )}

      {/* ── Audit Events ── */}
      {activeTab === "events" && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Activity className="w-4 h-4 text-rose-400" /> Clinical Audit Events
                {events.data && <Badge variant="secondary" className="text-xs ml-1">{events.data.total?.toLocaleString()} total</Badge>}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[520px] px-4 pb-4">
              {events.isLoading && (
                <div className="flex items-center gap-2 text-slate-500 text-sm py-8 justify-center">
                  <RefreshCw className="w-4 h-4 animate-spin" /> Loading audit events…
                </div>
              )}
              {(events.data?.events ?? []).length === 0 && !events.isLoading && (
                <div className="text-center py-16 text-slate-600">
                  <Activity className="w-8 h-8 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No audit events found</p>
                </div>
              )}
              {(events.data?.events ?? []).map((e: AuditEvent) => (
                <div
                  key={e.id}
                  data-testid={`audit-event-${e.id}`}
                  className="flex items-center gap-3 py-2 border-b border-slate-800 last:border-0 text-xs"
                >
                  {e.flagged
                    ? <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    : <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                  <span className="font-mono text-slate-500 w-20 shrink-0 truncate">{e.patient_id}</span>
                  <span className="text-slate-400 w-24 shrink-0 truncate">{e.clinic_id}</span>
                  <span className={`font-medium w-12 text-right shrink-0 ${
                    (e.confidence ?? 0) >= 0.85 ? "text-emerald-400" :
                    (e.confidence ?? 0) >= 0.70 ? "text-amber-400" : "text-red-400"
                  }`}>{((e.confidence ?? 0) * 100).toFixed(0)}%</span>
                  <span className="flex-1 font-mono text-slate-600 truncate text-xs">{e.id}</span>
                  <span className="text-slate-600 shrink-0 w-20 text-right">
                    {new Date(e.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* ── Chain ── */}
      {activeTab === "chain" && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Link2 className="w-4 h-4 text-amber-400" /> SHA-256 Audit Chain Integrity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {chain.isLoading && <p className="text-xs text-slate-500">Verifying chain…</p>}
            {chain.data && (() => {
              const c: ChainReport = chain.data.chain;
              return (
                <>
                  <div className="flex items-center gap-3">
                    {c.integrity === "VALID"
                      ? <CheckCircle className="w-8 h-8 text-emerald-400" />
                      : <XCircle className="w-8 h-8 text-red-400" />}
                    <div>
                      <p className={`text-lg font-bold ${c.integrity === "VALID" ? "text-emerald-400" : "text-red-400"}`}>
                        Chain Integrity: {c.integrity}
                      </p>
                      <p className="text-xs text-slate-500">{c.algorithm}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-slate-500">Total Events</p>
                      <p className="text-slate-200 font-bold text-lg">{c.length.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Last Verified</p>
                      <p className="text-slate-300">{new Date(c.verifiedAt).toLocaleString()}</p>
                    </div>
                  </div>
                  {c.lastEntryId && (
                    <div className="bg-slate-800 rounded p-2">
                      <p className="text-xs text-slate-500 mb-1">Last Entry Hash</p>
                      <p className="font-mono text-xs text-slate-300 break-all">{c.lastEntryId}</p>
                    </div>
                  )}
                  {c.integrity === "BROKEN" && (
                    <div className="flex items-start gap-2 bg-red-950 border border-red-800 rounded p-2">
                      <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                      <p className="text-xs text-red-300">
                        Chain integrity failure detected. This must be investigated immediately before any FDA submission.
                        Contact your compliance officer and freeze all audit operations.
                      </p>
                    </div>
                  )}
                </>
              );
            })()}
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-slate-700 mt-6 text-center">
        Auralyn SaMD · 21 CFR Part 11 &amp; Part 820 · IBER De Novo · {new Date().getFullYear()}
      </p>
    </div>
  );
}
