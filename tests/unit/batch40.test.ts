import { describe, it, expect } from "vitest";

// ─── 1. Workflow Engine ───────────────────────────────────────────────────────
import { Workflow } from "../../server/ai-orchestration/events/workflowEngine";

describe("Batch40 — workflowEngine", () => {
  it("runs steps in sequence and returns output", async () => {
    const workflow = new Workflow<number>()
      .add(async (n) => n + 1, "add_one")
      .add(async (n) => n * 2, "double");

    const result = await workflow.run(5);
    expect(result.output).toBe(12);
    expect(result.steps).toHaveLength(2);
    expect(result.success).toBe(true);
  });

  it("records step names in results", async () => {
    const wf = new Workflow().add(async (x) => x, "named_step");
    const r  = await wf.run("hello");
    expect(r.steps[0].name).toBe("named_step");
  });

  it("captures step duration", async () => {
    const wf = new Workflow().add(async (x) => x, "timing");
    const r  = await wf.run(1);
    expect(r.steps[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it("totalMs is >= sum of step durations", async () => {
    const wf = new Workflow()
      .add(async (x) => x, "s1")
      .add(async (x) => x, "s2");
    const r = await wf.run(1);
    const stepSum = r.steps.reduce((acc, s) => acc + s.durationMs, 0);
    expect(r.totalMs).toBeGreaterThanOrEqual(stepSum);
  });

  it("throws on step failure and records it", async () => {
    const wf = new Workflow().add(async () => { throw new Error("boom"); }, "bad_step");
    await expect(wf.run(1)).rejects.toThrow("boom");
  });

  it("onLog callback fires for each step", async () => {
    const logs: any[] = [];
    const wf = new Workflow()
      .add(async (x) => x + 1, "step_a")
      .add(async (x) => x + 1, "step_b")
      .onLog((r) => logs.push(r));

    await wf.run(0);
    expect(logs).toHaveLength(2);
    expect(logs[0].name).toBe("step_a");
    expect(logs[1].name).toBe("step_b");
  });

  it("chains multiple steps with data passing", async () => {
    const wf = new Workflow<string>()
      .add(async (s) => s.toUpperCase(), "upper")
      .add(async (s) => s + "!", "exclaim")
      .add(async (s) => ({ result: s }), "wrap");

    const r = await wf.run("hello");
    expect(r.output).toEqual({ result: "HELLO!" });
  });
});

// ─── 2. Clinical RAG ─────────────────────────────────────────────────────────
import { getClinicalRetriever } from "../../server/ai-orchestration/langchain/clinicalRAG";

describe("Batch40 — clinicalRAG retriever", () => {
  it("retriever returns string context", async () => {
    const retriever = getClinicalRetriever();
    const result    = await retriever.invoke("chest pain shortness of breath");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("retriever returns relevant content for sepsis symptoms", async () => {
    const retriever = getClinicalRetriever();
    const result    = await retriever.invoke("fever hypotension tachycardia");
    expect(result.toLowerCase()).toMatch(/fever|sepsis|tachycardia|hypoten/i);
  });

  it("retriever falls back for unrecognized symptoms", async () => {
    const retriever = getClinicalRetriever();
    const result    = await retriever.invoke("xyzzy unknown symptom abcdef");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

// ─── 3. LangGraph Triage ─────────────────────────────────────────────────────
import { runTriageGraph } from "../../server/ai-orchestration/langgraph/triageGraph";

describe("Batch40 — triageGraph", () => {
  it("returns a disposition string", async () => {
    const result = await runTriageGraph("mild cough and runny nose");
    expect(typeof result.disposition).toBe("string");
    expect(result.disposition.length).toBeGreaterThan(0);
  }, 10000);

  it("high-risk symptoms produce high risk score or ER disposition", async () => {
    const result = await runTriageGraph("chest pain shortness of breath diaphoresis");
    expect(result.riskScore).toBeGreaterThanOrEqual(4);
  }, 10000);

  it("result has questionsAsked array", async () => {
    const result = await runTriageGraph("fever and chills");
    expect(Array.isArray(result.questionsAsked)).toBe(true);
    expect(result.questionsAsked.length).toBeGreaterThan(0);
  }, 10000);

  it("result has iteration count", async () => {
    const result = await runTriageGraph("headache");
    expect(typeof result.iterations).toBe("number");
    expect(result.iterations).toBeGreaterThan(0);
  }, 10000);

  it("flags array is present", async () => {
    const result = await runTriageGraph("severe chest pain");
    expect(Array.isArray(result.flags)).toBe(true);
  }, 10000);

  it("stops within MAX_ITERATIONS", async () => {
    const result = await runTriageGraph("mild cough");
    expect(result.iterations).toBeLessThanOrEqual(5);
  }, 10000);
});

// ─── 4. LangSmith Observability ──────────────────────────────────────────────
import { logCase, getLocalAuditLog } from "../../server/ai-orchestration/observability/langsmith";

describe("Batch40 — langsmith observability", () => {
  it("logCase always returns logged=true", async () => {
    const r = await logCase({ symptoms: "test" }, { result: "ok" });
    expect(r.logged).toBe(true);
  });

  it("logCase records to local audit when no LangSmith key", async () => {
    const before = getLocalAuditLog().length;
    await logCase({ test: "batch40" }, { out: "ok" }, { name: "test-trace" });
    const after = getLocalAuditLog().length;
    expect(after).toBeGreaterThan(before);
  });

  it("getLocalAuditLog returns array", () => {
    const log = getLocalAuditLog();
    expect(Array.isArray(log)).toBe(true);
  });

  it("audit log entry has name + inputs + outputs", async () => {
    await logCase({ a: 1 }, { b: 2 }, { name: "batch40-named" });
    const log = getLocalAuditLog();
    const found = log.find((e) => e.name === "batch40-named");
    expect(found).toBeDefined();
    expect(found?.inputs).toEqual({ a: 1 });
    expect(found?.outputs).toEqual({ b: 2 });
  });

  it("provider is 'local' without LANGSMITH_API_KEY", async () => {
    const r = await logCase({ x: 1 }, { y: 2 });
    expect(r.provider).toBe("local");
  });
});
