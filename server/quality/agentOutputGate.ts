/**
 * agentOutputGate.ts — Article 25 (Agentic Engineering) — "PR-Rigor Review":
 *
 * "Review the code with the same rigor you'd apply to a human teammate's PR.
 *  If you can't explain what a module does, it doesn't go in. Read the diff.
 *  Understand every function. If something is unclear, ask the agent to explain
 *  it before merging."
 *
 * Article failure mode: "An agent writing 1,000 PRs per week with a 1% 
 * vulnerability rate creates 10 new vulnerabilities weekly. Vibe coding had
 * no gate for this."
 *
 * Clinical translation: An AI agent making 500+ triage decisions per day with
 * a 1% error rate = 5 missed critical diagnoses per day. The output gate is
 * the enforcement mechanism for the physician-as-architect role.
 *
 * Review checklist (from the article's three mandatory habits):
 *   ✓ Schema valid          — output matches expected structure
 *   ✓ Confidence adequate   — agent confidence above clinical threshold
 *   ✓ Explainability present — agent can explain the reasoning
 *   ✓ No contradictions     — output is consistent with prior decisions
 *   ✓ Edge cases addressed  — high-risk scenarios were considered
 *   ✓ Reviewer understands  — physician can explain what the agent produced
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type ReviewStatus = "pending_auto" | "pending_human" | "approved" | "rejected" | "escalated";

export interface ReviewChecklist {
  schemaValid:          boolean | null;   // null = not yet checked
  confidenceAdequate:   boolean | null;
  explainabilityPresent: boolean | null;
  noContradictions:     boolean | null;
  edgeCasesAddressed:   boolean | null;
  reviewerUnderstands:  boolean | null;   // physician self-attestation
}

export interface AgentOutput {
  id:              string;
  agentRole:       string;
  taskName:        string;
  output:          string;             // the agent's generated recommendation/decision
  confidence?:     number;            // 0-1 from the agent
  reasoning?:      string;            // agent's self-explanation
  patientId?:      string;
  sessionId?:      string;
  context:         string;
}

export interface OutputReview {
  id:            string;
  output:        AgentOutput;
  status:        ReviewStatus;
  checklist:     ReviewChecklist;
  qualityScore:  number;              // 0-100 from checklist completion
  autoCheckNotes: string[];           // automated pre-check findings
  reviewedBy?:   string;
  reviewerNotes?: string;
  submittedAt:   Date;
  reviewedAt?:   Date;
  escalationReason?: string;
}

// ── In-memory store ───────────────────────────────────────────────────────────

const _reviews = new Map<string, OutputReview>();
let   _seq     = 1;
function nextId(): string { return `rev_${Date.now()}_${_seq++}`; }

// ── Confidence thresholds by clinical role ────────────────────────────────────
// Article: "Agentic engineering = AI builds, human owns the quality and correctness."
// Minimum acceptable confidence before a physician review is mandatory

const CONFIDENCE_THRESHOLDS: Record<string, number> = {
  triage_agent:      0.85,   // triage errors cost lives
  sepsis_agent:      0.90,   // sepsis decisions are time-critical
  prescribing_agent: 0.92,   // medication errors are common and dangerous
  emergency_agent:   0.88,
  default:           0.70,
};

function getConfidenceThreshold(agentRole: string): number {
  return CONFIDENCE_THRESHOLDS[agentRole] ?? CONFIDENCE_THRESHOLDS.default;
}

// ── Auto pre-check ────────────────────────────────────────────────────────────
// Automated checks that run before human review — surface issues immediately.
// Article: "Run the tests before calling anything done."

const REQUIRED_OUTPUT_FIELDS   = ["recommendation", "rationale", "action", "assessment", "diagnosis", "decision"];
const EXPLAINABILITY_INDICATORS = ["because", "based on", "due to", "according to", "per", "consistent with", "evidence", "criteria"];

function autoPrecheck(output: AgentOutput): { checklist: Partial<ReviewChecklist>; notes: string[] } {
  const notes: string[] = [];
  const checklist: Partial<ReviewChecklist> = {};

  // 1. Schema valid — output contains at least one recognizable clinical field
  const outputLower     = output.output.toLowerCase();
  const hasStructuredField = REQUIRED_OUTPUT_FIELDS.some((f) => outputLower.includes(f));
  checklist.schemaValid = hasStructuredField || output.output.trim().length > 30;
  if (!checklist.schemaValid) notes.push("Output lacks identifiable clinical structure fields.");

  // 2. Confidence adequate
  const threshold = getConfidenceThreshold(output.agentRole);
  if (output.confidence !== undefined) {
    checklist.confidenceAdequate = output.confidence >= threshold;
    if (!checklist.confidenceAdequate) {
      notes.push(`Confidence ${(output.confidence * 100).toFixed(0)}% below threshold ${(threshold * 100).toFixed(0)}% for role '${output.agentRole}'.`);
    }
  } else {
    checklist.confidenceAdequate = null;  // unknown — flag for human
    notes.push("Agent confidence not provided — human reviewer must assess uncertainty.");
  }

  // 3. Explainability present
  const hasReasoning = (output.reasoning?.trim().length ?? 0) > 20;
  const outputExplains = EXPLAINABILITY_INDICATORS.some((w) => outputLower.includes(w));
  checklist.explainabilityPresent = hasReasoning || outputExplains;
  if (!checklist.explainabilityPresent) {
    notes.push("No reasoning or rationale detected. Agent cannot explain its recommendation — human must verify.");
  }

  // 4. No contradictions — cannot check in isolation; set to null for human to assess
  checklist.noContradictions = null;
  notes.push("Contradiction check requires session context — reviewer must compare with prior decisions.");

  // 5. Edge cases addressed — look for hedging/exception language
  const edgeCaseWords = ["except", "unless", "if.*allerg", "contraindicated", "caution", "pediatric", "renal", "hepatic", "pregnant"];
  const outputStr     = output.output + " " + (output.reasoning ?? "");
  const addressesEdges = edgeCaseWords.some((w) => new RegExp(w, "i").test(outputStr));
  checklist.edgeCasesAddressed = addressesEdges || output.output.length > 200;
  if (!checklist.edgeCasesAddressed) {
    notes.push("No edge-case language detected. Reviewer should verify contraindications were considered.");
  }

  // 6. Reviewer understands — must be attested by human; auto-set null
  checklist.reviewerUnderstands = null;

  return { checklist, notes };
}

// ── Quality score ─────────────────────────────────────────────────────────────

export function computeQualityScore(checklist: ReviewChecklist): number {
  const weights: [keyof ReviewChecklist, number][] = [
    ["schemaValid",           15],
    ["confidenceAdequate",    20],
    ["explainabilityPresent", 20],
    ["noContradictions",      20],
    ["edgeCasesAddressed",    15],
    ["reviewerUnderstands",   10],
  ];
  let score = 0;
  for (const [key, weight] of weights) {
    if (checklist[key] === true)  score += weight;
    if (checklist[key] === null)  score += weight * 0.4; // partial for unknown
  }
  return Math.round(score);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function submitForReview(output: AgentOutput): OutputReview {
  const { checklist: autoChecklist, notes } = autoPrecheck(output);

  const fullChecklist: ReviewChecklist = {
    schemaValid:          autoChecklist.schemaValid ?? null,
    confidenceAdequate:   autoChecklist.confidenceAdequate ?? null,
    explainabilityPresent: autoChecklist.explainabilityPresent ?? null,
    noContradictions:     null,
    edgeCasesAddressed:   autoChecklist.edgeCasesAddressed ?? null,
    reviewerUnderstands:  null,
  };

  const review: OutputReview = {
    id:            nextId(),
    output,
    status:        "pending_auto",
    checklist:     fullChecklist,
    qualityScore:  computeQualityScore(fullChecklist),
    autoCheckNotes: notes,
    submittedAt:   new Date(),
  };

  // Escalate immediately if confidence below threshold and role is high-stakes
  const threshold  = getConfidenceThreshold(output.agentRole);
  const lowConf    = output.confidence !== undefined && output.confidence < threshold;
  const highStake  = ["sepsis_agent", "prescribing_agent", "emergency_agent"].includes(output.agentRole);
  if (lowConf && highStake) {
    review.status             = "escalated";
    review.escalationReason   = `Low confidence (${((output.confidence ?? 0) * 100).toFixed(0)}%) from high-stakes agent '${output.agentRole}'. Immediate physician review required.`;
  } else {
    review.status = "pending_human";
  }

  _reviews.set(review.id, review);
  return review;
}

export function conductReview(
  reviewId:       string,
  reviewedBy:     string,
  checklistUpdate: Partial<ReviewChecklist>,
  notes?:         string,
): OutputReview | null {
  const review = _reviews.get(reviewId);
  if (!review) return null;

  review.checklist      = { ...review.checklist, ...checklistUpdate };
  review.qualityScore   = computeQualityScore(review.checklist);
  review.reviewedBy     = reviewedBy;
  review.reviewerNotes  = notes;
  review.reviewedAt     = new Date();

  // Determine outcome from checklist
  const allTrue    = Object.values(review.checklist).every((v) => v === true);
  const anyFalse   = Object.values(review.checklist).some((v) => v === false);
  const reviewerOk = review.checklist.reviewerUnderstands === true;

  if (anyFalse || !reviewerOk) {
    review.status = "rejected";
  } else if (allTrue) {
    review.status = "approved";
  } else {
    review.status = "pending_human"; // still has null items
  }

  return review;
}

export function approveOutput(reviewId: string, approvedBy: string, notes?: string): OutputReview | null {
  const review = _reviews.get(reviewId);
  if (!review) return null;
  review.status    = "approved";
  review.reviewedBy = approvedBy;
  review.reviewerNotes = notes;
  review.reviewedAt = new Date();
  // Force all nulls to true when physician explicitly approves
  for (const key of Object.keys(review.checklist) as (keyof ReviewChecklist)[]) {
    if (review.checklist[key] === null) review.checklist[key] = true;
  }
  review.qualityScore = computeQualityScore(review.checklist);
  return review;
}

export function rejectOutput(reviewId: string, rejectedBy: string, reason: string): OutputReview | null {
  const review = _reviews.get(reviewId);
  if (!review) return null;
  review.status          = "rejected";
  review.reviewedBy      = rejectedBy;
  review.reviewerNotes   = reason;
  review.reviewedAt      = new Date();
  return review;
}

export function getReview(reviewId: string): OutputReview | undefined {
  return _reviews.get(reviewId);
}

export function getReviewQueue(status?: ReviewStatus): OutputReview[] {
  const all = Array.from(_reviews.values());
  return status ? all.filter((r) => r.status === status) : all;
}

export function getPendingReviews(): OutputReview[] {
  return getReviewQueue("pending_human");
}

export function getEscalatedReviews(): OutputReview[] {
  return getReviewQueue("escalated");
}

export function getQueueStats(): {
  total: number;
  pending: number;
  escalated: number;
  approved: number;
  rejected: number;
  avgQualityScore: number;
} {
  const all       = Array.from(_reviews.values());
  const scores    = all.map((r) => r.qualityScore);
  const avg       = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  return {
    total:     all.length,
    pending:   all.filter((r) => r.status === "pending_human" || r.status === "pending_auto").length,
    escalated: all.filter((r) => r.status === "escalated").length,
    approved:  all.filter((r) => r.status === "approved").length,
    rejected:  all.filter((r) => r.status === "rejected").length,
    avgQualityScore: Math.round(avg),
  };
}
