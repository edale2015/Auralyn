import { useState, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
  Brain, ThumbsUp, ThumbsDown, Clock, Gauge, Bell, BrainCircuit,
  CheckCheck, CircleDot, Siren, Lock,
  Sparkles, Wrench, LayoutGrid, ListOrdered, ChevronUp, ArrowRight,
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

// ─── Learning Engine Tab ──────────────────────────────────────────────────────
const RISK_COLORS: Record<string, string> = {
  critical: "bg-red-500/10 text-red-400 border-red-500/30",
  high:     "bg-orange-500/10 text-orange-400 border-orange-500/30",
  medium:   "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  low:      "bg-blue-500/10 text-blue-400 border-blue-500/30",
};

const TYPE_LABELS: Record<string, string> = {
  red_flag_addition:    "Red Flag Rule",
  weight_adjustment:    "Weight Adjust",
  disposition_threshold: "Threshold",
  complaint_expansion:  "Complaint",
  evidence_update:      "Evidence",
  protocol_alignment:   "Protocol",
  contra_indicator:     "Contra",
  safety_override:      "Safety",
};

function LearningQueueItem({
  item, onApprove, onReject, approving, rejecting,
}: {
  item: any;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  approving: boolean;
  rejecting: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const { toast } = useToast();

  async function handleExplain() {
    setExpanded(true);
    if (explanation) return;
    setExplaining(true);
    try {
      const r = await apiRequest("POST", "/api/simulation-lab/ai/explain-proposal", {
        title: item.title, description: item.description, rationale: item.rationale,
        type: item.type, riskLevel: item.riskLevel,
        affectedComplaints: item.affectedComplaints, reasons: item.reasons, linkedCases: item.linkedCases,
      });
      const data = await r.json();
      if (data.ok) setExplanation(data.explanation);
      else toast({ title: "AI unavailable", description: "Could not generate explanation.", variant: "destructive" });
    } catch {
      toast({ title: "Error", description: "Failed to get AI explanation.", variant: "destructive" });
    } finally { setExplaining(false); }
  }

  return (
    <div
      className={cn(
        "border rounded-lg overflow-hidden transition-colors",
        item.riskLevel === "critical" ? "border-red-500/40 bg-red-500/5" :
        item.riskLevel === "high"     ? "border-orange-500/40 bg-orange-500/5" :
        "border-border/50",
      )}
      data-testid={`queue-item-${item.id}`}
    >
      <div className="px-4 py-2.5 flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          {item.riskLevel === "critical" ? <Siren size={13} className="text-red-400" /> :
           item.riskLevel === "high"     ? <AlertTriangle size={13} className="text-orange-400" /> :
                                          <CircleDot size={13} className="text-yellow-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono text-muted-foreground">{item.id?.slice(-6)}</span>
            <Badge variant="outline" className={cn("text-[9px] h-4 px-1.5 border", RISK_COLORS[item.riskLevel] ?? "")}>
              {item.riskLevel?.toUpperCase()}
            </Badge>
            <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-border/40 text-muted-foreground">
              {TYPE_LABELS[item.type] ?? item.type}
            </Badge>
            {item.confidence && (
              <span className="text-[9px] text-muted-foreground">
                {Math.round(item.confidence * 100)}% confidence
              </span>
            )}
          </div>
          <div className="text-xs font-semibold mt-1 leading-snug">{item.title}</div>
          {item.affectedComplaints?.length > 0 && (
            <div className="flex gap-1 flex-wrap mt-1">
              {item.affectedComplaints.slice(0, 4).map((c: string) => (
                <span key={c} className="text-[9px] bg-muted/40 rounded px-1.5 py-0.5">{c.replace(/_/g, " ")}</span>
              ))}
            </div>
          )}
          {expanded && (
            <div className="mt-2 space-y-1.5">
              {item.description && (
                <div className="text-[10px] text-muted-foreground leading-relaxed border-l-2 border-muted pl-2">
                  {item.description}
                </div>
              )}
              {item.rationale && (
                <div className="text-[10px] text-blue-300/80 leading-relaxed">
                  <span className="font-semibold">Rationale:</span> {item.rationale}
                </div>
              )}
              {(explaining || explanation) && (
                <div className="rounded-md border border-violet-500/30 bg-violet-500/5 px-3 py-2">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Sparkles size={9} className="text-violet-400" />
                    <span className="text-[9px] font-semibold text-violet-400 uppercase tracking-wider">AI Explanation</span>
                  </div>
                  {explaining ? (
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <Loader2 size={9} className="animate-spin" /> Analyzing proposal…
                    </div>
                  ) : (
                    <p className="text-[10px] text-foreground/90 leading-relaxed">{explanation}</p>
                  )}
                </div>
              )}
              {item.linkedCases?.length > 0 && (
                <div className="text-[9px] text-muted-foreground">
                  Linked cases: {item.linkedCases.slice(0, 8).join(", ")}
                  {item.linkedCases.length > 8 && ` +${item.linkedCases.length - 8} more`}
                </div>
              )}
              {item.linkedSimRunId && (
                <div className="text-[9px] text-muted-foreground font-mono">Run: {item.linkedSimRunId}</div>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 items-end shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              className="text-[9px] text-violet-400/80 hover:text-violet-300 flex items-center gap-0.5 transition-colors"
              onClick={handleExplain}
              disabled={explaining}
              data-testid={`explain-${item.id}`}
              title="Get AI explanation"
            >
              {explaining ? <Loader2 size={9} className="animate-spin" /> : <Sparkles size={9} />}
              Explain
            </button>
            <span className="text-muted-foreground/40 text-[10px]">·</span>
            <button
              className="text-[9px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
              onClick={() => setExpanded(e => !e)}
              data-testid={`expand-queue-item-${item.id}`}
            >
              {expanded ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
              {expanded ? "Less" : "More"}
            </button>
          </div>
          {item.status === "pending" && (
            <div className="flex gap-1 mt-1">
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[9px] gap-1 border-green-500/40 text-green-400 hover:bg-green-500/10"
                onClick={() => onApprove(item.id)}
                disabled={approving || rejecting}
                data-testid={`approve-${item.id}`}
              >
                {approving ? <Loader2 size={9} className="animate-spin" /> : <ThumbsUp size={9} />}
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[9px] gap-1 border-red-500/40 text-red-400 hover:bg-red-500/10"
                onClick={() => onReject(item.id)}
                disabled={approving || rejecting}
                data-testid={`reject-${item.id}`}
              >
                {rejecting ? <Loader2 size={9} className="animate-spin" /> : <ThumbsDown size={9} />}
                Reject
              </Button>
            </div>
          )}
          {item.status === "approved" && (
            <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-green-500/40 text-green-400">
              <CheckCheck size={8} className="mr-1" /> Approved
            </Badge>
          )}
          {item.status === "rejected" && (
            <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-red-500/40 text-red-400">
              <XCircle size={8} className="mr-1" /> Rejected
            </Badge>
          )}
          {item.status === "deployed" && (
            <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-blue-500/40 text-blue-400">
              <CheckCheck size={8} className="mr-1" /> Deployed
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

function DriftAlertItem({ alert, onResolve, resolving }: { alert: any; onResolve: (id: string) => void; resolving: boolean }) {
  const id = alert.alertId ?? alert.id;
  const isResolved = alert.level === "resolved" || !!alert.resolvedAt;
  return (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-2.5 rounded-lg border",
        alert.level === "critical" ? "border-red-500/40 bg-red-500/5" :
        alert.level === "warning"  ? "border-orange-500/40 bg-orange-500/5" :
        alert.level === "watchlist"? "border-yellow-500/30 bg-yellow-500/5" :
                                     "border-border/40 bg-muted/5",
      )}
      data-testid={`drift-alert-${id}`}
    >
      <Bell size={12} className={cn("mt-0.5 shrink-0",
        alert.level === "critical"  ? "text-red-400" :
        alert.level === "warning"   ? "text-orange-400" :
        alert.level === "watchlist" ? "text-yellow-400" : "text-muted-foreground"
      )} />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold leading-snug">
          {alert.detail ?? alert.title ?? alert.metric ?? "Drift alert"}
        </div>
        {alert.metric && (
          <div className="text-[9px] font-mono text-muted-foreground mt-0.5">
            {alert.metric}: baseline {typeof alert.baselineValue === "number" ? (alert.baselineValue * 100).toFixed(1) + "%" : alert.baselineValue}
            {" → "}current {typeof alert.currentValue === "number" ? (alert.currentValue * 100).toFixed(1) + "%" : alert.currentValue}
            {" ("}Δ {typeof alert.delta === "number" ? (alert.delta * 100).toFixed(1) + "%" : alert.delta}{")"}
          </div>
        )}
        <div className="text-[9px] text-muted-foreground mt-0.5">Level: <span className="capitalize">{alert.level}</span></div>
      </div>
      {!isResolved && (
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 text-[9px] gap-1 border-muted hover:bg-muted/20 shrink-0"
          onClick={() => onResolve(id)}
          disabled={resolving}
          data-testid={`resolve-alert-${id}`}
        >
          {resolving ? <Loader2 size={9} className="animate-spin" /> : <CheckCircle size={9} />}
          Resolve
        </Button>
      )}
    </div>
  );
}

// ─── Fix Generator ────────────────────────────────────────────────────────────
function FixGeneratorSection({ run }: { run: any }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<any[] | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [queuedFixes, setQueuedFixes] = useState<Set<string>>(new Set());

  const queueFixMutation = useMutation({
    mutationFn: async ({ fix, pattern }: { fix: any; pattern: string }) => {
      const res = await apiRequest("POST", "/api/ci/learning/queue", {
        type: "kb_fix_suggestion",
        riskLevel: fix.target?.toLowerCase().includes("red") ? "critical" : "high",
        title: `AI Fix: ${fix.target}`,
        rationale: fix.change,
        affectedComplaints: (run?.complaint ? [run.complaint] : []),
        reasons: [fix.impact ?? "", `From pattern: ${pattern}`],
        confidence: 0.75,
      });
      return res.json();
    },
    onSuccess: (_data, { fix }) => {
      const key = `${fix.target}-${fix.change}`;
      setQueuedFixes(prev => new Set([...prev, key]));
      queryClient.invalidateQueries({ queryKey: ["/api/ci/learning/queue"] });
      toast({ title: "Queued for physician review", description: "Fix has been added to the governance queue." });
    },
    onError: () => toast({ title: "Queue failed", description: "Could not queue this fix.", variant: "destructive" }),
  });

  const failures = useMemo(() =>
    (run?.results ?? []).filter((r: any) => !r.dispositionCorrect || r.redFlagMiss),
    [run]
  );

  const topPatterns = useMemo(() => {
    const counts: Record<string, { count: number; complaints: Set<string> }> = {};
    for (const f of failures) {
      const reasons: string[] = [...(f.failureReasons ?? f.reasons ?? [])];
      if (f.redFlagMiss) reasons.push("missed_red_flag");
      if (!f.dispositionCorrect) reasons.push("disposition_error");
      for (const r of reasons) {
        if (!counts[r]) counts[r] = { count: 0, complaints: new Set() };
        counts[r].count++;
        if (f.complaint) counts[r].complaints.add(f.complaint);
      }
    }
    return Object.entries(counts)
      .map(([reason, v]) => ({ reason, count: v.count, complaints: [...v.complaints] }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [failures]);

  async function generate() {
    if (!topPatterns.length) {
      toast({ title: "No failures", description: "No failure patterns detected in this run.", variant: "destructive" });
      return;
    }
    setLoading(true);
    setSuggestions(null);
    try {
      const r = await apiRequest("POST", "/api/simulation-lab/ai/fix-suggestions", {
        topPatterns,
        failures: failures.slice(0, 10),
        passRate: run?.passRate,
        redFlagMisses: run?.redFlagMisses,
      });
      const data = await r.json();
      if (data.ok) setSuggestions(data.suggestions ?? []);
      else toast({ title: "AI error", description: "Fix generator returned an error.", variant: "destructive" });
    } catch {
      toast({ title: "Error", description: "Could not contact fix generator.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  const TARGET_COLORS: Record<string, string> = {
    "Knowledge Base": "border-blue-500/40 bg-blue-500/5 text-blue-300",
    "Disposition": "border-orange-500/40 bg-orange-500/5 text-orange-300",
    "Red-flag": "border-red-500/40 bg-red-500/5 text-red-300",
    "Bayesian": "border-purple-500/40 bg-purple-500/5 text-purple-300",
    "Question": "border-cyan-500/40 bg-cyan-500/5 text-cyan-300",
  };

  function getTargetColor(target: string) {
    for (const [k, v] of Object.entries(TARGET_COLORS)) {
      if (target?.includes(k)) return v;
    }
    return "border-border/40 bg-muted/5 text-muted-foreground";
  }

  return (
    <section data-testid="section-fix-generator">
      <div className="flex items-center gap-2 mb-2">
        <Wrench size={12} className="text-amber-400" />
        <span className="text-xs font-bold">Fix Generator</span>
        {topPatterns.length > 0 && (
          <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-amber-500/30 text-amber-400">
            {topPatterns.length} pattern{topPatterns.length !== 1 ? "s" : ""}
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2.5 text-[9px] gap-1.5 border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
            onClick={generate}
            disabled={loading || !topPatterns.length}
            data-testid="button-generate-fixes"
          >
            {loading ? <Loader2 size={9} className="animate-spin" /> : <Sparkles size={9} />}
            {suggestions ? "Regenerate" : "Generate Fix Suggestions"}
          </Button>
          <button className="text-muted-foreground hover:text-foreground" onClick={() => setCollapsed(c => !c)}>
            {collapsed ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Top patterns ranked bar */}
          <div className="space-y-1 mb-3">
            {topPatterns.length === 0 ? (
              <div className="text-[10px] text-muted-foreground text-center py-3 bg-muted/10 rounded">
                No failure patterns detected — this run passed all cases.
              </div>
            ) : (
              topPatterns.map((p, i) => (
                <div
                  key={p.reason}
                  className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/10 border border-border/30"
                  data-testid={`pattern-${i}`}
                >
                  <span className="text-[9px] font-mono text-muted-foreground w-4 text-right shrink-0">{p.count}×</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-semibold">{p.reason.replace(/_/g, " ")}</span>
                    {p.complaints.length > 0 && (
                      <span className="text-[9px] text-muted-foreground ml-2">
                        {p.complaints.slice(0, 3).map((c: string) => c.replace(/_/g, " ")).join(", ")}
                        {p.complaints.length > 3 && ` +${p.complaints.length - 3}`}
                      </span>
                    )}
                  </div>
                  <div className="h-1.5 bg-muted/20 rounded-full overflow-hidden w-20 shrink-0">
                    <div
                      className="h-full bg-amber-400/70 rounded-full"
                      style={{ width: `${Math.min(100, (p.count / (topPatterns[0]?.count || 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground py-4 justify-center">
              <Loader2 size={11} className="animate-spin text-amber-400" />
              AI is analyzing failure patterns and generating targeted fixes…
            </div>
          )}

          {/* AI suggestions */}
          {suggestions && suggestions.length > 0 && (
            <div className="space-y-3" data-testid="fix-suggestions">
              {suggestions.map((s: any, i: number) => (
                <div key={i} className="border border-border/40 rounded-lg overflow-hidden" data-testid={`fix-group-${i}`}>
                  <div className="px-3 py-1.5 bg-muted/20 border-b border-border/30 flex items-center gap-2">
                    <ListOrdered size={10} className="text-amber-400" />
                    <span className="text-[10px] font-bold capitalize">{(s.pattern ?? "").replace(/_/g, " ")}</span>
                  </div>
                  <div className="p-3 space-y-2">
                    {(s.fixes ?? []).map((fix: any, fi: number) => {
                      const fixKey = `${fix.target}-${fix.change}`;
                      const isQueued = queuedFixes.has(fixKey);
                      return (
                        <div key={fi} className={cn("border rounded px-3 py-2", getTargetColor(fix.target ?? ""))} data-testid={`fix-${i}-${fi}`}>
                          <div className="flex items-center gap-1.5 mb-1">
                            <ArrowRight size={9} />
                            <span className="text-[9px] font-bold uppercase tracking-wider opacity-80 flex-1">{fix.target}</span>
                            <button
                              className={cn(
                                "text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border transition-all flex-shrink-0",
                                isQueued
                                  ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400"
                                  : "bg-background/60 hover:bg-background border-border/50 text-muted-foreground hover:text-foreground"
                              )}
                              disabled={isQueued || queueFixMutation.isPending}
                              onClick={(e) => { e.stopPropagation(); queueFixMutation.mutate({ fix, pattern: s.pattern ?? "" }); }}
                              data-testid={`button-queue-fix-${i}-${fi}`}
                            >
                              {isQueued ? "✓ Queued" : "Queue for Review"}
                            </button>
                          </div>
                          {fix.kbRuleId && (
                            <span className="text-[8px] font-mono px-1 py-0.5 rounded bg-background/70 border border-border/40 text-muted-foreground mr-1 inline-block mb-0.5" data-testid={`badge-kb-rule-id-${i}-${fi}`}>
                              KB: {fix.kbRuleId}
                            </span>
                          )}
                          <div className="text-[10px] leading-snug font-medium">{fix.change}</div>
                          {fix.impact && (
                            <div className="text-[9px] text-muted-foreground italic mt-0.5">{fix.impact}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          {suggestions && suggestions.length === 0 && !loading && (
            <div className="text-[10px] text-muted-foreground text-center py-2">No suggestions generated.</div>
          )}
        </>
      )}
    </section>
  );
}

// ─── Heatmap Tab ─────────────────────────────────────────────────────────────
function HeatmapTab({ run }: { run: RunResult | null }) {
  const failures = useMemo(() =>
    (run?.results ?? []).filter((r: any) => !r.dispositionCorrect || r.redFlagMiss),
    [run]
  );

  const { complaints, reasons, grid } = useMemo(() => {
    const complaintSet = new Set<string>();
    const reasonSet = new Set<string>();
    const raw: Record<string, Record<string, number>> = {};

    for (const f of failures) {
      const complaint = f.complaint ?? "unknown";
      const rs: string[] = [...(f.failureReasons ?? f.reasons ?? [])];
      if (f.redFlagMiss) rs.push("missed_red_flag");
      if (!f.dispositionCorrect) rs.push("disposition_error");

      complaintSet.add(complaint);
      for (const r of rs) {
        reasonSet.add(r);
        if (!raw[complaint]) raw[complaint] = {};
        raw[complaint][r] = (raw[complaint][r] ?? 0) + 1;
      }
    }

    const complaints = [...complaintSet].sort();
    const reasons = [...reasonSet].sort();
    const grid = complaints.map(c => reasons.map(r => raw[c]?.[r] ?? 0));
    return { complaints, reasons, grid };
  }, [failures]);

  const topComplaints = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of failures) {
      const c = f.complaint ?? "unknown";
      counts[c] = (counts[c] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15);
  }, [failures]);

  const maxCell = useMemo(() => Math.max(1, ...grid.flat()), [grid]);

  function heatColor(v: number) {
    if (v === 0) return "bg-muted/10 text-transparent";
    const pct = v / maxCell;
    if (pct > 0.75) return "bg-red-500/80 text-white font-bold";
    if (pct > 0.5)  return "bg-orange-500/70 text-white font-semibold";
    if (pct > 0.25) return "bg-yellow-500/60 text-foreground font-medium";
    return "bg-yellow-400/30 text-foreground";
  }

  if (!run) return null;

  if (failures.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
        <CheckCircle size={36} className="text-green-400/50" />
        <div>
          <div className="text-sm font-semibold mb-1 text-green-400">No Failures</div>
          <div className="text-xs text-muted-foreground">All {run.totalCases} cases passed — no heatmap data to display.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-5 space-y-6">
      {/* Top complaint failure bar */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 size={13} className="text-violet-400" />
          <span className="text-sm font-bold">Complaint Failure Rate</span>
          <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-violet-500/30 text-violet-400">
            Top {topComplaints.length}
          </Badge>
        </div>
        <div className="space-y-1.5">
          {topComplaints.map(([complaint, count]) => (
            <div key={complaint} className="flex items-center gap-2" data-testid={`complaint-bar-${complaint}`}>
              <div className="w-36 shrink-0 text-[10px] text-right text-muted-foreground truncate">
                {complaint.replace(/_/g, " ")}
              </div>
              <div className="flex-1 h-5 bg-muted/20 rounded overflow-hidden">
                <div
                  className="h-full bg-violet-500/60 rounded flex items-center pl-1.5"
                  style={{ width: `${Math.max(8, (count / (topComplaints[0]?.[1] || 1)) * 100)}%` }}
                >
                  <span className="text-[9px] text-white font-semibold whitespace-nowrap">{count} failure{count !== 1 ? "s" : ""}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Heatmap grid */}
      {complaints.length > 0 && reasons.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <LayoutGrid size={13} className="text-cyan-400" />
            <span className="text-sm font-bold">Failure Heatmap</span>
            <span className="text-[10px] text-muted-foreground">Complaint × Failure Type</span>
          </div>
          <div className="overflow-auto max-h-[420px] border border-border/30 rounded-lg">
            <table className="text-[9px] border-collapse w-full">
              <thead>
                <tr className="bg-muted/30 sticky top-0 z-10">
                  <th className="text-left px-2 py-1.5 font-semibold text-muted-foreground border-b border-r border-border/30 min-w-[120px]">
                    Complaint
                  </th>
                  {reasons.map(r => (
                    <th key={r} className="px-1.5 py-1.5 text-center font-semibold text-muted-foreground border-b border-border/30 min-w-[80px]">
                      <div className="writing-mode-vertical" style={{ writingMode: "vertical-lr", transform: "rotate(180deg)", maxHeight: 80, whiteSpace: "nowrap" }}>
                        {r.replace(/_/g, " ")}
                      </div>
                    </th>
                  ))}
                  <th className="px-2 py-1.5 text-center font-semibold text-muted-foreground border-b border-l border-border/30">Total</th>
                </tr>
              </thead>
              <tbody>
                {complaints.map((c, ci) => {
                  const rowTotal = grid[ci].reduce((a, b) => a + b, 0);
                  return (
                    <tr key={c} className="border-b border-border/20 hover:bg-muted/10">
                      <td className="px-2 py-1 border-r border-border/30 font-medium text-[9px] text-muted-foreground whitespace-nowrap">
                        {c.replace(/_/g, " ")}
                      </td>
                      {grid[ci].map((v, ri) => (
                        <td key={ri} className={cn("px-1 py-1 text-center text-[9px] border-border/20", heatColor(v))} data-testid={`heatcell-${c}-${reasons[ri]}`}>
                          {v > 0 ? v : ""}
                        </td>
                      ))}
                      <td className="px-2 py-1 text-center font-bold border-l border-border/30 text-[9px]">
                        {rowTotal}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Legend */}
          <div className="flex items-center gap-3 mt-2 text-[9px] text-muted-foreground flex-wrap">
            <span className="font-semibold">Intensity:</span>
            {[
              { label: "Low", cls: "bg-yellow-400/30" },
              { label: "Moderate", cls: "bg-yellow-500/60" },
              { label: "High", cls: "bg-orange-500/70" },
              { label: "Critical", cls: "bg-red-500/80" },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-1">
                <div className={cn("w-3 h-3 rounded", l.cls)} />
                <span>{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LearningEngineTab({ run }: { run: any }) {
  const { toast } = useToast();
  const [queueStatus, setQueueStatus] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [actingId, setActingId] = useState<string | null>(null);
  const [actingAction, setActingAction] = useState<"approve" | "reject" | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const statsQ = useQuery<any>({ queryKey: ["/api/ci/learning/queue/stats"], refetchInterval: 10_000 });
  const driftQ = useQuery<any>({ queryKey: ["/api/ci/drift/stats"], refetchInterval: 15_000 });
  const alertsQ = useQuery<any>({ queryKey: ["/api/ci/drift/alerts"], refetchInterval: 15_000 });

  const queueKey = queueStatus === "all"
    ? "/api/ci/learning/queue?limit=30"
    : `/api/ci/learning/queue?status=${queueStatus}&limit=30`;
  const queueQ = useQuery<any>({ queryKey: [queueKey], refetchInterval: 12_000 });

  const approveMut = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/ci/learning/queue/${id}/approve`, { reviewedBy: "admin" }).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Approved", description: "Learning proposal approved and queued for deployment." });
      queryClient.invalidateQueries({ queryKey: [queueKey] });
      queryClient.invalidateQueries({ queryKey: ["/api/ci/learning/queue/stats"] });
    },
    onError: () => toast({ title: "Error", description: "Could not approve proposal.", variant: "destructive" }),
    onSettled: () => { setActingId(null); setActingAction(null); },
  });

  const rejectMut = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/ci/learning/queue/${id}/reject`, { reviewedBy: "admin" }).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Rejected", description: "Proposal rejected and archived." });
      queryClient.invalidateQueries({ queryKey: [queueKey] });
      queryClient.invalidateQueries({ queryKey: ["/api/ci/learning/queue/stats"] });
    },
    onError: () => toast({ title: "Error", description: "Could not reject proposal.", variant: "destructive" }),
    onSettled: () => { setActingId(null); setActingAction(null); },
  });

  const resolveMut = useMutation({
    mutationFn: async (alertId: string) => apiRequest("POST", `/api/ci/drift/alerts/${alertId}/resolve`, {}).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Alert resolved", description: "Drift alert marked as resolved." });
      queryClient.invalidateQueries({ queryKey: ["/api/ci/drift/alerts"] });
    },
    onError: () => toast({ title: "Error", description: "Could not resolve alert.", variant: "destructive" }),
    onSettled: () => setResolvingId(null),
  });

  const pushToLearningMut = useMutation({
    mutationFn: async () => {
      if (!run) throw new Error("No run to push");
      return apiRequest("POST", "/api/simulation-lab/top50/push-to-learning", run).then(r => r.json());
    },
    onSuccess: (data: any) => {
      toast({ title: "Pushed to learning queue", description: `${data.pushed ?? 0} learning signal(s) generated from this run.` });
      queryClient.invalidateQueries({ queryKey: ["/api/ci/learning/queue/stats"] });
      queryClient.invalidateQueries({ queryKey: [queueKey] });
    },
    onError: () => toast({ title: "Error", description: "Could not push to learning queue.", variant: "destructive" }),
  });

  const stats = statsQ.data;
  const drift = driftQ.data;
  const alerts: any[] = alertsQ.data?.active ?? [];
  const queueItems: any[] = Array.isArray(queueQ.data) ? queueQ.data : (queueQ.data?.items ?? []);

  const activeAlerts = alerts.filter((a: any) => a.level !== "resolved" && !a.resolvedAt);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BrainCircuit size={14} className="text-violet-400" />
            <span className="text-sm font-bold">Learning Control Panel</span>
            {(statsQ.isLoading || driftQ.isLoading) && <Loader2 size={10} className="animate-spin text-muted-foreground" />}
          </div>
          {run && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[10px] gap-1.5 border-violet-500/40 text-violet-400 hover:bg-violet-500/10"
              onClick={() => pushToLearningMut.mutate()}
              disabled={pushToLearningMut.isPending}
              data-testid="button-push-to-learning"
            >
              {pushToLearningMut.isPending ? <Loader2 size={10} className="animate-spin" /> : <Brain size={10} />}
              Push Run to Learning
            </Button>
          )}
        </div>

        {/* Stat ribbon */}
        <div className="grid grid-cols-4 gap-2 mt-3">
          {[
            { label: "Pending", value: stats?.pending ?? "—", color: "text-yellow-400", icon: <Clock size={10} /> },
            { label: "Approved", value: stats?.approved ?? "—", color: "text-green-400", icon: <CheckCheck size={10} /> },
            { label: "Deployed", value: stats?.deployed ?? "—", color: "text-blue-400", icon: <CheckCircle size={10} /> },
            { label: "Active Alerts", value: activeAlerts.length, color: activeAlerts.length > 0 ? "text-red-400" : "text-muted-foreground", icon: <Bell size={10} /> },
          ].map(s => (
            <div key={s.label} className="bg-muted/20 rounded-lg px-3 py-2 flex items-center gap-2">
              <span className={s.color}>{s.icon}</span>
              <div>
                <div className={cn("text-sm font-black leading-none", s.color)}>{s.value}</div>
                <div className="text-[9px] text-muted-foreground mt-0.5">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-5">

        {/* ── Drift Monitor ─────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <Gauge size={12} className="text-orange-400" />
            <span className="text-xs font-bold">Drift Monitor</span>
            {drift && (() => {
              const lvl = drift.criticalAlerts > 0 ? "critical" : drift.activeAlerts > 0 ? "warning" : "ok";
              return (
                <Badge variant="outline" className={cn("text-[9px] h-4 px-1.5 ml-auto",
                  lvl === "critical" ? "border-red-500/40 text-red-400" :
                  lvl === "warning"  ? "border-orange-500/40 text-orange-400" :
                                       "border-green-500/40 text-green-400",
                )}>
                  {lvl.toUpperCase()}
                </Badge>
              );
            })()}
          </div>

          {driftQ.isLoading ? (
            <div className="text-[10px] text-muted-foreground p-3">Loading drift data…</div>
          ) : drift ? (
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Latest Accuracy", value: drift.latestAccuracy != null ? `${(drift.latestAccuracy * 100).toFixed(1)}%` : "—", trend: drift.accuracyTrend === "improving" ? "up" : drift.accuracyTrend === "degrading" ? "down" : undefined },
                { label: "Baseline Accuracy", value: drift.baselineAccuracy != null ? `${(drift.baselineAccuracy * 100).toFixed(1)}%` : "—" },
                { label: "Active Alerts", value: drift.activeAlerts ?? "—", color: (drift.activeAlerts ?? 0) > 0 ? "text-red-400" : undefined },
                { label: "Critical Alerts", value: drift.criticalAlerts ?? "—", color: (drift.criticalAlerts ?? 0) > 0 ? "text-red-400" : undefined },
                { label: "Total Snapshots", value: drift.totalSnapshots ?? "—" },
                { label: "Trend", value: drift.accuracyTrend ?? "stable", trend: drift.accuracyTrend === "improving" ? "up" : drift.accuracyTrend === "degrading" ? "down" : undefined },
              ].map(m => (
                <div key={m.label} className="bg-muted/20 rounded px-3 py-2">
                  <div className="flex items-center gap-1">
                    <span className={cn("text-xs font-bold", (m as any).color)}>{m.value}</span>
                    {m.trend === "up" && <TrendingUp size={9} className="text-green-400" />}
                    {m.trend === "down" && <TrendingDown size={9} className="text-red-400" />}
                  </div>
                  <div className="text-[9px] text-muted-foreground">{m.label}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[10px] text-muted-foreground p-3 bg-muted/10 rounded">
              No drift snapshots yet. Run a simulation to generate baseline data.
            </div>
          )}

          {/* Active alerts */}
          {activeAlerts.length > 0 && (
            <div className="mt-3 space-y-2">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                Active Drift Alerts ({activeAlerts.length})
              </div>
              {activeAlerts.slice(0, 5).map((alert: any) => (
                <DriftAlertItem
                  key={alert.id}
                  alert={alert}
                  onResolve={(id) => { setResolvingId(id); resolveMut.mutate(id); }}
                  resolving={resolvingId === alert.id && resolveMut.isPending}
                />
              ))}
              {activeAlerts.length > 5 && (
                <div className="text-[9px] text-muted-foreground text-center">
                  +{activeAlerts.length - 5} more alerts not shown
                </div>
              )}
            </div>
          )}
          {!alertsQ.isLoading && activeAlerts.length === 0 && (
            <div className="mt-2 flex items-center gap-2 text-[10px] text-green-400 bg-green-500/5 border border-green-500/20 rounded px-3 py-1.5">
              <CheckCircle size={10} /> No active drift alerts
            </div>
          )}
        </section>

        {/* ── Learning Queue ────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <Brain size={12} className="text-violet-400" />
            <span className="text-xs font-bold">Governance Queue</span>
            <div className="ml-auto flex gap-1">
              {(["pending", "approved", "rejected", "all"] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setQueueStatus(s)}
                  className={cn(
                    "text-[9px] px-2 py-0.5 rounded border transition-colors",
                    queueStatus === s
                      ? "bg-violet-500/20 border-violet-500/40 text-violet-300"
                      : "border-border/30 text-muted-foreground hover:border-border",
                  )}
                  data-testid={`filter-queue-${s}`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {queueQ.isLoading ? (
            <div className="text-[10px] text-muted-foreground p-3">Loading queue…</div>
          ) : queueItems.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <Lock size={20} className="mx-auto text-muted-foreground/30" />
              <div className="text-[10px] text-muted-foreground">
                {queueStatus === "pending"
                  ? "No pending proposals. Run a simulation to generate learning signals."
                  : `No ${queueStatus} items in the queue.`}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {queueItems.map((item: any) => (
                <LearningQueueItem
                  key={item.id}
                  item={item}
                  onApprove={(id) => { setActingId(id); setActingAction("approve"); approveMut.mutate(id); }}
                  onReject={(id) => { setActingId(id); setActingAction("reject"); rejectMut.mutate(id); }}
                  approving={actingId === item.id && actingAction === "approve" && approveMut.isPending}
                  rejecting={actingId === item.id && actingAction === "reject" && rejectMut.isPending}
                />
              ))}
              {queueItems.length >= 30 && (
                <div className="text-[9px] text-muted-foreground text-center pt-1">
                  Showing 30 most recent. Use the CI dashboard for full history.
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── Signal Explorer ───────────────────────────────────────────── */}
        {run && (
          <section>
            <div className="flex items-center gap-2 mb-2">
              <Activity size={12} className="text-cyan-400" />
              <span className="text-xs font-bold">Last Run Signal Summary</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Pass Rate", value: `${Math.round(run.passRate * 100)}%`, color: run.passRate >= 0.7 ? "text-green-400" : run.passRate >= 0.5 ? "text-yellow-400" : "text-red-400" },
                { label: "Red-Flag Misses", value: run.redFlagMisses, color: run.redFlagMisses > 0 ? "text-red-400" : "text-green-400" },
                { label: "Total Cases", value: run.totalCases, color: "text-foreground" },
                { label: "Critical Failures", value: run.criticalFailures?.length ?? 0, color: (run.criticalFailures?.length ?? 0) > 0 ? "text-red-400" : "text-green-400" },
              ].map(m => (
                <div key={m.label} className="bg-muted/20 rounded px-3 py-2 flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">{m.label}</span>
                  <span className={cn("text-sm font-black", m.color)}>{m.value}</span>
                </div>
              ))}
            </div>

            {run.criticalFailures?.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Critical Failures ({run.criticalFailures.length})
                </div>
                {run.criticalFailures.slice(0, 5).map((cf: any) => (
                  <div key={cf.caseId} className="flex items-start gap-2 px-3 py-2 border border-red-500/30 bg-red-500/5 rounded-lg" data-testid={`critical-failure-${cf.caseId}`}>
                    <ShieldAlert size={10} className="text-red-400 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-semibold">{cf.caseId}</span>
                        <span className="text-[9px] text-muted-foreground">{cf.complaint?.replace(/_/g, " ")}</span>
                        {cf.severity === "critical" && <Badge variant="destructive" className="text-[8px] h-3.5 px-1">CRITICAL</Badge>}
                      </div>
                      {cf.clinicalNote && <div className="text-[9px] text-muted-foreground mt-0.5">{cf.clinicalNote}</div>}
                      <div className="flex gap-3 text-[9px] mt-0.5">
                        <span className="text-muted-foreground">Expected: <span className="text-foreground">{cf.expected}</span></span>
                        <span className="text-muted-foreground">Got: <span className="text-red-300">{cf.predicted}</span></span>
                      </div>
                      {cf.reasons?.length > 0 && (
                        <div className="text-[9px] text-orange-300/80 mt-0.5">Reason: {cf.reasons[0]}</div>
                      )}
                    </div>
                  </div>
                ))}
                {run.criticalFailures.length > 5 && (
                  <div className="text-[9px] text-muted-foreground text-center">
                    +{run.criticalFailures.length - 5} more
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* ── Fix Generator ──────────────────────────────────────────────── */}
        {run && <FixGeneratorSection run={run} />}

      </div>
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
                  <TabsTrigger value="learning" className="text-[10px] h-6 px-3" data-testid="tab-learning">
                    <BrainCircuit size={10} className="mr-1.5" /> Learning Engine
                  </TabsTrigger>
                  <TabsTrigger value="heatmap" className="text-[10px] h-6 px-3" data-testid="tab-heatmap">
                    <LayoutGrid size={10} className="mr-1.5" /> Heatmap
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
              <TabsContent value="learning" className="flex-1 overflow-hidden m-0 data-[state=active]:flex data-[state=active]:flex-col">
                <LearningEngineTab run={run} />
              </TabsContent>
              <TabsContent value="heatmap" className="flex-1 overflow-hidden m-0 data-[state=active]:flex data-[state=active]:flex-col">
                <HeatmapTab run={run} />
              </TabsContent>
            </Tabs>
          )}
        </main>
      </div>
    </div>
  );
}
