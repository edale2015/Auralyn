import { describe, it, expect } from "vitest";
import { computeRegionalCapacity }   from "../../server/regional/regionalCapacity";
import { routeRegionally }           from "../../server/regional/geoRoutingEngine";
import { predictAdmissionRisk }      from "../../server/regional/admissionRisk";
import { predictBounceback }         from "../../server/regional/bouncebackPredictor";
import { buildCallbackPlan }         from "../../server/regional/callbackAutomation";
import { detectRegionalOutbreak }    from "../../server/regional/outbreakDetector";

// ── Regional Capacity ─────────────────────────────────────────────────────────

describe("computeRegionalCapacity", () => {
  const facilities = [
    { name: "ER A",      type: "ER"      as const, distance: 1, openSlots: 10, totalSlots: 20, physicianCount: 4, waitMinutes: 15 },
    { name: "Clinic B",  type: "CLINIC"  as const, distance: 2, openSlots: 0,  totalSlots: 10, physicianCount: 2, waitMinutes: 60 },
    { name: "Telemed C", type: "TELEMED" as const, distance: 0, openSlots: 30, totalSlots: 40, physicianCount: 8, waitMinutes: 5  },
  ];

  it("computes loadScore as complement of slot utilization", () => {
    const result = computeRegionalCapacity(facilities);
    const erA = result.find(f => f.name === "ER A")!;
    // 10 open / 20 total → slot util = 0.5 → load ~0.5
    expect(erA.loadScore).toBeCloseTo(0.5, 1);
  });

  it("sets saturation to critical when load >= 0.9", () => {
    const full = computeRegionalCapacity([
      { name: "Full ER", type: "ER" as const, distance: 1, openSlots: 0, totalSlots: 10, physicianCount: 2, waitMinutes: 70 },
    ]);
    expect(full[0].saturation).toBe("critical");
    expect(full[0].canAcceptRoutine).toBe(false);
  });

  it("canAcceptUrgent is false when no physicians available", () => {
    const result = computeRegionalCapacity([
      { name: "No MD", type: "CLINIC" as const, distance: 1, openSlots: 5, totalSlots: 10, physicianCount: 0, waitMinutes: 10 },
    ]);
    expect(result[0].canAcceptUrgent).toBe(false);
  });

  it("telemed with many slots is low saturation", () => {
    const result = computeRegionalCapacity(facilities);
    const tel = result.find(f => f.name === "Telemed C")!;
    expect(tel.saturation).toBe("low");
    expect(tel.canAcceptRoutine).toBe(true);
  });

  it("wait > 90 minutes gives blocked wait rating", () => {
    const result = computeRegionalCapacity([
      { name: "Slow ER", type: "ER" as const, distance: 1, openSlots: 5, totalSlots: 10, physicianCount: 2, waitMinutes: 100 },
    ]);
    expect(result[0].estimatedWaitRating).toBe("blocked");
  });

  it("returns same number of facilities as input", () => {
    const result = computeRegionalCapacity(facilities);
    expect(result.length).toBe(facilities.length);
  });
});

// ── Geo Routing Engine ────────────────────────────────────────────────────────

describe("routeRegionally", () => {
  const er = { name: "City ER", type: "ER" as const, distance: 1, openSlots: 10, totalSlots: 20, physicianCount: 4, waitMinutes: 20, loadScore: 0.5, saturation: "medium" as const, canAcceptUrgent: true, canAcceptRoutine: true, estimatedWaitRating: "moderate" as const, specialties: ["trauma"] };
  const clinic = { name: "Clinic", type: "CLINIC" as const, distance: 0.5, openSlots: 8, totalSlots: 15, physicianCount: 3, waitMinutes: 15, loadScore: 0.3, saturation: "low" as const, canAcceptUrgent: true, canAcceptRoutine: true, estimatedWaitRating: "fast" as const, specialties: [] };
  const telemed = { name: "Telemed", type: "TELEMED" as const, distance: 0, openSlots: 30, totalSlots: 50, physicianCount: 10, waitMinutes: 5, loadScore: 0.1, saturation: "low" as const, canAcceptUrgent: true, canAcceptRoutine: true, estimatedWaitRating: "fast" as const, specialties: [] };
  const facilities = [er, clinic, telemed];

  it("ER_NOW routes to ER", () => {
    const result = routeRegionally({
      patient: { patientId: "p1", safetyDisposition: "ER_NOW" },
      facilities,
      capacity: facilities,
    });
    expect(result.type).toBe("ER");
    expect(result.destination).toBe("City ER");
  });

  it("high risk routes to nearest available clinic", () => {
    const result = routeRegionally({
      patient: { patientId: "p2", riskLevel: "high", safetyDisposition: "ROUTINE" },
      facilities,
      capacity: facilities,
    });
    expect(result.type).toBe("CLINIC");
  });

  it("URGENT routes to clinic when available", () => {
    const result = routeRegionally({
      patient: { patientId: "p3", safetyDisposition: "URGENT" },
      facilities,
      capacity: facilities,
    });
    expect(result.type).toBe("CLINIC");
  });

  it("low-risk routes to telemed", () => {
    const result = routeRegionally({
      patient: { patientId: "p4", safetyDisposition: "ROUTINE", riskLevel: "low" },
      facilities,
      capacity: facilities,
    });
    expect(result.type).toBe("TELEMED");
  });

  it("specialty routing selects correct facility", () => {
    const cathLab = { ...er, name: "Cath Lab", type: "CATH" as const, specialties: ["cath"], loadScore: 0.4 };
    const result = routeRegionally({
      patient: { patientId: "p5", requiredSpecialty: "cath" },
      facilities: [er, cathLab, telemed],
      capacity:   [er, cathLab, telemed],
    });
    expect(result.type).toBe("CATH");
    expect(result.destination).toBe("Cath Lab");
  });

  it("falls back to ER when all clinics are at capacity", () => {
    const fullClinic = { ...clinic, canAcceptUrgent: false, loadScore: 0.95 };
    const result = routeRegionally({
      patient: { patientId: "p6", riskLevel: "high", safetyDisposition: "ROUTINE" },
      facilities: [er, fullClinic],
      capacity:   [er, fullClinic],
    });
    expect(result.type).toBe("ER");
  });
});

// ── Admission Risk Engine ─────────────────────────────────────────────────────

describe("predictAdmissionRisk", () => {
  it("low-risk young healthy patient has low score", () => {
    const result = predictAdmissionRisk({ ageYears: 25, complaint: "sore_throat", vitals: {} });
    expect(result.risk).toBe("low");
    expect(result.recommendDirectAdmissionPath).toBe(false);
    expect(result.contributingFactors).toHaveLength(0);
  });

  it("age > 65 adds 2 points", () => {
    const young = predictAdmissionRisk({ ageYears: 40 });
    const old   = predictAdmissionRisk({ ageYears: 70 });
    expect(old.score - young.score).toBe(2);
    expect(old.contributingFactors).toContain("Age > 65");
  });

  it("chest_pain adds 2 points", () => {
    const base  = predictAdmissionRisk({ complaint: "fever" });
    const chest = predictAdmissionRisk({ complaint: "chest_pain" });
    expect(chest.score - base.score).toBe(2);
  });

  it("hypotension + hypoxia together yield high risk", () => {
    const result = predictAdmissionRisk({
      ageYears: 70,
      complaint: "chest_pain",
      vitals: { systolicBp: 88, oxygenSaturation: 88 },
    });
    expect(result.risk).toBe("high");
    expect(result.recommendDirectAdmissionPath).toBe(true);
  });

  it("high risk triggers direct admission path", () => {
    const result = predictAdmissionRisk({
      ageYears: 80,
      complaint: "chest_pain",
      vitals: { systolicBp: 90, oxygenSaturation: 86, heartRate: 130 },
    });
    expect(result.risk).toBe("high");
    expect(result.recommendDirectAdmissionPath).toBe(true);
    expect(result.contributingFactors.length).toBeGreaterThan(3);
  });

  it("comorbidities add points", () => {
    const without = predictAdmissionRisk({ ageYears: 60 });
    const with_   = predictAdmissionRisk({ ageYears: 60, comorbidities: ["chf", "copd"] });
    expect(with_.score).toBeGreaterThan(without.score);
  });
});

// ── Bounceback Predictor ──────────────────────────────────────────────────────

describe("predictBounceback", () => {
  it("low-risk patient needs no follow-up", () => {
    const result = predictBounceback({ complaint: "sore_throat", ageYears: 30 });
    expect(result.risk).toBe("low");
    expect(result.needsFollowup).toBe(false);
    expect(result.followupWindow).toBe("none");
  });

  it("abdominal_pain adds 2 points and medium risk", () => {
    const result = predictBounceback({ complaint: "abdominal_pain", ageYears: 30 });
    expect(result.risk).toBe("medium");
    expect(result.needsFollowup).toBe(true);
  });

  it("age > 70 + abdominal_pain = high risk", () => {
    const result = predictBounceback({ complaint: "abdominal_pain", ageYears: 75 });
    expect(result.risk).toBe("high");
    expect(result.followupWindow).toBe("12h");
  });

  it("prior visits >= 2 adds 2 points", () => {
    const none = predictBounceback({ complaint: "headache", ageYears: 40, priorVisits30Days: 0 });
    const many = predictBounceback({ complaint: "headache", ageYears: 40, priorVisits30Days: 3 });
    expect(many.score - none.score).toBe(2);
  });

  it("worsened discharge condition adds 3 points", () => {
    const stable   = predictBounceback({ ageYears: 50, dischargeCondition: "stable" });
    const worsened = predictBounceback({ ageYears: 50, dischargeCondition: "worsened" });
    expect(worsened.score - stable.score).toBe(3);
  });

  it("high risk gives 12h follow-up window", () => {
    const result = predictBounceback({ complaint: "abdominal_pain", ageYears: 75, priorVisits30Days: 2 });
    expect(result.followupWindow).toBe("12h");
  });
});

// ── Callback Automation ───────────────────────────────────────────────────────

describe("buildCallbackPlan", () => {
  const highAdmission = { score: 8, risk: "high" as const, recommendDirectAdmissionPath: true, contributingFactors: ["Age > 65", "Chest pain"] };
  const highBounceback = { score: 5, risk: "high" as const, needsFollowup: true, followupWindow: "12h" as const, reason: "age > 70" };
  const medBounceback  = { score: 3, risk: "medium" as const, needsFollowup: true, followupWindow: "24h" as const, reason: "abdominal pain" };
  const lowAdmission   = { score: 1, risk: "low" as const, recommendDirectAdmissionPath: false, contributingFactors: [] };
  const lowBounceback  = { score: 0, risk: "low" as const, needsFollowup: false, followupWindow: "none" as const, reason: "no risk" };

  it("high admission risk → 2h phone call", () => {
    const plan = buildCallbackPlan({ patient: {}, admissionRisk: highAdmission, bouncebackRisk: lowBounceback });
    expect(plan.timing).toBe("2h");
    expect(plan.method).toBe("phone");
    expect(plan.priority).toBe("urgent");
    expect(plan.messageTemplate.length).toBeGreaterThan(0);
  });

  it("high bounceback risk → 12h SMS", () => {
    const plan = buildCallbackPlan({ patient: {}, admissionRisk: lowAdmission, bouncebackRisk: highBounceback });
    expect(plan.timing).toBe("12h");
    expect(plan.method).toBe("sms");
    expect(plan.priority).toBe("urgent");
  });

  it("medium bounceback → 24h SMS", () => {
    const plan = buildCallbackPlan({ patient: {}, admissionRisk: lowAdmission, bouncebackRisk: medBounceback });
    expect(plan.timing).toBe("24h");
    expect(plan.method).toBe("sms");
    expect(plan.priority).toBe("routine");
  });

  it("no risk → no callback", () => {
    const plan = buildCallbackPlan({ patient: {}, admissionRisk: lowAdmission, bouncebackRisk: lowBounceback });
    expect(plan.timing).toBe("none");
    expect(plan.method).toBe("none");
    expect(plan.priority).toBe("none");
    expect(plan.messageTemplate).toBe("");
  });

  it("high admission risk takes precedence over high bounceback", () => {
    const plan = buildCallbackPlan({ patient: {}, admissionRisk: highAdmission, bouncebackRisk: highBounceback });
    // Admission risk checked first → 2h phone
    expect(plan.timing).toBe("2h");
    expect(plan.method).toBe("phone");
  });
});

// ── Outbreak Detector ─────────────────────────────────────────────────────────

describe("detectRegionalOutbreak", () => {
  it("returns no alert when all complaints below threshold", () => {
    const patients = [
      { complaint: "fever", symptoms: [] },
      { complaint: "cough", symptoms: [] },
      { complaint: "fever", symptoms: [] },
    ];
    const result = detectRegionalOutbreak(patients);
    expect(result.alert).toBe(false);
    expect(result.clusters).toHaveLength(0);
  });

  it("watch level at 5-9 presentations", () => {
    const patients = Array.from({ length: 7 }, () => ({ complaint: "fever", symptoms: [] }));
    const result = detectRegionalOutbreak(patients);
    expect(result.clusters[0].alertLevel).toBe("watch");
    expect(result.alert).toBe(false);
    expect(result.watchCount).toBe(1);
  });

  it("alert level at 10+ presentations", () => {
    const patients = Array.from({ length: 12 }, () => ({ complaint: "fever", symptoms: [] }));
    const result = detectRegionalOutbreak(patients);
    expect(result.clusters[0].alertLevel).toBe("alert");
    expect(result.alert).toBe(true);
    expect(result.alertCount).toBe(1);
  });

  it("attaches syndromic label for known complaint types", () => {
    const patients = Array.from({ length: 6 }, () => ({ complaint: "vomiting", symptoms: [] }));
    const result = detectRegionalOutbreak(patients);
    expect(result.clusters[0].syndromicLabel).toContain("Gastrointestinal");
  });

  it("returns null syndromic label for unknown complaint types", () => {
    const patients = Array.from({ length: 6 }, () => ({ complaint: "back_pain", symptoms: [] }));
    const result = detectRegionalOutbreak(patients);
    expect(result.clusters[0].syndromicLabel).toBeNull();
  });

  it("tracks site diversity in cluster", () => {
    const patients = [
      ...Array.from({ length: 4 }, () => ({ complaint: "fever", symptoms: [], siteName: "Site A" })),
      ...Array.from({ length: 3 }, () => ({ complaint: "fever", symptoms: [], siteName: "Site B" })),
    ];
    const result = detectRegionalOutbreak(patients);
    expect(result.clusters[0].sites).toContain("Site A");
    expect(result.clusters[0].sites).toContain("Site B");
  });

  it("handles empty patient array gracefully", () => {
    const result = detectRegionalOutbreak([]);
    expect(result.alert).toBe(false);
    expect(result.clusters).toHaveLength(0);
    expect(result.summary).toContain("No outbreak signals");
  });

  it("sorts clusters by count descending", () => {
    const patients = [
      ...Array.from({ length: 12 }, () => ({ complaint: "fever", symptoms: [] })),
      ...Array.from({ length: 6 }, () => ({ complaint: "cough", symptoms: [] })),
    ];
    const result = detectRegionalOutbreak(patients);
    expect(result.clusters[0].complaint).toBe("fever");
    expect(result.clusters[0].count).toBeGreaterThan(result.clusters[1].count);
  });
});
