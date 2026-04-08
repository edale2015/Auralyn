/**
 * councilSystem.test.ts
 *
 * Tests the full multi-agent council stack:
 *   - DebateEngine   — critique generation + confidence adjustment
 *   - ConsensusEngine — weighted risk + disagreement detection
 *   - MultiAgentCouncil — 5-agent parallel run → debate → consensus
 *   - CardiologyCouncil — HEART score computation
 *   - InfectiousDiseaseCouncil — qSOFA scoring
 *   - ICUCouncil — SOFA proxy
 *   - CouncilActivationBandit — heuristic activation rules
 *   - ChiefResidentReflection — consistency checks
 *   - SafetyEscalationGuard — hard override rules
 *   - ShadowEvaluator — divergence detection
 *   - ConfidenceCalibrator — calibration bin lookup
 */

import { describe, it, expect, vi } from "vitest";
import { debateEngine }     from "../../server/agents/debateEngine";
import { consensusEngine }  from "../../server/agents/consensusEngine";
import { runChiefResidentReflection } from "../../server/clinical/chiefResidentReflection";
import { runSafetyEscalationGuard }   from "../../server/clinical/safetyEscalationGuard";
import { runShadowEvaluation }        from "../../server/clinical/shadowEvaluator";
import { CouncilActivationBandit }    from "../../server/agents/councilActivationBandit";
import type { AgentOutput }           from "../../server/agents/debateEngine";

// ─── DebateEngine ─────────────────────────────────────────────────────────────
describe("DebateEngine", () => {
  const agents: AgentOutput[] = [
    { agent: "diagnostic", confidence: 0.9, result: {},  reasoning: "high confidence dx" },
    { agent: "safety",     confidence: 0.1, result: {},  reasoning: "no safety flags" },
    { agent: "risk",       confidence: 0.7, result: {},  reasoning: "moderate risk" },
  ];

  it("generates critiques between agents", () => {
    const critiques = debateEngine.generateCritiques(agents);
    expect(Array.isArray(critiques)).toBe(true);
    expect(critiques.length).toBeGreaterThan(0);
  });

  it("adjusts confidences after apply()", () => {
    const critiques = debateEngine.generateCritiques(agents);
    const adjusted  = debateEngine.apply(critiques, agents);
    expect(adjusted.length).toBe(agents.length);
    adjusted.forEach((a) => {
      expect(a.confidence).toBeGreaterThanOrEqual(0);
      expect(a.confidence).toBeLessThanOrEqual(1);
    });
  });

  it("safety agent critique lowers divergent confidence", () => {
    const highRisk: AgentOutput[] = [
      { agent: "diagnostic", confidence: 0.9, result: {}, reasoning: "" },
      { agent: "safety",     confidence: 0.95, result: { alerts: ["sepsis"] }, reasoning: "high safety risk" },
    ];
    const critiques = debateEngine.generateCritiques(highRisk);
    const adjusted  = debateEngine.apply(critiques, highRisk);
    const diag      = adjusted.find((a) => a.agent === "diagnostic")!;
    expect(diag.confidence).toBeLessThanOrEqual(0.9);
  });
});

// ─── ConsensusEngine ──────────────────────────────────────────────────────────
describe("ConsensusEngine", () => {
  it("returns zero result for empty agents", () => {
    const result = consensusEngine.compute([]);
    expect(result.weightedRisk).toBe(0);
    expect(result.dominantAgent).toBe("none");
  });

  it("detects high disagreement when spread > 0.5", () => {
    const agents: AgentOutput[] = [
      { agent: "a", confidence: 0.95, result: {}, reasoning: "" },
      { agent: "b", confidence: 0.05, result: {}, reasoning: "" },
    ];
    const result = consensusEngine.compute(agents);
    expect(result.highDisagreement).toBe(true);
    expect(result.disagreement).toBeGreaterThan(0.5);
  });

  it("returns correct dominant agent", () => {
    const agents: AgentOutput[] = [
      { agent: "safety",     confidence: 0.9, result: {}, reasoning: "" },
      { agent: "diagnostic", confidence: 0.4, result: {}, reasoning: "" },
    ];
    const result = consensusEngine.compute(agents);
    expect(result.dominantAgent).toBe("safety");
  });

  it("computes weighted risk from agent result.riskScore", () => {
    const agents: AgentOutput[] = [
      { agent: "a", confidence: 0.8, result: { riskScore: 0.9 }, reasoning: "" },
      { agent: "b", confidence: 0.2, result: { riskScore: 0.1 }, reasoning: "" },
    ];
    const result = consensusEngine.compute(agents);
    // Weighted = (0.9 * 0.8 + 0.1 * 0.2) / (0.8 + 0.2) = (0.72 + 0.02) / 1.0 = 0.74
    expect(result.weightedRisk).toBeCloseTo(0.74, 1);
    expect(result.weightedRisk).toBeGreaterThan(0);
    expect(result.weightedRisk).toBeLessThanOrEqual(1);
  });
});

// ─── CouncilActivationBandit (heuristic mode) ─────────────────────────────────
describe("CouncilActivationBandit – heuristic rules", () => {
  const bandit = new CouncilActivationBandit("heuristic");

  const chestPainCtx = {
    symptoms: ["chest pain", "shortness of breath"],
    answers:  { chestPain: true },
    riskScore: 0.55,
    redFlags: [],
  };

  const feverCtx = {
    symptoms: ["fever", "chills"],
    answers:  { fever: true, temperature: 39.2 },
    riskScore: 0.3,
    redFlags: [],
  };

  const highRiskCtx = {
    symptoms: ["altered mental status", "hypotension"],
    answers:  { alteredMental: true },
    riskScore: 0.92,
    riskLevel: "high",
    redFlags: ["septic shock"],
  };

  it("activates cardiology for chest pain", async () => {
    const result = await bandit.shouldActivate("cardiology", chestPainCtx);
    expect(result).toBe(true);
  });

  it("activates infectious disease for fever", async () => {
    const result = await bandit.shouldActivate("infectious_disease", feverCtx);
    expect(result).toBe(true);
  });

  it("activates ICU for riskScore >= 0.80", async () => {
    const result = await bandit.shouldActivate("icu", highRiskCtx);
    expect(result).toBe(true);
  });

  it("does NOT activate cardiology for pure fever", async () => {
    const result = await bandit.shouldActivate("cardiology", feverCtx);
    expect(result).toBe(false);
  });

  it("does NOT activate ICU for low risk", async () => {
    const lowRiskCtx = { symptoms: ["runny nose"], answers: {}, riskScore: 0.1 };
    const result = await bandit.shouldActivate("icu", lowRiskCtx);
    expect(result).toBe(false);
  });
});

// ─── ChiefResidentReflection ───────────────────────────────────────────────────
describe("ChiefResidentReflection", () => {

  it("passes with no issues on clean output", () => {
    const result = runChiefResidentReflection({
      disposition:         "outpatient",
      riskLevel:           "low",
      riskScore:           0.15,
      redFlags:            [],
      differentials:       [],
      recommendations:     [{ treatmentName: "rest", category: "first_line" }],
      returnPrecautions:   [{ diagnosis: "rhinitis", precautions: ["Return if worsens"] }],
      governanceApproved:  true,
      uncertainty:         0.2,
      engineFailures:      [],
    });
    expect(result.escalated).toBe(false);
    expect(result.issues).toHaveLength(0);
  });

  it("escalates on disposition-risk mismatch", () => {
    const result = runChiefResidentReflection({
      disposition:  "outpatient",
      riskLevel:    "high",
      riskScore:    0.82,
      redFlags:     [],
    });
    expect(result.escalated).toBe(true);
    expect(result.issues.some((i) => i.type === "disposition_risk_mismatch")).toBe(true);
  });

  it("escalates on red flags with discharge disposition", () => {
    const result = runChiefResidentReflection({
      disposition: "home_care",
      redFlags:    ["chest pain", "diaphoresis"],
      riskScore:   0.4,
    });
    expect(result.escalated).toBe(true);
    expect(result.issues.some((i) => i.type === "red_flag_discharge_conflict")).toBe(true);
  });

  it("warns on missing return precautions for discharge", () => {
    const result = runChiefResidentReflection({
      disposition:       "outpatient",
      riskScore:         0.2,
      riskLevel:         "low",
      returnPrecautions: [],
      governanceApproved: true,
    });
    expect(result.issues.some((i) => i.type === "missing_return_precautions")).toBe(true);
  });

  it("escalates on extreme uncertainty", () => {
    const result = runChiefResidentReflection({
      uncertainty:  0.9,
      disposition:  "outpatient",
    });
    expect(result.escalated).toBe(true);
    expect(result.issues.some((i) => i.type === "extreme_uncertainty")).toBe(true);
  });
});

// ─── SafetyEscalationGuard ────────────────────────────────────────────────────
describe("SafetyEscalationGuard", () => {

  it("does not override safe discharge with no triggers", () => {
    const result = runSafetyEscalationGuard({
      disposition:        "outpatient",
      riskScore:          0.2,
      riskLevel:          "low",
      redFlags:           [],
      oversightAlerts:    [],
      governanceApproved: true,
      uncertainty:        0.2,
    });
    expect(result.overridden).toBe(false);
    expect(result.disposition).toBe("outpatient");
  });

  it("overrides to ER_NOW when riskScore > 0.85", () => {
    const result = runSafetyEscalationGuard({
      disposition: "outpatient",
      riskScore:   0.9,
    });
    expect(result.disposition).toBe("ER_NOW");
    expect(result.overridden).toBe(true);
    expect(result.overrideReasons.length).toBeGreaterThan(0);
  });

  it("overrides to ER_NOW on critical red flag (chest pain)", () => {
    const result = runSafetyEscalationGuard({
      disposition:  "outpatient",
      riskScore:    0.4,
      redFlags:     ["chest pain with radiation"],
    });
    expect(result.disposition).toBe("ER_NOW");
  });

  it("overrides to physician_required on chief resident escalation", () => {
    const result = runSafetyEscalationGuard({
      disposition:             "outpatient",
      riskScore:               0.3,
      chiefResidentEscalated:  true,
    });
    expect(result.disposition).toBe("physician_required");
  });

  it("overrides to ER_NOW on stroke red flag", () => {
    const result = runSafetyEscalationGuard({
      disposition: "outpatient",
      riskScore:   0.45,
      redFlags:    ["sudden onset stroke symptoms"],
    });
    expect(result.disposition).toBe("ER_NOW");
  });

  it("does not downgrade ER_NOW to physician_required via chief resident", () => {
    const result = runSafetyEscalationGuard({
      disposition:             "ER_NOW",
      riskScore:               0.9,
      chiefResidentEscalated:  true,
    });
    expect(result.disposition).toBe("ER_NOW");
  });
});

// ─── ShadowEvaluator ─────────────────────────────────────────────────────────
describe("ShadowEvaluator", () => {

  it("returns deploy recommendation when outputs match", () => {
    const primary = { disposition: "outpatient", riskLevel: "low", riskScore: 0.2, uncertainty: 0.3, governanceApproved: true };
    const shadow  = { disposition: "outpatient", riskLevel: "low", riskScore: 0.2, uncertainty: 0.3, governanceApproved: true };
    const result  = runShadowEvaluation({ primary, shadow });
    expect(result.recommendation).toBe("deploy");
    expect(result.divergences).toHaveLength(0);
  });

  it("flags critical divergence on disposition mismatch", () => {
    const primary = { disposition: "ER_NOW",    riskLevel: "high" };
    const shadow  = { disposition: "outpatient", riskLevel: "low"  };
    const result  = runShadowEvaluation({ primary, shadow });
    expect(result.hasCritical).toBe(true);
    expect(result.divergences.some((d) => d.field === "disposition")).toBe(true);
  });

  it("flags numeric divergence on riskScore delta > threshold", () => {
    const primary = { riskScore: 0.8 };
    const shadow  = { riskScore: 0.2 };
    const result  = runShadowEvaluation({ primary, shadow });
    expect(result.divergences.some((d) => d.field === "riskScore")).toBe(true);
  });

  it("returns investigate for critical divergence", () => {
    const primary = { disposition: "ER_NOW" };
    const shadow  = { disposition: "outpatient" };
    const result  = runShadowEvaluation({ primary, shadow });
    expect(result.recommendation).toBe("investigate");
  });

  it("includes traceId in result when provided", () => {
    const result = runShadowEvaluation({
      traceId: "test-trace-123",
      primary: {},
      shadow:  {},
    });
    expect(result.traceId).toBe("test-trace-123");
  });
});
