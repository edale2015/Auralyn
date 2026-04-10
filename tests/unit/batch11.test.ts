import { describe, it, expect } from "vitest";

// ── Payer Contract ────────────────────────────────────────────────────────────
import {
  simulatePayerContract, batchSimulateContracts, sendPush, CONTRACT_BASE_RATES,
} from "../../server/revenue/payerContract";

describe("payerContract — simulatePayerContract()", () => {
  it("returns base rate for standard claim", () => {
    expect(simulatePayerContract({ cpt: "99213" })).toBe(120);
    expect(simulatePayerContract({ cpt: "99285" })).toBe(500);
    expect(simulatePayerContract({ cpt: "99284" })).toBe(300);
  });

  it("returns 0 for unknown CPT", () => {
    expect(simulatePayerContract({ cpt: "00000" })).toBe(0);
  });

  it("applies 10% time modifier for > 60 min", () => {
    const base = CONTRACT_BASE_RATES["99213"]!;
    expect(simulatePayerContract({ cpt: "99213", time: 75 })).toBeCloseTo(base * 1.1, 1);
  });

  it("no time modifier for <= 60 min", () => {
    expect(simulatePayerContract({ cpt: "99213", time: 60 })).toBe(120);
  });

  it("applies 20% complexity modifier for high", () => {
    const base = CONTRACT_BASE_RATES["99213"]!;
    expect(simulatePayerContract({ cpt: "99213", complexity: "high" })).toBeCloseTo(base * 1.2, 1);
  });

  it("no modifier for low complexity", () => {
    expect(simulatePayerContract({ cpt: "99213", complexity: "low" })).toBe(120);
  });

  it("applies 40% denial risk penalty for > 0.5", () => {
    const base = CONTRACT_BASE_RATES["99213"]!;
    expect(simulatePayerContract({ cpt: "99213", denialRisk: 0.7 })).toBeCloseTo(base * 0.6, 1);
  });

  it("no denial penalty for <= 0.5", () => {
    expect(simulatePayerContract({ cpt: "99213", denialRisk: 0.5 })).toBe(120);
  });

  it("applies multiple modifiers multiplicatively", () => {
    const r = simulatePayerContract({ cpt: "99213", time: 90, complexity: "high" });
    expect(r).toBeCloseTo(120 * 1.1 * 1.2, 1);
  });

  it("result is rounded to 2 decimal places", () => {
    const r = simulatePayerContract({ cpt: "99213", time: 90 });
    expect(String(r).split(".")[1]?.length ?? 0).toBeLessThanOrEqual(2);
  });
});

describe("payerContract — batchSimulateContracts()", () => {
  it("returns array of same length", () => {
    const r = batchSimulateContracts([
      { cpt: "99285" },
      { cpt: "99213" },
    ]);
    expect(r).toHaveLength(2);
  });

  it("each result has claim and reimbursement", () => {
    const r = batchSimulateContracts([{ cpt: "99284" }]);
    expect(r[0].reimbursement).toBe(300);
    expect(r[0].claim.cpt).toBe("99284");
  });

  it("returns empty array for empty input", () => {
    expect(batchSimulateContracts([])).toEqual([]);
  });
});

describe("payerContract — sendPush()", () => {
  it("does not throw", () => {
    expect(() => sendPush("P001", "Your follow-up is scheduled")).not.toThrow();
  });

  it("handles empty message", () => {
    expect(() => sendPush("P002", "")).not.toThrow();
  });
});

// ── Slide Builder ─────────────────────────────────────────────────────────────
import { buildSlides, slidesToMarkdown } from "../../server/exec/slideBuilder";

describe("slideBuilder — buildSlides()", () => {
  it("returns 8 slides", () => {
    expect(buildSlides({})).toHaveLength(8);
  });

  it("first slide is Vision", () => {
    expect(buildSlides({})[0].title).toBe("Vision");
  });

  it("last slide is Next Steps", () => {
    const slides = buildSlides({});
    expect(slides[slides.length - 1].title).toBe("Next Steps");
  });

  it("includes patient count in Scale slide", () => {
    const slides = buildSlides({ patients: 50_000 });
    const scale = slides.find(s => s.title === "Scale");
    expect(scale?.content).toContain("50,000");
  });

  it("includes revenue in Revenue slide", () => {
    const slides = buildSlides({ revenue: 5_000_000 });
    const rev = slides.find(s => s.title === "Revenue");
    expect(rev?.content).toContain("5,000,000");
  });

  it("all slides have title and content", () => {
    buildSlides({ patients: 100, revenue: 1000 }).forEach(s => {
      expect(s.title).toBeTruthy();
      expect(s.content).toBeTruthy();
    });
  });

  it("accuracy defaults to 95%", () => {
    const slides = buildSlides({});
    const acc = slides.find(s => s.title === "Accuracy");
    expect(acc?.content).toContain("95.0%");
  });

  it("includes custom regions when provided", () => {
    const slides = buildSlides({ regions: ["eu-west-1"] });
    const scale = slides.find(s => s.title === "Scale");
    expect(scale?.content).toContain("eu-west-1");
  });
});

describe("slideBuilder — slidesToMarkdown()", () => {
  it("returns a non-empty string", () => {
    const md = slidesToMarkdown(buildSlides({}));
    expect(typeof md).toBe("string");
    expect(md.length).toBeGreaterThan(50);
  });

  it("contains all slide titles as headings", () => {
    const slides = buildSlides({});
    const md = slidesToMarkdown(slides);
    slides.forEach(s => expect(md).toContain(`## ${s.title}`));
  });

  it("uses --- as separator between slides", () => {
    const md = slidesToMarkdown(buildSlides({}));
    expect(md).toContain("---");
  });
});

// ── Dynamic Intake ────────────────────────────────────────────────────────────
import { nextSecondaryQuestion, collectModifiers, fastTrack } from "../../server/clinical/intakeDynamic";

describe("intakeDynamic — nextSecondaryQuestion()", () => {
  it("asks age when not provided", () => {
    const q = nextSecondaryQuestion({});
    expect(q?.toLowerCase()).toContain("old");
  });

  it("asks about fever when age is set but fever not in symptoms", () => {
    const q = nextSecondaryQuestion({ age: 30, symptoms: ["cough"] });
    expect(q?.toLowerCase()).toContain("fever");
  });

  it("asks duration when symptoms include fever but no duration", () => {
    const q = nextSecondaryQuestion({ age: 30, symptoms: ["fever"] });
    expect(q?.toLowerCase()).toContain("long");
  });

  it("returns null when all context is complete", () => {
    const q = nextSecondaryQuestion({ age: 30, symptoms: ["fever"], duration: "2 days" });
    expect(q).toBeNull();
  });
});

describe("intakeDynamic — collectModifiers()", () => {
  it("returns all required fields", () => {
    const m = collectModifiers({ age: 45, meds: ["aspirin"], allergies: ["penicillin"], pmh: ["HTN"] });
    expect(m.age).toBe(45);
    expect(m.meds).toEqual(["aspirin"]);
    expect(m.allergies).toEqual(["penicillin"]);
    expect(m.pmh).toEqual(["HTN"]);
  });

  it("defaults arrays to empty when not provided", () => {
    const m = collectModifiers({});
    expect(m.meds).toEqual([]);
    expect(m.allergies).toEqual([]);
    expect(m.pmh).toEqual([]);
  });

  it("preserves age when provided", () => {
    expect(collectModifiers({ age: 65 }).age).toBe(65);
  });

  it("age is undefined when not provided", () => {
    expect(collectModifiers({}).age).toBeUndefined();
  });
});

describe("intakeDynamic — fastTrack()", () => {
  it("returns ROUTINE for minor complaint with normal vitals", () => {
    expect(fastTrack({ complaint: "minor", vitals: { normal: true } })).toBe("ROUTINE");
  });

  it("returns null for non-minor complaint", () => {
    expect(fastTrack({ complaint: "chest pain", vitals: { normal: true } })).toBeNull();
  });

  it("returns null for abnormal vitals", () => {
    expect(fastTrack({ complaint: "minor", vitals: { normal: false } })).toBeNull();
  });

  it("returns null with no complaint", () => {
    expect(fastTrack({})).toBeNull();
  });
});

// ── Case Speed Panel ──────────────────────────────────────────────────────────
import { buildPhysicianSummary, dispositionFollowup } from "../../server/clinical/caseSpeedPanel";

describe("caseSpeedPanel — buildPhysicianSummary()", () => {
  it("returns all required fields", () => {
    const s = buildPhysicianSummary({
      complaint: "chest pain",
      differential: [{ diagnosis: "ACS" }],
      risk: "high",
      disposition: "ER_NOW",
    });
    expect(s.complaint).toBe("chest pain");
    expect(s.topDx).toBe("ACS");
    expect(s.risk).toBe("high");
    expect(s.disposition).toBe("ER_NOW");
  });

  it("falls back to 'Unknown' for missing fields", () => {
    const s = buildPhysicianSummary({});
    expect(s.complaint).toBe("Unknown");
    expect(s.topDx).toBe("Unknown");
    expect(s.disposition).toBe("Unknown");
  });

  it("uses name field when diagnosis is missing", () => {
    const s = buildPhysicianSummary({ differential: [{ name: "Pharyngitis" }] });
    expect(s.topDx).toBe("Pharyngitis");
  });

  it("handles empty differential array", () => {
    const s = buildPhysicianSummary({ differential: [] });
    expect(s.topDx).toBe("Unknown");
  });
});

describe("caseSpeedPanel — dispositionFollowup()", () => {
  it("ER_NOW → Immediate call", () => {
    expect(dispositionFollowup("ER_NOW")).toBe("Immediate call");
  });

  it("URGENT → 2-hour check", () => {
    expect(dispositionFollowup("URGENT")).toBe("2-hour check");
  });

  it("SAME_DAY → 4-hour check", () => {
    expect(dispositionFollowup("SAME_DAY")).toBe("4-hour check");
  });

  it("NEXT_DAY → Next-day call", () => {
    expect(dispositionFollowup("NEXT_DAY")).toBe("Next-day call");
  });

  it("ROUTINE → 24-hour follow-up", () => {
    expect(dispositionFollowup("ROUTINE")).toBe("24-hour follow-up");
  });

  it("unknown → 24-hour follow-up", () => {
    expect(dispositionFollowup("UNKNOWN")).toBe("24-hour follow-up");
  });
});

// ── Epic Sandbox ──────────────────────────────────────────────────────────────
import { epicTestPatientFlow } from "../../server/integrations/epicSandbox";

describe("epicSandbox — epicTestPatientFlow()", () => {
  it("returns full result shape with no FHIR config", async () => {
    const r = await epicTestPatientFlow("");
    expect(typeof r.patientId).toBe("string");
    expect(r.patientId.startsWith("sandbox-")).toBe(true);
    expect(typeof r.disposition).toBe("string");
    expect(r.fhirPatientCreated).toBe(false);
    expect(r.observationPosted).toBe(false);
    expect(typeof r.ts).toBe("string");
  }, 10_000);

  it("returns valid ISO timestamp", async () => {
    const r = await epicTestPatientFlow("");
    expect(() => new Date(r.ts)).not.toThrow();
  }, 10_000);

  it("disposition is a non-empty string", async () => {
    const r = await epicTestPatientFlow("");
    expect(r.disposition.length).toBeGreaterThan(0);
  }, 10_000);
});
