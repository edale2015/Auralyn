import { describe, it, expect } from "vitest";

// ─── 1. Clinical Query Router ─────────────────────────────────────────────────
import { routeQuery } from "../../server/rag/clinicalQueryRouter";

describe("Batch44c — clinicalQueryRouter", () => {
  it("chest pain → ACUTE_HIGH_RISK", () => {
    const r = routeQuery("patient presenting with chest pain and diaphoresis");
    expect(r.route).toBe("ACUTE_HIGH_RISK");
    expect(r.confidence).toBeGreaterThan(0.70);
  });

  it("sepsis → ACUTE_HIGH_RISK", () => {
    const r = routeQuery("suspected sepsis with hypotension");
    expect(r.route).toBe("ACUTE_HIGH_RISK");
  });

  it("stroke → ACUTE_HIGH_RISK", () => {
    const r = routeQuery("patient with sudden stroke symptoms facial droop");
    expect(r.route).toBe("ACUTE_HIGH_RISK");
  });

  it("antibiotic dosing → GENERAL_MEDICAL", () => {
    const r = routeQuery("what is the correct antibiotic dose for pneumonia");
    expect(r.route).toBe("GENERAL_MEDICAL");
  });

  it("ventilator settings → DEVICE_QUERY", () => {
    const r = routeQuery("how do I adjust ventilator settings for ARDS");
    expect(r.route).toBe("DEVICE_QUERY");
  });

  it("recipe query → OUT_OF_SCOPE", () => {
    const r = routeQuery("what is a good recipe for pasta");
    expect(r.route).toBe("OUT_OF_SCOPE");
  });

  it("ACUTE_HIGH_RISK wins over other categories", () => {
    // Even if general terms present, acute wins
    const r = routeQuery("treatment for sepsis and chest pain");
    expect(r.route).toBe("ACUTE_HIGH_RISK");
  });

  it("returns required fields", () => {
    const r = routeQuery("some medical query");
    expect(typeof r.route).toBe("string");
    expect(typeof r.confidence).toBe("number");
    expect(Array.isArray(r.matchedTerms)).toBe(true);
    expect(typeof r.reasoning).toBe("string");
  });
});

// ─── 2. Safety Gate ───────────────────────────────────────────────────────────
import { runSafetyGate } from "../../server/rag/safetyGate";

describe("Batch44c — safetyGate", () => {
  it("cardiac arrest → ESCALATE_EMERGENCY", () => {
    const r = runSafetyGate("patient in cardiac arrest");
    expect(r.decision).toBe("ESCALATE_EMERGENCY");
    expect(r.escalated).toBe(true);
  });

  it("not breathing → ESCALATE_EMERGENCY", () => {
    const r = runSafetyGate("patient is not breathing no pulse");
    expect(r.decision).toBe("ESCALATE_EMERGENCY");
    expect(r.escalated).toBe(true);
  });

  it("chest pain + diaphoresis + syncope → ESCALATE (CRITICAL co-occurrence)", () => {
    const r = runSafetyGate("chest pain with diaphoresis and syncope");
    expect(r.escalated).toBe(true);
  });

  it("routine query → PASS", () => {
    const r = runSafetyGate("what is the dose of ibuprofen for mild headache");
    expect(r.decision).toBe("PASS");
    expect(r.escalated).toBe(false);
  });

  it("ESCALATE_EMERGENCY includes immediateActions", () => {
    const r = runSafetyGate("cardiac arrest");
    expect(r.immediateActions.length).toBeGreaterThan(0);
  });

  it("PASS result has empty immediateActions", () => {
    const r = runSafetyGate("what is the normal range for blood glucose");
    expect(r.immediateActions).toHaveLength(0);
  });
});

// ─── 3. Relevance Scorer ─────────────────────────────────────────────────────
import { scoreChunks, filterContext } from "../../server/rag/relevanceScorer";

const SAMPLE_CHUNKS = [
  { id: "c1", text: "Sepsis bundle: blood cultures, lactate, broad-spectrum antibiotics, IV fluids", source: "symptom_skill" as const, metadata: {} },
  { id: "c2", text: "The weather in New York is partly cloudy", source: "kb_entity" as const, metadata: {} },
  { id: "c3", text: "Fever management: antipyretics, fluids, culture if source unknown", source: "knowledge_graph" as const, metadata: {} },
];

describe("Batch44c — relevanceScorer", () => {
  it("returns scored chunks sorted descending", () => {
    const scored = scoreChunks("patient with fever and sepsis", SAMPLE_CHUNKS);
    expect(scored[0].score).toBeGreaterThanOrEqual(scored[scored.length - 1].score);
  });

  it("symptom_skill source gets boost", () => {
    const scored = scoreChunks("sepsis bundle", SAMPLE_CHUNKS);
    const skillChunk = scored.find((s) => s.source === "symptom_skill");
    expect(skillChunk).toBeDefined();
    expect(skillChunk!.score).toBeGreaterThan(0);
  });

  it("off-topic chunk scores lower than medical chunks", () => {
    const scored = scoreChunks("fever and sepsis treatment", SAMPLE_CHUNKS);
    const weather = scored.find((s) => s.id === "c2");
    const sepsis  = scored.find((s) => s.id === "c1");
    expect(sepsis!.score).toBeGreaterThan(weather!.score);
  });

  it("filterContext returns only passing chunks", () => {
    const scored  = scoreChunks("sepsis lactate fever", SAMPLE_CHUNKS, 0.01);
    const { context, filtered } = filterContext(scored, 0.01);
    expect(context.length + filtered).toBe(scored.length);
  });

  it("each scored chunk has score + matchedTerms + passed", () => {
    const scored = scoreChunks("test", SAMPLE_CHUNKS);
    scored.forEach((s) => {
      expect(typeof s.score).toBe("number");
      expect(Array.isArray(s.matchedTerms)).toBe(true);
      expect(typeof s.passed).toBe("boolean");
    });
  });
});

// ─── 4. Disposition Engine ────────────────────────────────────────────────────
import { computeDisposition }           from "../../server/rag/dispositionEngine";
import type { ClinicalReasoningOutput } from "../../server/rag/clinicalReasoner";
import type { SafetyGateResult }        from "../../server/rag/safetyGate";
import type { RoutingResult }           from "../../server/rag/clinicalQueryRouter";

const EMERGENCY_GATE: SafetyGateResult = {
  decision: "ESCALATE_EMERGENCY", escalated: true,
  immediateActions: ["Call 911"], riskLevel: "CRITICAL", redFlags: ["cardiac arrest"],
  reason: "Emergency", passedAt: new Date().toISOString(),
};
const PASS_GATE: SafetyGateResult = {
  decision: "PASS", escalated: false, immediateActions: [],
  riskLevel: "LOW", redFlags: [], reason: "Pass", passedAt: new Date().toISOString(),
};
const ACUTE_ROUTE: RoutingResult  = { route: "ACUTE_HIGH_RISK",  confidence: 0.9, matchedTerms: ["sepsis"], reasoning: "" };
const GENERAL_ROUTE: RoutingResult= { route: "GENERAL_MEDICAL",  confidence: 0.7, matchedTerms: [],         reasoning: "" };

const IMMEDIATE_REASONING: ClinicalReasoningOutput = {
  differentialDiagnosis: [{ diagnosis: "Sepsis", likelihood: "high", reason: "test" }],
  redFlags: ["Hypotension"], nextSteps: ["Blood cultures"], urgency: "immediate",
  summary: "Septic shock", source: "deterministic",
};
const ROUTINE_REASONING: ClinicalReasoningOutput = {
  differentialDiagnosis: [{ diagnosis: "Common Cold", likelihood: "high", reason: "test" }],
  redFlags: [], nextSteps: ["Rest", "Fluids"], urgency: "routine",
  summary: "Mild URI", source: "deterministic",
};

describe("Batch44c — dispositionEngine", () => {
  it("emergency gate always → ER regardless of reasoning", () => {
    const d = computeDisposition(ROUTINE_REASONING, EMERGENCY_GATE, GENERAL_ROUTE);
    expect(d.disposition).toBe("ER");
    expect(d.overrideApplied).toBe(true);
    expect(d.confidence).toBeGreaterThan(0.95);
  });

  it("ACUTE_HIGH_RISK route + immediate urgency → ER", () => {
    const d = computeDisposition(IMMEDIATE_REASONING, PASS_GATE, ACUTE_ROUTE);
    expect(["ER", "ICU"]).toContain(d.disposition);
  });

  it("routine reasoning + pass gate → HOME or URGENT_CARE", () => {
    const d = computeDisposition(ROUTINE_REASONING, PASS_GATE, GENERAL_ROUTE);
    expect(["HOME", "URGENT_CARE"]).toContain(d.disposition);
  });

  it("instructions array is non-empty", () => {
    const d = computeDisposition(ROUTINE_REASONING, PASS_GATE, GENERAL_ROUTE);
    expect(d.instructions.length).toBeGreaterThan(0);
  });

  it("followUp is a string", () => {
    const d = computeDisposition(ROUTINE_REASONING, PASS_GATE, GENERAL_ROUTE);
    expect(typeof d.followUp).toBe("string");
  });

  it("confidence between 0 and 1", () => {
    const d = computeDisposition(IMMEDIATE_REASONING, PASS_GATE, ACUTE_ROUTE);
    expect(d.confidence).toBeGreaterThan(0);
    expect(d.confidence).toBeLessThanOrEqual(1);
  });
});

// ─── 5. Full CDE Pipeline ─────────────────────────────────────────────────────
import { runClinicalDecisionEngine } from "../../server/rag/clinicalDecisionEngine";

describe("Batch44c — clinicalDecisionEngine", () => {
  it("cardiac arrest query → ESCALATE_EMERGENCY gate + ER disposition", async () => {
    const r = await runClinicalDecisionEngine("patient has cardiac arrest");
    expect(r.gate.escalated).toBe(true);
    expect(r.disposition.disposition).toBe("ER");
    expect(r.disposition.overrideApplied).toBe(true);
  });

  it("chest pain query → ACUTE_HIGH_RISK route + ER disposition", async () => {
    const r = await runClinicalDecisionEngine("patient with severe chest pain");
    expect(r.route.route).toBe("ACUTE_HIGH_RISK");
    expect(["ER", "ICU"]).toContain(r.disposition.disposition);
  });

  it("returns all 6 layers", async () => {
    const r = await runClinicalDecisionEngine("antibiotic dose for pneumonia");
    expect(r.gate).toBeDefined();
    expect(r.route).toBeDefined();
    expect(r.retrieval).toBeDefined();
    expect(r.reasoning).toBeDefined();
    expect(r.disposition).toBeDefined();
    expect(r.trace.length).toBeGreaterThanOrEqual(6);
  });

  it("trace has all 6 layer names", async () => {
    const r      = await runClinicalDecisionEngine("fever treatment");
    const layers = r.trace.map((t) => t.layer);
    expect(layers).toContain("safety_gate");
    expect(layers).toContain("query_router");
    expect(layers).toContain("retrieval");
    expect(layers).toContain("relevance_scoring");
    expect(layers).toContain("clinical_reasoning");
    expect(layers).toContain("disposition");
  });

  it("durationMs is non-negative", async () => {
    const r = await runClinicalDecisionEngine("test query");
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("ventilator query → DEVICE_QUERY route", async () => {
    const r = await runClinicalDecisionEngine("how do I set ventilator parameters");
    expect(r.route.route).toBe("DEVICE_QUERY");
  });
});
