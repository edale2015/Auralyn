import { describe, it, expect } from "vitest";

// ─── 1. Dependency Wave ───────────────────────────────────────────────────────
import { runDependencyWave } from "../../server/agents/dependencyWave";

describe("Batch44e — dependencyWave", () => {
  it("runs independent tasks in wave 1", async () => {
    const result = await runDependencyWave([
      { name: "a", execute: async () => 1 },
      { name: "b", execute: async () => 2 },
    ]);
    expect(result.tasks.a.result).toBe(1);
    expect(result.tasks.b.result).toBe(2);
    expect(result.tasks.a.wave).toBe(1);
    expect(result.tasks.b.wave).toBe(1);
  });

  it("runs dependent tasks in later waves", async () => {
    const result = await runDependencyWave([
      { name: "scoring",   execute: async ()             => ({ NEWS2: 6 }) },
      { name: "diagnosis", deps: ["scoring"],
        execute: async ({ completed }) => ({ dx: "sepsis", news2: completed.scoring?.NEWS2 }) },
      { name: "disp",      deps: ["diagnosis"],
        execute: async ({ completed }) => ({ disposition: completed.diagnosis?.news2 >= 5 ? "ED" : "HOME" }) },
    ]);
    expect(result.tasks.scoring.wave).toBe(1);
    expect(result.tasks.diagnosis.wave).toBe(2);
    expect(result.tasks.disp.wave).toBe(3);
    expect(result.tasks.disp.result?.disposition).toBe("ED");
    expect(result.waves).toBe(3);
  });

  it("passes completed results to dependent tasks", async () => {
    const result = await runDependencyWave([
      { name: "score", execute: async () => ({ value: 42 }) },
      { name: "use",   deps: ["score"],
        execute: async ({ completed }) => completed.score?.value * 2 },
    ]);
    expect(result.tasks.use.result).toBe(84);
  });

  it("captures errors per-task without crashing the wave", async () => {
    const result = await runDependencyWave([
      { name: "ok",   execute: async () => "done" },
      { name: "fail", execute: async () => { throw new Error("task error"); } },
    ]);
    expect(result.tasks.ok.status).toBe("success");
    expect(result.tasks.fail.status).toBe("error");
    expect(result.tasks.fail.error).toContain("task error");
    expect(result.allPassed).toBe(false);
  });

  it("throws on unknown dependency name", async () => {
    await expect(
      runDependencyWave([{ name: "x", deps: ["nonexistent"], execute: async () => null }])
    ).rejects.toThrow('unknown task');
  });

  it("waveRunId and durationMs are present", async () => {
    const result = await runDependencyWave([{ name: "t", execute: async () => null }]);
    expect(result.waveRunId).toMatch(/[0-9a-f-]{36}/);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

// ─── 2. Goal Verifier ─────────────────────────────────────────────────────────
import { verifyGoals } from "../../server/agents/goalVerifier";

describe("Batch44e — goalVerifier", () => {
  const safeCtx = {
    patient:     { id: "p-001" },
    scores:      { NEWS2: 2, qSOFA: 0 },
    sepsisRisk:  { highRisk: false, probability: 0.10 },
    icuProb:     0.05,
    disposition: "HOME",
    gatesPassed: true,
  };

  it("returns safe=true for low-risk HOME disposition", () => {
    const r = verifyGoals(safeCtx);
    expect(r.safe).toBe(true);
    expect(r.allPassed).toBe(true);
    expect(r.failCount).toBe(0);
  });

  it("fails when NEWS2 ≥ 7 and disposition is not ICU", () => {
    const r = verifyGoals({ ...safeCtx, scores: { NEWS2: 8 }, disposition: "HOME" });
    const inv = r.invariants.find((i) => i.name === "news2_disposition_consistency");
    expect(inv?.result.status).toBe("FAIL");
    expect(r.allPassed).toBe(false);
  });

  it("fails when NEWS2 ≥ 5 and disposition is HOME", () => {
    const r = verifyGoals({ ...safeCtx, scores: { NEWS2: 6 }, disposition: "HOME" });
    expect(r.allPassed).toBe(false);
  });

  it("fails when sepsis is high-risk and disposition is HOME", () => {
    const r = verifyGoals({ ...safeCtx, sepsisRisk: { highRisk: true, probability: 0.75 }, disposition: "HOME" });
    const inv = r.invariants.find((i) => i.name === "sepsis_escalation");
    expect(inv?.result.status).toBe("FAIL");
  });

  it("warns when ICU probability is >60% and disposition is HOME", () => {
    const r = verifyGoals({ ...safeCtx, icuProb: 0.65, disposition: "HOME" });
    const inv = r.invariants.find((i) => i.name === "icu_probability_check");
    expect(inv?.result.status).toBe("WARN");
    expect(r.warnCount).toBeGreaterThan(0);
  });

  it("fails when gates did not pass", () => {
    const r = verifyGoals({ ...safeCtx, gatesPassed: false });
    const inv = r.invariants.find((i) => i.name === "safety_gates_passed");
    expect(inv?.result.status).toBe("FAIL");
    expect(r.safe).toBe(false);
  });

  it("fails when no scores present", () => {
    const r = verifyGoals({ ...safeCtx, scores: {}, disposition: "HOME" });
    const inv = r.invariants.find((i) => i.name === "scores_present");
    expect(inv?.result.status).toBe("FAIL");
  });

  it("recommendation mentions UNSAFE when failures exist", () => {
    const r = verifyGoals({ ...safeCtx, gatesPassed: false });
    expect(r.recommendation).toContain("UNSAFE");
  });

  it("recommendation says SAFE when all pass", () => {
    const r = verifyGoals(safeCtx);
    expect(r.recommendation).toContain("SAFE");
  });

  it("all 7 invariants are present", () => {
    const r = verifyGoals(safeCtx);
    expect(r.invariants).toHaveLength(7);
  });
});

// ─── 3. Acuity Router ────────────────────────────────────────────────────────
import { routeAcuity } from "../../server/triage/acuityRouter";

describe("Batch44e — acuityRouter", () => {
  it("ESI 1 for GCS ≤ 8", () => {
    const r = routeAcuity({ vitals: { gcs: 7, hr: 90, spo2: 96, systolicBP: 115 } });
    expect(r.esiLevel).toBe(1);
    expect(r.workup).toBe("FULL");
    expect(r.engines).toContain("specialist_council");
  });

  it("ESI 1 for cardiac arrest complaint", () => {
    const r = routeAcuity({ chiefComplaint: "patient in cardiac arrest" });
    expect(r.esiLevel).toBe(1);
    expect(r.label).toBe("IMMEDIATE");
  });

  it("ESI 2 for hypotension (SBP < 90)", () => {
    const r = routeAcuity({ vitals: { systolicBP: 82, hr: 105, spo2: 96 } });
    expect(r.esiLevel).toBe(2);
    expect(r.engines).toContain("digital_twin");
    expect(r.fastTrack).toBe(false);
  });

  it("ESI 2 for chest pain complaint", () => {
    const r = routeAcuity({ chiefComplaint: "severe chest pain", pain: 9 });
    expect(r.esiLevel).toBe(2);
  });

  it("ESI 3 for mild tachycardia (HR > 100)", () => {
    const r = routeAcuity({ vitals: { hr: 105, spo2: 97, systolicBP: 120 } });
    expect(r.esiLevel).toBe(3);
    expect(r.workup).toBe("STANDARD");
    expect(r.engines).toContain("sepsis");
    expect(r.engines).not.toContain("digital_twin");
  });

  it("ESI 3 for pediatric patient", () => {
    const r = routeAcuity({ pediatric: true, pain: 3, vitals: { hr: 90, spo2: 98 } });
    expect(r.esiLevel).toBe(3);
  });

  it("ESI 4 for sore throat + low pain", () => {
    const r = routeAcuity({ chiefComplaint: "sore throat", pain: 2, vitals: { hr: 78, spo2: 99, systolicBP: 120 } });
    expect(r.esiLevel).toBe(4);
    expect(r.workup).toBe("LIGHTWEIGHT");
    expect(r.engines).toEqual(["scoring"]);
    expect(r.fastTrack).toBe(true);
  });

  it("ESI 5 for non-urgent complaint + minimal pain", () => {
    const r = routeAcuity({ chiefComplaint: "prescription refill", pain: 0 });
    expect(r.esiLevel).toBe(5);
    expect(r.workup).toBe("MINIMAL");
  });

  it("all decisions include targetTime and rationale", () => {
    const r = routeAcuity({ chiefComplaint: "chest pain", pain: 8 });
    expect(typeof r.targetTime).toBe("string");
    expect(r.rationale.length).toBeGreaterThan(0);
  });
});

// ─── 4. Delta Tracker ────────────────────────────────────────────────────────
import {
  trackAdded, trackModified, trackRemoved,
  getDeltas, getDeltaById, verifyDelta, getDeltaSummary,
} from "../../server/audit/deltaTracker";

describe("Batch44e — deltaTracker", () => {
  it("tracks an ADDED delta with hash", () => {
    const d = trackAdded({
      entityType: "kb_rule",
      entityId:   "R100",
      after:      { whenExpr: "input.scores.NEWS2 >= 7", dispositionLevel: "ICU" },
      reason:     "Added ICU rule based on NEWS2 study",
      author:     "dr.smith",
    });
    expect(d.changeType).toBe("ADDED");
    expect(d.deltaId).toContain("DELTA-ADD");
    expect(d.changeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(d.before).toBeUndefined();
    expect(d.after).toBeDefined();
  });

  it("tracks a MODIFIED delta with diff", () => {
    const d = trackModified({
      entityType: "disposition_rule",
      entityId:   "R002",
      before:     { dispositionLevel: "URGENT_CARE" },
      after:      { dispositionLevel: "ED" },
      reason:     "Evidence shows NEWS2≥5 needs ED not URGENT_CARE",
      author:     "dr.jones",
    });
    expect(d.changeType).toBe("MODIFIED");
    expect(d.diff).toContain("dispositionLevel");
    expect(d.before.dispositionLevel).toBe("URGENT_CARE");
    expect(d.after.dispositionLevel).toBe("ED");
  });

  it("tracks a REMOVED delta", () => {
    const d = trackRemoved({
      entityType: "safety_gate",
      entityId:   "GATE_OLD",
      before:     { rule: "deprecated rule" },
      reason:     "Superseded by updated protocol",
      author:     "dr.chen",
    });
    expect(d.changeType).toBe("REMOVED");
    expect(d.after).toBeUndefined();
  });

  it("verifyDelta returns valid for unmodified record", () => {
    const d = trackAdded({
      entityType: "kb_rule", entityId: "R200",
      after: { x: 1 }, reason: "test", author: "sys",
    });
    expect(verifyDelta(d).valid).toBe(true);
  });

  it("verifyDelta detects tampered record", () => {
    const d = trackAdded({
      entityType: "kb_rule", entityId: "R201",
      after: { x: 1 }, reason: "test", author: "sys",
    });
    const tampered = { ...d, reason: "hacked reason" };
    expect(verifyDelta(tampered).valid).toBe(false);
  });

  it("getDeltas can filter by entityType", () => {
    const before = getDeltas({ entityType: "kb_rule" }).length;
    trackAdded({ entityType: "kb_rule", entityId: "RFILT", after: {}, reason: "filter test", author: "sys" });
    const after = getDeltas({ entityType: "kb_rule" }).length;
    expect(after).toBeGreaterThan(before);
  });

  it("getDeltaSummary returns correct counts", () => {
    const summary = getDeltaSummary();
    expect(summary.total).toBeGreaterThan(0);
    expect(typeof summary.added).toBe("number");
    expect(typeof summary.modified).toBe("number");
    expect(typeof summary.removed).toBe("number");
    expect(Array.isArray(summary.entities)).toBe(true);
  });

  it("getDeltaById returns the correct record", () => {
    const d  = trackAdded({ entityType: "protocol", entityId: "P1", after: {}, reason: "test", author: "sys" });
    const found = getDeltaById(d.deltaId);
    expect(found?.deltaId).toBe(d.deltaId);
  });
});
