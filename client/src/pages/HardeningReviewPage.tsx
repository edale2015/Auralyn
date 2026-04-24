import { useState, useRef, useEffect } from "react";
import { useQuery }                     from "@tanstack/react-query";
import { apiRequest }                   from "@/lib/queryClient";
import { cn }                           from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge }   from "@/components/ui/badge";
import { Button }  from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Shield, Play, CheckCircle2, AlertTriangle, XCircle,
  ChevronRight, Copy, RefreshCw, Lock, Activity, FileCode,
  GitMerge, Terminal, Bug,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface HardeningPhase {
  phase:        number;
  title:        string;
  description:  string;
  filesChanged: string[];
  steps:        string[];
  risks:        string[];
  testsCover:   string[];
}

interface IntegrationReview {
  filesThatCopyDirectly:    string[];
  filesThatNeedMerge:       string[];
  missingImports:           string[];
  missingSchemaDefinitions: string[];
  routeRegistrationChanges: string[];
  likelyCompileErrors:      string[];
}

interface HardeningResult {
  integrationReview:     IntegrationReview;
  phases:                HardeningPhase[];
  filesChanged:          string[];
  manualMergeConflicts:  string[];
  replitCommands:        string[];
  remainingConcerns: {
    clinical:  string[];
    hipaa:     string[];
    fda:       string[];
    security:  string[];
  };
  model:      string;
  durationMs: number;
  timestamp:  string;
}

// ── Colour helpers ─────────────────────────────────────────────────────────────
const sectionColour = (count: number, good = false) =>
  good
    ? count === 0 ? "text-emerald-400" : "text-slate-400"
    : count === 0 ? "text-emerald-400" : "text-red-400";

// ── Copy button ───────────────────────────────────────────────────────────────
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="ml-2 text-slate-500 hover:text-slate-300 transition-colors"
      title="Copy"
    >
      {copied ? <CheckCircle2 size={13} className="text-emerald-400" /> : <Copy size={13} />}
    </button>
  );
}

// ── Section block ─────────────────────────────────────────────────────────────
function Section({ title, items, icon, colour }: { title: string; items: string[]; icon: React.ReactNode; colour?: string }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
        {icon} {title} <span className={cn("ml-1", colour ?? "text-slate-500")}>({items.length})</span>
      </div>
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2 text-xs text-slate-300 bg-slate-800/40 rounded px-2 py-1.5">
          <ChevronRight size={11} className="text-slate-500 mt-0.5 flex-shrink-0" />
          <span className="font-mono break-all">{item}</span>
          <CopyBtn text={item} />
        </div>
      ))}
    </div>
  );
}

// ── Phase card ────────────────────────────────────────────────────────────────
function PhaseCard({ phase }: { phase: HardeningPhase }) {
  const [open, setOpen] = useState(phase.phase <= 2);
  const riskCount = phase.risks.filter(r => !r.toLowerCase().startsWith("low")).length;

  return (
    <Card className="bg-slate-900/60 border-slate-700/60">
      <CardHeader
        className="pb-2 pt-3 px-4 cursor-pointer select-none"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-violet-900/60 border border-violet-500/40 flex items-center justify-center text-xs font-bold text-violet-300 flex-shrink-0">
            {phase.phase}
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm text-slate-200">{phase.title}</CardTitle>
            <p className="text-[11px] text-slate-500 mt-0.5">{phase.description}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge variant="outline" className="text-[10px] border-slate-600 text-slate-400">
              {phase.filesChanged.length} files
            </Badge>
            {riskCount > 0 && (
              <Badge className="text-[10px] bg-orange-900/50 text-orange-300 border-orange-700">
                {riskCount} risks
              </Badge>
            )}
            <ChevronRight size={14} className={cn("text-slate-500 transition-transform", open && "rotate-90")} />
          </div>
        </div>
      </CardHeader>

      {open && (
        <CardContent className="px-4 pb-4 space-y-4">
          {phase.steps.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Steps</p>
              <ol className="space-y-1">
                {phase.steps.map((s, i) => (
                  <li key={i} className="text-xs text-slate-300 flex items-start gap-2">
                    <span className="text-violet-400 font-mono flex-shrink-0">{i + 1}.</span>
                    {s}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {phase.filesChanged.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Files changed</p>
              <div className="flex flex-wrap gap-1">
                {phase.filesChanged.map(f => (
                  <span key={f} className="text-[10px] font-mono bg-slate-800 text-slate-300 rounded px-1.5 py-0.5 border border-slate-700/60">{f}</span>
                ))}
              </div>
            </div>
          )}

          {phase.risks.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-orange-400 uppercase tracking-wider mb-1.5">Risks</p>
              {phase.risks.map((r, i) => (
                <div key={i} className="text-xs text-orange-300 flex items-start gap-1.5 mb-1">
                  <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" /> {r}
                </div>
              ))}
            </div>
          )}

          {phase.testsCover.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mb-1.5">Tests that must cover this</p>
              {phase.testsCover.map((t, i) => (
                <div key={i} className="text-xs text-emerald-300 flex items-start gap-1.5 mb-1">
                  <CheckCircle2 size={11} className="flex-shrink-0 mt-0.5" /> {t}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function HardeningReviewPage() {
  const [status,     setStatus]     = useState<"idle" | "running" | "done" | "error">("idle");
  const [logs,       setLogs]       = useState<string[]>([]);
  const [result,     setResult]     = useState<HardeningResult | null>(null);
  const [error,      setError]      = useState<string | null>(null);
  const [customRecs, setCustomRecs] = useState("");
  const [activeTab,  setActiveTab]  = useState<"integration" | "phases" | "commands" | "concerns">("phases");
  const logsEndRef = useRef<HTMLDivElement>(null);

  const { data: goalsData } = useQuery<{ goals: string }>({
    queryKey: ["/api/hardening-review/goals"],
  });

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  async function runReview() {
    setStatus("running");
    setLogs([]);
    setResult(null);
    setError(null);

    try {
      const res = await fetch("/api/hardening-review/run", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ gpt_recommendations: customRecs || undefined }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";

        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(part.slice(6));
            if (evt.type === "progress") {
              setLogs(l => [...l, evt.message]);
            } else if (evt.type === "complete") {
              setResult(evt.result);
              setStatus("done");
            } else if (evt.type === "error") {
              setError(evt.error);
              setStatus("error");
            }
          } catch {}
        }
      }

      if (status !== "done" && status !== "error") setStatus("done");
    } catch (err: any) {
      setError(err?.message ?? "Unknown error");
      setStatus("error");
    }
  }

  const tabs = [
    { id: "phases",      label: "Phases",              icon: <Activity size={12} /> },
    { id: "integration", label: "Integration Review",   icon: <GitMerge size={12} /> },
    { id: "commands",    label: "Replit Commands",      icon: <Terminal size={12} /> },
    { id: "concerns",    label: "Remaining Concerns",   icon: <Bug size={12} /> },
  ] as const;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-5 space-y-5">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Shield size={20} className="text-violet-400" />
          <h1 className="text-base font-bold tracking-tight">Hardening Review</h1>
          <Badge variant="outline" className="text-[10px] border-violet-500/40 text-violet-300">GPT-4o → Claude</Badge>
        </div>
        <p className="text-xs text-slate-500 ml-2">
          15 slices + ChatGPT recommendations → Claude integration plan
        </p>
        <div className="ml-auto">
          <Button
            data-testid="btn-run-hardening-review"
            size="sm"
            onClick={runReview}
            disabled={status === "running"}
            className="bg-violet-600 hover:bg-violet-700 text-white text-xs h-7"
          >
            {status === "running"
              ? <><RefreshCw size={12} className="mr-1 animate-spin" /> Reviewing…</>
              : <><Play size={12} className="mr-1" /> Run Review</>}
          </Button>
        </div>
      </div>

      {/* ── Custom recommendations input ──────────────────────────────────── */}
      <Card className="bg-slate-900/60 border-slate-700/60">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
            <FileCode size={13} className="text-violet-400" />
            ChatGPT Recommendations
            <span className="text-[10px] text-slate-500 font-normal ml-1">(pre-filled with 7 hardening goals — edit or leave as-is)</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <textarea
            data-testid="input-gpt-recommendations"
            className="w-full h-36 bg-slate-800/60 border border-slate-700/60 rounded-lg p-3 text-xs text-slate-300 font-mono resize-none focus:outline-none focus:border-violet-500/60"
            placeholder={goalsData?.goals ?? "Loading default recommendations…"}
            value={customRecs}
            onChange={e => setCustomRecs(e.target.value)}
          />
          <p className="text-[10px] text-slate-500 mt-1">Leave blank to use the 7 default ChatGPT hardening goals. Paste any custom GPT-4o recommendations here to override.</p>
        </CardContent>
      </Card>

      {/* ── Progress log ─────────────────────────────────────────────────── */}
      {(logs.length > 0 || status === "running") && (
        <Card className="bg-slate-900/60 border-slate-700/60">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <RefreshCw size={12} className={cn("text-violet-400", status === "running" && "animate-spin")} />
              <span className="text-xs font-semibold text-slate-400">Progress</span>
            </div>
            <div className="space-y-0.5 text-[11px] font-mono text-slate-400">
              {logs.map((l, i) => <div key={i}>{l}</div>)}
              <div ref={logsEndRef} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Error ────────────────────────────────────────────────────────── */}
      {error && (
        <div className="bg-red-900/30 border border-red-500/40 rounded-xl p-3 flex items-start gap-2">
          <XCircle size={14} className="text-red-400 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-300">Review failed</p>
            <p className="text-xs text-red-400 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* ── Results ──────────────────────────────────────────────────────── */}
      {result && (
        <>
          {/* Summary banner */}
          <div className="bg-violet-900/20 border border-violet-500/30 rounded-xl p-3 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-violet-400" />
              <span className="text-sm font-semibold text-violet-300">Review Complete</span>
              <Badge variant="outline" className="text-[10px] border-violet-500/40 text-violet-400">{result.model}</Badge>
            </div>
            <span className="text-xs text-slate-400">{(result.durationMs / 1000).toFixed(1)}s</span>
            <span className="text-xs text-slate-400">{result.phases?.length ?? 0} phases</span>
            <span className="text-xs text-slate-400">{result.filesChanged?.length ?? 0} files</span>
            <span className={cn("text-xs", result.manualMergeConflicts?.length > 0 ? "text-orange-400" : "text-emerald-400")}>
              {result.manualMergeConflicts?.length ?? 0} merge conflicts
            </span>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-slate-800/60">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors",
                  activeTab === t.id
                    ? "border-violet-500 text-violet-300"
                    : "border-transparent text-slate-500 hover:text-slate-300"
                )}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* Phase plan */}
          {activeTab === "phases" && (
            <div className="space-y-3">
              {(result.phases ?? []).map(p => <PhaseCard key={p.phase} phase={p} />)}
            </div>
          )}

          {/* Integration review */}
          {activeTab === "integration" && (
            <div className="space-y-4">
              <Section
                title="Files that can be copied directly"
                items={result.integrationReview?.filesThatCopyDirectly ?? []}
                icon={<CheckCircle2 size={12} className="text-emerald-400" />}
                colour="text-emerald-400"
              />
              <Section
                title="Files that need manual merge"
                items={result.integrationReview?.filesThatNeedMerge ?? []}
                icon={<GitMerge size={12} className="text-orange-400" />}
                colour="text-orange-400"
              />
              <Section
                title="Missing imports"
                items={result.integrationReview?.missingImports ?? []}
                icon={<AlertTriangle size={12} className="text-yellow-400" />}
                colour="text-yellow-400"
              />
              <Section
                title="Missing Drizzle schema definitions"
                items={result.integrationReview?.missingSchemaDefinitions ?? []}
                icon={<FileCode size={12} className="text-red-400" />}
                colour="text-red-400"
              />
              <Section
                title="Route registration changes (server/index.ts)"
                items={result.integrationReview?.routeRegistrationChanges ?? []}
                icon={<Activity size={12} className="text-blue-400" />}
                colour="text-blue-400"
              />
              <Section
                title="Likely compile errors"
                items={result.integrationReview?.likelyCompileErrors ?? []}
                icon={<Bug size={12} className="text-red-400" />}
                colour="text-red-400"
              />
              {result.manualMergeConflicts?.length > 0 && (
                <Section
                  title="Manual merge conflicts"
                  items={result.manualMergeConflicts}
                  icon={<XCircle size={12} className="text-red-400" />}
                  colour="text-red-400"
                />
              )}
            </div>
          )}

          {/* Replit commands */}
          {activeTab === "commands" && (
            <div className="space-y-2">
              {(result.replitCommands ?? []).length === 0 ? (
                <p className="text-xs text-slate-500">No commands specified.</p>
              ) : (
                (result.replitCommands ?? []).map((cmd, i) => (
                  <div key={i} className="flex items-center gap-2 bg-slate-800/60 border border-slate-700/40 rounded-lg px-3 py-2">
                    <Terminal size={12} className="text-slate-500 flex-shrink-0" />
                    <code className="text-xs font-mono text-emerald-300 flex-1">{cmd}</code>
                    <CopyBtn text={cmd} />
                  </div>
                ))
              )}
            </div>
          )}

          {/* Remaining concerns */}
          {activeTab === "concerns" && (
            <div className="space-y-4">
              <Section title="Clinical"  items={result.remainingConcerns?.clinical  ?? []} icon={<AlertTriangle size={12} className="text-red-400" />}    colour="text-red-400" />
              <Section title="HIPAA"     items={result.remainingConcerns?.hipaa     ?? []} icon={<Lock size={12}          className="text-orange-400" />} colour="text-orange-400" />
              <Section title="FDA SaMD"  items={result.remainingConcerns?.fda       ?? []} icon={<Shield size={12}        className="text-yellow-400" />} colour="text-yellow-400" />
              <Section title="Security"  items={result.remainingConcerns?.security  ?? []} icon={<Bug size={12}           className="text-red-400" />}    colour="text-red-400" />
              {Object.values(result.remainingConcerns ?? {}).every(a => a.length === 0) && (
                <div className="flex items-center gap-2 text-emerald-400 text-sm">
                  <CheckCircle2 size={14} /> No remaining concerns flagged.
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {status === "idle" && !result && (
        <div className="text-center py-16 text-slate-500">
          <Shield size={36} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">Click <strong className="text-slate-400">Run Review</strong> to send all 15 slices + ChatGPT recommendations to Claude</p>
          <p className="text-xs mt-1 text-slate-600">Claude will perform an integration review and return a 6-phase hardening plan</p>
        </div>
      )}
    </div>
  );
}
