import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  FlaskConical, Play, AlertTriangle, CheckCircle, XCircle, Target,
  BookOpen, GitBranch, Database, RefreshCw, ChevronDown, ChevronRight,
  Loader2, Info, BarChart3, ExternalLink, Filter, Zap, ShieldAlert,
  TrendingDown, TrendingUp, Activity,
} from "lucide-react";
import { Link } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────
interface SimResult {
  caseId: string;
  complaint: string;
  expectedDisposition: string;
  predictedDisposition: string;
  dispositionCorrect: boolean;
  expectedTopDiagnosis?: string;
  predictedTopDiagnosis?: string;
  diagnosisMatch: boolean;
  confidence: number;
  score: number;
  redFlagMiss: boolean;
  pack?: string;
  packLabel?: string;
  clinicalNote?: string;
  tags?: string[];
}

interface RunResult {
  ok: boolean;
  runId: string;
  createdAt: number;
  totalCases: number;
  results: SimResult[];
  summary: { accuracy: number; avgScore: number; passCount: number; failCount: number; total: number };
  failureBreakdown: Record<string, number>;
  passRate: number;
  redFlagMisses: number;
  criticalFailures: any[];
}

interface Pack {
  id: string;
  label: string;
  description: string;
  count: number;
}

// ─── Shared helpers ───────────────────────────────────────────────────────────
const PACK_COLORS: Record<string, string> = {
  misleading: "text-orange-400 border-orange-500/30 bg-orange-500/8",
  missing_data: "text-blue-400 border-blue-500/30 bg-blue-500/8",
  conflicting: "text-purple-400 border-purple-500/30 bg-purple-500/8",
  modifier_heavy: "text-yellow-400 border-yellow-500/30 bg-yellow-500/8",
  disposition_edge: "text-red-400 border-red-500/30 bg-red-500/8",
};

const DISPOSITION_LABELS: Record<string, string> = {
  er_now: "ER Now",
  urgent_care: "Urgent Care",
  self_care: "Self-Care",
};

function DispositionBadge({ value }: { value: string }) {
  const color = value === "er_now" ? "text-red-400 border-red-500/40" : value === "urgent_care" ? "text-yellow-400 border-yellow-500/40" : "text-green-400 border-green-500/40";
  return <Badge variant="outline" className={cn("text-[10px] font-mono", color)}>{DISPOSITION_LABELS[value] ?? value}</Badge>;
}

function ScoreMeter({ score }: { score: number }) {
  const color = score >= 80 ? "bg-green-500" : score >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-muted/40 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${score}%` }} />
      </div>
      <span className="text-[10px] font-mono font-semibold">{score}</span>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color = "text-foreground", sub }: { label: string; value: string | number; icon: any; color?: string; sub?: string }) {
  return (
    <div className="bg-muted/20 rounded-lg p-3 space-y-0.5" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex items-center gap-1.5">
        <Icon size={11} className={cn("shrink-0", color)} />
        <div className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</div>
      </div>
      <div className={cn("text-lg font-black font-mono", color)}>{value}</div>
      {sub && <div className="text-[9px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

// ─── Case Row ─────────────────────────────────────────────────────────────────
function CaseRow({ result, index }: { result: SimResult; index: number }) {
  const [open, setOpen] = useState(false);
  const pass = result.dispositionCorrect && !result.redFlagMiss;

  return (
    <div className={cn("border-b border-border/20 last:border-0", !pass && "bg-red-500/3")} data-testid={`sim-case-${result.caseId}`}>
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/20 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <span className="text-[9px] text-muted-foreground font-mono w-5 shrink-0">{index + 1}</span>
        {pass
          ? <CheckCircle size={12} className="text-green-400 shrink-0" />
          : result.redFlagMiss
            ? <ShieldAlert size={12} className="text-red-500 shrink-0" />
            : <XCircle size={12} className="text-red-400 shrink-0" />
        }
        <span className="text-xs font-mono font-semibold w-24 shrink-0 text-muted-foreground">{result.caseId}</span>
        <span className="text-xs flex-1 truncate">{result.complaint.replace(/_/g, " ")}</span>
        <DispositionBadge value={result.predictedDisposition} />
        {result.predictedDisposition !== result.expectedDisposition && (
          <span className="text-[9px] text-muted-foreground">→ expected <span className="text-red-400">{DISPOSITION_LABELS[result.expectedDisposition]}</span></span>
        )}
        <ScoreMeter score={result.score} />
        {result.pack && (
          <Badge variant="outline" className={cn("text-[9px] h-4 px-1.5 shrink-0", PACK_COLORS[result.pack] ?? "")}>
            {result.pack.replace(/_/g, " ")}
          </Badge>
        )}
        {open ? <ChevronDown size={12} className="text-muted-foreground shrink-0" /> : <ChevronRight size={12} className="text-muted-foreground shrink-0" />}
      </div>

      {open && (
        <div className="px-10 pb-3 space-y-2">
          {result.clinicalNote && (
            <div className="flex gap-2 bg-muted/20 rounded p-2">
              <Info size={11} className="text-blue-400 mt-0.5 shrink-0" />
              <div className="text-[11px] text-muted-foreground leading-relaxed">{result.clinicalNote}</div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div><span className="text-muted-foreground">Expected Dx: </span><span className="font-mono">{result.expectedTopDiagnosis ?? "—"}</span></div>
            <div><span className="text-muted-foreground">Predicted Dx: </span><span className={cn("font-mono", result.diagnosisMatch ? "text-green-400" : "text-red-400")}>{result.predictedTopDiagnosis ?? "—"}</span></div>
            <div><span className="text-muted-foreground">Confidence: </span><span className="font-mono">{(result.confidence * 100).toFixed(0)}%</span></div>
            <div><span className="text-muted-foreground">Red Flag Miss: </span><span className={result.redFlagMiss ? "text-red-500 font-bold" : "text-green-400"}>{ result.redFlagMiss ? "YES — CRITICAL" : "No"}</span></div>
          </div>
          {result.tags && result.tags.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {result.tags.map(t => <Badge key={t} variant="outline" className="text-[9px] h-4 px-1.5 text-muted-foreground">{t.replace(/_/g, " ")}</Badge>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Results Panel ────────────────────────────────────────────────────────────
function ResultsPanel({ run, onClear }: { run: RunResult; onClear: () => void }) {
  const [filter, setFilter] = useState<"all" | "pass" | "fail" | "red_flag">("all");
  const [packFilter, setPackFilter] = useState("all");
  const [search, setSearch] = useState("");

  const packs = Array.from(new Set(run.results.map(r => r.pack).filter(Boolean)));

  const filtered = run.results.filter(r => {
    const pass = r.dispositionCorrect && !r.redFlagMiss;
    if (filter === "pass" && !pass) return false;
    if (filter === "fail" && pass) return false;
    if (filter === "red_flag" && !r.redFlagMiss) return false;
    if (packFilter !== "all" && r.pack !== packFilter) return false;
    if (search && !r.complaint.includes(search) && !r.caseId.includes(search) && !r.clinicalNote?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const passRate = Math.round((run.summary.passCount / run.summary.total) * 100);
  const avgScore = Math.round(run.summary.avgScore ?? 0);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center gap-3 flex-shrink-0">
        <Activity size={14} className="text-primary" />
        <span className="text-xs font-semibold">Run Results — {run.totalCases} cases</span>
        <Badge variant="outline" className="text-[10px] border-green-500/30 text-green-400 ml-auto">{run.passRate !== undefined ? Math.round(run.passRate * 100) : passRate}% Pass</Badge>
        <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1" onClick={onClear}>
          <RefreshCw size={10} /> Clear
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-2 p-3 border-b shrink-0">
        <StatCard label="Pass Rate" value={`${passRate}%`} icon={TrendingUp} color={passRate >= 70 ? "text-green-400" : passRate >= 50 ? "text-yellow-400" : "text-red-400"} />
        <StatCard label="Avg Score" value={avgScore} icon={BarChart3} color={avgScore >= 70 ? "text-blue-400" : "text-yellow-400"} />
        <StatCard label="Red Flag Misses" value={run.redFlagMisses} icon={ShieldAlert} color={run.redFlagMisses > 0 ? "text-red-500" : "text-green-400"} sub="CRITICAL if >0" />
        <StatCard label="Critical Failures" value={run.criticalFailures?.length ?? 0} icon={AlertTriangle} color={(run.criticalFailures?.length ?? 0) > 0 ? "text-red-500" : "text-green-400"} />
      </div>

      {Object.keys(run.failureBreakdown).length > 0 && (
        <div className="p-3 border-b shrink-0">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Failure Breakdown</div>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(run.failureBreakdown).map(([cat, count]) => (
              <div key={cat} className="flex items-center gap-1 bg-red-500/8 border border-red-500/20 rounded px-2 py-0.5">
                <XCircle size={9} className="text-red-400" />
                <span className="text-[10px] font-mono">{cat.replace(/_/g, " ")}</span>
                <span className="text-[10px] font-bold text-red-400">{count as number}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="p-3 border-b flex gap-2 items-center shrink-0">
        <Filter size={11} className="text-muted-foreground" />
        <div className="flex gap-1.5">
          {(["all", "pass", "fail", "red_flag"] as const).map(f => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "ghost"} className="h-6 text-[10px] px-2" onClick={() => setFilter(f)} data-testid={`filter-${f}`}>
              {f.replace(/_/g, " ")}
            </Button>
          ))}
        </div>
        <Select value={packFilter} onValueChange={setPackFilter}>
          <SelectTrigger className="h-6 text-[10px] w-36" data-testid="select-pack-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Packs</SelectItem>
            {packs.map(p => <SelectItem key={p!} value={p!}>{p!.replace(/_/g, " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="Search cases…" value={search} onChange={e => setSearch(e.target.value)} className="h-6 text-[10px] flex-1 max-w-40" data-testid="input-search-cases" />
      </div>

      <div className="flex-1 overflow-auto">
        <div className="text-[9px] text-muted-foreground uppercase tracking-wide px-3 py-1.5 border-b bg-muted/10">
          Showing {filtered.length} of {run.results.length}
        </div>
        {filtered.map((r, i) => <CaseRow key={r.caseId} result={r} index={i} />)}
        {filtered.length === 0 && (
          <div className="p-8 text-center text-xs text-muted-foreground">No cases match the current filter</div>
        )}
      </div>
    </div>
  );
}

// ─── Simulation Runner Panel ──────────────────────────────────────────────────
function SimRunnerPanel({ onResult }: { onResult: (r: RunResult) => void }) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"all50" | "pack" | "complaint">("all50");
  const [selectedPack, setSelectedPack] = useState("misleading");
  const [complaint, setComplaint] = useState("cough");
  const [count, setCount] = useState("25");
  const [difficulty, setDifficulty] = useState("moderate");

  const packsQ = useQuery<{ ok: boolean; packs: Pack[] }>({
    queryKey: ["/api/simulation-lab/top50/packs"],
  });

  const runAll = useMutation({
    mutationFn: () => apiRequest("POST", "/api/simulation-lab/top50/run").then(r => r.json()),
    onSuccess: (data) => { onResult(data); toast({ title: "Run complete", description: `${data.totalCases} cases evaluated` }); },
    onError: (e: any) => toast({ title: "Run failed", description: e.message, variant: "destructive" }),
  });

  const runPack = useMutation({
    mutationFn: (packId: string) => apiRequest("POST", `/api/simulation-lab/top50/run-pack/${packId}`).then(r => r.json()),
    onSuccess: (data) => { onResult(data); toast({ title: "Pack run complete", description: `${data.totalCases} cases evaluated` }); },
    onError: (e: any) => toast({ title: "Pack run failed", description: e.message, variant: "destructive" }),
  });

  const runComplaint = useMutation({
    mutationFn: () => apiRequest("POST", "/api/simulation-lab/run", { complaint, count: Number(count), difficulty }).then(r => r.json()),
    onSuccess: (data) => {
      onResult({ ...data, pack: undefined, criticalFailures: [], redFlagMisses: data.results?.filter((r: any) => r.redFlagMiss).length ?? 0, passRate: data.summary?.accuracy });
      toast({ title: "Complaint run complete", description: `${data.results?.length ?? 0} cases evaluated` });
    },
    onError: (e: any) => toast({ title: "Run failed", description: e.message, variant: "destructive" }),
  });

  const isPending = runAll.isPending || runPack.isPending || runComplaint.isPending;

  const handleRun = () => {
    if (mode === "all50") runAll.mutate();
    else if (mode === "pack") runPack.mutate(selectedPack);
    else runComplaint.mutate();
  };

  return (
    <div className="space-y-4">
      <Card className="border border-border/50">
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <Play size={13} className="text-primary" />
          <span className="text-xs font-semibold">Simulation Runner</span>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex gap-1.5">
            {(["all50", "pack", "complaint"] as const).map(m => (
              <Button key={m} size="sm" variant={mode === m ? "default" : "outline"} className="text-[10px] h-7 flex-1" onClick={() => setMode(m)} data-testid={`mode-${m}`}>
                {m === "all50" ? "All 50 Cases" : m === "pack" ? "By Pack" : "By Complaint"}
              </Button>
            ))}
          </div>

          {mode === "pack" && (
            <div className="space-y-1">
              <div className="text-[10px] text-muted-foreground">Select pack</div>
              <Select value={selectedPack} onValueChange={setSelectedPack}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-pack">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(packsQ.data?.packs ?? []).map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.label} ({p.count})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {packsQ.data?.packs.find(p => p.id === selectedPack) && (
                <div className="text-[10px] text-muted-foreground">{packsQ.data!.packs.find(p => p.id === selectedPack)!.description}</div>
              )}
            </div>
          )}

          {mode === "complaint" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <div className="text-[10px] text-muted-foreground">Complaint</div>
                <Select value={complaint} onValueChange={setComplaint}>
                  <SelectTrigger className="h-7 text-xs" data-testid="select-complaint">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["cough", "chest_pain", "headache", "dizziness", "sore_throat", "fever", "ear_pain", "breathlessness"].map(c => (
                      <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] text-muted-foreground">Difficulty</div>
                <Select value={difficulty} onValueChange={setDifficulty}>
                  <SelectTrigger className="h-7 text-xs" data-testid="select-difficulty">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="moderate">Moderate</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1">
                <div className="text-[10px] text-muted-foreground">Case count</div>
                <Input type="number" min="5" max="100" value={count} onChange={e => setCount(e.target.value)}
                  className="h-7 text-xs" data-testid="input-count" />
              </div>
            </div>
          )}

          <Button className="w-full h-8 text-xs gap-1.5" onClick={handleRun} disabled={isPending} data-testid="button-run-simulation">
            {isPending ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
            {isPending ? "Running…" : mode === "all50" ? "Run All 50 Failure Cases" : mode === "pack" ? "Run Pack" : "Run Complaint Simulation"}
          </Button>

          {mode === "all50" && (
            <div className="text-[10px] text-muted-foreground leading-relaxed bg-muted/20 rounded p-2">
              Runs all 50 curated high-yield failure scenarios across 5 clinical packs. Each case is designed to expose a specific system weakness — misleading presentations, missing data, conflicting signals, modifier-heavy cases, and disposition edge cases.
            </div>
          )}
        </div>
      </Card>

      <Card className="border border-border/50">
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <BookOpen size={13} className="text-purple-400" />
          <span className="text-xs font-semibold">Pack Guide</span>
        </div>
        <div className="divide-y divide-border/20">
          {(packsQ.data?.packs ?? PACK_STUBS).map(p => (
            <div key={p.id} className="px-4 py-2.5">
              <div className={cn("text-[10px] font-semibold mb-0.5", PACK_COLORS[p.id]?.split(" ")[0] ?? "text-muted-foreground")}>
                {p.label} ({p.count})
              </div>
              <div className="text-[10px] text-muted-foreground leading-snug">{p.description}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="border border-border/50">
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <Database size={13} className="text-cyan-400" />
          <span className="text-xs font-semibold">Live System Access</span>
        </div>
        <div className="p-3 space-y-2">
          <Link to="/knowledge-base">
            <Button variant="outline" className="w-full h-8 text-xs gap-2 justify-start" data-testid="link-knowledge-base">
              <Database size={12} className="text-cyan-400" /> Knowledge Base Editor
              <ExternalLink size={10} className="ml-auto text-muted-foreground" />
            </Button>
          </Link>
          <Link to="/decision-tree">
            <Button variant="outline" className="w-full h-8 text-xs gap-2 justify-start" data-testid="link-decision-tree">
              <GitBranch size={12} className="text-green-400" /> Decision Tree Explorer
              <ExternalLink size={10} className="ml-auto text-muted-foreground" />
            </Button>
          </Link>
          <Link to="/clinical-improvement-lab">
            <Button variant="outline" className="w-full h-8 text-xs gap-2 justify-start" data-testid="link-improvement-lab">
              <FlaskConical size={12} className="text-violet-400" /> Clinical Improvement Lab
              <ExternalLink size={10} className="ml-auto text-muted-foreground" />
            </Button>
          </Link>
          <Link to={ROUTES_KNOWLEDGE_BASE}>
            <Button variant="outline" className="w-full h-8 text-xs gap-2 justify-start" data-testid="link-golden-cases">
              <Target size={12} className="text-orange-400" /> Golden Cases
              <ExternalLink size={10} className="ml-auto text-muted-foreground" />
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}

// ─── Pack Summary Tab ─────────────────────────────────────────────────────────
function PackSummaryTab({ run }: { run: RunResult | null }) {
  if (!run) {
    return (
      <div className="p-8 text-center text-xs text-muted-foreground">
        <FlaskConical size={24} className="mx-auto mb-3 text-muted-foreground/40" />
        Run a simulation to see pack-level breakdown
      </div>
    );
  }

  const byPack: Record<string, { total: number; pass: number; redFlagMiss: number }> = {};
  run.results.forEach(r => {
    const p = r.pack ?? "standard";
    if (!byPack[p]) byPack[p] = { total: 0, pass: 0, redFlagMiss: 0 };
    byPack[p].total++;
    if (r.dispositionCorrect && !r.redFlagMiss) byPack[p].pass++;
    if (r.redFlagMiss) byPack[p].redFlagMiss++;
  });

  return (
    <div className="space-y-3 p-4">
      {Object.entries(byPack).map(([pack, stats]) => {
        const pct = Math.round((stats.pass / stats.total) * 100);
        return (
          <div key={pack} className={cn("rounded-lg border p-3 space-y-2", PACK_COLORS[pack] ?? "border-border/50")} data-testid={`pack-summary-${pack}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold capitalize">{pack.replace(/_/g, " ")}</span>
              <span className={cn("text-sm font-black", pct >= 70 ? "text-green-400" : pct >= 50 ? "text-yellow-400" : "text-red-400")}>{pct}%</span>
            </div>
            <div className="w-full bg-muted/30 rounded-full h-1.5">
              <div className={cn("h-full rounded-full", pct >= 70 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-500")} style={{ width: `${pct}%` }} />
            </div>
            <div className="flex gap-3 text-[10px] text-muted-foreground">
              <span>{stats.pass}/{stats.total} passed</span>
              {stats.redFlagMiss > 0 && <span className="text-red-400 font-bold">{stats.redFlagMiss} red-flag misses</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Failure Anatomy Tab ──────────────────────────────────────────────────────
function FailureAnatomyTab({ run }: { run: RunResult | null }) {
  if (!run) {
    return <div className="p-8 text-center text-xs text-muted-foreground">Run a simulation first</div>;
  }

  const failures = run.results.filter(r => !r.dispositionCorrect || r.redFlagMiss);

  if (failures.length === 0) {
    return (
      <div className="p-8 text-center space-y-2">
        <CheckCircle size={24} className="mx-auto text-green-400" />
        <div className="text-xs font-semibold text-green-400">All cases passed</div>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/20">
      {failures.map((r, i) => (
        <div key={r.caseId} className="px-4 py-3 space-y-1.5" data-testid={`failure-${r.caseId}`}>
          <div className="flex items-start gap-2">
            {r.redFlagMiss
              ? <ShieldAlert size={12} className="text-red-500 mt-0.5 shrink-0" />
              : <XCircle size={12} className="text-red-400 mt-0.5 shrink-0" />
            }
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold">{r.caseId}</span>
                <span className="text-xs text-muted-foreground">{r.complaint.replace(/_/g, " ")}</span>
                {r.redFlagMiss && <Badge variant="destructive" className="text-[9px] h-4 px-1.5">RED FLAG MISS</Badge>}
              </div>
              {r.clinicalNote && <div className="text-[10px] text-muted-foreground mt-0.5">{r.clinicalNote}</div>}
              <div className="flex gap-3 text-[10px] mt-1">
                <span className="text-muted-foreground">Expected: <DispositionBadge value={r.expectedDisposition} /></span>
                <span className="text-muted-foreground">Got: <DispositionBadge value={r.predictedDisposition} /></span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────
const PACK_STUBS: Pack[] = [
  { id: "misleading", label: "Misleading Presentations", description: "Atypical MI, masked SAH, PE as anxiety", count: 10 },
  { id: "missing_data", label: "Missing / Incomplete Data", description: "Sparse or absent clinical information", count: 10 },
  { id: "conflicting", label: "Conflicting Signals", description: "Symptoms pointing in opposite directions", count: 10 },
  { id: "modifier_heavy", label: "Modifier-Heavy Cases", description: "Age extremes, comorbidities, medications", count: 10 },
  { id: "disposition_edge", label: "Disposition Edge Cases", description: "Exact ER/urgent-care boundary cases", count: 10 },
];

const ROUTES_KNOWLEDGE_BASE = "/golden-cases";

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ClinicalSimulationLabPage() {
  const [run, setRun] = useState<RunResult | null>(null);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <div className="px-6 py-3 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-3">
          <FlaskConical size={18} className="text-violet-400" />
          <div>
            <h1 className="text-base font-bold" data-testid="heading-simulation-lab">Clinical Simulation Lab</h1>
            <p className="text-xs text-muted-foreground">High-yield failure cases · KB editing · Decision tree · Tight feedback loop</p>
          </div>
          <div className="ml-auto flex gap-2">
            <Badge variant="outline" className="text-[10px] border-violet-500/30 text-violet-400">50 Failure Scenarios</Badge>
            <Badge variant="outline" className="text-[10px] border-orange-500/30 text-orange-400">5 Clinical Packs</Badge>
            {run && <Badge variant="outline" className={cn("text-[10px]", Math.round((run.summary.passCount / run.summary.total) * 100) >= 70 ? "border-green-500/30 text-green-400" : "border-red-500/30 text-red-400")}>Last Run: {Math.round((run.summary.passCount / run.summary.total) * 100)}% Pass</Badge>}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex gap-0">
        <aside className="w-72 shrink-0 border-r overflow-auto p-4">
          <SimRunnerPanel onResult={setRun} />
        </aside>

        <main className="flex-1 overflow-hidden flex flex-col">
          {!run ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
              <FlaskConical size={40} className="text-muted-foreground/30" />
              <div>
                <div className="text-sm font-semibold mb-1">Ready to Stress-Test</div>
                <div className="text-xs text-muted-foreground max-w-sm">
                  Select a mode and run simulations to expose system weaknesses. The 50 curated failure cases are designed to find real clinical logic gaps — not random noise.
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-left max-w-lg">
                {PACK_STUBS.map(p => (
                  <div key={p.id} className={cn("rounded-lg border p-2.5 space-y-1", PACK_COLORS[p.id] ?? "border-border/50")}>
                    <div className="text-[10px] font-semibold">{p.label}</div>
                    <div className="text-[9px] text-muted-foreground">{p.description}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <Tabs defaultValue="results" className="flex flex-col h-full overflow-hidden">
              <div className="px-4 pt-3 border-b shrink-0">
                <TabsList className="h-7">
                  <TabsTrigger value="results" className="text-[10px] h-6 px-3" data-testid="tab-results">
                    <Activity size={10} className="mr-1.5" /> All Cases ({run.results.length})
                  </TabsTrigger>
                  <TabsTrigger value="packs" className="text-[10px] h-6 px-3" data-testid="tab-packs">
                    <BarChart3 size={10} className="mr-1.5" /> Pack Breakdown
                  </TabsTrigger>
                  <TabsTrigger value="failures" className="text-[10px] h-6 px-3" data-testid="tab-failures">
                    <AlertTriangle size={10} className="mr-1.5" />
                    Failures ({run.results.filter(r => !r.dispositionCorrect || r.redFlagMiss).length})
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="results" className="flex-1 overflow-hidden m-0 data-[state=active]:flex data-[state=active]:flex-col">
                <ResultsPanel run={run} onClear={() => setRun(null)} />
              </TabsContent>
              <TabsContent value="packs" className="flex-1 overflow-auto m-0">
                <PackSummaryTab run={run} />
              </TabsContent>
              <TabsContent value="failures" className="flex-1 overflow-auto m-0">
                <FailureAnatomyTab run={run} />
              </TabsContent>
            </Tabs>
          )}
        </main>
      </div>
    </div>
  );
}
