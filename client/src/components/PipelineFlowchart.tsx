/**
 * PipelineFlowchart.tsx
 *
 * Visual flowchart of the 13-step clinical pipeline for a given complaint.
 * Shows: step boxes → arrows → decision diamond at Step 5 (red flag) →
 * hard-stop branch (ER) or continue path.
 *
 * Data from GET /api/master-rules/pipeline/:complaint_id
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input }  from "@/components/ui/input";
import { Badge }  from "@/components/ui/badge";
import { Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("app_auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─── Step definitions (canonical 13-step) ────────────────────────────────────

interface StepDef {
  step:     number;
  name:     string;
  short:    string;
  ruleType: string | null;
  shape:    "box" | "diamond" | "terminal";
  color:    string;   // fill color class
  border:   string;   // border color class
  textCol:  string;
}

const STEPS: StepDef[] = [
  { step:  1, name: "Complaint Identification",  short: "Chief Complaint",   ruleType: null,             shape: "box",      color: "bg-slate-700",   border: "border-slate-700",  textCol: "text-white" },
  { step:  2, name: "Modifier Evaluation",       short: "Modifiers",         ruleType: "modifier",       shape: "box",      color: "bg-amber-500",   border: "border-amber-500",  textCol: "text-white" },
  { step:  3, name: "Core Questions",            short: "Core Questions",    ruleType: "question",       shape: "box",      color: "bg-cyan-500",    border: "border-cyan-500",   textCol: "text-white" },
  { step:  4, name: "Secondary Questions",       short: "Secondary Qs",      ruleType: "question",       shape: "box",      color: "bg-sky-500",     border: "border-sky-500",    textCol: "text-white" },
  { step:  5, name: "Red Flag Safety Screen",    short: "Red Flag Screen",   ruleType: "red_flag",       shape: "diamond",  color: "bg-red-600",     border: "border-red-600",    textCol: "text-white" },
  { step:  6, name: "Cluster Scoring",           short: "Cluster Scoring",   ruleType: "cluster_scoring",shape: "box",      color: "bg-purple-500",  border: "border-purple-500", textCol: "text-white" },
  { step:  7, name: "Diagnosis Ranking",         short: "Diagnosis",         ruleType: "diagnosis",      shape: "box",      color: "bg-blue-600",    border: "border-blue-600",   textCol: "text-white" },
  { step:  8, name: "Disposition Determination", short: "Disposition",       ruleType: "disposition",    shape: "box",      color: "bg-indigo-600",  border: "border-indigo-600", textCol: "text-white" },
  { step:  9, name: "Workup Selection",          short: "Workup",            ruleType: "workup",         shape: "box",      color: "bg-teal-600",    border: "border-teal-600",   textCol: "text-white" },
  { step: 10, name: "Medication Groups",         short: "Medications",       ruleType: "medication",     shape: "box",      color: "bg-green-600",   border: "border-green-600",  textCol: "text-white" },
  { step: 11, name: "Medication Safety Filters", short: "Med Safety",        ruleType: "medication",     shape: "box",      color: "bg-green-500",   border: "border-green-500",  textCol: "text-white" },
  { step: 12, name: "Plan Finalization",         short: "Plan",              ruleType: "plan",           shape: "box",      color: "bg-emerald-600", border: "border-emerald-600",textCol: "text-white" },
  { step: 13, name: "Audit Trail",               short: "Audit",             ruleType: null,             shape: "terminal", color: "bg-slate-500",   border: "border-slate-500",  textCol: "text-white" },
];

// ─── Arrow connector ──────────────────────────────────────────────────────────

function Arrow({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="w-0.5 h-4 bg-slate-400" />
      {label && <span className="text-[10px] text-slate-500 -mt-0.5 mb-0.5 px-1 bg-white dark:bg-slate-950 z-10 rounded">{label}</span>}
      <svg width="10" height="6" viewBox="0 0 10 6" className="text-slate-400 fill-current -mt-px">
        <polygon points="5,6 0,0 10,0" />
      </svg>
    </div>
  );
}

// ─── Diamond decision node ────────────────────────────────────────────────────

function DiamondNode({ step, count, selected, onClick }: {
  step: StepDef; count: number; selected: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      data-testid={`fc-step-${step.step}`}
      className="relative flex items-center justify-center group"
      style={{ width: 140, height: 80 }}
    >
      {/* Rotated square = diamond */}
      <div
        className={`absolute ${step.color} ${selected ? "ring-4 ring-white ring-offset-2" : ""} transition-all group-hover:scale-105`}
        style={{
          width: 100, height: 100,
          transform: "rotate(45deg)",
          borderRadius: 6,
        }}
      />
      {/* Inner text (counter-rotate) */}
      <div className="relative z-10 text-center pointer-events-none px-3">
        <div className={`font-bold text-xs leading-tight ${step.textCol}`}>{step.short}</div>
        {count > 0 && <div className="text-[10px] text-white/80">{count} rules</div>}
      </div>
    </button>
  );
}

// ─── Regular step box ─────────────────────────────────────────────────────────

function StepBox({ step, count, selected, onClick }: {
  step: StepDef; count: number; selected: boolean; onClick: () => void;
}) {
  if (step.shape === "terminal") {
    return (
      <button
        onClick={onClick}
        data-testid={`fc-step-${step.step}`}
        className={`rounded-full px-6 py-2 text-center ${step.color} ${selected ? "ring-4 ring-white ring-offset-2" : ""} 
          hover:scale-105 transition-all group min-w-[160px]`}
      >
        <div className={`font-bold text-xs ${step.textCol}`}>{step.short}</div>
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      data-testid={`fc-step-${step.step}`}
      className={`rounded-lg px-5 py-2.5 text-center border-2 ${step.color} ${step.border}
        ${selected ? "ring-4 ring-white ring-offset-2" : ""}
        hover:scale-105 transition-all group min-w-[160px]`}
    >
      <div className={`text-[10px] font-bold uppercase tracking-wide opacity-80 ${step.textCol}`}>Step {step.step}</div>
      <div className={`font-bold text-sm leading-tight ${step.textCol}`}>{step.short}</div>
      {count > 0 && <div className={`text-[10px] opacity-80 ${step.textCol} mt-0.5`}>{count} rules</div>}
      {count === 0 && <div className={`text-[10px] opacity-60 ${step.textCol} mt-0.5`}>global rules</div>}
    </button>
  );
}

// ─── Rule list panel ──────────────────────────────────────────────────────────

function RulePanel({ step, pipeline }: { step: StepDef; pipeline: any[] }) {
  const pStep = pipeline.find(p => p.ruleType === step.ruleType);
  const rules = pStep?.rules ?? [];

  return (
    <div className="border rounded-lg p-3 bg-card text-xs space-y-2 max-h-[480px] overflow-y-auto">
      <div className="font-bold text-sm">Step {step.step} — {step.name}</div>
      {step.ruleType && (
        <div className="text-muted-foreground">Rule type: <code className="font-mono">{step.ruleType}</code></div>
      )}
      {rules.length === 0 && (
        <div className="text-muted-foreground italic">No complaint-specific rules for this step — global rules may still apply at runtime.</div>
      )}
      <div className="space-y-1.5">
        {rules.map((r: any) => (
          <div key={r.rule_id} className="border rounded p-2 bg-muted/30">
            <div className="font-medium">{r.rule_name}</div>
            <div className="font-mono text-muted-foreground">{r.rule_id}</div>
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              <Badge className={
                r.safety_level === "CRITICAL" ? "bg-red-700 text-white text-xs py-0" :
                r.safety_level === "HIGH"     ? "bg-orange-500 text-white text-xs py-0" :
                r.safety_level === "MODERATE" ? "bg-yellow-500 text-black text-xs py-0" :
                "bg-slate-200 text-slate-700 text-xs py-0"
              }>{r.safety_level}</Badge>
              {r.disposition_impact && <Badge variant="outline" className="text-xs py-0">{r.disposition_impact}</Badge>}
            </div>
            {r.logic_description && (
              <div className="text-muted-foreground mt-1 leading-snug line-clamp-2">{r.logic_description}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Hard-stop branch ────────────────────────────────────────────────────────

function HardStopBranch() {
  return (
    <div className="flex items-center gap-0">
      {/* Horizontal line going right */}
      <div className="w-12 h-0.5 bg-red-500" />
      <div className="text-[10px] text-red-500 font-bold -mt-4 whitespace-nowrap pr-1">Red Flag Hit</div>
      <div className="w-8 h-0.5 bg-red-500" />
      {/* Arrow head right */}
      <svg width="6" height="10" viewBox="0 0 6 10" className="fill-red-500 shrink-0">
        <polygon points="6,5 0,0 0,10" />
      </svg>
      {/* ER NOW box */}
      <div className="rounded-lg bg-red-700 text-white px-3 py-2 text-center ml-1 animate-pulse">
        <div className="text-[10px] font-bold uppercase tracking-wide">HARD STOP</div>
        <div className="text-sm font-black">ER NOW</div>
        <div className="text-[10px] opacity-80">Escalate immediately</div>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function PipelineFlowchart() {
  const [complaint, setComplaint] = useState("chest_pain");
  const [input, setInput]         = useState("chest_pain");
  const [selected, setSelected]   = useState<number | null>(null);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/master-rules/pipeline-detail", complaint],
    queryFn: async () => {
      const r = await fetch(`/api/master-rules/pipeline/${encodeURIComponent(complaint)}`, {
        credentials: "include", headers: authHeaders(),
      });
      return r.json();
    },
    enabled: !!complaint,
  });

  const pipeline: any[] = data?.pipeline ?? [];
  const totalRules = data?.totalRules ?? 0;

  // Build count lookup: ruleType → count
  const countOf = (ruleType: string | null): number => {
    if (!ruleType) return 0;
    const p = pipeline.find(s => s.ruleType === ruleType);
    return p?.count ?? 0;
  };

  const selectedStep = selected !== null ? STEPS[selected - 1] : null;

  return (
    <div className="space-y-4">
      {/* Complaint selector */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground whitespace-nowrap">Complaint ID:</label>
        <Input
          data-testid="fc-input-complaint"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") setComplaint(input.trim()); }}
          placeholder="chest_pain, sore_throat, dizziness…"
          className="h-8 text-xs font-mono w-64"
        />
        <button
          data-testid="fc-button-load"
          onClick={() => setComplaint(input.trim())}
          className="px-3 h-8 text-xs rounded border bg-card hover:bg-muted transition-colors"
        >
          Load
        </button>
        {totalRules > 0 && (
          <span className="text-xs text-muted-foreground">
            <span className="font-semibold text-blue-600">{totalRules}</span> rules in pipeline
          </span>
        )}
        {isLoading && <Loader2 className="animate-spin h-4 w-4 text-muted-foreground" />}
      </div>

      <div className="flex gap-6 items-start">
        {/* ── Flowchart column ── */}
        <div className="flex-shrink-0">
          <div className="flex flex-col items-center gap-0 select-none">
            {STEPS.map((step, idx) => {
              const count   = countOf(step.ruleType);
              const isSel   = selected === step.step;
              const isRedFl = step.step === 5;

              return (
                <div key={step.step} className="flex flex-col items-center">
                  {/* The node */}
                  <div className="flex items-center gap-0">
                    {isRedFl ? (
                      <DiamondNode step={step} count={count} selected={isSel} onClick={() => setSelected(isSel ? null : step.step)} />
                    ) : (
                      <StepBox step={step} count={count} selected={isSel} onClick={() => setSelected(isSel ? null : step.step)} />
                    )}

                    {/* Hard-stop branch from Step 5 */}
                    {isRedFl && (
                      <div className="flex items-center ml-2">
                        <HardStopBranch />
                      </div>
                    )}
                  </div>

                  {/* Arrow to next step (not after last) */}
                  {idx < STEPS.length - 1 && (
                    <Arrow label={isRedFl ? "Clear — no flags" : undefined} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-4 border rounded-lg p-3 text-xs space-y-1.5 bg-muted/30 max-w-[200px]">
            <div className="font-semibold text-foreground">How to use</div>
            <p className="text-muted-foreground leading-relaxed">
              Click any step to see which rules apply to <code className="font-mono">{complaint}</code>.
              Rules are loaded from the live KB.
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />Full coverage
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 inline-block bg-red-600 transform rotate-45" />Decision point
            </div>
          </div>
        </div>

        {/* ── Right panel: selected step rules ── */}
        <div className="flex-1 min-w-0">
          {selectedStep ? (
            <RulePanel step={selectedStep} pipeline={pipeline} />
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-12 text-center text-muted-foreground border rounded-lg border-dashed gap-3">
              <div className="text-4xl">🔍</div>
              <div className="font-medium">Click any step in the flowchart</div>
              <div className="text-xs max-w-xs">
                Select a step node on the left to see all rules that run at that stage
                for <code className="font-mono bg-muted px-1 rounded">{complaint}</code>.
              </div>
              {pipeline.length > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs w-full max-w-sm">
                  {pipeline.map((p: any) => (
                    <div key={p.ruleType} className="flex items-center justify-between border rounded px-2 py-1 bg-card">
                      <span className="font-mono text-muted-foreground truncate">{p.ruleType}</span>
                      <Badge variant="outline" className="text-xs">{p.count}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
