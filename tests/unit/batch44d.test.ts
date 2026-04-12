import { describe, it, expect } from "vitest";

// ─── 1. Context-Isolated Runner ───────────────────────────────────────────────
import { runClinicalWave, extractResults } from "../../server/agents/contextIsolatedRunner";

describe("Batch44d — contextIsolatedRunner", () => {
  it("runs parallel tasks and returns all results", async () => {
    const wave = await runClinicalWave([
      { name: "task_a", execute: async () => ({ value: 42 }) },
      { name: "task_b", execute: async () => "hello" },
    ]);
    expect(wave.tasks.task_a.result).toEqual({ value: 42 });
    expect(wave.tasks.task_b.result).toBe("hello");
    expect(wave.allPassed).toBe(true);
  });

  it("each task gets a unique contextId (zero carryover)", async () => {
    const ids: string[] = [];
    await runClinicalWave([
      { name: "t1", execute: async (ctx) => { ids.push(ctx.contextId); return ctx.contextId; } },
      { name: "t2", execute: async (ctx) => { ids.push(ctx.contextId); return ctx.contextId; } },
    ]);
    expect(ids[0]).not.toBe(ids[1]);
    expect(ids[0]).toMatch(/[0-9a-f-]{36}/);
  });

  it("memory starts empty for every task", async () => {
    const wave = await runClinicalWave([
      { name: "t1", execute: async (ctx) => Object.keys(ctx.memory).length },
    ]);
    expect(wave.tasks.t1.result).toBe(0);
  });

  it("captures errors without crashing the wave", async () => {
    const wave = await runClinicalWave([
      { name: "ok",   execute: async () => "success" },
      { name: "fail", execute: async () => { throw new Error("deliberate"); } },
    ]);
    expect(wave.tasks.ok.status).toBe("success");
    expect(wave.tasks.fail.status).toBe("error");
    expect(wave.tasks.fail.error).toContain("deliberate");
    expect(wave.allPassed).toBe(false);
  });

  it("extractResults returns values for successful tasks", async () => {
    const wave    = await runClinicalWave([{ name: "t1", execute: async () => 99 }]);
    const results = extractResults(wave);
    expect(results.t1).toBe(99);
  });

  it("wave has waveId, startedAt, durationMs", async () => {
    const wave = await runClinicalWave([{ name: "t1", execute: async () => null }]);
    expect(typeof wave.waveId).toBe("string");
    expect(typeof wave.startedAt).toBe("string");
    expect(wave.durationMs).toBeGreaterThanOrEqual(0);
  });
});

// ─── 2. Clinical Gates ────────────────────────────────────────────────────────
import { enforceClinicalGates } from "../../server/safety/clinicalGates";

describe("Batch44d — clinicalGates", () => {
  it("passes when scores present and disposition appropriate", () => {
    const r = enforceClinicalGates({ scores: { NEWS2: 2 }, disposition: "HOME", confidence: 0.80 });
    expect(r.passed).toBe(true);
    expect(r.blocker).toBeUndefined();
  });

  it("blocks when no scoring present", () => {
    const r = enforceClinicalGates({ scores: {}, disposition: "HOME" });
    expect(r.passed).toBe(false);
    expect(r.blocker).toContain("scoring");
  });

  it("blocks when NEWS2 ≥ 5 and disposition is HOME", () => {
    const r = enforceClinicalGates({ scores: { NEWS2: 6 }, disposition: "HOME", confidence: 0.80 });
    expect(r.passed).toBe(false);
    expect(r.blocker).toContain("NEWS2");
  });

  it("passes when NEWS2 ≥ 5 and disposition is ED", () => {
    const r = enforceClinicalGates({ scores: { NEWS2: 6 }, disposition: "ED", confidence: 0.80 });
    // gate 1 (scoring) passes, gate 2 (NEWS2 floor) passes since ED
    const news2Gate = r.gates.find((g) => g.gate === "news2_floor");
    expect(news2Gate?.status).toBe("PASS");
  });

  it("blocks antibiotic stewardship violation", () => {
    const r = enforceClinicalGates({
      scores:      { NEWS2: 1 },
      diagnosis:   { primary: "viral URI" },
      disposition: "HOME with antibiotic",
      confidence:  0.80,
    });
    expect(r.passed).toBe(false);
    expect(r.blocker).toContain("Antibiotic");
  });

  it("blocks ICU floor when icuProb > 0.70 and disposition HOME", () => {
    const r = enforceClinicalGates({ scores: { NEWS2: 3 }, disposition: "HOME", icuProb: 0.85, confidence: 0.80 });
    expect(r.passed).toBe(false);
    expect(r.blocker).toContain("ICU");
  });

  it("blocks low confidence HOME discharge", () => {
    const r = enforceClinicalGates({ scores: { NEWS2: 1 }, disposition: "HOME", confidence: 0.40 });
    expect(r.passed).toBe(false);
    expect(r.blocker).toContain("onfidence");
  });

  it("gates array has all 5 gate names", () => {
    const r = enforceClinicalGates({ scores: { NEWS2: 2 }, disposition: "URGENT_CARE", confidence: 0.80 });
    const names = r.gates.map((g) => g.gate);
    expect(names).toContain("scoring_presence");
    expect(names).toContain("news2_floor");
    expect(names).toContain("antibiotic_stewardship");
    expect(names).toContain("icu_floor");
    expect(names).toContain("confidence_minimum");
  });
});

// ─── 3. Clinical Trace ────────────────────────────────────────────────────────
import { buildClinicalTrace, verifyTrace, flattenTrace } from "../../server/audit/clinicalTrace";

describe("Batch44d — clinicalTrace", () => {
  const traceInput = {
    patientId:   "p-trace-001",
    symptoms:    { hr: 110, temp: 102 },
    questions:   ["Is there chest pain?"],
    scores:      { NEWS2: 4, qSOFA: 1 },
    diagnosis:   { primary: "Suspected sepsis" },
    disposition: "ED",
  };

  it("builds a trace with 5 steps", () => {
    const trace = buildClinicalTrace(traceInput);
    expect(trace.steps).toHaveLength(5);
    const stages = trace.steps.map((s) => s.stage);
    expect(stages).toContain("input");
    expect(stages).toContain("questions");
    expect(stages).toContain("scoring");
    expect(stages).toContain("diagnosis");
    expect(stages).toContain("disposition");
  });

  it("trace is sealed and has a traceHash", () => {
    const trace = buildClinicalTrace(traceInput);
    expect(trace.sealed).toBe(true);
    expect(trace.traceHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("verifyTrace returns valid for unmodified trace", () => {
    const trace = buildClinicalTrace(traceInput);
    const r     = verifyTrace(trace);
    expect(r.valid).toBe(true);
  });

  it("verifyTrace detects tampered trace", () => {
    const trace = buildClinicalTrace(traceInput);
    const tampered = { ...trace, steps: [...trace.steps] };
    tampered.steps[0] = { ...tampered.steps[0], data: { tampered: true } };
    const r = verifyTrace(tampered);
    expect(r.valid).toBe(false);
    expect(r.reason).toContain("mismatch");
  });

  it("flattenTrace produces a flat record", () => {
    const trace = buildClinicalTrace(traceInput);
    const flat  = flattenTrace(trace);
    expect(typeof flat.traceId).toBe("string");
    expect(flat.stage_input).toBeDefined();
    expect(flat.stage_disposition).toBeDefined();
  });

  it("disposition matches input", () => {
    const trace = buildClinicalTrace(traceInput);
    expect(trace.disposition).toBe("ED");
  });
});

// ─── 4. Spec Engine ───────────────────────────────────────────────────────────
import { applyRules, SEED_RULES } from "../../server/kb/specEngine";

describe("Batch44d — specEngine", () => {
  it("NEWS2 ≥ 7 → ICU disposition from seed rules", () => {
    const r = applyRules({ scores: { NEWS2: 8 }, icuProb: 0.5 }, SEED_RULES);
    expect(r.disposition).toBe("ICU");
    expect(r.matchedRule?.ruleId).toBe("R001");
  });

  it("NEWS2 = 5 → ED disposition", () => {
    const r = applyRules({ scores: { NEWS2: 5 }, sepsisRisk: { highRisk: false } }, SEED_RULES);
    expect(r.disposition).toBe("ED");
  });

  it("high sepsis risk → ED disposition", () => {
    const r = applyRules({ scores: { NEWS2: 2 }, sepsisRisk: { highRisk: true } }, SEED_RULES);
    expect(r.disposition).toBe("ED");
  });

  it("NEWS2 < 3 → HOME disposition", () => {
    const r = applyRules({ scores: { NEWS2: 1 }, sepsisRisk: { highRisk: false }, icuProb: 0.05 }, SEED_RULES);
    expect(r.disposition).toBe("HOME");
  });

  it("returns fallback when no rules match", () => {
    const r = applyRules({}, [], "uncertain");
    expect(r.disposition).toBe("uncertain");
    expect(r.fallback).toBe(true);
    expect(r.matchedRule).toBeNull();
  });

  it("rulesEvaluated equals number of rules passed", () => {
    const r = applyRules({ scores: { NEWS2: 1 } }, SEED_RULES);
    expect(r.rulesEvaluated).toBe(SEED_RULES.length);
  });

  it("malformed whenExpr is skipped safely", () => {
    const badRules = [
      { ruleId: "BAD", complaintId: "*", priority: 1, whenExpr: "this is not valid js )(", dispositionLevel: "ICU", confidenceHint: "HIGH" },
      ...SEED_RULES,
    ];
    const r = applyRules({ scores: { NEWS2: 1 } }, badRules);
    expect(r.disposition).not.toBe("ICU");   // bad rule skipped, SEED_RULES applied
  });
});
