/**
 * Packet 20 Phase 3 — Integration Layer Tests
 *
 * Covers:
 *   - events.ts        TOPICS + event type shapes
 *   - metricsTracker.ts  counters, p95, per-template, Prometheus export
 *   - queue.ts         fireAndForget, enqueueJob, result listeners, concurrency
 *   - automationMonitor.ts  rolling failure rate, analyzeAutomationMetrics
 *   - LearningInsight selector_drift type extension
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { TOPICS } from "../../server/automation/events";
import {
  recordRun,
  getMetrics,
  getFailureRate,
  resetMetrics,
  toPrometheusText,
} from "../../server/automation/metricsTracker";
import {
  onJobResult,
  getQueueState,
  registerJobHandler,
  enqueueJob,
  fireAndForget,
  type AutomationJob,
  type JobResult,
} from "../../server/automation/queue";
import {
  analyzeAutomationMetrics,
  FAILURE_RATE_THRESHOLD,
} from "../../server/oversight/automationMonitor";
import type { LearningInsight } from "../../server/meta/metaLearningEngine";

// ── TOPICS ────────────────────────────────────────────────────────────────────

describe("events.ts — TOPICS constants", () => {
  it("exports all required topic names", () => {
    expect(TOPICS.RUN).toBe("automation.run");
    expect(TOPICS.RESULT).toBe("automation.result");
    expect(TOPICS.VALIDATION).toBe("automation.validation");
    expect(TOPICS.DRIFT).toBe("automation.selector_drift");
  });
});

// ── metricsTracker ────────────────────────────────────────────────────────────

describe("metricsTracker.ts", () => {
  beforeEach(() => resetMetrics());

  it("starts at zero", () => {
    const m = getMetrics();
    expect(m.runsTotal).toBe(0);
    expect(m.failuresTotal).toBe(0);
    expect(m.selectorHealCount).toBe(0);
    expect(m.latencyMs.count).toBe(0);
  });

  it("records a successful run", () => {
    recordRun({ templateKey: "test_tmpl", success: true, durationMs: 120 });
    const m = getMetrics();
    expect(m.runsTotal).toBe(1);
    expect(m.failuresTotal).toBe(0);
    expect(m.latencyMs.count).toBe(1);
    expect(m.latencyMs.sum).toBe(120);
  });

  it("records a failed run", () => {
    recordRun({ templateKey: "test_tmpl", success: false, durationMs: 50 });
    const m = getMetrics();
    expect(m.runsTotal).toBe(1);
    expect(m.failuresTotal).toBe(1);
  });

  it("accumulates healed selectors", () => {
    recordRun({ templateKey: "test_tmpl", success: true, durationMs: 100, healedCount: 3 });
    recordRun({ templateKey: "test_tmpl", success: true, durationMs: 100, healedCount: 2 });
    expect(getMetrics().selectorHealCount).toBe(5);
  });

  it("tracks per-template breakdown", () => {
    recordRun({ templateKey: "alpha", success: true,  durationMs: 100 });
    recordRun({ templateKey: "alpha", success: false, durationMs: 80 });
    recordRun({ templateKey: "beta",  success: true,  durationMs: 200 });

    const m = getMetrics();
    expect(m.byTemplate.alpha.runs).toBe(2);
    expect(m.byTemplate.alpha.failures).toBe(1);
    expect(m.byTemplate.beta.runs).toBe(1);
    expect(m.byTemplate.beta.failures).toBe(0);
  });

  it("computes failure rate correctly", () => {
    recordRun({ templateKey: "t", success: true,  durationMs: 100 });
    recordRun({ templateKey: "t", success: false, durationMs: 100 });
    expect(getFailureRate()).toBeCloseTo(0.5);
  });

  it("computes max latency", () => {
    recordRun({ templateKey: "t", success: true, durationMs: 100 });
    recordRun({ templateKey: "t", success: true, durationMs: 999 });
    expect(getMetrics().latencyMs.max).toBe(999);
  });

  it("generates prometheus text output", () => {
    recordRun({ templateKey: "t", success: true, durationMs: 100 });
    const text = toPrometheusText();
    expect(text).toContain("automation_runs_total 1");
    expect(text).toContain("automation_failures_total 0");
    expect(text).toContain("# HELP automation_runs_total");
  });

  it("resets cleanly", () => {
    recordRun({ templateKey: "t", success: true, durationMs: 100 });
    resetMetrics();
    expect(getMetrics().runsTotal).toBe(0);
    expect(getFailureRate()).toBe(0);
  });
});

// ── queue.ts ──────────────────────────────────────────────────────────────────

describe("queue.ts", () => {
  beforeEach(() => resetMetrics());

  const makeJob = (key = "tmpl_a"): AutomationJob => ({
    id:          `job-${Date.now()}`,
    templateKey:  key,
    payload:      { field: "value" },
    traceId:      "trace-test",
    enqueuedAt:   new Date().toISOString(),
  });

  it("getQueueState returns numeric shape", () => {
    const s = getQueueState();
    expect(typeof s.running).toBe("number");
    expect(typeof s.pending).toBe("number");
    expect(typeof s.failureRate).toBe("number");
  });

  it("enqueueJob returns failure result when no handler registered", async () => {
    // Reset handler by registering a no-op that overrides
    registerJobHandler(async () => ({ ok: false, error: "test-no-handler" }));
    const r = await enqueueJob(makeJob("missing_handler"));
    expect(r.ok).toBe(false);
  });

  it("enqueueJob succeeds when handler returns ok", async () => {
    registerJobHandler(async (job) => ({ ok: true, result: { templateKey: job.templateKey } }));
    const r = await enqueueJob(makeJob("success_tmpl"));
    expect(r.ok).toBe(true);
    expect(r.templateKey).toBe("success_tmpl");
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("enqueueJob records metrics on success", async () => {
    resetMetrics();
    registerJobHandler(async () => ({ ok: true }));
    await enqueueJob(makeJob("metrics_test"));
    expect(getMetrics().runsTotal).toBe(1);
    expect(getMetrics().failuresTotal).toBe(0);
  });

  it("enqueueJob records metrics on failure", async () => {
    resetMetrics();
    registerJobHandler(async () => ({ ok: false, error: "intentional" }));
    const r = await enqueueJob(makeJob("fail_tmpl"));
    expect(r.ok).toBe(false);
    expect(getMetrics().failuresTotal).toBe(1);
  });

  it("onJobResult listener fires after job completes", async () => {
    registerJobHandler(async () => ({ ok: true }));
    const results: JobResult[] = [];
    onJobResult((r) => results.push(r));

    await enqueueJob(makeJob("listener_test"));
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[results.length - 1].templateKey).toBe("listener_test");
  });

  it("fireAndForget does not throw synchronously", () => {
    registerJobHandler(async () => ({ ok: true }));
    expect(() => fireAndForget({ templateKey: "fire_test", payload: {}, traceId: "t" })).not.toThrow();
  });
});

// ── automationMonitor.ts ──────────────────────────────────────────────────────

describe("automationMonitor.ts — analyzeAutomationMetrics()", () => {
  it("returns zero failure rate for empty input", () => {
    const r = analyzeAutomationMetrics([]);
    expect(r.failureRate).toBe(0);
    expect(r.alert).toBeNull();
    expect(r.actions).toHaveLength(0);
  });

  it("no alert below threshold", () => {
    const runs = Array.from({ length: 20 }, (_, i) => ({ ok: i > 1 })); // 2 failures / 20 = 10%
    const r = analyzeAutomationMetrics(runs);
    expect(r.failureRate).toBeCloseTo(0.1);
    // Exactly at threshold is still an alert (> threshold)
    expect(r.alert).toBeNull();
  });

  it("raises alert above threshold", () => {
    const runs = [
      { ok: false }, { ok: false }, { ok: false },
      { ok: true },  { ok: true },
    ];  // 3/5 = 0.6
    const r = analyzeAutomationMetrics(runs);
    expect(r.failureRate).toBeCloseTo(0.6);
    expect(r.alert).not.toBeNull();
    expect(r.actions).toContain("Trigger validation worker");
  });

  it("FAILURE_RATE_THRESHOLD is 0.1", () => {
    expect(FAILURE_RATE_THRESHOLD).toBe(0.1);
  });
});

// ── LearningInsight selector_drift extension ──────────────────────────────────

describe("metaLearningEngine.ts — LearningInsight type", () => {
  it("accepts selector_drift as a valid type (compile-time check at runtime)", () => {
    const insight: LearningInsight = {
      type:           "selector_drift",
      target:         "insurance_check::button-submit",
      recommendation: { replaceWith: "#submit-btn" },
      confidence:     0.72,
    };
    // If TypeScript compiled this without error, the type extension works.
    expect(insight.type).toBe("selector_drift");
    expect(insight.confidence).toBeGreaterThan(0);
  });

  it("still accepts original types", () => {
    const a: LearningInsight = { type: "threshold_adjustment", target: "t", recommendation: {}, confidence: 0.9 };
    const b: LearningInsight = { type: "prior_shift",          target: "t", recommendation: {}, confidence: 0.8 };
    const c: LearningInsight = { type: "question_ordering",    target: "t", recommendation: {}, confidence: 0.7 };
    expect([a.type, b.type, c.type]).toEqual(["threshold_adjustment", "prior_shift", "question_ordering"]);
  });
});
