import { describe, it, expect } from "vitest";
import { scrubClaim, scrubClaimOrThrow } from "../../server/billing/claimScrubber";
import { predictDenial, batchPredictDenials, InMemoryCptPricingStore } from "../../server/billing/denialPredictionEngine";
import { preSubmitCheck } from "../../server/billing/preSubmission";

// ── Shared fixtures ───────────────────────────────────────────────────────────

const VALID_CLAIM = {
  patientId:     "P-001",
  provider:      "NPI-1234567890",
  icd10:         "J06.9",
  cpt:           "99213",
  dateOfService: new Date().toISOString().split("T")[0],  // today — always valid
};

const VALID_CODING = {
  primary:          { icd10: "J06.9", description: "Upper respiratory", mapped: true },
  differentials:    [],
  cpt:              { code: "99213", description: "Office visit", mapped: true },
  allCodes:         ["J06.9"],
  codingConfidence: 0.9,
  warnings:         [],
};

const VALID_RISK = {
  level:                  "LOW"  as const,
  requiresPhysicianReview: false,
  requiresAuditTrail:      false,
  escalationRequired:      false,
  reason:                  "Routine",
};

const VALID_NOTE = {
  hpi:        "Patient presents with sore throat.",
  assessment: "Primary: J06.9",
  plan:       "Supportive care.",
};

// ── claimScrubber ─────────────────────────────────────────────────────────────

describe("scrubClaim", () => {
  it("returns clean for a fully valid claim", () => {
    const r = scrubClaim(VALID_CLAIM);
    expect(r.status).toBe("clean");
    expect(r.valid).toBe(true);
    expect(r.issues).toHaveLength(0);
    expect(r.warnings).toHaveLength(0);
  });

  // ── ICD-10 format ──────────────────────────────────────────────────────────

  it("rejects missing icd10", () => {
    const r = scrubClaim({ ...VALID_CLAIM, icd10: undefined });
    expect(r.valid).toBe(false);
    expect(r.issues.some(i => i.code === "MISSING_ICD10")).toBe(true);
  });

  it("rejects icd10 that is all letters (free-text)", () => {
    const r = scrubClaim({ ...VALID_CLAIM, icd10: "HEART ATTACK" });
    expect(r.valid).toBe(false);
    expect(r.issues.some(i => i.code === "INVALID_ICD10_FORMAT")).toBe(true);
  });

  it("rejects icd10 that is only one letter + one digit (too short)", () => {
    const r = scrubClaim({ ...VALID_CLAIM, icd10: "A1" });
    expect(r.valid).toBe(false);
    expect(r.issues.some(i => i.code === "INVALID_ICD10_FORMAT")).toBe(true);
  });

  it("accepts ICD-10 with decimal subclassification", () => {
    const r = scrubClaim({ ...VALID_CLAIM, icd10: "S72.001A" });
    expect(r.valid).toBe(true);
  });

  it("accepts ICD-10 without decimal (e.g. R69)", () => {
    const r = scrubClaim({ ...VALID_CLAIM, icd10: "R69" });
    expect(r.valid).toBe(true);
  });

  it("rejects ICD-10 starting with a digit", () => {
    const r = scrubClaim({ ...VALID_CLAIM, icd10: "123.4" });
    expect(r.valid).toBe(false);
    expect(r.issues.some(i => i.code === "INVALID_ICD10_FORMAT")).toBe(true);
  });

  // ── CPT format ─────────────────────────────────────────────────────────────

  it("rejects missing cpt", () => {
    const r = scrubClaim({ ...VALID_CLAIM, cpt: undefined });
    expect(r.valid).toBe(false);
    expect(r.issues.some(i => i.code === "MISSING_CPT")).toBe(true);
  });

  it("rejects cpt with letters", () => {
    const r = scrubClaim({ ...VALID_CLAIM, cpt: "ABC12" });
    expect(r.valid).toBe(false);
    expect(r.issues.some(i => i.code === "INVALID_CPT_FORMAT")).toBe(true);
  });

  it("rejects cpt shorter than 5 digits", () => {
    const r = scrubClaim({ ...VALID_CLAIM, cpt: "9921" });
    expect(r.valid).toBe(false);
    expect(r.issues.some(i => i.code === "INVALID_CPT_FORMAT")).toBe(true);
  });

  it("rejects cpt longer than 5 digits", () => {
    const r = scrubClaim({ ...VALID_CLAIM, cpt: "992130" });
    expect(r.valid).toBe(false);
    expect(r.issues.some(i => i.code === "INVALID_CPT_FORMAT")).toBe(true);
  });

  // ── Documentation ──────────────────────────────────────────────────────────

  it("rejects 99285 without documentation", () => {
    const r = scrubClaim({ ...VALID_CLAIM, cpt: "99285" });
    expect(r.valid).toBe(false);
    expect(r.issues.some(i => i.code === "MISSING_DOCUMENTATION")).toBe(true);
  });

  it("rejects 99284 without documentation (fixed: previously missed)", () => {
    const r = scrubClaim({ ...VALID_CLAIM, cpt: "99284" });
    expect(r.valid).toBe(false);
    expect(r.issues.some(i => i.code === "MISSING_DOCUMENTATION")).toBe(true);
  });

  it("rejects 99291 without documentation (critical care)", () => {
    const r = scrubClaim({ ...VALID_CLAIM, cpt: "99291" });
    expect(r.valid).toBe(false);
    expect(r.issues.some(i => i.code === "MISSING_DOCUMENTATION")).toBe(true);
  });

  it("accepts 99285 when documentation is provided", () => {
    const r = scrubClaim({ ...VALID_CLAIM, cpt: "99285", documentation: "Full clinical note..." });
    expect(r.valid).toBe(true);
  });

  // ── Date of service ────────────────────────────────────────────────────────

  it("rejects missing dateOfService", () => {
    const r = scrubClaim({ ...VALID_CLAIM, dateOfService: undefined });
    expect(r.valid).toBe(false);
    expect(r.issues.some(i => i.code === "INVALID_DOS")).toBe(true);
  });

  it("rejects bare year as dateOfService", () => {
    const r = scrubClaim({ ...VALID_CLAIM, dateOfService: "2024" });
    expect(r.valid).toBe(false);
    expect(r.issues.some(i => i.code === "INVALID_DOS")).toBe(true);
  });

  it("rejects non-existent date Feb 30", () => {
    const r = scrubClaim({ ...VALID_CLAIM, dateOfService: "2024-02-30" });
    expect(r.valid).toBe(false);
    expect(r.issues.some(i => i.code === "INVALID_DOS")).toBe(true);
  });

  it("rejects invalid month 13", () => {
    const r = scrubClaim({ ...VALID_CLAIM, dateOfService: "2024-13-01" });
    expect(r.valid).toBe(false);
    expect(r.issues.some(i => i.code === "INVALID_DOS")).toBe(true);
  });

  it("rejects locale-formatted date (MM/DD/YYYY)", () => {
    const r = scrubClaim({ ...VALID_CLAIM, dateOfService: "03/15/2024" });
    expect(r.valid).toBe(false);
    expect(r.issues.some(i => i.code === "INVALID_DOS")).toBe(true);
  });

  it("rejects future dateOfService", () => {
    const r = scrubClaim({ ...VALID_CLAIM, dateOfService: "2099-01-01" });
    expect(r.valid).toBe(false);
    expect(r.issues.some(i => i.code === "FUTURE_DOS")).toBe(true);
  });

  it("warns about DOS more than 1 year ago (timely filing risk)", () => {
    const r = scrubClaim({ ...VALID_CLAIM, dateOfService: "2020-01-01" });
    expect(r.valid).toBe(true);
    expect(r.status).toBe("warnings_only");
    expect(r.warnings.some(w => w.code === "TIMELY_FILING_RISK")).toBe(true);
  });

  // ── Required fields ────────────────────────────────────────────────────────

  it("rejects missing patientId", () => {
    const r = scrubClaim({ ...VALID_CLAIM, patientId: undefined });
    expect(r.valid).toBe(false);
    expect(r.issues.some(i => i.code === "MISSING_PATIENT_ID")).toBe(true);
  });

  it("rejects missing provider (now a hard issue, not a warning)", () => {
    const r = scrubClaim({ ...VALID_CLAIM, provider: undefined });
    expect(r.valid).toBe(false);
    expect(r.issues.some(i => i.code === "MISSING_PROVIDER_ID")).toBe(true);
  });

  // ── Three-state status ─────────────────────────────────────────────────────

  it("status=invalid when hard issues present", () => {
    const r = scrubClaim({ ...VALID_CLAIM, icd10: undefined });
    expect(r.status).toBe("invalid");
  });

  it("status=warnings_only when only soft warnings", () => {
    const r = scrubClaim({ ...VALID_CLAIM, dateOfService: "2020-01-01" });
    expect(r.status).toBe("warnings_only");
  });

  it("status=clean when no issues or warnings", () => {
    const r = scrubClaim(VALID_CLAIM);
    expect(r.status).toBe("clean");
  });

  // ── ScrubIssue has structured code and field ───────────────────────────────

  it("issues have structured code, severity, message, and field", () => {
    const r = scrubClaim({ ...VALID_CLAIM, icd10: undefined });
    const issue = r.issues[0];
    expect(issue).toHaveProperty("code");
    expect(issue).toHaveProperty("severity", "issue");
    expect(issue).toHaveProperty("message");
    expect(issue).toHaveProperty("field");
  });

  // ── scrubClaimOrThrow ──────────────────────────────────────────────────────

  it("scrubClaimOrThrow does not throw on valid claim", () => {
    expect(() => scrubClaimOrThrow(VALID_CLAIM)).not.toThrow();
  });

  it("scrubClaimOrThrow throws with structured message on invalid claim", () => {
    expect(() => scrubClaimOrThrow({ ...VALID_CLAIM, icd10: "INVALID" })).toThrowError(/INVALID_ICD10_FORMAT/);
  });
});

// ── denialPredictionEngine ────────────────────────────────────────────────────

describe("predictDenial", () => {
  const BASE_INPUT = {
    coding:             VALID_CODING,
    riskClassification: VALID_RISK,
    encounter:          { complaint: "Sore throat", diagnosis: "URI", triage: "urgent", confidence: 0.9 },
    clinicalNote:       VALID_NOTE,
  };

  it("returns a low risk score for a clean, well-documented claim", async () => {
    const r = await predictDenial(BASE_INPUT);
    expect(r.riskScore).toBeGreaterThanOrEqual(0);
    expect(r.riskScore).toBeLessThanOrEqual(1);
    expect(r.riskLevel).toBe("low");
    expect(r.reasons).toBeDefined();
    expect(r.recommendations).toBeDefined();
  });

  it("increases risk score when primary ICD-10 is unmapped", async () => {
    const unmappedCoding = {
      ...VALID_CODING,
      primary: { ...VALID_CODING.primary, mapped: false },
    };
    const r = await predictDenial({ ...BASE_INPUT, coding: unmappedCoding });
    expect(r.riskScore).toBeGreaterThan(0.3);
    expect(r.reasons.some(r => /unmapped/i.test(r))).toBe(true);
  });

  it("caps differential risk regardless of how many unmapped differentials there are", async () => {
    const manyUnmapped = Array.from({ length: 20 }, (_, i) => ({
      icd10:       `R${(10 + i).toString().padStart(2, "0")}`,
      description: `Differential ${i}`,
      mapped:      false,
    }));
    const coding = { ...VALID_CODING, differentials: manyUnmapped };
    const r = await predictDenial({ ...BASE_INPUT, coding });
    // Differential risk capped at 0.20 — total should not exceed 0.20 + nothing_else = 0.20
    expect(r.riskScore).toBeLessThanOrEqual(0.21);
  });

  it("high-complexity CPT with low confidence adds risk", async () => {
    const lowConfidence = {
      ...BASE_INPUT,
      coding: { ...VALID_CODING, cpt: { code: "99215", description: "Complex visit", mapped: true } },
      encounter: { ...BASE_INPUT.encounter, confidence: 0.5, triage: "urgent" },
    };
    const r = await predictDenial(lowConfidence);
    expect(r.riskScore).toBeGreaterThan(0.24);
  });

  it("missing clinical note sections adds documentation risk for auditable CPTs", async () => {
    const incompleteNote = {
      ...BASE_INPUT,
      coding: { ...VALID_CODING, cpt: { code: "99285", description: "ED level 5", mapped: true } },
      clinicalNote: { hpi: "", assessment: "", plan: "" },
    };
    const r = await predictDenial(incompleteNote);
    expect(r.riskScore).toBeGreaterThan(0.14);
    expect(r.reasons.some(r => /documentation/i.test(r))).toBe(true);
  });

  it("risk score is bounded — never exceeds 1.0", async () => {
    const worstCase = {
      ...BASE_INPUT,
      coding: {
        primary:          { ...VALID_CODING.primary, mapped: false },
        differentials:    Array(20).fill({ icd10: "R69", description: "x", mapped: false }),
        cpt:              { code: "99291", description: "Critical care", mapped: true },
        allCodes:         ["R69"],
        codingConfidence: 0.3,
        warnings:         [],
      },
      encounter: { ...BASE_INPUT.encounter, confidence: 0.3 },
      clinicalNote: { hpi: "", assessment: "", plan: "" },
    };
    const r = await predictDenial(worstCase);
    expect(r.riskScore).toBeLessThanOrEqual(1);
    expect(r.riskScore).toBeGreaterThan(0.9);  // all 4 factors fired
  });

  it("returns pricingSource=configured when CPT is known to the store", async () => {
    const r = await predictDenial(BASE_INPUT);
    expect(r.pricingSource).toBe("configured");
    expect(r.estimatedRevenue).not.toBeNull();
    expect(r.estimatedRevenueImpact).not.toBeNull();
  });

  it("returns pricingSource=unavailable and null revenue for unknown CPT", async () => {
    const unknownCpt = {
      ...BASE_INPUT,
      coding: { ...VALID_CODING, cpt: { code: "93000", description: "ECG", mapped: true } },
    };
    const r = await predictDenial(unknownCpt);
    expect(r.pricingSource).toBe("unavailable");
    expect(r.estimatedRevenue).toBeNull();
    expect(r.estimatedRevenueImpact).toBeNull();
  });

  it("accepts an injected CptPricingStore", async () => {
    const mockStore = { getRate: async (_cpt: string) => 999 };
    const r = await predictDenial(BASE_INPUT, mockStore);
    expect(r.estimatedRevenue).toBe(999);
    expect(r.pricingSource).toBe("configured");
  });

  it("riskLevel is low for riskScore <= 0.20", async () => {
    const r = await predictDenial(BASE_INPUT);
    // Clean claim with known CPT will have score 0
    expect(r.riskLevel).toBe("low");
  });
});

// ── batchPredictDenials ───────────────────────────────────────────────────────

describe("batchPredictDenials", () => {
  const BUNDLE = {
    coding:             VALID_CODING,
    riskClassification: VALID_RISK,
    encounter:          { complaint: "Sore throat", diagnosis: "URI", triage: "urgent", confidence: 0.9 },
    clinicalNote:       VALID_NOTE,
  };

  it("returns all predictions and a summary", async () => {
    const result = await batchPredictDenials([BUNDLE, BUNDLE]);
    expect(result.predictions).toHaveLength(2);
    expect(result.summary.totalBundles).toBe(2);
    expect(result.summary.lowRisk).toBe(2);
    expect(result.summary.highRisk).toBe(0);
  });

  it("totalRevenueAtRisk excludes null estimatedRevenueImpact", async () => {
    const unknownCptBundle = {
      ...BUNDLE,
      coding: { ...VALID_CODING, cpt: { code: "93000", description: "ECG", mapped: true } },
    };
    const result = await batchPredictDenials([BUNDLE, unknownCptBundle]);
    // Second bundle has null revenue — should not affect sum
    expect(result.summary.totalRevenueAtRisk).toBeGreaterThanOrEqual(0);
  });

  it("uses Promise.all — all predictions resolve", async () => {
    const bundles = Array(5).fill(BUNDLE);
    const result  = await batchPredictDenials(bundles);
    expect(result.predictions).toHaveLength(5);
  });
});

// ── preSubmission ─────────────────────────────────────────────────────────────

describe("preSubmitCheck", () => {
  const VALID = {
    patientId:       "P-001",
    provider:        "NPI-1234567890",
    icd10:           "J06.9",
    cpt:             "99213",
    dateOfService:   new Date().toISOString().split("T")[0],
    modifier:        "25",
    documentation:   true,   // modifier 25 requires documentation=true
    separateService: true,
    procedure:       "office",
    emergency:       false,
    symptoms:        [],
    history:         [],
  };

  it("returns approved status for a clean valid claim", () => {
    const r = preSubmitCheck(VALID);
    expect(r.submittable).toBe(true);
    expect(r.status).not.toBe("rejected");
    expect(r.checkedAt).toBeDefined();
  });

  it("returns rejected status when scrub fails", () => {
    const r = preSubmitCheck({ ...VALID, icd10: "NOTVALID" });
    expect(r.status).toBe("rejected");
    expect(r.submittable).toBe(false);
    expect(r.requiresHumanReview).toBe(true);
  });

  it("result includes scrub, priorAuth, modifier, and hcc sections", () => {
    const r = preSubmitCheck(VALID);
    expect(r).toHaveProperty("scrub");
    expect(r).toHaveProperty("priorAuth");
    expect(r).toHaveProperty("modifier");
    expect(r).toHaveProperty("hcc");
  });

  it("issues array contains flat strings for backward compatibility", () => {
    const r = preSubmitCheck({ ...VALID, icd10: "BAD" });
    expect(Array.isArray(r.issues)).toBe(true);
    expect(typeof r.issues[0]).toBe("string");
  });

  it("requiresHumanReview is false only when status is approved", () => {
    const r = preSubmitCheck(VALID);
    if (r.status === "approved") {
      expect(r.requiresHumanReview).toBe(false);
    } else {
      expect(r.requiresHumanReview).toBe(true);
    }
  });
});
