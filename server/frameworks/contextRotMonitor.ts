/**
 * contextRotMonitor.ts — GSD (Get "Stuff" Done) clinical translation
 *
 * Article 26 — GSD: "Context rot is the quality degradation that occurs as an
 *  AI model processes more tokens within a single session. Research and practitioner
 *  experience suggest a predictable decline curve:
 *    0-30%:  Peak quality
 *    50%+:   Starts rushing, skipping details, making shortcuts
 *    70%+:   Hallucinations increase
 *    80%+:   May forget requirements established earlier in the conversation"
 *
 * GSD solution: "Spawn fresh subagent contexts for each execution unit. Task 50
 *  gets the same context quality as Task 1 because it starts from a fresh window."
 *
 * GSD Multi-Agent Orchestra:
 *   4 parallel researchers → investigate codebase/patient simultaneously
 *   1 planner → converts research into structured execution plans
 *   1 plan checker → validates plans before execution begins
 *   Wave-based parallel executors → implement tasks in fresh contexts
 *   Verifiers → validate completed work against specifications
 *   Debugger → goal-backward hypothesis testing ("what must be TRUE?")
 *
 * GSD vertical slices: End-to-end care pathways (diagnosis→treatment→discharge)
 *   NOT horizontal layers (all diagnostics first, then all treatments, then all discharges)
 *   Vertical slices minimize inter-task dependencies → maximize parallelism
 *
 * Clinical translation: Context rot in a clinical AI session = patient safety risk.
 *  A sepsis agent that "forgets" the lactate value from 30 minutes ago is not
 *  a UX problem — it's a diagnostic error.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type ContextHealthZone = "peak" | "caution" | "degraded" | "critical" | "reset_required";

export interface ContextRotProfile {
  utilizationPct: number;
  zone:           ContextHealthZone;
  description:    string;
  clinicalRisk:   string;
  recommendation: string;
}

export type OrchestraRole =
  | "researcher"    // 4 parallel — investigate simultaneously
  | "planner"       // 1 — converts research into structured plans
  | "plan_checker"  // 1 — validates plan before execution
  | "executor"      // N — implement tasks in fresh contexts (wave-based)
  | "verifier"      // N — validate completed work against specs
  | "debugger";     // 1 — goal-backward hypothesis testing

export interface OrchestraAgent {
  id:         string;
  role:       OrchestraRole;
  contextId:  string;     // always fresh — never shared
  taskName:   string;
  status:     "idle" | "active" | "complete" | "error";
  startedAt:  Date;
  completedAt?: Date;
  utilization: number;   // 0-1 context utilization estimate
}

export interface ResearchFindings {
  agentId:   string;
  domain:    string;    // "patient_vitals" | "lab_results" | "medication_history" | "clinical_notes"
  findings:  string[];
  confidence: number;
}

export interface ExecutionPlan {
  id:          string;
  waves:       ExecutionWave[];
  verticalSlice: string;  // e.g., "sepsis_pathway" — end-to-end feature
  checkedAt?:  Date;
  checkPassed: boolean;
  checkNotes:  string[];
}

export interface ExecutionWave {
  waveNumber:  number;
  tasks:       WaveTask[];
  canParallelize: boolean;
  dependsOn:   number[];   // wave numbers this wave depends on
}

export interface WaveTask {
  id:          string;
  name:        string;
  contextId:   string;   // each task gets its own fresh context
  slice:       string;   // which vertical slice this belongs to
  status:      "pending" | "running" | "complete" | "failed";
  result?:     unknown;
  startedAt?:  Date;
  completedAt?: Date;
}

export interface DebugHypothesis {
  assertion:   string;        // "What must be TRUE for this to work?"
  observable:  string;        // observable behavior to test
  testMethod:  string;        // how to verify this assertion
  result?:     "confirmed" | "refuted" | "inconclusive";
  tested:      boolean;
}

export interface ContextRotSession {
  sessionId:        string;
  tokenCount:       number;
  maxTokens:        number;
  utilizationPct:   number;
  zone:             ContextHealthZone;
  checkpoints:      ContextCheckpoint[];
  orchestra:        OrchestraAgent[];
  plans:            ExecutionPlan[];
  researchFindings: ResearchFindings[];
  debugHypotheses:  DebugHypothesis[];
  createdAt:        Date;
  updatedAt:        Date;
}

export interface ContextCheckpoint {
  at:          Date;
  utilization: number;
  zone:        ContextHealthZone;
  event:       string;
  recommendation: string;
}

// ── Context rot threshold table ───────────────────────────────────────────────
// Article: "predictable decline curve" — exact thresholds from the article

export const CONTEXT_ROT_ZONES: ContextRotProfile[] = [
  {
    utilizationPct: 0,
    zone:           "peak",
    description:    "0-30%: AI model performing at peak quality.",
    clinicalRisk:   "Minimal. Full context available for complex reasoning.",
    recommendation: "Proceed with all clinical tasks including complex differential diagnosis.",
  },
  {
    utilizationPct: 30,
    zone:           "caution",
    description:    "30-50%: Context filling. Watch for early shortcuts.",
    clinicalRisk:   "Low. Model may begin simplifying explanations.",
    recommendation: "Consider spawning fresh sub-contexts for new patient cases.",
  },
  {
    utilizationPct: 50,
    zone:           "degraded",
    description:    "50-70%: Model starts rushing, skipping details, making shortcuts.",
    clinicalRisk:   "Moderate. Risk of incomplete differential, missed contraindications.",
    recommendation: "Spawn fresh context for each new clinical task. Do not add new patients.",
  },
  {
    utilizationPct: 70,
    zone:           "critical",
    description:    "70-80%: Hallucinations increase. Model may fabricate lab values.",
    clinicalRisk:   "High. Fabricated clinical data is life-threatening. Verify every output.",
    recommendation: "Reset context immediately. All clinical outputs require physician verification.",
  },
  {
    utilizationPct: 80,
    zone:           "reset_required",
    description:    "80%+: Model may forget requirements from earlier in the conversation.",
    clinicalRisk:   "Critical. Model may forget allergy alerts, prior diagnoses, or treatment plans.",
    recommendation: "STOP. Reset context. Summarize all decisions to fresh context before proceeding.",
  },
];

export function assessContextZone(utilizationPct: number): ContextRotProfile {
  if (utilizationPct >= 80) return CONTEXT_ROT_ZONES[4];
  if (utilizationPct >= 70) return CONTEXT_ROT_ZONES[3];
  if (utilizationPct >= 50) return CONTEXT_ROT_ZONES[2];
  if (utilizationPct >= 30) return CONTEXT_ROT_ZONES[1];
  return CONTEXT_ROT_ZONES[0];
}

// ── Multi-agent orchestra ─────────────────────────────────────────────────────

const ORCHESTRA_MAXIMUMS: Record<OrchestraRole, number> = {
  researcher:   4,
  planner:      1,
  plan_checker: 1,
  executor:     Infinity,
  verifier:     Infinity,
  debugger:     1,
};

const ORCHESTRA_DESCRIPTIONS: Record<OrchestraRole, string> = {
  researcher:   "4 parallel clinical researchers — investigate patient simultaneously",
  planner:      "Converts research findings into structured execution plan",
  plan_checker: "Validates plan before execution begins — prevents wrong-plan execution",
  executor:     "Wave-based task executor in fresh isolated context",
  verifier:     "Validates completed work against specifications (goal-backward)",
  debugger:     "Hypothesis-based debugger: 'What must be TRUE for this to work?'",
};

let _agentSeq = 1;
function freshContextId(): string { return `ctx_${Date.now()}_${_agentSeq++}`; }

// ── Vertical slice planning ───────────────────────────────────────────────────
// Article: "Vertical slices (end-to-end features) over horizontal layers"

export function buildVerticalSlicePlan(sliceName: string, tasks: string[]): ExecutionPlan {
  // Assign tasks to waves based on implied dependencies
  // Rule: first wave is always independent; each subsequent wave depends on prior
  const waves: ExecutionWave[] = [];
  const taskChunks = chunkByDependency(tasks);

  taskChunks.forEach((chunk, waveIndex) => {
    waves.push({
      waveNumber:     waveIndex + 1,
      canParallelize: chunk.length > 1,
      dependsOn:      waveIndex > 0 ? [waveIndex] : [],
      tasks: chunk.map((name) => ({
        id:        `task_${Date.now()}_${Math.random().toString(36).slice(2,5)}`,
        name,
        contextId: freshContextId(),   // fresh context per task
        slice:     sliceName,
        status:    "pending" as const,
      })),
    });
  });

  return {
    id:           `plan_${Date.now()}`,
    verticalSlice: sliceName,
    waves,
    checkPassed:  false,
    checkNotes:   [],
  };
}

function chunkByDependency(tasks: string[]): string[][] {
  // Heuristic: group tasks by implied sequence keywords
  const independents = tasks.filter((t) => !/(after|then|following|once|when|depends)/i.test(t));
  const dependents   = tasks.filter((t) =>  /(after|then|following|once|when|depends)/i.test(t));
  const result: string[][] = [];
  if (independents.length > 0) result.push(independents);
  if (dependents.length   > 0) result.push(dependents);
  if (result.length === 0)     result.push(tasks);
  return result;
}

// ── Goal-backward debugging ───────────────────────────────────────────────────
// Article: "Instead of 'what tasks did we do?', GSD asks 'what must be TRUE for this to work?'"

export function buildDebugHypotheses(goal: string): DebugHypothesis[] {
  // Generate observable assertions from a clinical goal
  const templates = [
    { assertion: `Patient is stable (${goal})`,           observable: "Vital signs within normal range",            testMethod: "Check HR, RR, SpO2, BP, temp within 15 minutes" },
    { assertion: `Treatment was administered (${goal})`,  observable: "Nurse documents administration in EHR",      testMethod: "Audit medication administration record" },
    { assertion: `Expected response occurred (${goal})`,  observable: "Clinical endpoint documented by physician",  testMethod: "Review physician re-assessment note" },
    { assertion: `No adverse event (${goal})`,            observable: "No allergy reaction, no critical lab change", testMethod: "Review allergy log and critical lab values" },
  ];
  return templates.map((t) => ({ ...t, tested: false }));
}

export function testHypothesis(
  hyp: DebugHypothesis,
  observedResult: string,
): DebugHypothesis {
  const observed = observedResult.toLowerCase();
  const confirmed = ["yes", "confirmed", "true", "pass", "normal", "stable", "documented"].some((k) => observed.includes(k));
  const refuted   = ["no", "fail", "false", "abnormal", "missing", "not"].some((k) => observed.includes(k));
  return {
    ...hyp,
    tested: true,
    result: confirmed ? "confirmed" : refuted ? "refuted" : "inconclusive",
  };
}

// ── Session management ────────────────────────────────────────────────────────

const _sessions = new Map<string, ContextRotSession>();

export function createContextSession(sessionId: string, maxTokens = 200_000): ContextRotSession {
  const s: ContextRotSession = {
    sessionId,
    tokenCount:       0,
    maxTokens,
    utilizationPct:   0,
    zone:             "peak",
    checkpoints:      [],
    orchestra:        [],
    plans:            [],
    researchFindings: [],
    debugHypotheses:  [],
    createdAt:        new Date(),
    updatedAt:        new Date(),
  };
  _sessions.set(sessionId, s);
  return s;
}

export function recordTokenUsage(sessionId: string, tokensUsed: number, event: string): ContextCheckpoint | null {
  const s = _sessions.get(sessionId);
  if (!s) return null;
  s.tokenCount     += tokensUsed;
  s.utilizationPct  = Math.min(100, (s.tokenCount / s.maxTokens) * 100);
  const profile     = assessContextZone(s.utilizationPct);
  s.zone            = profile.zone;
  const checkpoint: ContextCheckpoint = {
    at:             new Date(),
    utilization:    s.utilizationPct,
    zone:           profile.zone,
    event,
    recommendation: profile.recommendation,
  };
  s.checkpoints.push(checkpoint);
  s.updatedAt = new Date();
  return checkpoint;
}

export function spawnOrchestraAgent(
  sessionId: string,
  role:      OrchestraRole,
  taskName:  string,
): OrchestraAgent | null {
  const s = _sessions.get(sessionId);
  if (!s) return null;
  const currentOfRole = s.orchestra.filter((a) => a.role === role && a.status !== "complete").length;
  const max = ORCHESTRA_MAXIMUMS[role];
  if (currentOfRole >= max) return null;  // max agents of this role reached

  const agent: OrchestraAgent = {
    id:         `agent_${Date.now()}_${Math.random().toString(36).slice(2,5)}`,
    role,
    contextId:  freshContextId(),    // always fresh — never shared
    taskName,
    status:     "active",
    startedAt:  new Date(),
    utilization: 0,
  };
  s.orchestra.push(agent);
  s.updatedAt = new Date();
  return agent;
}

export function completeOrchestraAgent(sessionId: string, agentId: string): boolean {
  const s = _sessions.get(sessionId);
  if (!s) return false;
  const a = s.orchestra.find((x) => x.id === agentId);
  if (!a) return false;
  a.status      = "complete";
  a.completedAt = new Date();
  s.updatedAt   = new Date();
  return true;
}

export function addResearchFindings(sessionId: string, findings: Omit<ResearchFindings, "agentId">, agentId: string): boolean {
  const s = _sessions.get(sessionId);
  if (!s) return false;
  s.researchFindings.push({ ...findings, agentId });
  s.updatedAt = new Date();
  return true;
}

export function addPlan(sessionId: string, plan: ExecutionPlan): boolean {
  const s = _sessions.get(sessionId);
  if (!s) return false;
  s.plans.push(plan);
  s.updatedAt = new Date();
  return true;
}

export function checkPlan(sessionId: string, planId: string, notes: string[]): boolean {
  const s = _sessions.get(sessionId);
  if (!s) return false;
  const plan = s.plans.find((p) => p.id === planId);
  if (!plan) return false;
  plan.checkedAt   = new Date();
  plan.checkPassed = notes.every((n) => !n.toLowerCase().includes("fail") && !n.toLowerCase().includes("error"));
  plan.checkNotes  = notes;
  s.updatedAt      = new Date();
  return true;
}

export function getContextSession(sessionId: string): ContextRotSession | undefined {
  return _sessions.get(sessionId);
}

export function listContextSessions(): ContextRotSession[] {
  return Array.from(_sessions.values());
}

export function getOrchestraDescriptions(): Record<OrchestraRole, string> {
  return ORCHESTRA_DESCRIPTIONS;
}
