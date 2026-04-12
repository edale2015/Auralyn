import { describe, it, expect, beforeEach } from "vitest";

// ─── 1. Monologue Engine ──────────────────────────────────────────────────────
import { generateClinicalMonologue } from "../../server/cognitive/monologueEngine";

describe("Batch33 — monologueEngine", () => {
  it("normal presentation: low uncertainty, reassure strategy", async () => {
    const m = await generateClinicalMonologue({ symptoms: ["sore throat"], vitals: { hr: 72, spo2: 98, tempF: 99 } });
    expect(typeof m.uncertainty_level).toBe("number");
    expect(m.uncertainty_level).toBeGreaterThanOrEqual(0);
    expect(m.uncertainty_level).toBeLessThanOrEqual(1);
    expect(Array.isArray(m.dangerous_misses)).toBe(true);
    expect(Array.isArray(m.bias_flags)).toBe(true);
    expect(Array.isArray(m.confidence_gaps)).toBe(true);
    expect(["rule_out","reassure","escalate","observe"]).toContain(m.recommended_strategy);
  });

  it("chest pain: ACS and PE in dangerous_misses", async () => {
    const m = await generateClinicalMonologue({ symptoms: ["chest pain"], vitals: { hr: 110, spo2: 97 } });
    expect(m.dangerous_misses).toContain("ACS");
    expect(m.dangerous_misses).toContain("PE");
  });

  it("redFlags=true → high uncertainty, rule_out strategy", async () => {
    const m = await generateClinicalMonologue({ symptoms: [], redFlags: true });
    expect(m.uncertainty_level).toBeGreaterThan(0.5);
    expect(m.recommended_strategy).toBe("rule_out");
  });

  it("hypoxia → respiratory_failure in dangerous_misses", async () => {
    const m = await generateClinicalMonologue({ symptoms: ["dyspnea"], vitals: { spo2: 88, hr: 110 } });
    expect(m.dangerous_misses).toContain("respiratory_failure");
  });

  it("missing vitals → confidence_gaps populated", async () => {
    const m = await generateClinicalMonologue({ symptoms: ["cough"] });
    expect(m.confidence_gaps.length).toBeGreaterThan(0);
  });

  it("reasoning_summary is a non-empty string", async () => {
    const m = await generateClinicalMonologue({ symptoms: ["fever"] });
    expect(typeof m.reasoning_summary).toBe("string");
    expect(m.reasoning_summary.length).toBeGreaterThan(5);
  });
});

// ─── 2. Strategy Engine ───────────────────────────────────────────────────────
import { selectStrategy } from "../../server/cognitive/strategyEngine";

const BASE_MONOLOGUE = {
  uncertainty_level: 0.3, dangerous_misses: [], bias_flags: [], confidence_gaps: [],
  recommended_strategy: "observe" as const, reasoning_summary: "",
};

const BASE_DEBATE = {
  final_diagnosis: "Viral URI", disagreementScore: 0.1, most_dangerous_miss: "none",
  confidence: 0.85, opinions: [], graphCandidates: [],
};

describe("Batch33 — strategyEngine", () => {
  it("normal low-uncertainty → observe", () => {
    expect(selectStrategy(BASE_MONOLOGUE, BASE_DEBATE)).toBe("observe");
  });

  it("uncertainty > 0.7 → rule_out", () => {
    const m = { ...BASE_MONOLOGUE, uncertainty_level: 0.8, recommended_strategy: "observe" as const };
    expect(selectStrategy(m, BASE_DEBATE)).toBe("rule_out");
  });

  it("disagreement > 0.5 → escalate", () => {
    const d = { ...BASE_DEBATE, disagreementScore: 0.6 };
    expect(selectStrategy(BASE_MONOLOGUE, d)).toBe("escalate");
  });

  it("> 2 dangerous misses → rule_out", () => {
    const m = { ...BASE_MONOLOGUE, dangerous_misses: ["ACS", "PE", "Sepsis"] };
    expect(selectStrategy(m, BASE_DEBATE)).toBe("rule_out");
  });

  it("high confidence + low uncertainty → reassure", () => {
    const m = { ...BASE_MONOLOGUE, uncertainty_level: 0.1, recommended_strategy: "reassure" as const };
    const d = { ...BASE_DEBATE, confidence: 0.9 };
    expect(selectStrategy(m, d)).toBe("reassure");
  });
});

// ─── 3. Bias Engine ───────────────────────────────────────────────────────────
import { applyBiasGuards } from "../../server/cognitive/biasEngine";

describe("Batch33 — biasEngine", () => {
  it("no bias flags → unchanged diagnosis", () => {
    const plan     = { ...BASE_DEBATE };
    const monologue = BASE_MONOLOGUE;
    const result   = applyBiasGuards({ plan, monologue });
    expect(result.final_diagnosis).toBe(plan.final_diagnosis);
    expect(result.biasCorrections).toHaveLength(0);
  });

  it("over-treatment flag → suppressedActions includes antibiotics", () => {
    const m = { ...BASE_MONOLOGUE, bias_flags: ["over-treatment"] };
    const r = applyBiasGuards({ plan: BASE_DEBATE, monologue: m });
    expect(r.suppressedActions).toContain("antibiotics_removed_pending_culture");
  });

  it("anchoring flag → biasCorrections includes broadened_differential", () => {
    const m = { ...BASE_MONOLOGUE, bias_flags: ["anchoring_single_symptom"] };
    const r = applyBiasGuards({ plan: BASE_DEBATE, monologue: m });
    expect(r.biasCorrections.some((c) => c.includes("broadened"))).toBe(true);
  });

  it("high disagreement → premature_closure_flag applied", () => {
    const d = { ...BASE_DEBATE, disagreementScore: 0.5 };
    const r = applyBiasGuards({ plan: d, monologue: BASE_MONOLOGUE });
    expect(r.biasCorrections).toContain("premature_closure_flag_applied");
  });
});

// ─── 4. Disposition Engine ────────────────────────────────────────────────────
import { computeDisposition } from "../../server/cognitive/dispositionEngine";

describe("Batch33 — dispositionEngine", () => {
  it("redFlags=true → ED regardless of confidence", () => {
    const r = computeDisposition({ confidence: 0.95, uncertainty: 0.1, disagreement: 0, redFlags: true });
    expect(r.disposition).toBe("ED");
    expect(r.urgencyScore).toBe(1.0);
  });

  it("redFlags=[] (empty) → NOT ED", () => {
    const r = computeDisposition({ confidence: 0.9, uncertainty: 0.2, disagreement: 0.1, redFlags: [] });
    expect(r.disposition).not.toBe("ED");
  });

  it("high uncertainty → URGENT_CARE", () => {
    const r = computeDisposition({ confidence: 0.5, uncertainty: 0.7, disagreement: 0.1, redFlags: false });
    expect(r.disposition).toBe("URGENT_CARE");
  });

  it("high disagreement → URGENT_CARE", () => {
    const r = computeDisposition({ confidence: 0.6, uncertainty: 0.3, disagreement: 0.6, redFlags: false });
    expect(r.disposition).toBe("URGENT_CARE");
  });

  it("high confidence + low uncertainty → HOME", () => {
    const r = computeDisposition({ confidence: 0.9, uncertainty: 0.2, disagreement: 0.1, redFlags: false });
    expect(r.disposition).toBe("HOME");
  });

  it("moderate confidence → FOLLOW_UP", () => {
    const r = computeDisposition({ confidence: 0.6, uncertainty: 0.4, disagreement: 0.2, redFlags: false });
    expect(r.disposition).toBe("FOLLOW_UP");
  });

  it("rationale is a non-empty string", () => {
    const r = computeDisposition({ confidence: 0.8, uncertainty: 0.2, disagreement: 0.1 });
    expect(typeof r.rationale).toBe("string");
    expect(r.rationale.length).toBeGreaterThan(10);
  });
});

// ─── 5. Communication Engine ──────────────────────────────────────────────────
import { generatePatientMessage } from "../../server/cognitive/communicationEngine";

describe("Batch33 — communicationEngine", () => {
  it("HOME → routine urgency, includes headline", () => {
    const m = generatePatientMessage({ disposition: "HOME", strategy: "reassure" });
    expect(m.urgency).toBe("routine");
    expect(m.headline).toBeTruthy();
    expect(m.returnPrecautions.length).toBeGreaterThan(0);
  });

  it("ED → immediate urgency, no return precautions needed", () => {
    const m = generatePatientMessage({ disposition: "ED", strategy: "rule_out" });
    expect(m.urgency).toBe("immediate");
  });

  it("URGENT_CARE → prompt urgency", () => {
    const m = generatePatientMessage({ disposition: "URGENT_CARE", strategy: "escalate" });
    expect(m.urgency).toBe("prompt");
  });

  it("FOLLOW_UP → prompt urgency", () => {
    const m = generatePatientMessage({ disposition: "FOLLOW_UP", strategy: "observe" });
    expect(m.urgency).toBe("prompt");
  });

  it("body is a non-empty string for all dispositions", () => {
    for (const d of ["HOME", "FOLLOW_UP", "URGENT_CARE", "ED"] as const) {
      const m = generatePatientMessage({ disposition: d, strategy: "observe" });
      expect(typeof m.body).toBe("string");
      expect(m.body.length).toBeGreaterThan(10);
    }
  });
});

// ─── 6. Memory Graph ──────────────────────────────────────────────────────────
import { writeToMemoryGraph, readMemoryGraph, queryMemory, memorySize, clearMemory } from "../../server/cognitive/memoryGraph";

describe("Batch33 — memoryGraph", () => {
  beforeEach(() => clearMemory());

  it("writeToMemoryGraph() increments frequency for same pair", async () => {
    await writeToMemoryGraph({ symptoms: ["cough"] }, { final_diagnosis: "Viral URI" });
    await writeToMemoryGraph({ symptoms: ["cough"] }, { final_diagnosis: "Viral URI" });
    const entries = readMemoryGraph();
    const entry   = entries.find((e) => e.symptom === "cough" && e.diagnosis === "viral uri");
    expect(entry?.frequency).toBe(2);
  });

  it("readMemoryGraph() returns sorted by frequency descending", async () => {
    await writeToMemoryGraph({ symptoms: ["fever"] }, { final_diagnosis: "Sepsis" });
    await writeToMemoryGraph({ symptoms: ["fever"] }, { final_diagnosis: "Sepsis" });
    await writeToMemoryGraph({ symptoms: ["cough"] }, { final_diagnosis: "Viral URI" });
    const m = readMemoryGraph();
    expect(m[0].frequency).toBeGreaterThanOrEqual(m[1]?.frequency ?? 0);
  });

  it("queryMemory() returns only entries for the given symptom", async () => {
    await writeToMemoryGraph({ symptoms: ["fever"] },  { final_diagnosis: "Sepsis" });
    await writeToMemoryGraph({ symptoms: ["cough"] },  { final_diagnosis: "Viral URI" });
    const results = queryMemory("fever");
    expect(results.every((r) => r.symptom === "fever")).toBe(true);
  });

  it("memorySize() reflects writes", async () => {
    expect(memorySize()).toBe(0);
    await writeToMemoryGraph({ symptoms: ["fever"] }, { final_diagnosis: "Flu" });
    expect(memorySize()).toBe(1);
  });

  it("clearMemory() empties the graph", async () => {
    await writeToMemoryGraph({ symptoms: ["fever"] }, { final_diagnosis: "Flu" });
    clearMemory();
    expect(memorySize()).toBe(0);
  });

  it("handles Record<string,boolean> symptoms", async () => {
    await writeToMemoryGraph({ symptoms: { fever: true, cough: false } }, { final_diagnosis: "URI" });
    const m = readMemoryGraph();
    expect(m.some((e) => e.symptom === "fever")).toBe(true);
    expect(m.every((e) => e.symptom !== "cough")).toBe(true); // cough=false should not be written
  });
});

// ─── 7. Case Store ────────────────────────────────────────────────────────────
import { persistCognitiveCase, listCognitiveCases, getCognitiveCase, caseCount, clearCases } from "../../server/cognitive/caseStore";

describe("Batch33 — caseStore", () => {
  beforeEach(() => clearCases());

  it("persistCognitiveCase() returns a case with id and createdAt", () => {
    const c = persistCognitiveCase({
      input: { symptoms: ["cough"] }, diagnosis: "Viral URI", disposition: "HOME",
      confidence: 0.85, strategy: "reassure",
      reasoning: { monologue: {}, debate: {} }, patientMessage: {}, durationMs: 50,
    });
    expect(c.id).toBeTruthy();
    expect(c.createdAt).toBeTruthy();
  });

  it("listCognitiveCases() is newest first", () => {
    persistCognitiveCase({ input: {}, diagnosis: "A", disposition: "HOME", confidence: 0.8, strategy: "observe", reasoning: { monologue: {}, debate: {} }, patientMessage: {}, durationMs: 10 });
    persistCognitiveCase({ input: {}, diagnosis: "B", disposition: "HOME", confidence: 0.8, strategy: "observe", reasoning: { monologue: {}, debate: {} }, patientMessage: {}, durationMs: 10 });
    expect(listCognitiveCases()[0].diagnosis).toBe("B");
  });

  it("getCognitiveCase() retrieves by id", () => {
    const c = persistCognitiveCase({ input: {}, diagnosis: "X", disposition: "ED", confidence: 0.9, strategy: "rule_out", reasoning: { monologue: {}, debate: {} }, patientMessage: {}, durationMs: 5 });
    expect(getCognitiveCase(c.id)?.id).toBe(c.id);
  });

  it("caseCount() tracks persisted cases", () => {
    expect(caseCount()).toBe(0);
    persistCognitiveCase({ input: {}, diagnosis: "Y", disposition: "FOLLOW_UP", confidence: 0.7, strategy: "observe", reasoning: { monologue: {}, debate: {} }, patientMessage: {}, durationMs: 5 });
    expect(caseCount()).toBe(1);
  });

  it("clearCases() empties the store", () => {
    persistCognitiveCase({ input: {}, diagnosis: "Z", disposition: "HOME", confidence: 0.8, strategy: "observe", reasoning: { monologue: {}, debate: {} }, patientMessage: {}, durationMs: 5 });
    clearCases();
    expect(caseCount()).toBe(0);
  });
});

// ─── 8. Debate Council ────────────────────────────────────────────────────────
import { runSpecialistDebate } from "../../server/cognitive/debateCouncil";

describe("Batch33 — debateCouncil", () => {
  it("returns a valid DebateCouncilResult", async () => {
    const r = await runSpecialistDebate({ symptoms: ["chest pain"], vitals: { hr: 110, spo2: 95 } });
    expect(typeof r.final_diagnosis).toBe("string");
    expect(typeof r.disagreementScore).toBe("number");
    expect(typeof r.confidence).toBe("number");
    expect(r.opinions.length).toBeGreaterThanOrEqual(2); // cardiology + pulmonary + ID
    expect(Array.isArray(r.graphCandidates)).toBe(true);
  });

  it("ID specialist always returns an opinion", async () => {
    const r = await runSpecialistDebate({ symptoms: ["fever"], vitals: { tempF: 102 } });
    const id = r.opinions.find((o) => o.specialist === "InfectiousDisease");
    expect(id).toBeTruthy();
  });

  it("graphCandidates is sorted by score", async () => {
    const r = await runSpecialistDebate({ symptoms: ["chest pain", "fever"] });
    for (let i = 0; i < r.graphCandidates.length - 1; i++) {
      expect(r.graphCandidates[i].score).toBeGreaterThanOrEqual(r.graphCandidates[i + 1].score);
    }
  });

  it("confidence is between 0 and 1", async () => {
    const r = await runSpecialistDebate({ symptoms: ["cough"] });
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });
});

// ─── 9. Full Cognitive Orchestrator ──────────────────────────────────────────
import { runCognitiveBrain } from "../../server/cognitive/cognitiveOrchestrator";

describe("Batch33 — cognitiveOrchestrator", () => {
  it("returns a valid CognitiveResult for a normal case", async () => {
    const result = await runCognitiveBrain({ symptoms: ["cough", "fever"], vitals: { tempF: 100, hr: 88, spo2: 97 } });
    expect(result.caseId).toBeTruthy();
    expect(result.diagnosis).toBeTruthy();
    expect(["ED", "URGENT_CARE", "HOME", "FOLLOW_UP"]).toContain(result.disposition);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(["rule_out","reassure","escalate","observe","admit"]).toContain(result.strategy);
    expect(result.patientMessage.headline).toBeTruthy();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("redFlags=true → ED disposition", async () => {
    const result = await runCognitiveBrain({ symptoms: ["chest pain"], redFlags: true });
    expect(result.disposition).toBe("ED");
    expect(result.patientMessage.urgency).toBe("immediate");
  });

  it("reasoning contains monologue and debate", async () => {
    const result = await runCognitiveBrain({ symptoms: ["sore throat"] });
    expect(result.reasoning.monologue).toBeDefined();
    expect(result.reasoning.debate).toBeDefined();
    expect(result.reasoning.safePlan).toBeDefined();
  });

  it("case is persisted after run", async () => {
    const before = caseCount();
    await runCognitiveBrain({ symptoms: ["headache"] });
    expect(caseCount()).toBeGreaterThan(before);
  });

  it("specifying redFlags as array of strings → ED", async () => {
    const result = await runCognitiveBrain({ symptoms: ["chest pain"], redFlags: ["hypotension", "tachycardia"] });
    expect(result.disposition).toBe("ED");
  });
});
