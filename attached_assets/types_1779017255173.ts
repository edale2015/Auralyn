/**
 * Auralyn Context Engineering — Core Types
 *
 * The central idea: an encounter has FOUR tiers of context, each with
 * different rules about when it's included in prompts and when it survives
 * compaction.
 *
 *   Tier 1 — IMMUTABLES: chief complaint, allergies, vitals, red flags.
 *            Always in every prompt. Never compacted. Never overwritten.
 *
 *   Tier 2 — WORKING: current differential, pending questions, candidate
 *            dispositions. Active reasoning state. Compactable.
 *
 *   Tier 3 — ARTIFACTS: durable outputs (ruled-outs, validated findings,
 *            calculations, decisions). Survive compaction. How agents
 *            communicate.
 *
 *   Tier 4 — TRACE: raw conversation history. Almost never sent to the
 *            model. Persisted to S3 audit sink for compliance.
 */

export type EncounterId = string;
export type TenantId = string;
export type PhysicianId = string;
export type ISOTimestamp = string;

export type AgentRole =
  | "triage"
  | "differential"
  | "disposition"
  | "billing"
  | "supervisor";

// ───────────────────────────────────────────────────────────────────────────
// Tier 1 — Immutables
// ───────────────────────────────────────────────────────────────────────────

export interface ClinicalImmutables {
  encounterId: EncounterId;
  tenantId: TenantId;
  physicianId: PhysicianId;

  patient: {
    ageYears: number;
    sex: "M" | "F" | "Other";
    allergies: string[];
    currentMedications: string[];
    relevantHistory: string[]; // PMH that's clinically active
    pregnancyStatus?: "pregnant" | "possibly" | "not_pregnant" | "n/a";
  };

  chiefComplaint: string;

  presentingVitals?: {
    hr?: number;
    sbp?: number;
    dbp?: number;
    rr?: number;
    spo2?: number;
    tempC?: number;
    painScale?: number;
    capturedAt: ISOTimestamp;
  };

  /**
   * Red flags identified at any point during the encounter.
   * Once flagged, NEVER removed — these permanently constrain disposition.
   * Example: "Tearing chest pain with BP differential" → aortic dissection
   * concern → cannot discharge home regardless of later reassuring findings.
   */
  redFlagsIdentified: RedFlag[];

  /**
   * Hard constraints from rules, guidelines, or supervisor override.
   * Example: "Do not discharge without ECG", "Glucose required before disposition"
   */
  hardConstraints: string[];

  encounterStartedAt: ISOTimestamp;
}

export interface RedFlag {
  id: string;
  description: string;
  identifiedAt: ISOTimestamp;
  identifiedBy: AgentRole | "rule_engine" | "physician";
  source: string; // KB citation, rule id, or "physician_input"
}

// ───────────────────────────────────────────────────────────────────────────
// Tier 2 — Working Context
// ───────────────────────────────────────────────────────────────────────────

export interface WorkingContext {
  currentDifferential: DifferentialItem[];
  pendingQuestions: AdaptiveQuestion[];
  answeredQuestions: AnsweredQuestion[];
  candidateDispositions: Disposition[];
  currentAgent: AgentRole;
  step: number;
  /** Number of tokens currently estimated in this tier */
  estimatedTokens: number;
}

export interface DifferentialItem {
  diagnosis: string;
  icd10?: string;
  likelihood: number; // 0..1, model's current belief
  supportingFindings: string[];
  refutingFindings: string[];
  evidenceQuality: "low" | "moderate" | "high";
  lastUpdatedStep: number;
}

export interface AdaptiveQuestion {
  id: string;
  text: string;
  purpose: string;
  /** Which differential entries this question helps discriminate */
  discriminatesBetween: string[];
  createdAtStep: number;
}

export interface AnsweredQuestion {
  questionId: string;
  question: string;
  answer: string;
  answeredAt: ISOTimestamp;
  /** Resulting findings extracted from the answer */
  extractedFindings?: string[];
}

export interface Disposition {
  type:
    | "home_self_care"
    | "home_with_rx"
    | "follow_up_pcp"
    | "urgent_consult"
    | "ed_transfer"
    | "observation"
    | "admit";
  rationale: string;
  preconditions: string[]; // must be true before this disposition can be selected
  blockers: string[]; // currently preventing it
  proposedAtStep: number;
}

// ───────────────────────────────────────────────────────────────────────────
// Tier 3 — Artifacts (the durable layer)
// ───────────────────────────────────────────────────────────────────────────

export type ArtifactType =
  | "kb_retrieval" // a KB chunk + why it was retrieved
  | "ruled_out" // a diagnosis / disposition we eliminated, and why
  | "validated_finding" // a clinical finding confirmed
  | "calculation" // risk score (HEART, Wells, PERC, NEXUS, etc.)
  | "decision" // a discrete choice made (e.g., order CXR)
  | "uncertainty" // unresolved question to revisit
  | "failed_attempt" // something we tried that didn't pan out (don't retry)
  | "compaction_summary"; // produced by the compactor itself

export interface Artifact {
  id: string;
  type: ArtifactType;
  producedBy: AgentRole;
  producedAt: ISOTimestamp;
  /** Which agents have already read this artifact (for cache locality) */
  consumedBy: AgentRole[];
  payload: ArtifactPayload;
  provenance: Provenance;
  /** Estimated tokens this artifact uses when serialized */
  estimatedTokens: number;
}

export type ArtifactPayload =
  | KBRetrievalPayload
  | RuledOutPayload
  | ValidatedFindingPayload
  | CalculationPayload
  | DecisionPayload
  | UncertaintyPayload
  | FailedAttemptPayload
  | CompactionSummaryPayload;

export interface KBRetrievalPayload {
  query: string;
  chunkId: string;
  chunkText: string;
  relevanceScore: number;
}

export interface RuledOutPayload {
  diagnosis: string;
  reason: string;
  evidence: string[];
  /** If this is ever to be reconsidered, what would need to change */
  reconsiderIf: string[];
}

export interface ValidatedFindingPayload {
  finding: string;
  positiveOrNegative: "present" | "absent";
  source: "history" | "physical" | "vitals" | "study";
}

export interface CalculationPayload {
  scoreName: string; // "HEART", "Wells", etc.
  score: number;
  interpretation: string;
  inputs: Record<string, string | number | boolean>;
}

export interface DecisionPayload {
  decision: string;
  rationale: string;
  alternatives_considered: string[];
}

export interface UncertaintyPayload {
  question: string;
  whyItMatters: string;
  blockedAgents: AgentRole[];
}

export interface FailedAttemptPayload {
  attempted: string;
  outcome: string;
  doNotRetryReason: string;
}

export interface CompactionSummaryPayload {
  summarizedSteps: [number, number]; // inclusive range
  highlights: string[];
  preservedArtifactIds: string[];
}

export interface Provenance {
  source: "kb" | "physician" | "patient" | "rule_engine" | "calculation" | "external_tool";
  kbChunkIds?: string[];
  toolCallId?: string;
  citation?: string;
}

// ───────────────────────────────────────────────────────────────────────────
// Tier 4 — Trace (NOT for prompts; for audit only)
// ───────────────────────────────────────────────────────────────────────────

export interface TraceEntry {
  step: number;
  agent: AgentRole;
  occurredAt: ISOTimestamp;
  promptHash: string; // hash of the prompt sent (don't store full prompt here)
  responseHash: string;
  tokensIn: number;
  tokensOut: number;
}

// ───────────────────────────────────────────────────────────────────────────
// The full context object
// ───────────────────────────────────────────────────────────────────────────

export interface EncounterContext {
  immutables: ClinicalImmutables;
  working: WorkingContext;
  artifacts: Artifact[];
  /** Trace is kept separately and NOT included in prompts */
  traceRefId: string; // pointer to S3 audit object
}

// ───────────────────────────────────────────────────────────────────────────
// Prompt assembly result
// ───────────────────────────────────────────────────────────────────────────

export interface AssembledPrompt {
  systemPrompt: string;
  userPrompt: string;
  estimatedTokens: number;
  includedArtifactIds: string[];
  toolNames: string[];
  /** What we deliberately left out, for debugging */
  excluded: {
    artifactIds: string[];
    reason: string;
  };
}
