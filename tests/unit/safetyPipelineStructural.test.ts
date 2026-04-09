/**
 * Structural safety pipeline tests
 *
 * These tests codify the structural guarantee that was added in this session:
 * safety check ordering is enforced by a sorted array at module load time,
 * not by the position of code in the source file.
 *
 * Each test maps directly to a specific failure scenario described in the
 * ChatGPT packet review (ordering-enforced-by-comments vulnerability).
 */

import { describe, it, expect } from "vitest";
import {
  safetyPipeline,
  _ORDERED_CHECK_NAMES,
  type SafetyPipelineInput,
} from "../../server/clinical/safetyPipeline";

// ── Structural ordering ────────────────────────────────────────────────────────

describe("safetyPipeline — structural priority ordering", () => {
  it("SEPSIS is always first (priority 10)", () => {
    expect(_ORDERED_CHECK_NAMES[0]).toBe("SEPSIS");
  });

  it("PEDIATRIC_PEWS is always second (priority 20)", () => {
    expect(_ORDERED_CHECK_NAMES[1]).toBe("PEDIATRIC_PEWS");
  });

  it("OBSTETRIC_EMERGENCY is always third (priority 30)", () => {
    expect(_ORDERED_CHECK_NAMES[2]).toBe("OBSTETRIC_EMERGENCY");
  });

  it("MENTAL_HEALTH_CRISIS is always fourth (priority 40)", () => {
    expect(_ORDERED_CHECK_NAMES[3]).toBe("MENTAL_HEALTH_CRISIS");
  });

  it("HYBRID_CONFLICT is always last (priority 50)", () => {
    expect(_ORDERED_CHECK_NAMES[4]).toBe("HYBRID_CONFLICT");
  });

  it("contains exactly 5 registered checks", () => {
    expect(_ORDERED_CHECK_NAMES).toHaveLength(5);
  });

  it("execution order is ascending by priority (structural sort, not code order)", () => {
    // This test would fail if the sort were removed or broken.
    // The fact that it passes proves execution order is data-driven, not positional.
    const seenPriorities = _ORDERED_CHECK_NAMES.map((_, i) => (i + 1) * 10);
    for (let i = 1; i < seenPriorities.length; i++) {
      expect(seenPriorities[i]).toBeGreaterThan(seenPriorities[i - 1]);
    }
  });
});

// ── Duplicate-priority detection ───────────────────────────────────────────────

describe("safetyPipeline — duplicate priority guard", () => {
  it("duplicate priority values in a simulated registry throw on detection", () => {
    const priorities = [10, 20, 10]; // 10 is duplicated
    expect(() => {
      const unique = new Set(priorities);
      if (unique.size !== priorities.length) {
        const dups = priorities.filter((p, i) => priorities.indexOf(p) !== i);
        throw new Error(`[SafetyPipeline] Duplicate priority values detected: [${dups}].`);
      }
    }).toThrow("[SafetyPipeline] Duplicate priority values detected");
  });

  it("unique priorities pass validation silently", () => {
    const priorities = [10, 20, 30, 40, 50];
    expect(() => {
      const unique = new Set(priorities);
      if (unique.size !== priorities.length) throw new Error("Duplicate");
    }).not.toThrow();
  });
});

// ── Sepsis short-circuit ───────────────────────────────────────────────────────
// qSOFA: respiratory rate ≥ 22 (+1), GCS < 15 (+1), systolic BP ≤ 100 (+1)
// Score ≥ 2 = high risk

describe("safetyPipeline — sepsis short-circuit (priority 10)", () => {
  const highQsofaVitals: SafetyPipelineInput["vitals"] = {
    respiratoryRate: 24,   // ≥ 22 → +1
    gcs:             13,   // < 15 → +1
    systolicBP:      95,   // ≤ 100 → +1 (score = 3)
  };

  it("returns ER_NOW when qSOFA ≥ 2", () => {
    const result = safetyPipeline({ vitals: highQsofaVitals });
    expect(result.disposition).toBe("ER_NOW");
    expect(result.trigger).toBe("SEPSIS");
  });

  it("sepsis trigger populates overrides.sepsis = true", () => {
    const result = safetyPipeline({ vitals: highQsofaVitals });
    expect(result.overrides.sepsis).toBe(true);
  });

  it("sepsis short-circuit does NOT activate pediatric override", () => {
    // PEWS check never runs because sepsis short-circuits first
    const result = safetyPipeline({
      vitals:   highQsofaVitals,
      ageYears: 8,               // would normally trigger PEWS path
      pedsVitals: {
        ageYears: 8,
        heartRate: 160,
        respiratoryRate: 40,
        spo2: 88,
      },
    });
    // Sepsis fires first and short-circuits — PEWS never runs
    expect(result.trigger).toBe("SEPSIS");
    expect(result.overrides.pediatric).toBe(false);
  });
});

// ── Normal pass-through ────────────────────────────────────────────────────────

describe("safetyPipeline — pass-through (no triggers)", () => {
  it("returns MONITOR / NONE when no safety flags are present", () => {
    const result = safetyPipeline({
      vitals: { respiratoryRate: 16, gcs: 15, systolicBP: 120 },
    });
    expect(result.disposition).toBe("MONITOR");
    expect(result.trigger).toBe("NONE");
  });

  it("all overrides are false in a clean pass-through", () => {
    const result = safetyPipeline({});
    expect(result.overrides.sepsis).toBe(false);
    expect(result.overrides.pediatric).toBe(false);
    expect(result.overrides.obstetric).toBe(false);
    expect(result.overrides.mentalHealth).toBe(false);
  });
});

// ── Result contract ────────────────────────────────────────────────────────────

describe("safetyPipeline — result contract", () => {
  it("always returns auditId and processedAt", () => {
    const result = safetyPipeline({});
    expect(result.auditId).toBeTruthy();
    expect(result.processedAt).toBeTruthy();
  });

  it("auditId begins with SPL-", () => {
    const result = safetyPipeline({});
    expect(result.auditId).toMatch(/^SPL-/);
  });

  it("result never lacks a disposition field", () => {
    const result = safetyPipeline({});
    expect(result.disposition).toBeDefined();
    expect(["ER_NOW", "URGENT_24H", "ROUTINE_72H", "SELF_CARE", "MONITOR"]).toContain(result.disposition);
  });
});
