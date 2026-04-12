/**
 * clinicalSuperpowers.ts — Superpowers framework clinical translation
 *
 * Article 26 — Superpowers: "Not primarily a specification framework, not an
 *  enterprise team simulator, and not a context orchestration engine. It is a
 *  DISCIPLINE ENFORCEMENT SYSTEM."
 *
 * Three unique mechanisms (all three new, not in existing codebase):
 *
 * 1. BRAINSTORMING GATE (hard gate — Article 26):
 *    "Before any code is written, Superpowers forces a structured dialogue.
 *     The agent is explicitly prohibited from writing code, scaffolding projects,
 *     or taking any implementation action until a design has been presented and
 *     approved. BMAD has a similar analysis phase, but Superpowers' gate is
 *     harder: there is NO workaround, no 'this is too simple to need a design'
 *     escape hatch."
 *
 * 2. TDD AS IRON LAW (delete-and-rewrite rule — Article 26):
 *    "If the agent writes production code before a failing test exists, the code
 *     gets DELETED. Not saved for reference. Not adapted. Deleted. This is the
 *     most aggressive testing enforcement of any framework in this comparison."
 *
 * 3. NAMED RATIONALIZATIONS (anti-social-engineering — Article 26):
 *    "Superpowers explicitly addresses the psychology of AI agents. It names the
 *     rationalizations models use to skip steps and preemptively blocks them.
 *     The creator deliberately tries to talk the agent into cutting corners by
 *     simulating urgency and watching for compliance."
 *
 * 4. TWO-STAGE REVIEW (spec compliance + code quality):
 *    "Each subagent's output goes through SPEC COMPLIANCE review and CODE QUALITY
 *     review before the workflow advances."
 *
 * Clinical translation:
 *   Brainstorming gate → No clinical intervention until protocol design reviewed
 *   TDD iron law       → No treatment order without defined success criteria (delete if skipped)
 *   Named rationalizations → 8 clinical rationalizations that agents use to skip safety steps
 *   Two-stage review   → Protocol compliance + clinical quality sign-off
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type SuperpowersPhase =
  | "brainstorm"   // hard gate — no intervention until design approved
  | "test_define"  // define success criteria (failing "test") BEFORE intervention
  | "implement"    // intervention can now proceed
  | "review_spec"  // stage 1: does output comply with the spec?
  | "review_quality" // stage 2: is the output clinically high quality?
  | "complete";

export type GateResult = "pass" | "fail" | "pending";

export type RationalizationCategory =
  | "urgency_override"      // "The patient is critical, just skip the check"
  | "simplicity_bypass"     // "This is too simple to need a protocol"
  | "defer_documentation"   // "I'll document it after"
  | "experience_exemption"  // "I've done this 1000 times, no need for review"
  | "time_pressure"         // "There's no time, just do it"
  | "minor_deviation"       // "It's just a small change from the protocol"
  | "trust_the_agent"       // "The AI said it's fine, no need to verify"
  | "exception_claim";      // "This patient is a special case"

export interface ClinicalRationalization {
  category:    RationalizationCategory;
  pattern:     RegExp;
  description: string;
  counter:     string;    // pre-emptive block message
  severity:    "low" | "medium" | "high" | "critical";
}

export interface BrainstormSession {
  id:              string;
  objective:       string;
  designProposal?:  string;
  proposedBy?:     string;
  approvedBy?:     string;
  approved:        boolean;
  gateResult:      GateResult;
  notes:           string[];
  createdAt:       Date;
  approvedAt?:     Date;
}

export interface TDDProtocol {
  id:                 string;
  interventionName:   string;
  successCriteria:    string[];    // these are the "failing tests" — must be defined FIRST
  testConditions:     string[];    // how to verify each criterion
  status:             "criteria_defined" | "intervention_active" | "verified" | "deleted";
  deletedReason?:     string;      // if code was "deleted" (iron law enforcement)
  definedAt:          Date;
  interventionStartedAt?: Date;
}

export interface TwoStageReview {
  id:             string;
  sessionId:      string;
  output:         string;
  // Stage 1: Spec compliance
  specCompliance: {
    checked:     boolean;
    passed:      boolean | null;
    violations:  string[];
    reviewer?:   string;
    checkedAt?:  Date;
  };
  // Stage 2: Clinical quality
  qualityReview: {
    checked:     boolean;
    passed:      boolean | null;
    issues:      string[];
    reviewer?:   string;
    checkedAt?:  Date;
  };
  overallPassed:  boolean;
  blockedReason?: string;
}

export interface SuperpowersSession {
  id:              string;
  phase:           SuperpowersPhase;
  brainstorm?:     BrainstormSession;
  tddProtocol?:    TDDProtocol;
  reviews:         TwoStageReview[];
  rationalizationsDetected: Array<{ category: RationalizationCategory; text: string; at: Date }>;
  phaseHistory:    Array<{ phase: SuperpowersPhase; at: Date; by: string }>;
  createdAt:       Date;
  updatedAt:       Date;
}

// ── Named rationalizations (anti-social-engineering table) ────────────────────
// Article: "It names the rationalizations models use to skip steps and preemptively blocks them"

export const NAMED_RATIONALIZATIONS: ClinicalRationalization[] = [
  {
    category:    "urgency_override",
    pattern:     /\b(critical|emergency|no time|just do it|skip|too urgent)\b/i,
    description: "Agent claims urgency to bypass safety checks",
    counter:     "BLOCKED: Urgency does not override patient safety gates. Use the Emergency Pathway which has its own pre-approved protocol.",
    severity:    "critical",
  },
  {
    category:    "simplicity_bypass",
    pattern:     /\b(too simple|obvious|doesn't need|no need for|straightforward|clearly)\b/i,
    description: "Agent claims task is too simple to need a protocol",
    counter:     "BLOCKED: 'Too simple to need a protocol' is the rationalization that causes the most preventable harm. Apply protocol regardless.",
    severity:    "high",
  },
  {
    category:    "defer_documentation",
    pattern:     /\b(document after|chart later|will note|note it later|after the fact)\b/i,
    description: "Agent defers documentation to after the intervention",
    counter:     "BLOCKED: Documentation after the fact is not documentation — it is reconstruction. Document before proceeding.",
    severity:    "high",
  },
  {
    category:    "experience_exemption",
    pattern:     /\b(always done|years of|experience|done it.*(thousand|hundred|many times)|standard practice)\b/i,
    description: "Agent appeals to experience to bypass review",
    counter:     "BLOCKED: Experience does not replace protocol compliance. The protocol exists because experience is fallible.",
    severity:    "medium",
  },
  {
    category:    "time_pressure",
    pattern:     /\b(no time|tight|quickly|fast|hurry|right away|immediately.*skip)\b/i,
    description: "Agent cites time pressure to skip steps",
    counter:     "BLOCKED: Time pressure is a manipulation vector. The safety gate takes 30 seconds. A missed step costs much more.",
    severity:    "high",
  },
  {
    category:    "minor_deviation",
    pattern:     /\b(small|minor|slight|little|barely|just.*tweak|small.*(change|adjustment|deviation))\b/i,
    description: "Agent claims deviation from protocol is minor",
    counter:     "BLOCKED: There are no minor deviations from a validated clinical protocol. Deviations require explicit physician authorization.",
    severity:    "medium",
  },
  {
    category:    "trust_the_agent",
    pattern:     /\b(AI said|model confirmed|algorithm|system says|the AI|it.*(checked|verified|said it.*(fine|safe|ok)))\b/i,
    description: "Agent cites another AI system's output as sufficient verification",
    counter:     "BLOCKED: AI confirmation is not physician sign-off. Human verification is required for all high-stakes clinical decisions.",
    severity:    "critical",
  },
  {
    category:    "exception_claim",
    pattern:     /\b(special case|unique|exception|different|this (patient|case|situation) is)\b/i,
    description: "Agent claims the case is a special exception that bypasses protocol",
    counter:     "BLOCKED: Exceptions require explicit protocol override with documented clinical reasoning — not unilateral agent decision.",
    severity:    "medium",
  },
];

export function detectRationalization(text: string): ClinicalRationalization[] {
  return NAMED_RATIONALIZATIONS.filter((r) => r.pattern.test(text));
}

// ── TDD iron law ──────────────────────────────────────────────────────────────

export function requireSuccessCriteriaFirst(
  interventionName: string,
  successCriteria:  string[],
  testConditions:   string[],
): TDDProtocol {
  if (successCriteria.length === 0) {
    throw new Error(
      `TDD Iron Law Violation: Cannot begin '${interventionName}' without defined success criteria. ` +
      "Define at least one measurable success criterion before proceeding."
    );
  }
  return {
    id:              `tdd_${Date.now()}`,
    interventionName,
    successCriteria,
    testConditions,
    status:          "criteria_defined",
    definedAt:       new Date(),
  };
}

export function enforcePreTestRequired(protocol: TDDProtocol): TDDProtocol {
  if (protocol.status !== "criteria_defined") {
    // Iron law: delete the intervention (mark as deleted)
    return {
      ...protocol,
      status:       "deleted",
      deletedReason: "TDD Iron Law: Intervention started before success criteria were defined. Intervention deleted — must restart with criteria defined first.",
    };
  }
  return {
    ...protocol,
    status:                 "intervention_active",
    interventionStartedAt:  new Date(),
  };
}

// ── Two-stage review ──────────────────────────────────────────────────────────

const _reviews = new Map<string, TwoStageReview>();

export function submitForTwoStageReview(sessionId: string, output: string): TwoStageReview {
  const id = `2sr_${Date.now()}`;
  const review: TwoStageReview = {
    id, sessionId, output,
    specCompliance: { checked: false, passed: null, violations: [] },
    qualityReview:  { checked: false, passed: null, issues:     [] },
    overallPassed:  false,
  };
  _reviews.set(id, review);
  return review;
}

export function conductSpecComplianceReview(
  reviewId:   string,
  reviewer:   string,
  violations: string[],
): TwoStageReview | null {
  const r = _reviews.get(reviewId);
  if (!r) return null;
  r.specCompliance = {
    checked:  true,
    passed:   violations.length === 0,
    violations,
    reviewer,
    checkedAt: new Date(),
  };
  updateOverallResult(r);
  return r;
}

export function conductQualityReview(
  reviewId:  string,
  reviewer:  string,
  issues:    string[],
): TwoStageReview | null {
  const r = _reviews.get(reviewId);
  if (!r) return null;
  if (!r.specCompliance.checked) {
    r.blockedReason = "Stage 1 (spec compliance) must be completed before Stage 2 (quality review).";
    return r;
  }
  r.qualityReview = {
    checked:  true,
    passed:   issues.length === 0,
    issues,
    reviewer,
    checkedAt: new Date(),
  };
  updateOverallResult(r);
  return r;
}

function updateOverallResult(r: TwoStageReview): void {
  const stage1 = r.specCompliance.checked && r.specCompliance.passed;
  const stage2 = r.qualityReview.checked  && r.qualityReview.passed;
  r.overallPassed = Boolean(stage1 && stage2);
  if (!r.overallPassed) {
    const blockers = [
      ...r.specCompliance.violations.map((v) => `SpecViolation: ${v}`),
      ...r.qualityReview.issues.map((i) => `QualityIssue: ${i}`),
    ];
    r.blockedReason = blockers.length ? blockers.join("; ") : undefined;
  }
}

export function getReview(reviewId: string): TwoStageReview | undefined {
  return _reviews.get(reviewId);
}

// ── Session management ────────────────────────────────────────────────────────

const _sessions = new Map<string, SuperpowersSession>();
let   _seq      = 1;

export function createSuperpowersSession(objective: string): SuperpowersSession {
  const id = `sp_${Date.now()}_${_seq++}`;
  const s: SuperpowersSession = {
    id,
    phase:   "brainstorm",
    reviews: [],
    rationalizationsDetected: [],
    phaseHistory: [{ phase: "brainstorm", at: new Date(), by: "system" }],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  // Automatically create brainstorm session
  s.brainstorm = {
    id:       `bs_${Date.now()}`,
    objective,
    approved: false,
    gateResult: "pending",
    notes:    [],
    createdAt: new Date(),
  };
  _sessions.set(id, s);
  return s;
}

export function submitDesignProposal(
  sessionId: string,
  proposal:  string,
  proposedBy: string,
): SuperpowersSession | null {
  const s = _sessions.get(sessionId);
  if (!s || !s.brainstorm) return null;
  // Check for rationalizations in the proposal
  const detected = detectRationalization(proposal);
  detected.forEach((r) => {
    s.rationalizationsDetected.push({ category: r.category, text: r.counter, at: new Date() });
  });
  if (detected.some((r) => r.severity === "critical")) {
    s.brainstorm.gateResult = "fail";
    s.brainstorm.notes.push(`BLOCKED: Critical rationalization detected — ${detected[0].counter}`);
    return s;
  }
  s.brainstorm.designProposal = proposal;
  s.brainstorm.proposedBy     = proposedBy;
  s.brainstorm.gateResult     = "pending";  // awaiting approval
  s.updatedAt = new Date();
  return s;
}

export function approveBrainstorm(sessionId: string, approvedBy: string): SuperpowersSession | null {
  const s = _sessions.get(sessionId);
  if (!s || !s.brainstorm) return null;
  if (!s.brainstorm.designProposal) {
    s.brainstorm.notes.push("Cannot approve — no design proposal submitted.");
    return s;
  }
  s.brainstorm.approved   = true;
  s.brainstorm.approvedBy = approvedBy;
  s.brainstorm.approvedAt = new Date();
  s.brainstorm.gateResult = "pass";
  s.phase = "test_define";
  s.phaseHistory.push({ phase: "test_define", at: new Date(), by: approvedBy });
  s.updatedAt = new Date();
  return s;
}

export function defineTDDProtocol(
  sessionId: string,
  interventionName: string,
  successCriteria: string[],
  testConditions:  string[],
): SuperpowersSession | null {
  const s = _sessions.get(sessionId);
  if (!s) return null;
  if (s.phase !== "test_define") {
    s.rationalizationsDetected.push({ category: "urgency_override", text: "Attempted to define TDD protocol outside test_define phase.", at: new Date() });
    return s;
  }
  s.tddProtocol = requireSuccessCriteriaFirst(interventionName, successCriteria, testConditions);
  s.phase = "implement";
  s.phaseHistory.push({ phase: "implement", at: new Date(), by: "physician" });
  s.updatedAt = new Date();
  return s;
}

export function checkRationalization(sessionId: string, text: string): ClinicalRationalization[] {
  const s = _sessions.get(sessionId);
  const detected = detectRationalization(text);
  if (s && detected.length > 0) {
    detected.forEach((r) => {
      s.rationalizationsDetected.push({ category: r.category, text: r.counter, at: new Date() });
    });
    s.updatedAt = new Date();
  }
  return detected;
}

export function getSuperpowersSession(id: string): SuperpowersSession | undefined {
  return _sessions.get(id);
}

export function listSuperpowersSessions(): SuperpowersSession[] {
  return Array.from(_sessions.values());
}
