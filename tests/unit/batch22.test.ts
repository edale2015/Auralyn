import { describe, it, expect, beforeEach } from "vitest";

// ── scriptEngine ──────────────────────────────────────────────────────────────
import {
  generateCommunicationScript,
  isRepeatVisitTrigger,
  TRIGGER_COMPLAINTS,
  TRIGGER_VISIT_MIN,
  TRIGGER_DURATION_MAX_DAYS,
} from "../../server/services/communication/scriptEngine";

// ── toneDetector ──────────────────────────────────────────────────────────────
import { detectTone, detectToneScore } from "../../server/services/communication/toneDetector";

// ── scriptVariants ────────────────────────────────────────────────────────────
import { getScriptVariant, listVariantNames } from "../../server/services/communication/scriptVariants";

// ── antibioticDemandDetector ──────────────────────────────────────────────────
import { detectAntibioticDemand, ANTIBIOTIC_DEMAND_PHRASES } from "../../server/services/communication/antibioticDemandDetector";

// ── antibioticDemandEngine ────────────────────────────────────────────────────
import { generateAntibioticDemandResponse } from "../../server/services/communication/antibioticDemandEngine";

// ── delayedPrescriptionService ────────────────────────────────────────────────
import {
  createDelayedPrescription,
  activateDelayedPrescription,
  buildActivationCriteria,
} from "../../server/services/communication/delayedPrescriptionService";

// ── outcomeTracker ────────────────────────────────────────────────────────────
import {
  logCommunicationOutcome,
  logAntibioticDemandEvent,
  getCommunicationStats,
  getAntibioticDemandStats,
  resetOutcomes,
} from "../../server/services/communication/outcomeTracker";

// ──────────────────────────────────────────────────────────────────────────────
// isRepeatVisitTrigger
// ──────────────────────────────────────────────────────────────────────────────

describe("scriptEngine — isRepeatVisitTrigger()", () => {
  it("triggers for cough with ≥3 visits ≤14 days", () => {
    expect(isRepeatVisitTrigger({ complaint: "cough", visitCount: 3, durationDays: 10 })).toBe(true);
  });

  it("triggers for uri complaint", () => {
    expect(isRepeatVisitTrigger({ complaint: "uri", visitCount: 3, durationDays: 14 })).toBe(true);
  });

  it("triggers for sinus complaint", () => {
    expect(isRepeatVisitTrigger({ complaint: "sinus", visitCount: 4, durationDays: 7 })).toBe(true);
  });

  it("does NOT trigger below 3 visits", () => {
    expect(isRepeatVisitTrigger({ complaint: "cough", visitCount: 2, durationDays: 10 })).toBe(false);
  });

  it("does NOT trigger beyond 14 days", () => {
    expect(isRepeatVisitTrigger({ complaint: "cough", visitCount: 3, durationDays: 15 })).toBe(false);
  });

  it("does NOT trigger for unrelated complaint", () => {
    expect(isRepeatVisitTrigger({ complaint: "chest pain", visitCount: 5, durationDays: 7 })).toBe(false);
  });

  it("triggers for upper respiratory complaint", () => {
    expect(isRepeatVisitTrigger({ complaint: "upper respiratory", visitCount: 3, durationDays: 12 })).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// generateCommunicationScript
// ──────────────────────────────────────────────────────────────────────────────

describe("scriptEngine — generateCommunicationScript()", () => {
  it("returns triggered:false for non-qualifying case", () => {
    const r = generateCommunicationScript({ complaint: "chest pain", visitCount: 1, durationDays: 3, priorAntibiotics: false });
    expect(r.triggered).toBe(false);
    expect(r.script).toBe("");
    expect(r.variant).toBe("none");
  });

  it("returns triggered:true for repeat URI visit", () => {
    const r = generateCommunicationScript({ complaint: "uri", visitCount: 3, durationDays: 10, priorAntibiotics: false });
    expect(r.triggered).toBe(true);
    expect(r.script.length).toBeGreaterThan(50);
    expect(r.variant).not.toBe("none");
  });

  it("detects frustrated tone from patient text", () => {
    const r = generateCommunicationScript({
      complaint: "cough", visitCount: 3, durationDays: 10, priorAntibiotics: false,
      patientText: "Nothing is helping and I've been here multiple times",
    });
    expect(r.tone).toBe("frustrated");
    expect(r.variant).toBe("frustrated_variant");
  });

  it("detects demanding tone from patient text", () => {
    const r = generateCommunicationScript({
      complaint: "cough", visitCount: 3, durationDays: 10, priorAntibiotics: false,
      patientText: "I want antibiotics, just give me something",
    });
    expect(r.tone).toBe("demanding");
    expect(r.variant).toBe("demanding_variant");
  });

  it("detects anxious tone from patient text", () => {
    const r = generateCommunicationScript({
      complaint: "sinus", visitCount: 3, durationDays: 10, priorAntibiotics: false,
      patientText: "I'm worried this could be something serious",
    });
    expect(r.tone).toBe("anxious");
    expect(r.variant).toBe("anxious_variant");
  });

  it("includes prior_antibiotics in triggerReasons", () => {
    const r = generateCommunicationScript({ complaint: "cough", visitCount: 3, durationDays: 10, priorAntibiotics: true });
    expect(r.triggerReasons).toContain("prior_antibiotics");
  });

  it("includes visit_count and complaint in triggerReasons", () => {
    const r = generateCommunicationScript({ complaint: "cough", visitCount: 3, durationDays: 10, priorAntibiotics: false });
    expect(r.triggerReasons.some(t => t.startsWith("visit_count"))).toBe(true);
    expect(r.triggerReasons.some(t => t.startsWith("complaint"))).toBe(true);
  });

  it("uses neutral_variant for neutral text", () => {
    const r = generateCommunicationScript({ complaint: "uri", visitCount: 3, durationDays: 10, priorAntibiotics: false, patientText: "" });
    expect(r.variant).toBe("neutral_variant");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// toneDetector
// ──────────────────────────────────────────────────────────────────────────────

describe("toneDetector — detectTone()", () => {
  it("detects frustrated", () => {
    expect(detectTone("nothing is helping and this is ridiculous")).toBe("frustrated");
  });

  it("detects demanding", () => {
    expect(detectTone("I want antibiotics right now")).toBe("demanding");
  });

  it("detects anxious", () => {
    expect(detectTone("I'm worried, is this serious?")).toBe("anxious");
  });

  it("returns neutral for benign text", () => {
    expect(detectTone("I feel a bit better today")).toBe("neutral");
  });

  it("returns neutral for empty string", () => {
    expect(detectTone("")).toBe("neutral");
  });

  it("is case-insensitive", () => {
    expect(detectTone("NOTHING IS HELPING")).toBe("frustrated");
  });
});

describe("toneDetector — detectToneScore()", () => {
  it("returns an object with all four keys", () => {
    const s = detectToneScore("nothing is helping");
    expect(typeof s.frustrated).toBe("number");
    expect(typeof s.demanding).toBe("number");
    expect(typeof s.anxious).toBe("number");
    expect(typeof s.neutral).toBe("number");
  });

  it("scores frustrated phrases correctly", () => {
    const s = detectToneScore("nothing is helping and this is ridiculous");
    expect(s.frustrated).toBeGreaterThan(0);
  });

  it("scores zero for no match", () => {
    const s = detectToneScore("I feel fine today");
    expect(s.frustrated).toBe(0);
    expect(s.demanding).toBe(0);
    expect(s.anxious).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// scriptVariants
// ──────────────────────────────────────────────────────────────────────────────

describe("scriptVariants — getScriptVariant()", () => {
  it("returns frustrated_variant for frustrated tone", () => {
    const v = getScriptVariant({ tone: "frustrated", complaint: "cough", priorAntibiotics: false });
    expect(v.name).toBe("frustrated_variant");
    expect(v.script).toMatch(/I hear you/);
  });

  it("returns demanding_variant for demanding tone", () => {
    const v = getScriptVariant({ tone: "demanding", complaint: "cough", priorAntibiotics: false });
    expect(v.name).toBe("demanding_variant");
    expect(v.script).toMatch(/I understand/);
  });

  it("returns anxious_variant for anxious tone", () => {
    const v = getScriptVariant({ tone: "anxious", complaint: "sinus", priorAntibiotics: false });
    expect(v.name).toBe("anxious_variant");
    expect(v.script).toMatch(/good news/i);
  });

  it("returns neutral_variant for neutral tone", () => {
    const v = getScriptVariant({ tone: "neutral", complaint: "cough", priorAntibiotics: false });
    expect(v.name).toBe("neutral_variant");
  });

  it("appends prior-antibiotic addendum when flag set", () => {
    const v = getScriptVariant({ tone: "neutral", complaint: "cough", priorAntibiotics: true });
    expect(v.script).toMatch(/already tried antibiotics/i);
  });

  it("does not append addendum when flag false", () => {
    const v = getScriptVariant({ tone: "neutral", complaint: "cough", priorAntibiotics: false });
    expect(v.script).not.toMatch(/already tried antibiotics/i);
  });
});

describe("scriptVariants — listVariantNames()", () => {
  it("returns 4 variant names", () => {
    const names = listVariantNames();
    expect(names).toHaveLength(4);
    expect(names).toContain("neutral_variant");
    expect(names).toContain("frustrated_variant");
    expect(names).toContain("demanding_variant");
    expect(names).toContain("anxious_variant");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// antibioticDemandDetector
// ──────────────────────────────────────────────────────────────────────────────

describe("antibioticDemandDetector — detectAntibioticDemand()", () => {
  it("detects 'zpack'", () => {
    const r = detectAntibioticDemand("I want a zpack like last time");
    expect(r.isDemandingAntibiotic).toBe(true);
    expect(r.phrasesMatched).toContain("zpack");
  });

  it("detects 'z-pak'", () => {
    const r = detectAntibioticDemand("can I get a z-pak please");
    expect(r.isDemandingAntibiotic).toBe(true);
  });

  it("detects 'i know my body'", () => {
    const r = detectAntibioticDemand("I know my body and it always turns into a sore throat");
    expect(r.isDemandingAntibiotic).toBe(true);
    expect(r.phrasesMatched.length).toBeGreaterThan(0);
  });

  it("detects 'antibiotics always fix it'", () => {
    const r = detectAntibioticDemand("antibiotics always fix it for me");
    expect(r.isDemandingAntibiotic).toBe(true);
  });

  it("returns false for neutral text", () => {
    const r = detectAntibioticDemand("I have a mild cough and runny nose");
    expect(r.isDemandingAntibiotic).toBe(false);
    expect(r.phrasesMatched).toHaveLength(0);
  });

  it("is case-insensitive", () => {
    const r = detectAntibioticDemand("JUST GIVE ME ANTIBIOTICS");
    expect(r.isDemandingAntibiotic).toBe(true);
  });

  it("returns confidence medium for single phrase", () => {
    const r = detectAntibioticDemand("I want antibiotics");
    expect(r.confidence).toBe("medium");
  });

  it("returns confidence low for no match", () => {
    const r = detectAntibioticDemand("I feel okay today");
    expect(r.confidence).toBe("low");
  });

  it("handles empty string", () => {
    const r = detectAntibioticDemand("");
    expect(r.isDemandingAntibiotic).toBe(false);
  });

  it("PHRASES list has at least 10 entries", () => {
    expect(ANTIBIOTIC_DEMAND_PHRASES.length).toBeGreaterThanOrEqual(10);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// antibioticDemandEngine
// ──────────────────────────────────────────────────────────────────────────────

describe("antibioticDemandEngine — generateAntibioticDemandResponse()", () => {
  it("returns triggered:false when no demand signal", () => {
    const r = generateAntibioticDemandResponse({ patientText: "I have a cough", hasBacterialCriteria: false, priorAntibiotics: false });
    expect(r.triggered).toBe(false);
    expect(r.script).toBe("");
    expect(r.offerDelayedRx).toBe(false);
  });

  it("returns triggered:true when demand detected", () => {
    const r = generateAntibioticDemandResponse({ patientText: "I want a zpack", hasBacterialCriteria: false, priorAntibiotics: false });
    expect(r.triggered).toBe(true);
  });

  it("offers delayed Rx when demand + no bacterial criteria", () => {
    const r = generateAntibioticDemandResponse({ patientText: "I know my body, antibiotics always fix it", hasBacterialCriteria: false, priorAntibiotics: false });
    expect(r.offerDelayedRx).toBe(true);
    expect(r.rationale).toContain("demand_without_criteria");
  });

  it("does NOT offer delayed Rx when bacterial criteria met", () => {
    const r = generateAntibioticDemandResponse({ patientText: "I want antibiotics", hasBacterialCriteria: true, priorAntibiotics: false });
    expect(r.offerDelayedRx).toBe(false);
    expect(r.rationale).toContain("bacterial_criteria_met");
  });

  it("script contains Z-Pak reference for no-criteria case", () => {
    const r = generateAntibioticDemandResponse({ patientText: "I need a zpack", hasBacterialCriteria: false, priorAntibiotics: false });
    expect(r.script).toMatch(/Z-Pak/i);
  });

  it("includes centor_borderline in rationale for score≥2", () => {
    const r = generateAntibioticDemandResponse({ patientText: "I want antibiotics", hasBacterialCriteria: false, priorAntibiotics: false, centorScore: 2 });
    expect(r.rationale).toContain("centor_borderline");
  });

  it("includes prior_antibiotics in rationale", () => {
    const r = generateAntibioticDemandResponse({ patientText: "I need a zpack", hasBacterialCriteria: false, priorAntibiotics: true });
    expect(r.rationale).toContain("prior_antibiotics");
  });

  it("exposes demandSignal in output", () => {
    const r = generateAntibioticDemandResponse({ patientText: "I want antibiotics", hasBacterialCriteria: false, priorAntibiotics: false });
    expect(r.demandSignal?.isDemandingAntibiotic).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// delayedPrescriptionService
// ──────────────────────────────────────────────────────────────────────────────

describe("delayedPrescriptionService — createDelayedPrescription()", () => {
  it("returns success:true", async () => {
    const r = await createDelayedPrescription({ patientId: "P001", medication: "Azithromycin", instructions: "Start if fever", activationCriteria: ["Fever ≥ 101°F"] });
    expect(r.success).toBe(true);
  });

  it("sets status PENDING_ACTIVATION", async () => {
    const r = await createDelayedPrescription({ patientId: "P001", medication: "Azithromycin", instructions: "x", activationCriteria: [] });
    expect(r.record.status).toBe("PENDING_ACTIVATION");
  });

  it("includes patientId in record", async () => {
    const r = await createDelayedPrescription({ patientId: "P999", medication: "Amoxicillin", instructions: "x", activationCriteria: [] });
    expect(r.record.patientId).toBe("P999");
  });

  it("generates unique id", async () => {
    const r1 = await createDelayedPrescription({ patientId: "P1", medication: "A", instructions: "x", activationCriteria: [] });
    const r2 = await createDelayedPrescription({ patientId: "P1", medication: "A", instructions: "x", activationCriteria: [] });
    expect(r1.record.id).not.toBe(r2.record.id);
  });

  it("sets expiresAt 7 days in future by default", async () => {
    const before = Date.now();
    const r = await createDelayedPrescription({ patientId: "P1", medication: "A", instructions: "x", activationCriteria: [] });
    const sevenDays = 7 * 86_400_000;
    expect(r.record.expiresAt.getTime()).toBeGreaterThan(before + sevenDays - 1000);
  });

  it("respects custom expiresInDays", async () => {
    const r = await createDelayedPrescription({ patientId: "P1", medication: "A", instructions: "x", activationCriteria: [], expiresInDays: 3 });
    const threeDays = 3 * 86_400_000;
    expect(r.record.expiresAt.getTime()).toBeLessThan(Date.now() + threeDays + 5000);
  });
});

describe("delayedPrescriptionService — activateDelayedPrescription()", () => {
  it("returns success:true", async () => {
    const r = await activateDelayedPrescription("rx-123");
    expect(r.success).toBe(true);
  });

  it("includes rxId in message", async () => {
    const r = await activateDelayedPrescription("rx-abc-456");
    expect(r.message).toContain("rx-abc-456");
  });
});

describe("delayedPrescriptionService — buildActivationCriteria()", () => {
  it("includes fever criterion", () => {
    const c = buildActivationCriteria({ fever: true });
    expect(c.some(s => s.match(/fever/i))).toBe(true);
  });

  it("includes throat pain criterion", () => {
    const c = buildActivationCriteria({ throatPain: true });
    expect(c.some(s => s.match(/throat/i))).toBe(true);
  });

  it("includes worsening criterion", () => {
    const c = buildActivationCriteria({ worsening: true });
    expect(c.some(s => s.match(/worsen|improving/i))).toBe(true);
  });

  it("returns empty array for all false", () => {
    const c = buildActivationCriteria({});
    expect(c).toHaveLength(0);
  });

  it("includes custom criteria", () => {
    const c = buildActivationCriteria({ custom: ["New rash", "Difficulty breathing"] });
    expect(c).toContain("New rash");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// outcomeTracker
// ──────────────────────────────────────────────────────────────────────────────

describe("outcomeTracker", () => {
  beforeEach(() => resetOutcomes());

  describe("logCommunicationOutcome + getCommunicationStats()", () => {
    it("stats are zero after reset", () => {
      const s = getCommunicationStats();
      expect(s.total).toBe(0);
      expect(s.antibioticRequests).toBe(0);
    });

    it("increments total on each log", async () => {
      await logCommunicationOutcome({ patientId: "P1", complaint: "cough", visitCount: 3, scriptVariant: "neutral_variant", tone: "neutral", antibioticsRequested: false, antibioticsGiven: false });
      await logCommunicationOutcome({ patientId: "P2", complaint: "uri", visitCount: 3, scriptVariant: "frustrated_variant", tone: "frustrated", antibioticsRequested: true, antibioticsGiven: false });
      const s = getCommunicationStats();
      expect(s.total).toBe(2);
    });

    it("counts antibioticRequests correctly", async () => {
      await logCommunicationOutcome({ patientId: "P1", complaint: "cough", visitCount: 3, scriptVariant: "demanding_variant", tone: "demanding", antibioticsRequested: true, antibioticsGiven: false });
      const s = getCommunicationStats();
      expect(s.antibioticRequests).toBe(1);
      expect(s.avoidedAntibiotics).toBe(1);
    });

    it("computes avoidanceRate", async () => {
      await logCommunicationOutcome({ patientId: "P1", complaint: "cough", visitCount: 3, scriptVariant: "neutral_variant", tone: "neutral", antibioticsRequested: true, antibioticsGiven: false });
      const s = getCommunicationStats();
      expect(s.avoidanceRate).toBe(1);
    });

    it("tracks variantBreakdown", async () => {
      await logCommunicationOutcome({ patientId: "P1", complaint: "cough", visitCount: 3, scriptVariant: "frustrated_variant", tone: "frustrated", antibioticsRequested: false, antibioticsGiven: false });
      const s = getCommunicationStats();
      expect(s.variantBreakdown["frustrated_variant"]).toBe(1);
    });
  });

  describe("logAntibioticDemandEvent + getAntibioticDemandStats()", () => {
    it("stats are zero after reset", () => {
      const s = getAntibioticDemandStats();
      expect(s.total).toBe(0);
    });

    it("increments total and demands", async () => {
      await logAntibioticDemandEvent({ patientId: "P1", complaint: "sore throat", demanded: true, delayedRxOffered: true, antibioticsGiven: false });
      const s = getAntibioticDemandStats();
      expect(s.total).toBe(1);
      expect(s.demands).toBe(1);
    });

    it("tracks delayedRxOffered and delayedUsed", async () => {
      await logAntibioticDemandEvent({ patientId: "P1", complaint: "sore throat", demanded: true, delayedRxOffered: true, delayedRxUsed: true, antibioticsGiven: false });
      const s = getAntibioticDemandStats();
      expect(s.delayedOffered).toBe(1);
      expect(s.delayedUsed).toBe(1);
      expect(s.acceptanceRate).toBe(1);
    });

    it("computes demandRate correctly", async () => {
      await logAntibioticDemandEvent({ patientId: "P1", complaint: "x", demanded: true, delayedRxOffered: false, antibioticsGiven: false });
      await logAntibioticDemandEvent({ patientId: "P2", complaint: "x", demanded: false, delayedRxOffered: false, antibioticsGiven: false });
      const s = getAntibioticDemandStats();
      expect(s.demandRate).toBeCloseTo(0.5, 2);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Trigger constants validation
// ──────────────────────────────────────────────────────────────────────────────

describe("scriptEngine — trigger constants", () => {
  it("TRIGGER_VISIT_MIN is 3", () => {
    expect(TRIGGER_VISIT_MIN).toBe(3);
  });

  it("TRIGGER_DURATION_MAX_DAYS is 14", () => {
    expect(TRIGGER_DURATION_MAX_DAYS).toBe(14);
  });

  it("TRIGGER_COMPLAINTS includes cough, sinus, uri", () => {
    expect(TRIGGER_COMPLAINTS).toContain("cough");
    expect(TRIGGER_COMPLAINTS).toContain("sinus");
    expect(TRIGGER_COMPLAINTS).toContain("uri");
  });
});
