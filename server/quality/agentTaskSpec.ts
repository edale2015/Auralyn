/**
 * agentTaskSpec.ts — Article 25 (Agentic Engineering) — "Spec First":
 *
 * "Before prompting anything, write a design document. What does this feature
 *  do? What are the edge cases? What does the data model look like? What can
 *  go wrong? This is the step vibe coders skip."
 *
 * "Well-designed agentic systems break tasks into smaller modules, enabling
 *  agents to generate self-contained components in real-time that integrate
 *  cleanly into the existing codebase without increasing technical debt."
 *
 * Clinical relevance: before the sepsis agent administers 30 mL/kg crystalloid,
 * there should be a spec for: what clinical criteria trigger this, what are
 * the edge cases (CHF, ESRD, pediatric), what data model is used (lactate,
 * MAP, qSOFA), what can go wrong (fluid overload, delayed antibiotics).
 * That's not bureaucracy — that's the difference between protocol and guesswork.
 *
 * Vibe prompt vs. Agentic task classifier:
 *   "Build me a user authentication system" → vibe_prompt (too broad, vague)
 *   "Implement password reset using Resend. Token in Redis, 15-min TTL." → agentic_task
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type SpecStatus  = "draft" | "validated" | "approved" | "rejected" | "archived";
export type PromptStyle = "vibe_prompt" | "borderline" | "agentic_task";

export interface AgentTaskSpec {
  id:             string;
  agentRole:      string;
  taskName:       string;
  description:    string;         // what does this task do?
  scope:          string;         // what is in/out of scope?
  edgeCases:      string[];       // list of edge cases considered
  dataModel:      string;         // what inputs/outputs/state does it use?
  risksIdentified: string[];      // what can go wrong?
  testCriteria:   string[];       // how do we know it worked? (tests first)
  status:         SpecStatus;
  approvedBy?:    string;
  rejectionReason?: string;
  completenessScore: number;      // 0-100
  promptStyle:    PromptStyle;    // classified style of the task description
  createdAt:      Date;
  updatedAt:      Date;
}

export interface SpecValidationResult {
  valid:             boolean;
  completenessScore: number;
  missingFields:     string[];
  warnings:          string[];
  promptStyle:       PromptStyle;
}

// ── In-memory store ───────────────────────────────────────────────────────────

const _specs = new Map<string, AgentTaskSpec>();
let   _seq   = 1;
function nextId(): string { return `spec_${Date.now()}_${_seq++}`; }

// ── Prompt style classifier ───────────────────────────────────────────────────
// Article: "'Build me a user authentication system' is a vibe coding prompt.
//  It's too large, too vague, and the agent will make architectural decisions
//  you never agreed to."

const VIBE_SIGNALS = [
  /^build me/i, /^create an? .*system$/i, /^make (a|an|the)/i,
  /^add (a|an|the)/i, /^implement (some|a|an) (thing|feature|stuff)/i,
  /\b(etc|stuff|things|whatever|somehow|just|quick(ly)?)\b/i,
  /^(fix|update|change) (it|this|that|the (thing|page|screen))$/i,
];

const AGENTIC_SIGNALS = [
  /\busing (our|existing|the)\b/i,          // references existing integration
  /\b(spec|specification|criteria|protocol)\b/i,
  /\b(TTL|timeout|token|JWT|session)\b/i,   // concrete technical constraint
  /\b(here'?s?|per|following|based on)\s+(the|this|our)\b/i,
  /\b(redis|postgres|queue|endpoint|schema)\b/i,
  /\b(edge case|contraindication|allergy|dose|mg|mmhg|sofa)\b/i,
  /\b(test|spec|criteria|acceptance|pass)\b/i,
];

export function classifyPromptStyle(text: string): PromptStyle {
  const vibeHits    = VIBE_SIGNALS.filter((r) => r.test(text)).length;
  const agenticHits = AGENTIC_SIGNALS.filter((r) => r.test(text)).length;
  const wordCount   = text.trim().split(/\s+/).length;

  if (wordCount < 8 && vibeHits >= 1) return "vibe_prompt";
  if (vibeHits >= 2 && agenticHits === 0) return "vibe_prompt";
  if (agenticHits >= 3) return "agentic_task";
  if (agenticHits >= 1 && vibeHits <= 1) return "agentic_task";
  return "borderline";
}

// ── Spec validation ───────────────────────────────────────────────────────────

export function validateSpec(
  spec: Omit<AgentTaskSpec, "id" | "status" | "completenessScore" | "promptStyle" | "createdAt" | "updatedAt">
): SpecValidationResult {
  const missingFields: string[] = [];
  const warnings: string[] = [];

  if (!spec.description?.trim() || spec.description.trim().length < 20) {
    missingFields.push("description (min 20 chars — what does this task do?)");
  }
  if (!spec.scope?.trim() || spec.scope.trim().length < 10) {
    missingFields.push("scope (what is in/out of scope?)");
  }
  if (!spec.edgeCases || spec.edgeCases.length === 0) {
    missingFields.push("edgeCases (at least 1 edge case required)");
  }
  if (!spec.dataModel?.trim() || spec.dataModel.trim().length < 10) {
    missingFields.push("dataModel (what inputs/outputs/state are used?)");
  }
  if (!spec.risksIdentified || spec.risksIdentified.length === 0) {
    missingFields.push("risksIdentified (what can go wrong?)");
  }
  if (!spec.testCriteria || spec.testCriteria.length === 0) {
    missingFields.push("testCriteria (how do we know it worked? write tests first)");
  }

  // Warnings (present but thin)
  if (spec.edgeCases?.length === 1)    warnings.push("Only 1 edge case — consider more clinical scenarios.");
  if (spec.testCriteria?.length === 1) warnings.push("Only 1 test criterion — brittle coverage.");
  if (spec.risksIdentified?.length === 1) warnings.push("Only 1 risk identified — re-examine failure modes.");

  // Completeness score: each of 6 required fields is worth up to ~16 points
  let score = 0;
  if (spec.description?.trim().length >= 20)  score += 16;
  else if (spec.description?.trim().length > 0) score += 6;
  if (spec.scope?.trim().length >= 10)         score += 14;
  else if (spec.scope?.trim().length > 0)      score += 5;
  if ((spec.edgeCases?.length ?? 0) >= 2)      score += 18;
  else if ((spec.edgeCases?.length ?? 0) === 1) score += 9;
  if (spec.dataModel?.trim().length >= 10)     score += 16;
  else if (spec.dataModel?.trim().length > 0)  score += 5;
  if ((spec.risksIdentified?.length ?? 0) >= 2) score += 18;
  else if ((spec.risksIdentified?.length ?? 0) === 1) score += 9;
  if ((spec.testCriteria?.length ?? 0) >= 2)   score += 18;
  else if ((spec.testCriteria?.length ?? 0) === 1) score += 9;

  const promptStyle = classifyPromptStyle(spec.description ?? "");
  if (promptStyle === "vibe_prompt") {
    score = Math.max(0, score - 20);
    warnings.push("Task description reads like a vibe prompt — too broad/vague. Narrow scope and add constraints.");
  }

  return {
    valid: missingFields.length === 0,
    completenessScore: Math.min(100, score),
    missingFields,
    warnings,
    promptStyle,
  };
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export function createSpec(
  input: Omit<AgentTaskSpec, "id" | "status" | "completenessScore" | "promptStyle" | "createdAt" | "updatedAt">
): AgentTaskSpec {
  const validation = validateSpec(input);
  const id = nextId();
  const spec: AgentTaskSpec = {
    ...input,
    id,
    status:            "draft",
    completenessScore: validation.completenessScore,
    promptStyle:       validation.promptStyle,
    createdAt:         new Date(),
    updatedAt:         new Date(),
  };
  if (validation.valid) spec.status = "validated";
  _specs.set(id, spec);
  return spec;
}

export function getSpec(id: string): AgentTaskSpec | undefined {
  return _specs.get(id);
}

export function listSpecs(statusFilter?: SpecStatus): AgentTaskSpec[] {
  const all = Array.from(_specs.values());
  return statusFilter ? all.filter((s) => s.status === statusFilter) : all;
}

export function approveSpec(id: string, approvedBy: string): AgentTaskSpec | null {
  const spec = _specs.get(id);
  if (!spec) return null;
  spec.status     = "approved";
  spec.approvedBy = approvedBy;
  spec.updatedAt  = new Date();
  return spec;
}

export function rejectSpec(id: string, reason: string): AgentTaskSpec | null {
  const spec = _specs.get(id);
  if (!spec) return null;
  spec.status          = "rejected";
  spec.rejectionReason = reason;
  spec.updatedAt       = new Date();
  return spec;
}

export function archiveSpec(id: string): boolean {
  const spec = _specs.get(id);
  if (!spec) return false;
  spec.status    = "archived";
  spec.updatedAt = new Date();
  return true;
}

export function requiresSpecApproval(agentRole: string, taskName: string): boolean {
  // High-stakes clinical roles always require an approved spec
  const highStakeRoles  = ["prescribing_agent", "sepsis_agent", "triage_agent", "emergency_agent"];
  const highStakeTasks  = ["administer", "prescribe", "intubate", "defibrillate", "discharge", "code"];
  if (highStakeRoles.includes(agentRole)) return true;
  if (highStakeTasks.some((t) => taskName.toLowerCase().includes(t))) return true;
  return false;
}

export function hasApprovedSpec(agentRole: string, taskName: string): boolean {
  return Array.from(_specs.values()).some(
    (s) =>
      s.status === "approved" &&
      s.agentRole === agentRole &&
      s.taskName.toLowerCase() === taskName.toLowerCase()
  );
}

// ── Pre-seeded clinical specs ─────────────────────────────────────────────────

const SEEDED_SPECS: Parameters<typeof createSpec>[0][] = [
  {
    agentRole:   "sepsis_agent",
    taskName:    "administer 30mL/kg crystalloid bolus",
    description: "Administer IV fluid resuscitation of 30 mL/kg crystalloid within Hour-1 for sepsis/septic shock per Surviving Sepsis Campaign guidelines.",
    scope:       "In scope: initial fluid resuscitation in adult sepsis/septic shock. Out of scope: pediatric dosing, cardiogenic shock, ARDS patients.",
    edgeCases:   [
      "Congestive heart failure — reduce bolus to 10-15 mL/kg, reassess after each 500 mL aliquot.",
      "End-stage renal disease — coordinate with nephrology, limit to 250-500 mL bolus.",
      "Hypertonic saline contraindicated — use isotonic saline (0.9% NaCl) or Lactated Ringer's only.",
      "Pre-existing fluid overload — assess JVP/lung sounds before initiating.",
    ],
    dataModel:   "Inputs: weight (kg), MAP (mmHg), lactate (mmol/L), qSOFA score. Outputs: fluid volume (mL), infusion rate (mL/hr), reassessment schedule.",
    risksIdentified: [
      "Pulmonary edema from over-resuscitation in CHF patients.",
      "Delayed antibiotic administration if fluids prioritized incorrectly.",
      "Hyponatremia from excessive hypotonic fluid use.",
    ],
    testCriteria: [
      "MAP rises above 65 mmHg within 30 minutes of bolus completion.",
      "Lactate re-measurement performed at 2 hours — clearance ≥10% confirms response.",
      "Lung sounds and JVP documented before and after bolus.",
    ],
  },
  {
    agentRole:   "triage_agent",
    taskName:    "assign ESI triage level",
    description: "Classify arriving patient into Emergency Severity Index (ESI 1-5) within 2 minutes of presentation using chief complaint, vital signs, and resource prediction.",
    scope:       "In scope: adult and pediatric triage in emergency department. Out of scope: ICU step-down triage, psychiatric-only presentations handled by separate protocol.",
    edgeCases:   [
      "Pediatric fever — use Pediatric Assessment Triangle before ESI assignment.",
      "Non-verbal or unconscious patient — default to ESI 1 pending rapid assessment.",
      "Altered mental status — evaluate for stroke (FAST) before ESI 2 assignment.",
    ],
    dataModel:   "Inputs: chief complaint, HR, RR, SpO2, temperature, pain scale, mental status. Outputs: ESI level (1-5), resource prediction, recommended disposition.",
    risksIdentified: [
      "Under-triage of STEMI presenting as GI pain — requires ECG in all chest/epigastric complaints.",
      "Over-triage consuming critical care resources unnecessarily.",
    ],
    testCriteria: [
      "ESI assignment completed within 120 seconds of patient registration.",
      "ESI 1-2 patients achieve physician contact within 15 minutes.",
      "Over-triage rate <5% when compared to final disposition.",
    ],
  },
];

// Seed on module load
for (const s of SEEDED_SPECS) {
  createSpec(s);
}
// Approve the seeded specs (they are pre-validated clinical protocols)
for (const spec of listSpecs("validated")) {
  approveSpec(spec.id, "system_clinical_governance");
}
