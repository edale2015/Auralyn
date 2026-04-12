/**
 * Sequential Clinical Thinking Engine
 *
 * Article #1 (Sequential Thinking MCP):
 *   "Models love answering fast. But sometimes too fast.
 *   Sequential thinking helps them plan first and then answer.
 *   It breaks the problem down, lists assumptions, outlines steps,
 *   and then generates code. [Use it for] serious logic.
 *   Sequential Thinking is the difference between guessing and engineering."
 *
 * Clinical translation:
 *   Before the agent produces any diagnosis, disposition, or treatment plan,
 *   it must first complete a THINK phase that explicitly produces:
 *
 *   1. ASSUMPTIONS  — what is being taken as true before reasoning begins
 *      "Assuming HR 118 is accurate and not artifact"
 *      "Assuming patient is not currently anticoagulated"
 *
 *   2. UNKNOWNS     — what we don't know and need to find out
 *      "Troponin result unavailable"
 *      "Prior cardiac history unclear"
 *
 *   3. DIAGNOSTIC STEPS — ordered numbered steps to resolve the problem
 *      Step 1: Rule out life threat (STEMI, PE, dissection)
 *      Step 2: Risk stratify using HEART score
 *      Step 3: Interpret troponin trend
 *
 *   4. KEY QUESTION per step — what the step must answer
 *      Step 1 key question: "Is there ST elevation or hemodynamic instability?"
 *
 *   5. CONFIDENCE GATE — minimum certainty before proceeding to action
 *
 *   Only after the THINK phase is complete does the agent EXECUTE.
 *
 * This module is separate from:
 *   - clinicalTaskBoard.ts (tracks execution steps after planning)
 *   - clinicalReasoningChain.ts (traverses knowledge graph)
 *   - agentProtocol.ts (manages agent FSM states)
 *
 * The output of sequentialThink() is the INPUT to writePlan() on the task board.
 */

import { randomUUID } from "crypto";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ThinkingInput {
  patientId:      string;
  chiefComplaint: string;
  vitals?:        Record<string, number | string>;
  knownHistory?:  string[];   // confirmed facts
  presentingData?: Record<string, any>;
  urgency?:       "stat" | "urgent" | "routine";
}

export interface DiagnosticStep {
  stepNumber: number;
  name:       string;        // e.g. "Rule out STEMI"
  keyQuestion:string;        // what this step must answer
  tools?:     string[];      // tool IDs that execute this step
  timeboxSec?:number;        // max time to spend on this step
  mustComplete:boolean;      // if true, cannot skip even if earlier steps resolve
}

export interface ThinkingPlan {
  id:             string;
  patientId:      string;
  chiefComplaint: string;
  assumptions:    string[];          // what we're taking as true
  unknowns:       string[];          // what we don't know yet
  redFlagsToExclude: string[];       // life threats to actively rule out first
  steps:          DiagnosticStep[];  // ordered diagnostic plan
  confidenceGate: number;            // 0–1: minimum certainty before acting
  maxSteps:       number;
  urgency:        "stat" | "urgent" | "routine";
  createdAt:      string;
  thinkDurationMs:number;
}

export interface ThinkingTrace {
  plan:       ThinkingPlan;
  stepLogs:   StepLog[];
  conclusion: ThinkingConclusion | null;
}

export interface StepLog {
  stepNumber:  number;
  startedAt:   string;
  completedAt: string | null;
  finding:     string | null;
  confidence:  number;          // 0–1 confidence this step is resolved
  skipped:     boolean;
  skipReason?: string;
}

export interface ThinkingConclusion {
  primaryHypothesis: string;
  confidence:        number;
  supportingFindings:string[];
  unresolvedUnknowns:string[];
  recommendedActions:string[];
  safeToAct:         boolean;    // false if confidence < confidenceGate
  reasoning:         string;     // human-readable explanation of the conclusion
}

// ── Symptom → assumption generator ───────────────────────────────────────────

const COMPLAINT_ASSUMPTIONS: Record<string, string[]> = {
  "chest pain": [
    "Reported chest pain is reproducible and not positional artifact",
    "No iatrogenic cause (recent procedure/medication) has been identified",
    "ECG lead placement was correct for 12-lead acquisition",
  ],
  "shortness of breath": [
    "Reported dyspnea onset is acute (not chronic progression)",
    "Room air SpO2 reading is accurate, not probe interference",
    "No recent known allergen exposure (anaphylaxis excluded initially)",
  ],
  "altered mental status": [
    "Patient's baseline mental status is known or collateral history is available",
    "Hypoglycemia has been excluded or glucose is pending",
    "No active seizure activity observed during assessment",
  ],
  "sepsis": [
    "Vital sign abnormalities represent true hemodynamic compromise",
    "Source of infection is not yet identified",
    "Patient has no known immunodeficiency altering presentation",
  ],
  "abdominal pain": [
    "Pain scale rating reflects subjective patient experience",
    "Last oral intake timing is accurate as reported",
    "No prior similar episodes have been dismissed without workup",
  ],
};

const COMPLAINT_RED_FLAGS: Record<string, string[]> = {
  "chest pain":           ["STEMI", "aortic dissection", "pulmonary embolism", "tension pneumothorax", "cardiac tamponade"],
  "shortness of breath":  ["pulmonary embolism", "ARDS", "cardiac tamponade", "anaphylaxis", "epiglottitis"],
  "altered mental status":["intracranial bleed", "meningitis/encephalitis", "status epilepticus", "herniation"],
  "sepsis":               ["septic shock", "meningococcemia", "necrotizing fasciitis"],
  "abdominal pain":       ["ruptured aortic aneurysm", "mesenteric ischemia", "perforated viscus", "ectopic pregnancy"],
};

const COMPLAINT_STEPS: Record<string, DiagnosticStep[]> = {
  "chest pain": [
    { stepNumber: 1, name: "Life-threat exclusion",    keyQuestion: "Is there STEMI, hemodynamic instability, or aortic dissection?", tools: ["vitals_check"], timeboxSec: 120, mustComplete: true },
    { stepNumber: 2, name: "HEART score risk stratify",keyQuestion: "What is the HEART score and what risk tier does it indicate?",     tools: ["news2"], timeboxSec: 180, mustComplete: true },
    { stepNumber: 3, name: "Troponin interpretation",  keyQuestion: "Is troponin rising, falling, or stable over 3-hour delta?",        tools: ["labs-review"], timeboxSec: 240, mustComplete: true },
    { stepNumber: 4, name: "Disposition planning",     keyQuestion: "Is the patient safe for discharge, observation, or admission?",    tools: ["discharge"], timeboxSec: 120, mustComplete: false },
  ],
  "shortness of breath": [
    { stepNumber: 1, name: "Hypoxia severity",         keyQuestion: "What is SpO2 and is supplemental oxygen correcting it?",          tools: ["vitals_check"], timeboxSec: 60, mustComplete: true },
    { stepNumber: 2, name: "PE risk stratification",   keyQuestion: "Wells score — is PE clinically likely?",                          tools: [], timeboxSec: 120, mustComplete: true },
    { stepNumber: 3, name: "BNP/cardiac contribution", keyQuestion: "Is there evidence of cardiogenic pulmonary edema?",               tools: ["labs-review"], timeboxSec: 180, mustComplete: false },
    { stepNumber: 4, name: "Disposition",              keyQuestion: "ICU, step-down, or monitored bed?",                              tools: ["discharge"], timeboxSec: 120, mustComplete: false },
  ],
  "sepsis": [
    { stepNumber: 1, name: "qSOFA screen",             keyQuestion: "qSOFA ≥ 2 — is this sepsis by Sepsis-3 criteria?",               tools: ["sepsis-screen"], timeboxSec: 90, mustComplete: true },
    { stepNumber: 2, name: "Lactate + cultures",       keyQuestion: "Is lactate > 2? Are blood cultures drawn before antibiotics?",    tools: ["labs-review"], timeboxSec: 120, mustComplete: true },
    { stepNumber: 3, name: "Antibiotic selection",     keyQuestion: "What empiric antibiotic covers the suspected source?",            tools: ["drug-check"], timeboxSec: 180, mustComplete: true },
    { stepNumber: 4, name: "Fluid resuscitation",      keyQuestion: "Has 30 mL/kg crystalloid been initiated?",                       tools: [], timeboxSec: 120, mustComplete: true },
  ],
};

// ── Core function ─────────────────────────────────────────────────────────────

/**
 * THINK before acting.
 * Generates a structured diagnostic plan with assumptions, unknowns,
 * red flags to exclude, and ordered steps with key questions.
 */
export function sequentialThink(input: ThinkingInput): ThinkingPlan {
  const tStart = Date.now();
  const complaint = input.chiefComplaint.toLowerCase();

  // Match the closest known complaint
  const matchKey = Object.keys(COMPLAINT_STEPS).find((k) => complaint.includes(k)) ?? "";

  // Build assumptions
  const baseAssumptions = COMPLAINT_ASSUMPTIONS[matchKey] ?? [
    "Presenting vital signs are accurate",
    "Patient history is reliable as reported",
    "No prior workup for this complaint has been performed today",
  ];
  // Add vital-specific assumptions
  const extraAssumptions: string[] = [];
  if (input.vitals?.hr) {
    const hr = Number(input.vitals.hr);
    if (hr > 100) extraAssumptions.push(`Tachycardia (HR ${hr}) is genuine and not anxiety/pain response alone`);
  }
  if (input.urgency === "stat") extraAssumptions.push("Patient is in immediate danger — stat workup is justified");

  // Build unknowns from missing data
  const unknowns: string[] = [];
  if (!input.vitals?.spo2)    unknowns.push("SpO2 not yet recorded");
  if (!input.vitals?.sbp)     unknowns.push("Blood pressure not yet recorded");
  if (!input.vitals?.temp)    unknowns.push("Temperature not yet recorded");
  if (!input.knownHistory?.length) unknowns.push("Medical history not yet established");
  if (unknowns.length === 0) unknowns.push("All baseline data present — proceed to risk stratification");

  const steps: DiagnosticStep[] = COMPLAINT_STEPS[matchKey] ?? [
    { stepNumber: 1, name: "Initial assessment",      keyQuestion: "What are the vital signs and chief complaint details?", tools: ["vitals_check"], timeboxSec: 120, mustComplete: true },
    { stepNumber: 2, name: "Risk stratification",     keyQuestion: "What validated scoring tool applies here?",              tools: [],              timeboxSec: 180, mustComplete: true },
    { stepNumber: 3, name: "Targeted investigations", keyQuestion: "Which labs/imaging are indicated?",                     tools: ["labs-review"], timeboxSec: 240, mustComplete: false },
    { stepNumber: 4, name: "Disposition",             keyQuestion: "What is the safest disposition for this patient?",     tools: ["discharge"],   timeboxSec: 120, mustComplete: false },
  ];

  const confidenceGate = input.urgency === "stat" ? 0.85 : input.urgency === "urgent" ? 0.75 : 0.65;

  return {
    id:                randomUUID().slice(0, 10),
    patientId:         input.patientId,
    chiefComplaint:    input.chiefComplaint,
    assumptions:       [...baseAssumptions, ...extraAssumptions],
    unknowns,
    redFlagsToExclude: COMPLAINT_RED_FLAGS[matchKey] ?? ["critical illness", "hemodynamic instability"],
    steps,
    confidenceGate,
    maxSteps:          steps.length,
    urgency:           input.urgency ?? "urgent",
    createdAt:         new Date().toISOString(),
    thinkDurationMs:   Date.now() - tStart,
  };
}

// ── Trace execution ───────────────────────────────────────────────────────────

/**
 * Create a mutable trace for a plan — records step outcomes as they execute.
 */
export function createThinkingTrace(plan: ThinkingPlan): ThinkingTrace {
  return {
    plan,
    stepLogs: plan.steps.map((s) => ({
      stepNumber:  s.stepNumber,
      startedAt:   new Date().toISOString(),
      completedAt: null,
      finding:     null,
      confidence:  0,
      skipped:     false,
    })),
    conclusion: null,
  };
}

/** Record a finding for a step. */
export function recordStepFinding(
  trace:      ThinkingTrace,
  stepNumber: number,
  finding:    string,
  confidence: number
): ThinkingTrace {
  const logs = trace.stepLogs.map((l) =>
    l.stepNumber === stepNumber
      ? { ...l, finding, confidence, completedAt: new Date().toISOString() }
      : l
  );
  return { ...trace, stepLogs: logs };
}

/**
 * Conclude the thinking trace — synthesize all step findings into a recommendation.
 * Only marks `safeToAct = true` if cumulative confidence ≥ confidenceGate.
 */
export function concludeThinking(trace: ThinkingTrace): ThinkingTrace {
  const { plan, stepLogs } = trace;
  const completed = stepLogs.filter((l) => l.completedAt !== null);
  const avgConfidence = completed.length > 0
    ? completed.reduce((s, l) => s + l.confidence, 0) / completed.length
    : 0;

  const findings = completed.filter((l) => l.finding).map((l) => l.finding!);
  const unresolvedUnknowns = plan.unknowns.filter(
    (u) => !completed.some((l) => l.finding?.toLowerCase().includes(u.toLowerCase().slice(0, 15)))
  );

  const safeToAct = avgConfidence >= plan.confidenceGate;

  const conclusion: ThinkingConclusion = {
    primaryHypothesis: findings.length > 0
      ? `Based on ${findings.length} evaluated steps: ${findings[0]}`
      : "Insufficient data for hypothesis — further workup required",
    confidence:        avgConfidence,
    supportingFindings:findings,
    unresolvedUnknowns,
    recommendedActions: safeToAct
      ? plan.steps.map((s) => s.name)
      : [`Resolve unknowns first: ${unresolvedUnknowns.slice(0, 2).join(", ")}`],
    safeToAct,
    reasoning: `${completed.length}/${plan.steps.length} steps complete. Avg confidence ${(avgConfidence * 100).toFixed(0)}%. ${safeToAct ? "Confidence gate met — safe to proceed." : `Confidence gate ${(plan.confidenceGate * 100).toFixed(0)}% not met — continue workup.`}`,
  };

  return { ...trace, conclusion };
}

// ── Formatting ────────────────────────────────────────────────────────────────

export function formatThinkingPlan(plan: ThinkingPlan): string {
  const lines = [
    `## THINK: ${plan.chiefComplaint} [${plan.urgency.toUpperCase()}] — Patient ${plan.patientId}`,
    ``,
    `### Assumptions (${plan.assumptions.length})`,
    ...plan.assumptions.map((a, i) => `  ${i + 1}. ${a}`),
    ``,
    `### Unknowns to Resolve`,
    ...plan.unknowns.map((u) => `  ? ${u}`),
    ``,
    `### Red Flags to Actively Exclude`,
    ...plan.redFlagsToExclude.map((f) => `  ⚠ ${f}`),
    ``,
    `### Diagnostic Steps (confidence gate: ${(plan.confidenceGate * 100).toFixed(0)}%)`,
    ...plan.steps.map((s) =>
      `  Step ${s.stepNumber}: ${s.name}\n    → ${s.keyQuestion}${s.tools?.length ? `\n    → Tools: ${s.tools.join(", ")}` : ""}`
    ),
  ];
  return lines.join("\n");
}
