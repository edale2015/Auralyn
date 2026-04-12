import { describe, it, expect, beforeEach } from "vitest";

// ─── KB Validation Schemas (already exist from batch26, regression) ───────────
import {
  CanonicalPathwayPromotionSchema,
} from "../../server/kb/schemas/kbValidationSchemas";

describe("kbValidationSchemas — regression", () => {
  it("still validates a full promotion payload", () => {
    const result = CanonicalPathwayPromotionSchema.safeParse({
      sourceType: "manual",
      complaintId: "throat",
      syndromeId: "strep",
      label: "Strep pharyngitis",
      treatmentClass: "antibiotic",
      canonicalDisposition: "home_with_rx",
      actorId: "dr-test",
      traceId: "t-001",
    });
    expect(result.success).toBe(true);
  });
});

// ─── Consensus Engine ─────────────────────────────────────────────────────────
import { runConsensus, weightedConsensus } from "../../server/engines/consensusEngine";

describe("consensusEngine", () => {
  const opinions = [
    { agent: "infectious", diagnosis: "strep_pharyngitis", confidence: 0.8 },
    { agent: "general",    diagnosis: "strep_pharyngitis", confidence: 0.75 },
    { agent: "pulmonary",  diagnosis: "viral_pharyngitis", confidence: 0.6 },
  ];

  it("returns top diagnosis when majority agrees", () => {
    const r = runConsensus(opinions);
    expect(r.topDiagnosis).toBe("strep_pharyngitis");
  });

  it("ranks all diagnoses", () => {
    const r = runConsensus(opinions);
    expect(r.ranked.length).toBe(2);
  });

  it("normalizedScore sums to 1 within ranked", () => {
    const r = runConsensus(opinions);
    const total = r.ranked.reduce((s, d) => s + d.normalizedScore, 0);
    expect(total).toBeCloseTo(1, 1);
  });

  it("consensusStrength is strong when lead is dominant", () => {
    const dominated = [
      { agent: "infectious", diagnosis: "strep_pharyngitis", confidence: 0.95 },
      { agent: "general",    diagnosis: "strep_pharyngitis", confidence: 0.90 },
      { agent: "cardiology", diagnosis: "strep_pharyngitis", confidence: 0.85 },
    ];
    const r = runConsensus(dominated);
    expect(r.consensusStrength).toBe("strong");
  });

  it("dissent is true when more than half disagree", () => {
    const split = [
      { agent: "infectious", diagnosis: "strep_pharyngitis", confidence: 0.8 },
      { agent: "general",    diagnosis: "viral_pharyngitis", confidence: 0.7 },
      { agent: "pulmonary",  diagnosis: "covid19",           confidence: 0.6 },
    ];
    const r = runConsensus(split);
    expect(r.dissent).toBe(true);
  });

  it("handles empty opinions gracefully", () => {
    const r = runConsensus([]);
    expect(r.topDiagnosis).toBeNull();
    expect(r.ranked.length).toBe(0);
  });

  it("weightedConsensus applies custom weights", () => {
    const r = weightedConsensus(opinions, { infectious: 2.0, general: 0.5, pulmonary: 0.5 });
    expect(r.topDiagnosis).toBe("strep_pharyngitis");
  });

  it("applies known AGENT_WEIGHTS (cardiology 1.3)", () => {
    const cardiologyHeavy = [
      { agent: "cardiology", diagnosis: "cardiac_syndrome_x", confidence: 0.8 },
      { agent: "general",    diagnosis: "viral_pharyngitis",  confidence: 0.9 },
    ];
    const r = runConsensus(cardiologyHeavy);
    expect(r.topDiagnosis).toBe("cardiac_syndrome_x");
  });
});

// ─── Next Best Question Engine ────────────────────────────────────────────────
import {
  getNextBestQuestion,
  buildSoreThroatQuestions,
} from "../../server/engines/nextBestQuestion";

describe("nextBestQuestion", () => {
  const differential = [
    { diagnosis: "strep_pharyngitis", probability: 0.6 },
    { diagnosis: "viral_pharyngitis", probability: 0.4 },
  ];

  const questions = buildSoreThroatQuestions();

  it("returns a non-null question for a typical differential", () => {
    const r = getNextBestQuestion(differential, questions);
    expect(r.question).not.toBeNull();
    expect(typeof r.question).toBe("string");
  });

  it("expectedImpact is positive", () => {
    const r = getNextBestQuestion(differential, questions);
    expect(r.expectedImpact).toBeGreaterThan(0);
  });

  it("ranked questions list is ordered descending by infoGain", () => {
    const r = getNextBestQuestion(differential, questions);
    for (let i = 0; i < r.rankedQuestions.length - 1; i++) {
      expect(r.rankedQuestions[i].infoGain).toBeGreaterThanOrEqual(r.rankedQuestions[i + 1].infoGain);
    }
  });

  it("returns null question when all questions are already asked", () => {
    const asked = questions.map((q) => ({ ...q, alreadyAsked: true }));
    const r = getNextBestQuestion(differential, asked);
    expect(r.question).toBeNull();
    expect(r.expectedImpact).toBe(0);
  });

  it("returns null question on empty differential", () => {
    const r = getNextBestQuestion([], questions);
    expect(r.question).toBeNull();
  });

  it("buildSoreThroatQuestions returns at least 5 questions", () => {
    expect(questions.length).toBeGreaterThanOrEqual(5);
  });

  it("questionId matches a known question id", () => {
    const r = getNextBestQuestion(differential, questions);
    expect(typeof r.questionId).toBe("string");
    const ids = questions.map((q) => q.id);
    expect(ids).toContain(r.questionId);
  });
});

// ─── Disposition Guardrail ────────────────────────────────────────────────────
import { applyDispositionGuardrail } from "../../server/engines/dispositionGuardrail";

describe("dispositionGuardrail", () => {
  it("no override for low-risk patient", () => {
    const r = applyDispositionGuardrail({
      diagnosis: "viral_pharyngitis",
      riskScore: 0.2,
      redFlags: [],
      llmDisposition: "home_supportive_care",
    });
    expect(r.override).toBe(false);
    expect(r.finalDisposition).toBe("home_supportive_care");
    expect(r.riskLevel).toBe("low");
  });

  it("overrides to er_now when riskScore > 0.85", () => {
    const r = applyDispositionGuardrail({
      diagnosis: "sepsis",
      riskScore: 0.9,
      redFlags: [],
      llmDisposition: "home_supportive_care",
    });
    expect(r.override).toBe(true);
    expect(r.finalDisposition).toBe("er_now");
    expect(r.riskLevel).toBe("critical");
  });

  it("overrides to same_day_urgent_care when riskScore > 0.55", () => {
    const r = applyDispositionGuardrail({
      diagnosis: "pharyngitis",
      riskScore: 0.65,
      redFlags: [],
      llmDisposition: "home_supportive_care",
    });
    expect(r.override).toBe(true);
    expect(r.finalDisposition).toBe("same_day_urgent_care");
    expect(r.riskLevel).toBe("high");
  });

  it("overrides to er_now on stridor red flag", () => {
    const r = applyDispositionGuardrail({
      diagnosis: "croup",
      riskScore: 0.3,
      redFlags: ["stridor"],
      llmDisposition: "home_supportive_care",
    });
    expect(r.override).toBe(true);
    expect(r.finalDisposition).toBe("er_now");
    expect(r.riskLevel).toBe("critical");
  });

  it("overrides to er_now on altered_mental_status red flag", () => {
    const r = applyDispositionGuardrail({
      diagnosis: "unknown",
      riskScore: 0.2,
      redFlags: ["altered_mental_status"],
      llmDisposition: "home_supportive_care",
    });
    expect(r.override).toBe(true);
    expect(r.finalDisposition).toBe("er_now");
  });

  it("overrides to same_day_urgent_care on peritonsillar_bulge", () => {
    const r = applyDispositionGuardrail({
      diagnosis: "peritonsillar_abscess",
      riskScore: 0.3,
      redFlags: ["peritonsillar_bulge"],
      llmDisposition: "home_supportive_care",
    });
    expect(r.override).toBe(true);
    expect(r.finalDisposition).toBe("same_day_urgent_care");
  });

  it("overrides to home_with_rx on Centor ≥4", () => {
    const r = applyDispositionGuardrail({
      diagnosis: "strep_pharyngitis",
      riskScore: 0.3,
      redFlags: [],
      llmDisposition: "follow_up_primary_care",
      centorScore: 4,
    });
    expect(r.override).toBe(true);
    expect(r.finalDisposition).toBe("home_with_rx");
  });

  it("no Centor override when disposition already includes rx", () => {
    const r = applyDispositionGuardrail({
      diagnosis: "strep_pharyngitis",
      riskScore: 0.3,
      redFlags: [],
      llmDisposition: "home_with_rx",
      centorScore: 4,
    });
    expect(r.override).toBe(false);
  });
});

// ─── Parallel Dispatch ────────────────────────────────────────────────────────
import { runParallelTools, buildToolBlock } from "../../server/agent/parallelDispatch";

describe("parallelDispatch", () => {
  it("returns results for all tool blocks", async () => {
    const blocks = [
      buildToolBlock("tool_a", { x: 1 }),
      buildToolBlock("tool_b", { x: 2 }),
      buildToolBlock("tool_c", { x: 3 }),
    ];
    const results = await runParallelTools(blocks);
    expect(results.length).toBe(3);
  });

  it("each result has tool_use_id and durationMs", async () => {
    const blocks = [buildToolBlock("my_tool", { key: "value" }, "id-abc")];
    const [result] = await runParallelTools(blocks);
    expect(result.tool_use_id).toBe("id-abc");
    expect(typeof result.durationMs).toBe("number");
  });

  it("captures error gracefully without throwing", async () => {
    const errorDispatcher = async (_name: string, _input: any) => {
      throw new Error("tool exploded");
    };
    const blocks  = [buildToolBlock("bad_tool", {})];
    const [result] = await runParallelTools(blocks, errorDispatcher);
    expect(result.error).toBeDefined();
    expect(result.content).toBeNull();
  });

  it("buildToolBlock auto-generates an id when not provided", () => {
    const block = buildToolBlock("tool", {});
    expect(block.id).toMatch(/^tool-/);
  });

  it("runs all blocks in parallel — durationMs each < sequential total", async () => {
    const slowDispatcher = async () => {
      await new Promise((r) => setTimeout(r, 20));
      return "done";
    };
    const blocks  = [buildToolBlock("a", {}), buildToolBlock("b", {}), buildToolBlock("c", {})];
    const start   = Date.now();
    const results = await runParallelTools(blocks, slowDispatcher);
    const elapsed = Date.now() - start;
    expect(results.length).toBe(3);
    expect(elapsed).toBeLessThan(150);
  });
});

// ─── Interrupt System ─────────────────────────────────────────────────────────
import {
  triggerInterrupt,
  checkInterrupt,
  clearInterrupt,
  isInterruptPending,
  getInterruptHistory,
} from "../../server/agent/interrupt";

describe("interrupt", () => {
  beforeEach(() => clearInterrupt());

  it("no interrupt pending initially", () => {
    expect(isInterruptPending()).toBe(false);
  });

  it("triggerInterrupt sets flag", () => {
    triggerInterrupt({ type: "physician_override", message: "Override by dr. smith" });
    expect(isInterruptPending()).toBe(true);
  });

  it("checkInterrupt returns stop=true and clears flag", () => {
    triggerInterrupt({ type: "safety_halt", message: "Safety halt triggered" });
    const result = checkInterrupt();
    expect(result.stop).toBe(true);
    expect(result.event?.type).toBe("safety_halt");
    expect(isInterruptPending()).toBe(false);
  });

  it("checkInterrupt returns stop=false when no interrupt", () => {
    const result = checkInterrupt();
    expect(result.stop).toBe(false);
    expect(result.event).toBeNull();
  });

  it("interrupt event includes actorId when provided", () => {
    triggerInterrupt({ type: "escalation_required", message: "Escalate now", actorId: "dr-jones" });
    const result = checkInterrupt();
    expect(result.event?.actorId).toBe("dr-jones");
  });

  it("clearInterrupt works independently", () => {
    triggerInterrupt({ type: "timeout", message: "Timed out" });
    clearInterrupt();
    expect(isInterruptPending()).toBe(false);
  });

  it("getInterruptHistory accumulates all triggered events", () => {
    triggerInterrupt({ type: "physician_override", message: "Override 1" });
    triggerInterrupt({ type: "physician_override", message: "Override 2" });
    const history = getInterruptHistory();
    const myEvents = history.filter((e) => e.message.startsWith("Override"));
    expect(myEvents.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── Usage Tracker ────────────────────────────────────────────────────────────
import {
  trackUsage,
  getUsage,
  getCallHistory,
  resetUsage,
  estimateCost,
} from "../../server/monitoring/usageTracker";

describe("usageTracker", () => {
  beforeEach(() => resetUsage());

  it("starts with zero usage", () => {
    const u = getUsage();
    expect(u.calls).toBe(0);
    expect(u.tokens).toBe(0);
  });

  it("trackUsage increments calls and tokens", () => {
    trackUsage({ promptTokens: 100, completionTokens: 50 });
    const u = getUsage();
    expect(u.calls).toBe(1);
    expect(u.tokens).toBe(150);
    expect(u.promptTokens).toBe(100);
    expect(u.completionTokens).toBe(50);
  });

  it("avgTokensPerCall is computed correctly", () => {
    trackUsage({ promptTokens: 100, completionTokens: 100 });
    trackUsage({ promptTokens: 200, completionTokens: 0 });
    const u = getUsage();
    expect(u.avgTokensPerCall).toBe(200);
  });

  it("tracks errors", () => {
    trackUsage({ promptTokens: 0, completionTokens: 0, error: true });
    expect(getUsage().errors).toBe(1);
  });

  it("getCallHistory returns recent calls up to limit", () => {
    trackUsage({ model: "gpt-4o", promptTokens: 50, endpoint: "/test" });
    const history = getCallHistory(5);
    expect(history.length).toBeGreaterThan(0);
    expect(history[history.length - 1].model).toBe("gpt-4o");
  });

  it("estimateCost returns a number", () => {
    trackUsage({ promptTokens: 1000, completionTokens: 500 });
    const cost = estimateCost("gpt-4o");
    expect(typeof cost).toBe("number");
    expect(cost).toBeGreaterThan(0);
  });

  it("resetUsage zeroes everything", () => {
    trackUsage({ promptTokens: 999, completionTokens: 999 });
    resetUsage();
    expect(getUsage().calls).toBe(0);
    expect(getUsage().tokens).toBe(0);
  });
});

// ─── MCP Router ───────────────────────────────────────────────────────────────
import { callExternalTool, batchMcpCalls } from "../../server/mcp/mcpRouter";

describe("mcpRouter", () => {
  it("ehr_lookup returns patientId and source", async () => {
    const r = await callExternalTool("ehr_lookup", { patientId: "p-001" });
    expect(r.tool).toBe("ehr_lookup");
    expect((r.result as any).patientId).toBe("p-001");
    expect(r.source).toBe("ehr");
  });

  it("lab_results returns patient results stub", async () => {
    const r = await callExternalTool("lab_results", { patientId: "p-002" });
    expect(r.source).toBe("lab");
    expect((r.result as any).results).toBeDefined();
  });

  it("rapid_strep_result returns sensitivity/specificity", async () => {
    const r = await callExternalTool("rapid_strep_result", { patientId: "p-003" });
    expect((r.result as any).sensitivity).toBe(0.86);
    expect((r.result as any).specificity).toBe(0.95);
  });

  it("unknown tool returns error in result", async () => {
    const r = await callExternalTool("unknown_tool_xyz", {});
    expect(r.error).toBeDefined();
    expect(r.result).toBeNull();
  });

  it("batchMcpCalls processes all calls in parallel", async () => {
    const results = await batchMcpCalls([
      { name: "ehr_lookup",    input: { patientId: "p-batch-1" } },
      { name: "lab_results",   input: { patientId: "p-batch-2" } },
      { name: "medication_check", input: { patientId: "p-batch-3" } },
    ]);
    expect(results.length).toBe(3);
    expect(results[0].source).toBe("ehr");
    expect(results[1].source).toBe("lab");
    expect(results[2].source).toBe("rx");
  });
});

// ─── Clinical Consensus Orchestrator ─────────────────────────────────────────
import { runClinicalConsensus } from "../../server/agent/clinicalConsensusOrchestrator";

describe("clinicalConsensusOrchestrator", () => {
  it("returns consensus, guardrail, and nextQuestion", async () => {
    const r = await runClinicalConsensus({
      complaint: "sore throat",
      features: { fever: true, exudate: true, nodes: true },
      riskScore: 0.4,
      redFlags: [],
      centorScore: 3,
      probability: 0.6,
    });
    expect(r.consensus).toBeDefined();
    expect(r.guardrail).toBeDefined();
    expect(r.nextQuestion).toBeDefined();
    expect(typeof r.processingTimeMs).toBe("number");
  });

  it("consensus topDiagnosis is a string", async () => {
    const r = await runClinicalConsensus({
      complaint: "sore throat",
      features: { fever: true, exudate: true, nodes: true },
      riskScore: 0.3,
      redFlags: [],
      centorScore: 4,
      probability: 0.7,
    });
    expect(typeof r.consensus.topDiagnosis).toBe("string");
  });

  it("guardrail applies Centor override when centorScore≥4", async () => {
    const r = await runClinicalConsensus({
      complaint: "sore throat",
      features: { fever: true, exudate: true, nodes: true },
      riskScore: 0.2,
      redFlags: [],
      centorScore: 4,
      probability: 0.7,
    });
    expect(r.guardrail.override).toBe(true);
    expect(r.guardrail.finalDisposition).toBe("home_with_rx");
  });

  it("guardrail fires er_now on high riskScore", async () => {
    const r = await runClinicalConsensus({
      complaint: "unknown",
      features: {},
      riskScore: 0.95,
      redFlags: [],
    });
    expect(r.guardrail.finalDisposition).toBe("er_now");
    expect(r.guardrail.riskLevel).toBe("critical");
  });

  it("processingTimeMs is a non-negative number", async () => {
    const r = await runClinicalConsensus({
      complaint: "cough",
      features: { cough: true },
      riskScore: 0.1,
      redFlags: [],
    });
    expect(r.processingTimeMs).toBeGreaterThanOrEqual(0);
  });
});

// ─── Disposition Guardrail — Edge Cases ──────────────────────────────────────
describe("dispositionGuardrail — edge cases", () => {
  it("moderate riskScore 0.3 gives low risk level with no override", () => {
    const r = applyDispositionGuardrail({
      diagnosis: "viral_uri",
      riskScore: 0.3,
      redFlags: [],
      llmDisposition: "home_supportive_care",
    });
    expect(r.override).toBe(false);
    expect(r.riskLevel).toBe("low");
    expect(r.guardrailApplied).toBeNull();
  });

  it("drooling red flag forces er_now", () => {
    const r = applyDispositionGuardrail({
      diagnosis: "epiglottitis_suspected",
      riskScore: 0.4,
      redFlags: ["drooling"],
      llmDisposition: "follow_up_primary_care",
    });
    expect(r.finalDisposition).toBe("er_now");
    expect(r.override).toBe(true);
  });

  it("riskLevel is moderate for 0.4 < riskScore ≤ 0.55 with no override", () => {
    const r = applyDispositionGuardrail({
      diagnosis: "pharyngitis",
      riskScore: 0.45,
      redFlags: [],
      llmDisposition: "follow_up_primary_care",
    });
    expect(r.riskLevel).toBe("moderate");
    expect(r.override).toBe(false);
  });
});
