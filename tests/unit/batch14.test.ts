import { describe, it, expect, beforeEach } from "vitest";

// ── Graph Utils ───────────────────────────────────────────────────────────────
import { edgesToGraph, graphToExecutionOrder } from "../../server/workflows/graphUtils";

describe("graphUtils — edgesToGraph()", () => {
  it("builds a map of node ids", () => {
    const nodes = [{ id: "a" }, { id: "b" }];
    const edges = [{ source: "a", target: "b" }];
    const g = edgesToGraph(nodes, edges);
    expect(g).toHaveProperty("a");
    expect(g).toHaveProperty("b");
  });

  it("connects source → target in next[]", () => {
    const nodes = [{ id: "a" }, { id: "b" }];
    const edges = [{ source: "a", target: "b" }];
    const g = edgesToGraph(nodes, edges);
    expect(g.a.next).toContain("b");
  });

  it("supports multiple outgoing edges", () => {
    const nodes = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const edges = [{ source: "a", target: "b" }, { source: "a", target: "c" }];
    const g = edgesToGraph(nodes, edges);
    expect(g.a.next).toHaveLength(2);
  });

  it("preserves node data", () => {
    const nodes = [{ id: "a", data: { label: "Start" } }];
    const g = edgesToGraph(nodes, []);
    expect(g.a.data?.label).toBe("Start");
  });

  it("ignores edge for unknown source", () => {
    const nodes = [{ id: "a" }];
    const edges = [{ source: "MISSING", target: "a" }];
    const g = edgesToGraph(nodes, edges);
    expect(g.a.next).toHaveLength(0);
  });

  it("returns empty graph for empty input", () => {
    expect(edgesToGraph([], [])).toEqual({});
  });
});

describe("graphUtils — graphToExecutionOrder()", () => {
  it("returns BFS execution order", () => {
    const nodes = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const edges = [{ source: "a", target: "b" }, { source: "b", target: "c" }];
    const g = edgesToGraph(nodes, edges);
    const order = graphToExecutionOrder(g, "a");
    expect(order).toEqual(["a", "b", "c"]);
  });

  it("handles single node", () => {
    const g = edgesToGraph([{ id: "x" }], []);
    expect(graphToExecutionOrder(g, "x")).toEqual(["x"]);
  });
});

// ── Alert Rules ───────────────────────────────────────────────────────────────
import { addRule, getAlertRules, clearRules, removeRule, evalRules } from "../../server/monitoring/alertRules";

describe("alertRules", () => {
  beforeEach(() => clearRules());

  it("addRule returns rule with id and createdAt", () => {
    const r = addRule({ expr: "latency > 2000", target: "slack" });
    expect(r.id).toBeTruthy();
    expect(r.createdAt).toBeTruthy();
    expect(r.expr).toBe("latency > 2000");
  });

  it("getAlertRules returns all rules", () => {
    addRule({ expr: "erRate > 0.3", target: "slack" });
    addRule({ expr: "latency > 5000", target: "whatsapp" });
    expect(getAlertRules()).toHaveLength(2);
  });

  it("removeRule removes by id", () => {
    const r = addRule({ expr: "test", target: "slack" });
    expect(removeRule(r.id)).toBe(true);
    expect(getAlertRules()).toHaveLength(0);
  });

  it("removeRule returns false for unknown id", () => {
    expect(removeRule("nonexistent")).toBe(false);
  });

  it("clearRules empties the list", () => {
    addRule({ expr: "a > 1", target: "slack" });
    clearRules();
    expect(getAlertRules()).toHaveLength(0);
  });

  it("evalRules fires matching rules", async () => {
    addRule({ expr: "latency > 2000", target: "slack" });
    const fired = await evalRules({ latency: 3000 });
    expect(fired).toHaveLength(1);
  });

  it("evalRules skips non-matching rules", async () => {
    addRule({ expr: "latency > 2000", target: "slack" });
    const fired = await evalRules({ latency: 100 });
    expect(fired).toHaveLength(0);
  });

  it("evalRules returns [] when no rules registered", async () => {
    const fired = await evalRules({ latency: 9999 });
    expect(fired).toHaveLength(0);
  });

  it("evalRules handles both target", async () => {
    addRule({ expr: "latency > 0", target: "both" });
    const fired = await evalRules({ latency: 1 });
    expect(fired).toHaveLength(1);
  });

  it("evalRules skips invalid expressions gracefully", async () => {
    addRule({ expr: "INVALID %%% SYNTAX", target: "slack" });
    await expect(evalRules({ latency: 100 })).resolves.not.toThrow();
  });
});

// ── QA Utils ─────────────────────────────────────────────────────────────────
import { minimizeQuestions, debugFailure, trend, captureTrace, runGoldenBatch } from "../../server/clinical/qaUtils";

describe("qaUtils — minimizeQuestions()", () => {
  it("returns at most 3 questions", () => {
    expect(minimizeQuestions(["a","b","c","d","e"])).toHaveLength(3);
  });

  it("returns all if <= 3", () => {
    expect(minimizeQuestions(["a","b"])).toHaveLength(2);
  });

  it("returns empty array for empty input", () => {
    expect(minimizeQuestions([])).toHaveLength(0);
  });

  it("preserves order (first 3)", () => {
    expect(minimizeQuestions(["q1","q2","q3","q4"])).toEqual(["q1","q2","q3"]);
  });
});

describe("qaUtils — debugFailure()", () => {
  it("detects FHIR error", () => {
    expect(debugFailure("FHIR token expired")).toBe("Check token");
  });

  it("detects selector error", () => {
    expect(debugFailure("selector not found")).toBe("Heal selector");
  });

  it("detects network error", () => {
    expect(debugFailure("network unavailable")).toBe("Retry network call");
  });

  it("detects timeout error", () => {
    expect(debugFailure("timeout exceeded")).toBe("Increase timeout");
  });

  it("returns undefined for unknown error", () => {
    expect(debugFailure("unknown crash")).toBeUndefined();
  });
});

describe("qaUtils — trend()", () => {
  it("positive trend for increasing data", () => {
    expect(trend([100, 200, 300])).toBe(200);
  });

  it("negative trend for decreasing data", () => {
    expect(trend([300, 200, 100])).toBe(-200);
  });

  it("zero trend for single point", () => {
    expect(trend([50])).toBe(0);
  });

  it("zero for empty array", () => {
    expect(trend([])).toBe(0);
  });

  it("zero trend for flat data", () => {
    expect(trend([5, 5, 5])).toBe(0);
  });
});

describe("qaUtils — captureTrace()", () => {
  it("does not throw", () => {
    expect(() => captureTrace("trace-001", "pipeline_start", { patientId: "P1" })).not.toThrow();
  });
});

describe("qaUtils — runGoldenBatch()", () => {
  it("returns match=true when expected equals actual", async () => {
    const results = await runGoldenBatch(
      [{ input: {}, expected: "PASS" }],
      async () => "PASS"
    );
    expect(results[0].match).toBe(true);
  });

  it("returns match=false when expected differs from actual", async () => {
    const results = await runGoldenBatch(
      [{ input: {}, expected: "PASS" }],
      async () => "FAIL"
    );
    expect(results[0].match).toBe(false);
  });

  it("handles multiple cases", async () => {
    const results = await runGoldenBatch(
      [{ input: {}, expected: "A" }, { input: {}, expected: "B" }],
      async (input: any) => input.val ?? "A"
    );
    expect(results).toHaveLength(2);
  });

  it("returns empty array for empty input", async () => {
    const results = await runGoldenBatch([], async () => "x");
    expect(results).toHaveLength(0);
  });
});

// ── Telegram + Broadcast ──────────────────────────────────────────────────────
import { sendTelegramAlert, broadcastMultiChannel } from "../../server/monitoring/alerts";

describe("sendTelegramAlert()", () => {
  it("does not throw when TG_TOKEN not configured", async () => {
    await expect(sendTelegramAlert("test alert")).resolves.not.toThrow();
  });
});

describe("broadcastMultiChannel()", () => {
  it("does not throw when no webhooks configured", async () => {
    await expect(broadcastMultiChannel("system alert")).resolves.not.toThrow();
  });
});
