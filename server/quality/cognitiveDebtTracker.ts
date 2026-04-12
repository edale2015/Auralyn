/**
 * cognitiveDebtTracker.ts — Article 25 (Agentic Engineering):
 *
 * "Cognitive debt — the accumulated cost of poorly managed AI interactions,
 *  context loss, and unreliable agent behavior — is taking over as the primary
 *  threat to engineering teams."
 *
 * Three failure modes from the article, translated to clinical risk metrics:
 *   1. Context collapse: "The longer a session runs, the worse the output gets.
 *      The agent loses track of earlier decisions."
 *   2. Decision contradictions: "Code starts contradicting itself."
 *   3. Accumulated debt: each unreviewed AI decision compounds future risk.
 *
 * Clinical relevance: In Auralyn, a single physician managing 500+ patients/day
 * via AI agents MUST know when the sepsis agent's recommendations at hour 8
 * are being shaped by a context window that no longer accurately reflects
 * patient state from hour 1. That's not a code quality problem — it's a
 * patient safety problem.
 *
 * Debt score formula (0-100):
 *   base          = clamp(contextTokens / 800, 0, 40)   ← context size pressure
 *   contradictions= clamp(contradictions * 8, 0, 30)    ← decision reversals
 *   sessionAge    = clamp(ageMinutes / 60, 0, 20)        ← session time drift
 *   unreviewedGap = clamp(unreviewedDecisions * 2, 0, 10)← review lag
 *   score         = base + contradictions + sessionAge + unreviewedAge
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type CollapseRisk = "low" | "medium" | "high" | "critical";

export interface AgentDecision {
  id:             string;
  sessionId:      string;
  agentRole:      string;
  decision:       string;
  contextSnapshot: string;   // first 300 chars of context at time of decision
  timestamp:      Date;
  reviewed:       boolean;
}

export interface ContradictionRecord {
  decisionIdA:   string;
  decisionIdB:   string;
  decisionA:     string;
  decisionB:     string;
  detectedAt:    Date;
  explanation:   string;
}

export interface CognitiveDebtReport {
  sessionId:         string;
  agentRole:         string;
  totalDecisions:    number;
  reviewedDecisions: number;
  unreviewedCount:   number;
  contradictions:    ContradictionRecord[];
  contextTokens:     number;    // approximate tokens in current context snapshot
  sessionAgeMinutes: number;
  debtScore:         number;    // 0-100
  collapseRisk:      CollapseRisk;
  recommendation:    string;
  createdAt:         Date;
  updatedAt:         Date;
}

export interface SessionSummary {
  sessionId:    string;
  agentRole:    string;
  debtScore:    number;
  collapseRisk: CollapseRisk;
  decisions:    number;
  updatedAt:    Date;
}

// ── In-memory session store ───────────────────────────────────────────────────

interface SessionState {
  agentRole:      string;
  decisions:      AgentDecision[];
  contradictions: ContradictionRecord[];
  currentContext: string;
  createdAt:      Date;
  updatedAt:      Date;
}

const _sessions = new Map<string, SessionState>();
let   _idSeq    = 1;

function nextId(): string { return `dec_${Date.now()}_${_idSeq++}`; }

// ── Contradiction detection ───────────────────────────────────────────────────
// Article: "Code starts contradicting itself. The developer doesn't notice."
// Clinically: detecting reversed recommendations ("administer X" vs "withhold X")

const NEGATION_PAIRS: [RegExp, RegExp][] = [
  [/\b(administer|give|start|initiate|begin)\b/i,  /\b(withhold|hold|stop|discontinue|avoid)\b/i],
  [/\b(increase|up-titrate|escalate)\b/i,          /\b(decrease|reduce|de-escalate|wean)\b/i],
  [/\b(isolate|quarantine)\b/i,                    /\b(discharge|release|transfer out)\b/i],
  [/\b(intubate|secure airway)\b/i,                /\b(extubate|remove tube)\b/i],
  [/\b(antibiotic|antibiotics)\b/i,                /\b(no antibiotic|withhold antibiotic|contraindicated)\b/i],
  [/\b(admit|admission)\b/i,                       /\b(discharge|send home)\b/i],
];

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/\W+/).filter((t) => t.length > 4));
  const tb = b.toLowerCase().split(/\W+/).filter((t) => t.length > 4);
  if (!ta.size || !tb.length) return 0;
  return tb.filter((t) => ta.has(t)).length / Math.max(ta.size, tb.length);
}

function detectContradiction(
  prev: AgentDecision,
  next: AgentDecision,
): ContradictionRecord | null {
  const subjectOverlap = tokenOverlap(prev.decision, next.decision);
  if (subjectOverlap < 0.15) return null; // different subjects → not contradictory

  for (const [actionA, actionB] of NEGATION_PAIRS) {
    const prevHasA = actionA.test(prev.decision);
    const nextHasB = actionB.test(next.decision);
    const prevHasB = actionB.test(prev.decision);
    const nextHasA = actionA.test(next.decision);

    if ((prevHasA && nextHasB) || (prevHasB && nextHasA)) {
      return {
        decisionIdA:  prev.id,
        decisionIdB:  next.id,
        decisionA:    prev.decision.slice(0, 120),
        decisionB:    next.decision.slice(0, 120),
        detectedAt:   new Date(),
        explanation:  `Semantic reversal detected — agent appears to recommend opposite actions on similar clinical subject (overlap ${(subjectOverlap * 100).toFixed(0)}%).`,
      };
    }
  }
  return null;
}

// ── Debt score + collapse risk ────────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.split(/\s+/).length * 1.3);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function computeDebtScore(sessionId: string): number {
  const s = _sessions.get(sessionId);
  if (!s) return 0;

  const contextTokens    = estimateTokens(s.currentContext);
  const ageMinutes       = (Date.now() - s.createdAt.getTime()) / 60_000;
  const unreviewedCount  = s.decisions.filter((d) => !d.reviewed).length;
  const contradictions   = s.contradictions.length;

  const base         = clamp(contextTokens / 800, 0, 40);
  const contribContr = clamp(contradictions * 8,  0, 30);
  const contribAge   = clamp(ageMinutes / 60,      0, 20);
  const contribUnrev = clamp(unreviewedCount * 2,  0, 10);

  return Math.round(base + contribContr + contribAge + contribUnrev);
}

export function getCollapseRisk(debtScore: number): CollapseRisk {
  if (debtScore >= 70) return "critical";
  if (debtScore >= 50) return "high";
  if (debtScore >= 25) return "medium";
  return "low";
}

function buildRecommendation(score: number, contradictions: number, ageMinutes: number): string {
  if (score >= 70) return "CRITICAL: Reset agent context immediately. Physician must re-verify all recent decisions. Context collapse risk is high.";
  if (contradictions >= 3)  return "HIGH: Multiple decision contradictions detected. Physician review required before further agent execution.";
  if (score >= 50) return "HIGH: Cognitive debt elevated. Consider summarizing context and starting a fresh sub-session for new patient cases.";
  if (score >= 25) return "MEDIUM: Context growing. Ensure physician reviews agent decisions every 30 minutes. Run correction log refresh.";
  if (ageMinutes > 120) return "LOW: Session is long-running. Consider periodic context summarization to prevent drift.";
  return "LOW: Cognitive debt within acceptable range. Continue current workflow with standard review cadence.";
}

// ── Public API ────────────────────────────────────────────────────────────────

export function createSession(sessionId: string, agentRole: string, initialContext = ""): void {
  _sessions.set(sessionId, {
    agentRole,
    decisions:      [],
    contradictions: [],
    currentContext: initialContext,
    createdAt:      new Date(),
    updatedAt:      new Date(),
  });
}

export function recordDecision(
  sessionId:       string,
  agentRole:       string,
  decision:        string,
  contextSnapshot: string,
): AgentDecision {
  let s = _sessions.get(sessionId);
  if (!s) {
    createSession(sessionId, agentRole, contextSnapshot);
    s = _sessions.get(sessionId)!;
  }

  const entry: AgentDecision = {
    id: nextId(), sessionId, agentRole, decision,
    contextSnapshot: contextSnapshot.slice(0, 300),
    timestamp: new Date(),
    reviewed: false,
  };

  // Check for contradictions with the last 10 decisions
  const recent = s.decisions.slice(-10);
  for (const prev of recent) {
    const c = detectContradiction(prev, entry);
    if (c) s.contradictions.push(c);
  }

  s.decisions.push(entry);
  s.currentContext = contextSnapshot;
  s.updatedAt      = new Date();
  return entry;
}

export function markDecisionReviewed(sessionId: string, decisionId: string): boolean {
  const s = _sessions.get(sessionId);
  if (!s) return false;
  const d = s.decisions.find((x) => x.id === decisionId);
  if (!d) return false;
  d.reviewed   = true;
  s.updatedAt  = new Date();
  return true;
}

export function getSessionReport(sessionId: string): CognitiveDebtReport | null {
  const s = _sessions.get(sessionId);
  if (!s) return null;

  const ageMinutes = (Date.now() - s.createdAt.getTime()) / 60_000;
  const debtScore  = computeDebtScore(sessionId);

  return {
    sessionId,
    agentRole:         s.agentRole,
    totalDecisions:    s.decisions.length,
    reviewedDecisions: s.decisions.filter((d) => d.reviewed).length,
    unreviewedCount:   s.decisions.filter((d) => !d.reviewed).length,
    contradictions:    s.contradictions,
    contextTokens:     estimateTokens(s.currentContext),
    sessionAgeMinutes: Math.round(ageMinutes),
    debtScore,
    collapseRisk:      getCollapseRisk(debtScore),
    recommendation:    buildRecommendation(debtScore, s.contradictions.length, ageMinutes),
    createdAt:         s.createdAt,
    updatedAt:         s.updatedAt,
  };
}

export function listSessions(): SessionSummary[] {
  return Array.from(_sessions.entries()).map(([sessionId, s]) => {
    const score = computeDebtScore(sessionId);
    return {
      sessionId,
      agentRole:    s.agentRole,
      debtScore:    score,
      collapseRisk: getCollapseRisk(score),
      decisions:    s.decisions.length,
      updatedAt:    s.updatedAt,
    };
  });
}

export function clearSession(sessionId: string): boolean {
  return _sessions.delete(sessionId);
}

export function getSessionDecisions(sessionId: string): AgentDecision[] {
  return _sessions.get(sessionId)?.decisions ?? [];
}

export function getSessionContradictions(sessionId: string): ContradictionRecord[] {
  return _sessions.get(sessionId)?.contradictions ?? [];
}
