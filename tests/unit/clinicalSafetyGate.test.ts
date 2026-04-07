import { describe, it, expect } from "vitest";
import {
  clinicalSafetyGate,
  batchSafetyCheck,
  DEFAULT_SAFETY_CONFIG,
  type SafetyGateConfig,
} from "../../server/clinical/safetyGate";
import {
  InMemoryEscalationStore,
  recordDisposition,
  escalationControl,
  DEFAULT_ESCALATION_CONFIG,
} from "../../server/clinical/escalationGuard";
import { buildEscalationKey } from "../../server/clinical/escalationScope";

// ── clinicalSafetyGate boundary tests ─────────────────────────────────────────
// These tests codify the exact bugs found in the original implementation and
// verify they are fixed. Each comment explains the original failure mode.

describe("clinicalSafetyGate — input validation", () => {
  it("allows riskScore = 0 (lowest valid score)", () => {
    const r = clinicalSafetyGate({ riskScore: 0 });
    expect(r.allowed).toBe(true);
    expect(r.reason).toBeTruthy();
    expect(r.configVersion).toBe(DEFAULT_SAFETY_CONFIG.configVersion);
  });

  it("allows riskScore = 0.6 (exactly at threshold, not above)", () => {
    // > not >= — score exactly AT threshold must pass
    const r = clinicalSafetyGate({ riskScore: 0.6 });
    expect(r.allowed).toBe(true);
  });

  it("blocks riskScore = 0.6001 (just above threshold) with physician_review", () => {
    const r = clinicalSafetyGate({ riskScore: 0.6001 });
    expect(r.allowed).toBe(false);
    expect(r.requiredAction).toBe("physician_review");
  });

  it("blocks riskScore = 0.95 (exactly at hard stop) with hard_stop", () => {
    // >= comparison — boundary must be included
    const r = clinicalSafetyGate({ riskScore: 0.95 });
    expect(r.allowed).toBe(false);
    expect(r.requiredAction).toBe("hard_stop");
  });

  it("blocks riskScore = 1.0 (maximum valid score) with hard_stop", () => {
    const r = clinicalSafetyGate({ riskScore: 1.0 });
    expect(r.allowed).toBe(false);
    expect(r.requiredAction).toBe("hard_stop");
  });

  it("blocks riskScore = 1.5 (out of range) with input_error — not a clinical block", () => {
    // BUG FIXED: original checked riskScore >= 0.95 first. 1.5 >= 0.95 → hard_stop.
    // But 1.5 is an invalid score, not an extreme clinical risk. Now input_error.
    const r = clinicalSafetyGate({ riskScore: 1.5 });
    expect(r.allowed).toBe(false);
    expect(r.requiredAction).toBe("input_error");
  });

  it("blocks riskScore = -0.1 (negative) with input_error — was silently passing", () => {
    // BUG FIXED: -0.1 < 0.95 (hard stop skip), -0.1 <= 0.6 (risk threshold skip)
    // → original returned allowed:true. Now blocks as input_error.
    const r = clinicalSafetyGate({ riskScore: -0.1 });
    expect(r.allowed).toBe(false);
    expect(r.requiredAction).toBe("input_error");
  });

  it("blocks riskScore = NaN with input_error — was silently passing", () => {
    // BUG FIXED: NaN >= 0.95 → false (hard stop skipped)
    //            NaN > 0.6  → false (risk threshold skipped)
    //            NaN > 0.3  → false (uncertainty skipped)
    // → original returned allowed:true. Now blocks as input_error.
    const r = clinicalSafetyGate({ riskScore: NaN });
    expect(r.allowed).toBe(false);
    expect(r.requiredAction).toBe("input_error");
  });

  it("blocks riskScore = Infinity with input_error", () => {
    const r = clinicalSafetyGate({ riskScore: Infinity });
    expect(r.allowed).toBe(false);
    expect(r.requiredAction).toBe("input_error");
  });

  it("blocks riskScore = -Infinity with input_error", () => {
    const r = clinicalSafetyGate({ riskScore: -Infinity });
    expect(r.allowed).toBe(false);
    expect(r.requiredAction).toBe("input_error");
  });

  it("blocks invalid uncertainty (e.g. 1.5) with input_error", () => {
    const r = clinicalSafetyGate({ riskScore: 0.3, uncertainty: 1.5 });
    expect(r.allowed).toBe(false);
    expect(r.requiredAction).toBe("input_error");
  });

  it("blocks NaN uncertainty with input_error", () => {
    const r = clinicalSafetyGate({ riskScore: 0.3, uncertainty: NaN });
    expect(r.allowed).toBe(false);
    expect(r.requiredAction).toBe("input_error");
  });
});

describe("clinicalSafetyGate — uncertainty check", () => {
  it("blocks when uncertainty exceeds threshold", () => {
    const r = clinicalSafetyGate({ riskScore: 0.3, uncertainty: 0.35 });
    expect(r.allowed).toBe(false);
    expect(r.requiredAction).toBe("confidence_boost");
  });

  it("allows when uncertainty exactly at threshold (not above)", () => {
    const r = clinicalSafetyGate({ riskScore: 0.3, uncertainty: 0.3 });
    expect(r.allowed).toBe(true);
  });
});

describe("clinicalSafetyGate — fail-closed behaviour", () => {
  it("blocks when config is misconfigured (riskThreshold >= hardStopThreshold)", () => {
    // Misconfigured config — the gate should throw internally, then fail closed
    const badConfig: SafetyGateConfig = {
      riskThreshold:        0.95,  // same as hard stop — invalid
      hardStopThreshold:    0.95,
      uncertaintyThreshold: 0.3,
      configVersion:        "bad",
    };
    const r = clinicalSafetyGate({ riskScore: 0.3 }, badConfig);
    expect(r.allowed).toBe(false);
    expect(r.requiredAction).toBe("physician_review");
  });

  it("result always includes a non-empty reason string", () => {
    const cases = [0, 0.3, 0.6, 0.65, 0.95, 1.0, NaN, -1, Infinity];
    for (const riskScore of cases) {
      const r = clinicalSafetyGate({ riskScore });
      expect(r.reason).toBeTruthy();
      expect(typeof r.reason).toBe("string");
    }
  });

  it("result always includes configVersion", () => {
    const cases = [0, 0.6, 0.95, NaN, -1];
    for (const riskScore of cases) {
      const r = clinicalSafetyGate({ riskScore });
      expect(r.configVersion).toBeTruthy();
    }
  });
});

describe("clinicalSafetyGate — custom config", () => {
  it("respects custom riskThreshold", () => {
    const config: SafetyGateConfig = { ...DEFAULT_SAFETY_CONFIG, riskThreshold: 0.5 };
    expect(clinicalSafetyGate({ riskScore: 0.51 }, config).allowed).toBe(false);
    expect(clinicalSafetyGate({ riskScore: 0.49 }, config).allowed).toBe(true);
  });

  it("includes custom configVersion in all results", () => {
    const config: SafetyGateConfig = { ...DEFAULT_SAFETY_CONFIG, configVersion: "2.1.0" };
    const r = clinicalSafetyGate({ riskScore: 0.3 }, config);
    expect(r.configVersion).toBe("2.1.0");
  });
});

describe("batchSafetyCheck", () => {
  it("returns one result per input, each independently fail-closed", () => {
    const results = batchSafetyCheck([
      { riskScore: 0.3 },
      { riskScore: NaN },      // should block
      { riskScore: 0.95 },     // should hard_stop
      { riskScore: 0.2, uncertainty: 0.5 },  // should confidence_boost
    ]);
    expect(results).toHaveLength(4);
    expect(results[0].allowed).toBe(true);
    expect(results[1].requiredAction).toBe("input_error");
    expect(results[2].requiredAction).toBe("hard_stop");
    expect(results[3].requiredAction).toBe("confidence_boost");
  });
});

// ── escalationGuard boundary tests ────────────────────────────────────────────

describe("escalationControl — minimum sample size", () => {
  it("does NOT trigger adjustment when below minCasesPerWindow", async () => {
    // BUG FIXED: 1 ER / 1 total = 100% rate → original triggered immediately.
    // Now requires minCasesPerWindow samples first.
    const store = new InMemoryEscalationStore();
    await recordDisposition("ER_NOW", store);  // 1 total, 1 ER (100% rate)

    const r = await escalationControl(store, DEFAULT_ESCALATION_CONFIG);
    expect(r.adjust).toBe(false);
    expect(r.reason).toBe("insufficient_sample_size");
  });

  it("triggers when rate exceeds threshold AND enough data exists", async () => {
    const store = new InMemoryEscalationStore();
    // 60 total, 40 ER = 66.7% rate (> 40% threshold), 60 >= minCasesPerWindow(50)
    for (let i = 0; i < 60; i++) {
      await recordDisposition(i < 40 ? "ER_NOW" : "HOME", store);
    }
    const r = await escalationControl(store, DEFAULT_ESCALATION_CONFIG);
    expect(r.adjust).toBe(true);
    expect(r.reason).toBe("over_escalation_rate");
    expect(r.currentRate).toBeCloseTo(0.667, 2);
  });

  it("triggers hourly cap even without enough rate-data", async () => {
    const store = new InMemoryEscalationStore();
    // 500 total, 121 ER = 24.2% rate (< 40% threshold), but cap is 120
    for (let i = 0; i < 500; i++) {
      await recordDisposition(i < 121 ? "ER_NOW" : "HOME", store);
    }
    const r = await escalationControl(store, DEFAULT_ESCALATION_CONFIG);
    expect(r.adjust).toBe(true);
    expect(r.reason).toBe("hourly_er_cap_exceeded");
    expect(r.hourlyErCount).toBe(121);
  });

  it("returns rate_and_cap_exceeded when both triggered", async () => {
    const store = new InMemoryEscalationStore();
    // 200 total, 130 ER = 65% rate (> 40% threshold) AND 130 > 120 hourly cap
    for (let i = 0; i < 200; i++) {
      await recordDisposition(i < 130 ? "ER_NOW" : "HOME", store);
    }
    const r = await escalationControl(store, DEFAULT_ESCALATION_CONFIG);
    expect(r.adjust).toBe(true);
    expect(r.reason).toBe("rate_and_cap_exceeded");
    expect(r.hourlyErCount).toBe(130);
  });

  it("resets correctly and returns normal after reset", async () => {
    const store = new InMemoryEscalationStore();
    for (let i = 0; i < 80; i++) await recordDisposition("ER_NOW", store);
    await store.reset();
    const r = await escalationControl(store, DEFAULT_ESCALATION_CONFIG);
    expect(r.adjust).toBe(false);
    expect(r.totalCount).toBe(0);
  });
});

describe("escalationControl — probabilityDelta naming", () => {
  it("returns probabilityDelta (not just factor) in adjustment result", async () => {
    const store = new InMemoryEscalationStore();
    for (let i = 0; i < 60; i++) await recordDisposition(i < 50 ? "ER_NOW" : "HOME", store);
    const r = await escalationControl(store);
    if (r.adjust) {
      expect(typeof r.probabilityDelta).toBe("number");
      expect(r.probabilityDelta).toBe(r.factor);  // backward compat alias
    }
  });

  it("returns totalCount in result for debugging", async () => {
    const store = new InMemoryEscalationStore();
    for (let i = 0; i < 60; i++) await recordDisposition("HOME", store);
    const r = await escalationControl(store);
    expect(r.totalCount).toBe(60);
  });
});

describe("escalationScope — key isolation", () => {
  it("builds different keys for different tenants", () => {
    const keyA = buildEscalationKey({ tenantId: "clinic-a" }, "total");
    const keyB = buildEscalationKey({ tenantId: "clinic-b" }, "total");
    expect(keyA).not.toBe(keyB);
  });

  it("builds different keys for different complaints within same tenant", () => {
    const keyFlu    = buildEscalationKey({ tenantId: "t1", complaint: "flu" }, "er");
    const keyChest  = buildEscalationKey({ tenantId: "t1", complaint: "chest_pain" }, "er");
    expect(keyFlu).not.toBe(keyChest);
  });

  it("defaults unspecified segments to all-* sentinels", () => {
    const key = buildEscalationKey({ tenantId: "t1" }, "total");
    expect(key).toContain("all-clinics");
    expect(key).toContain("all-models");
    expect(key).toContain("all-complaints");
  });
});
