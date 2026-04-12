/**
 * Goal-Backward Clinical Verifier (GSD debugger concept)
 * "What must be TRUE for this patient to be safely discharged?"
 *
 * Instead of asking "did we run these tasks?" (task-focused),
 * we ask "are these observable safety conditions satisfied?" (goal-focused).
 *
 * This catches clinical errors that task-completion checking misses:
 *   - Task ran but produced wrong output (scoring engine returned 0 on error)
 *   - Task ran but result was overridden by a later step incorrectly
 *   - All tasks completed but final disposition contradicts the evidence
 *
 * Verification is structured as a set of named invariants, each returning
 * pass/fail with a clinical reason. ALL invariants must pass for the
 * pipeline to be considered safe.
 */

export type VerifierStatus = "PASS" | "FAIL" | "WARN";

export interface Invariant {
  name:     string;
  category: "safety" | "scoring" | "disposition" | "completeness" | "consistency";
  check:    (context: VerifierContext) => VerifierResult;
}

export interface VerifierContext {
  patient:     any;
  scores:      Record<string, number>;
  sepsisRisk?: { highRisk?: boolean; probability?: number };
  icuProb?:    number;
  disposition: string;
  gatesPassed: boolean;
  trace?:      any;
}

export interface VerifierResult {
  status:  VerifierStatus;
  finding: string;        // plain-English explanation
  data?:   any;
}

export interface VerificationReport {
  safe:          boolean;      // all safety invariants passed
  allPassed:     boolean;      // every invariant (including WARNs treated as pass) passed
  failCount:     number;
  warnCount:     number;
  invariants:    (Invariant & { result: VerifierResult })[];
  recommendation: string;
  checkedAt:     string;
}

// ── Built-in clinical invariants ──────────────────────────────────────────────

const INVARIANTS: Invariant[] = [
  {
    name:     "scores_present",
    category: "completeness",
    check:    (ctx) => {
      const hasAny = Object.keys(ctx.scores ?? {}).length > 0;
      return hasAny
        ? { status: "PASS", finding: "Clinical scoring is present" }
        : { status: "FAIL", finding: "No scoring found — cannot verify safety without validated scores" };
    },
  },
  {
    name:     "news2_disposition_consistency",
    category: "consistency",
    check:    (ctx) => {
      const news2 = ctx.scores?.NEWS2 ?? 0;
      const disp  = ctx.disposition?.toUpperCase() ?? "";
      if (news2 >= 7 && !["ICU", "ICU_ADMIT"].includes(disp)) {
        return { status: "FAIL", finding: `NEWS2=${news2} demands ICU but disposition is "${ctx.disposition}"`, data: { news2, disposition: ctx.disposition } };
      }
      if (news2 >= 5 && ["HOME", "DISCHARGE"].includes(disp)) {
        return { status: "FAIL", finding: `NEWS2=${news2} is high-risk — HOME disposition is contradicted`, data: { news2 } };
      }
      return { status: "PASS", finding: `NEWS2=${news2} is consistent with "${ctx.disposition}"` };
    },
  },
  {
    name:     "sepsis_escalation",
    category: "safety",
    check:    (ctx) => {
      const highRisk  = ctx.sepsisRisk?.highRisk === true;
      const prob      = ctx.sepsisRisk?.probability ?? 0;
      const safeDisp  = ["ED", "ER", "ICU", "ICU_ADMIT", "URGENT_CARE"];
      const disp      = ctx.disposition?.toUpperCase() ?? "";
      if ((highRisk || prob > 0.60) && !safeDisp.some((d) => disp.includes(d))) {
        return {
          status:  "FAIL",
          finding: `Sepsis risk ${(prob * 100).toFixed(0)}% requires escalated care — "${ctx.disposition}" is unsafe`,
          data:    { prob, highRisk },
        };
      }
      return { status: "PASS", finding: "Sepsis disposition is appropriate" };
    },
  },
  {
    name:     "icu_probability_check",
    category: "safety",
    check:    (ctx) => {
      const prob = ctx.icuProb ?? 0;
      const disp = ctx.disposition?.toUpperCase() ?? "";
      if (prob > 0.80 && !["ICU", "ICU_ADMIT"].includes(disp)) {
        return { status: "FAIL", finding: `ICU probability ${(prob * 100).toFixed(0)}% — must admit to ICU`, data: { icuProb: prob } };
      }
      if (prob > 0.60 && ["HOME", "DISCHARGE"].includes(disp)) {
        return { status: "WARN", finding: `ICU probability ${(prob * 100).toFixed(0)}% — home discharge warrants physician review`, data: { icuProb: prob } };
      }
      return { status: "PASS", finding: "ICU probability is consistent with disposition" };
    },
  },
  {
    name:     "safety_gates_passed",
    category: "safety",
    check:    (ctx) => {
      return ctx.gatesPassed
        ? { status: "PASS",  finding: "All clinical safety gates passed" }
        : { status: "FAIL",  finding: "Clinical safety gates did not pass — output blocked" };
    },
  },
  {
    name:     "disposition_is_defined",
    category: "completeness",
    check:    (ctx) => {
      const valid = ["HOME", "URGENT_CARE", "ED", "ER", "ICU", "ICU_ADMIT", "DISCHARGE", "UNCERTAIN"];
      const disp  = ctx.disposition?.toUpperCase() ?? "";
      const known = valid.some((v) => disp.includes(v));
      return known
        ? { status: "PASS", finding: `Disposition "${ctx.disposition}" is a recognised level` }
        : { status: "WARN", finding: `Disposition "${ctx.disposition}" is not a standard level — verify manually` };
    },
  },
  {
    name:     "qsofa_score_alignment",
    category: "consistency",
    check:    (ctx) => {
      const qsofa = ctx.scores?.qSOFA ?? 0;
      const disp  = ctx.disposition?.toUpperCase() ?? "";
      if (qsofa >= 2 && ["HOME", "DISCHARGE"].includes(disp)) {
        return {
          status:  "WARN",
          finding: `qSOFA=${qsofa} (≥2 is high risk for sepsis) — home discharge requires explicit documentation`,
          data:    { qsofa },
        };
      }
      return { status: "PASS", finding: `qSOFA=${qsofa} is consistent with disposition` };
    },
  },
];

export function verifyGoals(ctx: VerifierContext): VerificationReport {
  const checked = INVARIANTS.map((inv) => ({
    ...inv,
    result: inv.check(ctx),
  }));

  const failures = checked.filter((c) => c.result.status === "FAIL");
  const warnings = checked.filter((c) => c.result.status === "WARN");
  const safetyFailures = failures.filter((c) => c.category === "safety");

  let recommendation: string;
  if (failures.length > 0) {
    recommendation = `UNSAFE: ${failures.length} invariant(s) failed — do NOT discharge. Review: ${failures.map((f) => f.name).join(", ")}`;
  } else if (warnings.length > 0) {
    recommendation = `CAUTION: ${warnings.length} warning(s) — physician review required before discharge`;
  } else {
    recommendation = "SAFE: All invariants satisfied — disposition is clinically consistent";
  }

  return {
    safe:           safetyFailures.length === 0,
    allPassed:      failures.length === 0,
    failCount:      failures.length,
    warnCount:      warnings.length,
    invariants:     checked,
    recommendation,
    checkedAt:      new Date().toISOString(),
  };
}

/** Add a custom invariant for domain-specific rules */
export function addInvariant(inv: Invariant): void {
  INVARIANTS.push(inv);
}
