import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Dna, FlaskConical, CheckCircle2, Clock, AlertTriangle,
  ChevronDown, ChevronRight, Play, RefreshCw, History,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function authHeaders() {
  const token = localStorage.getItem("app_auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchWithAuth(url: string) {
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function evidenceColor(score: number) {
  if (score >= 0.85) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 0.60) return "text-yellow-600 dark:text-yellow-400";
  if (score >= 0.30) return "text-orange-500 dark:text-orange-400";
  return "text-red-500 dark:text-red-400";
}

function evidenceBg(score: number) {
  if (score >= 0.85) return "bg-emerald-50 border-emerald-200 dark:bg-emerald-950 dark:border-emerald-800";
  if (score >= 0.60) return "bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800";
  if (score >= 0.30) return "bg-orange-50 border-orange-200 dark:bg-orange-950 dark:border-orange-800";
  return "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800";
}

function relevanceBadge(r: string) {
  const map: Record<string, string> = {
    high:         "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
    moderate:     "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    low:          "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    insufficient: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  };
  return map[r] ?? map.insufficient;
}

function studyTypeBadge(t: string) {
  const map: Record<string, string> = {
    meta_analysis:        "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    systematic_review:    "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
    rct:                  "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    prospective_cohort:   "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
    retrospective_cohort: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  };
  return map[t] ?? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Finding {
  id: number;
  treatment: string;
  study_type: string;
  evidence_score: string;
  summary: string;
  key_finding: string;
  sample_size: number | null;
  population: string;
  outcome_measured: string;
  effect_size: string | null;
  confidence_interval: string | null;
  safety_signals: string[];
  fda_status: string;
  clinical_relevance: "high" | "moderate" | "low" | "insufficient";
  pubmed_ids: string[];
  source_urls: string[];
  scan_date: string;
  physician_reviewed: boolean;
  physician_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

interface Stats {
  total: string;
  high_evidence: string;
  unreviewed: string;
  high_relevance: string;
  avg_score: string;
  last_scan: string;
}

// ─── Review Modal ─────────────────────────────────────────────────────────────
function ReviewPanel({
  finding,
  onClose,
}: {
  finding: Finding;
  onClose: () => void;
}) {
  const [notes, setNotes] = useState(finding.physician_notes ?? "");
  const qc = useQueryClient();
  const { toast } = useToast();

  const reviewMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/longevity/findings/${finding.id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/longevity/findings"] });
      qc.invalidateQueries({ queryKey: ["/api/longevity/stats"] });
      toast({ title: "Finding marked as reviewed" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Review failed", description: e.message, variant: "destructive" }),
  });

  const score = parseFloat(finding.evidence_score);
  const safetySignals = Array.isArray(finding.safety_signals)
    ? finding.safety_signals
    : typeof finding.safety_signals === "string"
    ? JSON.parse(finding.safety_signals)
    : [];
  const pubmedIds = Array.isArray(finding.pubmed_ids)
    ? finding.pubmed_ids
    : typeof finding.pubmed_ids === "string"
    ? JSON.parse(finding.pubmed_ids)
    : [];

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" data-testid="review-panel-overlay">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white" data-testid="review-treatment-title">
              {finding.treatment}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-sm font-semibold ${evidenceColor(score)}`}>
                Score: {score.toFixed(3)}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${studyTypeBadge(finding.study_type)}`}>
                {finding.study_type.replace(/_/g, " ")}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${relevanceBadge(finding.clinical_relevance)}`}>
                {finding.clinical_relevance}
              </span>
            </div>
          </div>
          <button
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-2xl leading-none"
            onClick={onClose}
            data-testid="review-panel-close"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Key Finding</p>
            <p className="text-sm text-slate-800 dark:text-slate-200 font-medium" data-testid="review-key-finding">{finding.key_finding}</p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Summary</p>
            <p className="text-sm text-slate-700 dark:text-slate-300">{finding.summary}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            {finding.population && (
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Population</p>
                <p className="text-slate-700 dark:text-slate-300">{finding.population}</p>
              </div>
            )}
            {finding.outcome_measured && (
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Outcome Measured</p>
                <p className="text-slate-700 dark:text-slate-300">{finding.outcome_measured}</p>
              </div>
            )}
            {finding.sample_size && (
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Sample Size</p>
                <p className="text-slate-700 dark:text-slate-300">n = {finding.sample_size.toLocaleString()}</p>
              </div>
            )}
            {finding.effect_size && (
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Effect Size</p>
                <p className="text-slate-700 dark:text-slate-300">{finding.effect_size}</p>
              </div>
            )}
            {finding.confidence_interval && (
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Confidence Interval</p>
                <p className="text-slate-700 dark:text-slate-300">{finding.confidence_interval}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">FDA Status</p>
              <p className="text-slate-700 dark:text-slate-300">{finding.fda_status}</p>
            </div>
          </div>

          {safetySignals.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-1.5 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Safety Signals
              </p>
              <ul className="list-disc list-inside space-y-0.5">
                {safetySignals.map((s: string, i: number) => (
                  <li key={i} className="text-sm text-amber-800 dark:text-amber-200">{s}</li>
                ))}
              </ul>
            </div>
          )}

          {pubmedIds.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">PubMed IDs</p>
              <div className="flex flex-wrap gap-2">
                {pubmedIds.map((pmid: string) => (
                  <a
                    key={pmid}
                    href={`https://pubmed.ncbi.nlm.nih.gov/${pmid}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                    data-testid={`pubmed-link-${pmid}`}
                  >
                    PMID {pmid}
                  </a>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {finding.physician_reviewed ? (
            <div className="bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3">
              <p className="text-sm text-emerald-700 dark:text-emerald-300 font-medium flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Reviewed by {finding.reviewed_by}
              </p>
              {finding.physician_notes && (
                <p className="text-sm text-emerald-800 dark:text-emerald-200 mt-1">{finding.physician_notes}</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Physician Review Notes</p>
              <Textarea
                placeholder="Optional — add clinical notes, caveats, or recommendations…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="text-sm"
                data-testid="review-notes-input"
              />
              <Button
                onClick={() => reviewMut.mutate()}
                disabled={reviewMut.isPending}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                data-testid="btn-mark-reviewed"
              >
                {reviewMut.isPending ? "Saving…" : "Mark as Reviewed"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Finding Row ──────────────────────────────────────────────────────────────
function FindingRow({
  finding,
  onSelect,
}: {
  finding: Finding;
  onSelect: (f: Finding) => void;
}) {
  const score = parseFloat(finding.evidence_score);

  return (
    <div
      className={`border rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow ${evidenceBg(score)}`}
      onClick={() => onSelect(finding)}
      data-testid={`finding-row-${finding.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-900 dark:text-white text-sm truncate">
              {finding.treatment}
            </span>
            {finding.physician_reviewed && (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
            )}
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-2">
            {finding.key_finding}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <span className={`text-lg font-bold tabular-nums ${evidenceColor(score)}`}>
            {score.toFixed(2)}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${studyTypeBadge(finding.study_type)}`}>
            {finding.study_type.replace(/_/g, " ")}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${relevanceBadge(finding.clinical_relevance)}`}>
            {finding.clinical_relevance}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1" data-testid={`stat-${label.toLowerCase().replace(/\s/g, "-")}`}>{value}</p>
            {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
          </div>
          <div className="text-slate-400 dark:text-slate-500">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function LongevityIntelligencePage() {
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [relevanceFilter, setRelevanceFilter] = useState("all");
  const [reviewedFilter, setReviewedFilter] = useState("all");
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const statsQuery = useQuery<Stats>({
    queryKey: ["/api/longevity/stats"],
    queryFn: () => fetchWithAuth("/api/longevity/stats"),
  });

  const findingsQuery = useQuery<{ findings: Finding[]; total: number }>({
    queryKey: ["/api/longevity/findings", relevanceFilter, reviewedFilter, search],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "100" });
      if (relevanceFilter !== "all") params.set("relevance", relevanceFilter);
      if (reviewedFilter !== "all") params.set("reviewed", reviewedFilter === "reviewed" ? "true" : "false");
      if (search.trim()) params.set("search", search.trim());
      return fetchWithAuth(`/api/longevity/findings?${params}`);
    },
  });

  const historyQuery = useQuery<{ history: any[] }>({
    queryKey: ["/api/longevity/scan/history"],
    queryFn: () => fetchWithAuth("/api/longevity/scan/history"),
  });

  const triggerScanMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/longevity/scan/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Scan started", description: data.message });
      qc.invalidateQueries({ queryKey: ["/api/longevity/scan/history"] });
    },
    onError: (e: any) => toast({ title: "Scan trigger failed", description: e.message, variant: "destructive" }),
  });

  const stats = statsQuery.data;
  const findings = findingsQuery.data?.findings ?? [];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      {selectedFinding && (
        <ReviewPanel finding={selectedFinding} onClose={() => setSelectedFinding(null)} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-100 dark:bg-emerald-900 rounded-xl">
            <Dna className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Longevity Intelligence
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Weekly AI-powered evidence scan · GPT-4o · PubMed indexed
            </p>
          </div>
        </div>
        <Button
          onClick={() => triggerScanMut.mutate()}
          disabled={triggerScanMut.isPending}
          className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2"
          data-testid="btn-trigger-scan"
        >
          {triggerScanMut.isPending ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {triggerScanMut.isPending ? "Scanning…" : "Run Scan Now"}
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          <StatCard
            label="Total Findings"
            value={stats.total ?? "—"}
            icon={<FlaskConical className="w-5 h-5" />}
          />
          <StatCard
            label="High Evidence"
            value={stats.high_evidence ?? "—"}
            sub="Score ≥ 0.85"
            icon={<Dna className="w-5 h-5" />}
          />
          <StatCard
            label="Unreviewed"
            value={stats.unreviewed ?? "—"}
            icon={<Clock className="w-5 h-5" />}
          />
          <StatCard
            label="High Relevance"
            value={stats.high_relevance ?? "—"}
            icon={<CheckCircle2 className="w-5 h-5" />}
          />
          <StatCard
            label="Avg Score"
            value={stats.avg_score ? parseFloat(stats.avg_score).toFixed(3) : "—"}
            icon={<BarChart className="w-5 h-5" />}
          />
          <StatCard
            label="Last Scan"
            value={stats.last_scan ? new Date(stats.last_scan).toLocaleDateString() : "Never"}
            icon={<History className="w-5 h-5" />}
          />
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="findings">
        <TabsList className="mb-4">
          <TabsTrigger value="findings" data-testid="tab-findings">
            All Findings
          </TabsTrigger>
          <TabsTrigger value="high-evidence" data-testid="tab-high-evidence">
            High Evidence
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">
            Scan History
          </TabsTrigger>
        </TabsList>

        {/* ── Findings Tab ─────────────────────────────────────────────────── */}
        <TabsContent value="findings">
          {/* Filter bar */}
          <div className="flex flex-wrap gap-3 mb-4">
            <Input
              placeholder="Search treatment or summary…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64"
              data-testid="input-search"
            />
            <Select value={relevanceFilter} onValueChange={setRelevanceFilter}>
              <SelectTrigger className="w-44" data-testid="select-relevance">
                <SelectValue placeholder="Relevance" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Relevance</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="moderate">Moderate</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="insufficient">Insufficient</SelectItem>
              </SelectContent>
            </Select>
            <Select value={reviewedFilter} onValueChange={setReviewedFilter}>
              <SelectTrigger className="w-44" data-testid="select-reviewed">
                <SelectValue placeholder="Review status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="unreviewed">Unreviewed</SelectItem>
                <SelectItem value="reviewed">Reviewed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {findingsQuery.isLoading ? (
            <div className="text-sm text-slate-500 py-8 text-center">Loading findings…</div>
          ) : findings.length === 0 ? (
            <div className="text-center py-16 text-slate-500 dark:text-slate-400">
              <Dna className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">No findings yet</p>
              <p className="text-sm mt-1">Run a scan to populate the database with longevity evidence.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {findings.map((f) => (
                <FindingRow key={f.id} finding={f} onSelect={setSelectedFinding} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── High Evidence Tab ─────────────────────────────────────────────── */}
        <TabsContent value="high-evidence">
          <HighEvidenceTab onSelect={setSelectedFinding} />
        </TabsContent>

        {/* ── Scan History Tab ─────────────────────────────────────────────── */}
        <TabsContent value="history">
          {historyQuery.isLoading ? (
            <div className="text-sm text-slate-500 py-8 text-center">Loading history…</div>
          ) : (historyQuery.data?.history ?? []).length === 0 ? (
            <div className="text-center py-16 text-slate-500 dark:text-slate-400">
              <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No scan history yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(historyQuery.data?.history ?? []).map((h, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                          Scan completed
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {new Date(h.created_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right text-xs text-slate-600 dark:text-slate-400 space-y-0.5">
                        {h.data?.totalFindings != null && (
                          <p>{h.data.totalFindings} findings processed</p>
                        )}
                        {h.data?.highEvidenceFindings != null && (
                          <p className="text-emerald-600 dark:text-emerald-400">
                            {h.data.highEvidenceFindings} high-evidence
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── High Evidence sub-tab ────────────────────────────────────────────────────
function HighEvidenceTab({ onSelect }: { onSelect: (f: Finding) => void }) {
  const query2 = useQuery<{ findings: Finding[] }>({
    queryKey: ["/api/longevity/findings/high-evidence"],
    queryFn: () => fetchWithAuth("/api/longevity/findings/high-evidence"),
  });

  const findings = query2.data?.findings ?? [];

  if (query2.isLoading) {
    return <div className="text-sm text-slate-500 py-8 text-center">Loading…</div>;
  }

  if (findings.length === 0) {
    return (
      <div className="text-center py-16 text-slate-500 dark:text-slate-400">
        <FlaskConical className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>No high-evidence findings yet (score ≥ 0.85 = RCT-level or above).</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
        Showing {findings.length} finding{findings.length !== 1 ? "s" : ""} at RCT-level evidence or above (score ≥ 0.85)
      </p>
      {findings.map((f) => (
        <FindingRow key={f.id} finding={f} onSelect={onSelect} />
      ))}
    </div>
  );
}

// missing import shim
function BarChart({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}
