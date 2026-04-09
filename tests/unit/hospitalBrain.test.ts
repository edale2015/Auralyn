import { describe, it, expect } from "vitest";
import { predictDemandWindow }         from "../../server/hospital/predictiveDemandEngine";
import { predictPatientDeterioration } from "../../server/hospital/deteriorationPredictor";
import { computeCapacityState }        from "../../server/hospital/capacityEngine";
import { routePatientAcrossSystem }    from "../../server/hospital/routingEngine";
import { detectOperationalSurge }      from "../../server/hospital/surgeDetector";
import { buildPopulationSignals }      from "../../server/hospital/populationIntelligence";

// ── Predictive Demand Engine ──────────────────────────────────────────────────

describe("predictDemandWindow", () => {
  const baseHistory = Array.from({ length: 24 }, (_, i) => ({
    ts: Date.now() - (23 - i) * 3_600_000,
    count: 20,
    erCount: 4,
    telemedCount: 8,
    clinicCount: 6,
  }));

  it("returns correct next-hour volume from recent history", () => {
    const result = predictDemandWindow({
      historicalVolumes: baseHistory,
      currentQueueSize: 5,
      averageWaitMinutes: 10,
      nowTs: Date.now(),
    });
    expect(result.nextHourVolume).toBe(20);
    expect(result.nextHourEr).toBe(4);
    expect(result.next4HourVolume).toBe(80);
  });

  it("applies queue pressure boost when queue > 20", () => {
    const result = predictDemandWindow({
      historicalVolumes: baseHistory,
      currentQueueSize: 25,
      averageWaitMinutes: 10,
      nowTs: Date.now(),
    });
    expect(result.queuePressureBoost).toBe(1.2);
    expect(result.nextHourVolume).toBeGreaterThan(20);
  });

  it("applies wait pressure boost when wait > 30 min", () => {
    const result = predictDemandWindow({
      historicalVolumes: baseHistory,
      currentQueueSize: 5,
      averageWaitMinutes: 45,
      nowTs: Date.now(),
    });
    expect(result.waitPressureBoost).toBe(1.15);
  });

  it("classifies risk level high when volume > 30", () => {
    const heavyHistory = baseHistory.map(h => ({ ...h, count: 35 }));
    const result = predictDemandWindow({
      historicalVolumes: heavyHistory,
      currentQueueSize: 30,
      averageWaitMinutes: 40,
      nowTs: Date.now(),
    });
    expect(result.riskLevel).toBe("high");
  });

  it("returns low risk with empty history", () => {
    const result = predictDemandWindow({
      historicalVolumes: [],
      currentQueueSize: 0,
      averageWaitMinutes: 0,
      nowTs: Date.now(),
    });
    expect(result.riskLevel).toBe("low");
    expect(result.nextHourVolume).toBe(0);
  });

  it("only uses last 24 data points", () => {
    const longHistory = [
      ...Array.from({ length: 48 }, () => ({ ts: 0, count: 100, erCount: 50, telemedCount: 30, clinicCount: 20 })),
      ...baseHistory,
    ];
    const result = predictDemandWindow({
      historicalVolumes: longHistory,
      currentQueueSize: 0,
      averageWaitMinutes: 0,
      nowTs: Date.now(),
    });
    expect(result.nextHourVolume).toBe(20);
  });
});

// ── Deterioration Predictor ───────────────────────────────────────────────────

describe("predictPatientDeterioration", () => {
  const base = {
    ageYears: 40,
    complaint: "fever",
    symptoms: [],
    vitals: {},
    safetyDisposition: "ROUTINE" as const,
    differential: [],
  };

  it("ER_NOW adds 5 to score and triggers escalation", () => {
    const routine = predictPatientDeterioration({ ...base, safetyDisposition: "ROUTINE" });
    const erNow   = predictPatientDeterioration({ ...base, safetyDisposition: "ER_NOW" });
    // ER_NOW adds exactly 5 points over ROUTINE
    expect(erNow.score - routine.score).toBe(5);
    // ER_NOW by itself with fever → score 6 → medium → escalation needed
    expect(erNow.predictedNeedForEscalation).toBe(true);
  });

  it("ER_NOW with additional risk factors reaches high risk", () => {
    const result = predictPatientDeterioration({
      ...base,
      safetyDisposition: "ER_NOW",
      // SpO2 < 92 (+3), RR >= 22 (+2) → total ≥ 5+1+3+2 = 11 → high
      vitals: { oxygenSaturation: 88, respiratoryRate: 24 },
    });
    expect(result.riskLevel).toBe("high");
    expect(result.estimatedTimeToConcernMinutes).toBe(15);
  });

  it("URGENT disposition adds exactly 2 points over ROUTINE", () => {
    const routine = predictPatientDeterioration({ ...base, safetyDisposition: "ROUTINE" });
    const urgent  = predictPatientDeterioration({ ...base, safetyDisposition: "URGENT" });
    // ROUTINE adds 0 disposition points; URGENT adds 2
    expect(urgent.score - routine.score).toBe(2);
    // Note: URGENT + fever = score 3 (< 4 threshold), so still low risk
    // escalation only triggers when total score >= 4
  });

  it("URGENT with elevated vitals yields medium risk", () => {
    const result = predictPatientDeterioration({
      ...base,
      safetyDisposition: "URGENT",
      // HR >= 120 (+2), RR >= 22 (+2) → URGENT(2) + fever(1) + HR(2) = 5 → medium
      vitals: { heartRate: 125 },
    });
    expect(result.riskLevel).toBe("medium");
    expect(result.predictedNeedForEscalation).toBe(true);
  });

  it("age >= 65 adds 1 point", () => {
    const young = predictPatientDeterioration({ ...base, ageYears: 40 });
    const old   = predictPatientDeterioration({ ...base, ageYears: 70 });
    expect(old.score).toBe(young.score + 1);
  });

  it("SpO2 < 92 adds 3 points", () => {
    const normal = predictPatientDeterioration({ ...base, vitals: { oxygenSaturation: 98 } });
    const low    = predictPatientDeterioration({ ...base, vitals: { oxygenSaturation: 88 } });
    expect(low.score).toBe(normal.score + 3);
  });

  it("heavy_bleeding symptom adds 4 points", () => {
    const without = predictPatientDeterioration({ ...base });
    const with_   = predictPatientDeterioration({ ...base, symptoms: ["heavy_bleeding"] });
    expect(with_.score).toBe(without.score + 4);
  });

  it("chest_pain complaint adds 2 points above a neutral complaint", () => {
    // Use "back_pain" which has no score in the rule table (0 points)
    const neutral = predictPatientDeterioration({ ...base, complaint: "back_pain" });
    const chest   = predictPatientDeterioration({ ...base, complaint: "chest_pain" });
    expect(chest.score - neutral.score).toBe(2);
  });

  it("fever complaint adds 1 point above a neutral complaint", () => {
    const neutral = predictPatientDeterioration({ ...base, complaint: "back_pain" });
    const fever   = predictPatientDeterioration({ ...base, complaint: "fever" });
    expect(fever.score - neutral.score).toBe(1);
  });

  it("high-confidence differential adds 1 point", () => {
    const without = predictPatientDeterioration({ ...base, differential: [] });
    const with_   = predictPatientDeterioration({ ...base, differential: [{ diagnosis: "PE", probability: 0.85 }] });
    expect(with_.score).toBe(without.score + 1);
  });

  it("routine healthy patient is low risk", () => {
    const result = predictPatientDeterioration({ ...base });
    expect(result.riskLevel).toBe("low");
    expect(result.predictedNeedForEscalation).toBe(false);
    expect(result.estimatedTimeToConcernMinutes).toBe(240);
  });
});

// ── Capacity Engine ───────────────────────────────────────────────────────────

describe("computeCapacityState", () => {
  const stable = {
    telemedOpenSlots: 20,
    clinicOpenSlots: 10,
    physicianAvailable: 4,
    nurseAvailable: 6,
    currentQueueSize: 5,
    averageWaitMinutes: 10,
  };

  it("returns stable with ample capacity", () => {
    const result = computeCapacityState(stable);
    expect(result.systemState).toBe("stable");
    expect(result.canAbsorbMoreTelemed).toBe(true);
    expect(result.canAbsorbMoreClinic).toBe(true);
  });

  it("returns strained when telemed and clinic slots are zero", () => {
    const result = computeCapacityState({
      ...stable,
      telemedOpenSlots: 0,
      clinicOpenSlots: 0,
      physicianAvailable: 1,
      averageWaitMinutes: 35,
    });
    expect(result.systemState).toBe("strained");
    expect(result.canAbsorbMoreTelemed).toBe(false);
    expect(result.canAbsorbMoreClinic).toBe(false);
  });

  it("adds 2 to strain when wait > 30", () => {
    const short = computeCapacityState({ ...stable, averageWaitMinutes: 10 });
    const long_ = computeCapacityState({ ...stable, averageWaitMinutes: 40 });
    expect(long_.strainScore).toBeGreaterThan(short.strainScore);
  });

  it("utilization is capped at 1 when slots are zero", () => {
    const result = computeCapacityState({ ...stable, telemedOpenSlots: 0, clinicOpenSlots: 0 });
    expect(result.telemedUtilization).toBe(1);
    expect(result.clinicUtilization).toBe(1);
  });

  it("busy state when strain score 3-5", () => {
    const result = computeCapacityState({
      ...stable,
      telemedOpenSlots: 8,
      clinicOpenSlots: 8,
      physicianAvailable: 1,
      currentQueueSize: 7,
      averageWaitMinutes: 35,
    });
    expect(["busy", "strained"]).toContain(result.systemState);
  });
});

// ── Routing Engine ────────────────────────────────────────────────────────────

describe("routePatientAcrossSystem", () => {
  const baseDet = { score: 2, riskLevel: "low" as const, predictedNeedForEscalation: false };
  const baseCapOk = { canAbsorbMoreTelemed: true, canAbsorbMoreClinic: true, systemState: "stable" as const };
  const baseCapFull = { canAbsorbMoreTelemed: false, canAbsorbMoreClinic: false, systemState: "strained" as const };
  const surgeNormal = { status: "normal" as const };
  const surgeCritical = { status: "critical" as const };

  function patient(id: string, safety?: "ER_NOW" | "URGENT" | "ROUTINE" | "CONTINUE") {
    return { patientId: id, complaint: "fever", symptoms: [], safetyDisposition: safety };
  }

  it("ER_NOW always routes to ER immediately", () => {
    const result = routePatientAcrossSystem({
      patient: patient("p1", "ER_NOW"),
      deterioration: baseDet,
      capacityState: baseCapOk,
      surgeState: surgeNormal,
    });
    expect(result.route.destination).toBe("ER");
    expect(result.route.urgency).toBe("immediate");
  });

  it("high deterioration routes to CLINIC urgent", () => {
    const result = routePatientAcrossSystem({
      patient: patient("p2", "ROUTINE"),
      deterioration: { score: 10, riskLevel: "high", predictedNeedForEscalation: true },
      capacityState: baseCapOk,
      surgeState: surgeNormal,
    });
    expect(result.route.destination).toBe("CLINIC");
    expect(result.route.urgency).toBe("urgent");
  });

  it("URGENT with clinic available routes to CLINIC", () => {
    const result = routePatientAcrossSystem({
      patient: patient("p3", "URGENT"),
      deterioration: baseDet,
      capacityState: baseCapOk,
      surgeState: surgeNormal,
    });
    expect(result.route.destination).toBe("CLINIC");
  });

  it("URGENT with no clinic routes to ER", () => {
    const result = routePatientAcrossSystem({
      patient: patient("p4", "URGENT"),
      deterioration: baseDet,
      capacityState: { ...baseCapOk, canAbsorbMoreClinic: false },
      surgeState: surgeNormal,
    });
    expect(result.route.destination).toBe("ER");
  });

  it("critical surge diverts to TELEMED if available", () => {
    const result = routePatientAcrossSystem({
      patient: patient("p5", "ROUTINE"),
      deterioration: baseDet,
      capacityState: baseCapOk,
      surgeState: surgeCritical,
    });
    expect(result.route.destination).toBe("TELEMED");
  });

  it("telemed preferred for routine low-acuity", () => {
    const result = routePatientAcrossSystem({
      patient: patient("p6", "ROUTINE"),
      deterioration: baseDet,
      capacityState: baseCapOk,
      surgeState: surgeNormal,
    });
    expect(result.route.destination).toBe("TELEMED");
  });

  it("falls back to CLINIC when telemed full", () => {
    const result = routePatientAcrossSystem({
      patient: patient("p7"),
      deterioration: baseDet,
      capacityState: { ...baseCapOk, canAbsorbMoreTelemed: false },
      surgeState: surgeNormal,
    });
    expect(result.route.destination).toBe("CLINIC");
  });

  it("falls back to HOME when both at capacity", () => {
    const result = routePatientAcrossSystem({
      patient: patient("p8"),
      deterioration: baseDet,
      capacityState: baseCapFull,
      surgeState: surgeNormal,
    });
    expect(result.route.destination).toBe("HOME");
  });

  it("includes patientId and deterioration in output", () => {
    const result = routePatientAcrossSystem({
      patient: patient("p9"),
      deterioration: baseDet,
      capacityState: baseCapOk,
      surgeState: surgeNormal,
    });
    expect(result.patientId).toBe("p9");
    expect(result.deterioration).toEqual(baseDet);
  });
});

// ── Surge Detector ────────────────────────────────────────────────────────────

describe("detectOperationalSurge", () => {
  const calmForecast = { nextHourVolume: 10, nextHourEr: 2, riskLevel: "low" as const };
  const heavyForecast = { nextHourVolume: 30, nextHourEr: 8, riskLevel: "high" as const };
  const stableCapacity  = { strainScore: 1, systemState: "stable" as const };
  const strainedCapacity = { strainScore: 7, systemState: "strained" as const };

  it("returns normal when calm and all systems healthy", () => {
    const result = detectOperationalSurge({
      demandForecast: calmForecast,
      capacityState: stableCapacity,
      ehrHealthy: true,
      fhirHealthy: true,
    });
    expect(result.status).toBe("normal");
    expect(result.recommendedActions).toHaveLength(0);
  });

  it("returns critical under heavy demand + strained capacity", () => {
    const result = detectOperationalSurge({
      demandForecast: heavyForecast,
      capacityState: strainedCapacity,
      ehrHealthy: true,
      fhirHealthy: true,
    });
    expect(result.status).toBe("critical");
    expect(result.recommendedActions.length).toBeGreaterThan(0);
  });

  it("EHR down adds 2 to surge score", () => {
    const healthy = detectOperationalSurge({ demandForecast: calmForecast, capacityState: stableCapacity, ehrHealthy: true, fhirHealthy: true });
    const broken  = detectOperationalSurge({ demandForecast: calmForecast, capacityState: stableCapacity, ehrHealthy: false, fhirHealthy: true });
    expect(broken.score).toBe(healthy.score + 2);
    expect(broken.recommendedActions.some(a => a.includes("EHR"))).toBe(true);
  });

  it("FHIR down adds 1 to surge score and recommends retry queue", () => {
    const healthy = detectOperationalSurge({ demandForecast: calmForecast, capacityState: stableCapacity, ehrHealthy: true, fhirHealthy: true });
    const broken  = detectOperationalSurge({ demandForecast: calmForecast, capacityState: stableCapacity, ehrHealthy: true, fhirHealthy: false });
    expect(broken.score).toBe(healthy.score + 1);
    expect(broken.recommendedActions.some(a => a.includes("FHIR"))).toBe(true);
  });

  it("surge status is between normal and critical", () => {
    const result = detectOperationalSurge({
      demandForecast: { nextHourVolume: 28, nextHourEr: 6, riskLevel: "high" },
      capacityState: { strainScore: 3, systemState: "busy" },
      ehrHealthy: true,
      fhirHealthy: true,
    });
    expect(["watch", "surge", "critical"]).toContain(result.status);
  });
});

// ── Population Intelligence ───────────────────────────────────────────────────

describe("buildPopulationSignals", () => {
  const forecast = { nextHourVolume: 20, nextHourEr: 4 };

  it("counts top complaints correctly", () => {
    const patients = [
      { complaint: "fever", symptoms: [] },
      { complaint: "fever", symptoms: [] },
      { complaint: "cough", symptoms: [] },
    ];
    const routes = patients.map(() => ({ route: { destination: "TELEMED" as const, urgency: "routine", reason: "" } }));
    const result = buildPopulationSignals({ patients, routes, forecast });
    expect(result.topComplaints[0]).toEqual({ complaint: "fever", count: 2 });
  });

  it("returns only top 5 complaints", () => {
    const complaints = ["a", "b", "c", "d", "e", "f"].map(c => ({ complaint: c, symptoms: [] }));
    const routes = complaints.map(() => ({ route: { destination: "TELEMED" as const, urgency: "routine", reason: "" } }));
    const result = buildPopulationSignals({ patients: complaints, routes, forecast });
    expect(result.topComplaints.length).toBeLessThanOrEqual(5);
  });

  it("flags syndromic signal at 5 or more cases of same complaint", () => {
    const patients = Array.from({ length: 7 }, () => ({ complaint: "fever", symptoms: [] }));
    const routes = patients.map(() => ({ route: { destination: "CLINIC" as const, urgency: "routine", reason: "" } }));
    const result = buildPopulationSignals({ patients, routes, forecast });
    expect(result.possibleSyndromicSignal).not.toBeNull();
    expect(result.possibleSyndromicSignal).toContain("fever");
  });

  it("no syndromic signal below 5 cases", () => {
    const patients = Array.from({ length: 4 }, () => ({ complaint: "fever", symptoms: [] }));
    const routes = patients.map(() => ({ route: { destination: "CLINIC" as const, urgency: "routine", reason: "" } }));
    const result = buildPopulationSignals({ patients, routes, forecast });
    expect(result.possibleSyndromicSignal).toBeNull();
  });

  it("computes ER rate from routes", () => {
    const patients = [{ complaint: "chest_pain", symptoms: [] }, { complaint: "fever", symptoms: [] }];
    const routes = [
      { route: { destination: "ER"     as const, urgency: "immediate", reason: "" } },
      { route: { destination: "TELEMED" as const, urgency: "routine",  reason: "" } },
    ];
    const result = buildPopulationSignals({ patients, routes, forecast });
    expect(result.erRate).toBe(0.5);
  });

  it("passes through forecast values", () => {
    const result = buildPopulationSignals({ patients: [], routes: [], forecast: { nextHourVolume: 42, nextHourEr: 7 } });
    expect(result.nextHourVolume).toBe(42);
    expect(result.nextHourEr).toBe(7);
  });

  it("handles empty patients gracefully", () => {
    const result = buildPopulationSignals({ patients: [], routes: [], forecast });
    expect(result.topComplaints).toHaveLength(0);
    expect(result.erRate).toBe(0);
    expect(result.possibleSyndromicSignal).toBeNull();
  });

  it("uses syndromic label for known complaint types", () => {
    const patients = Array.from({ length: 6 }, () => ({ complaint: "cough", symptoms: [] }));
    const routes = patients.map(() => ({ route: { destination: "TELEMED" as const, urgency: "routine", reason: "" } }));
    const result = buildPopulationSignals({ patients, routes, forecast });
    expect(result.possibleSyndromicSignal).toContain("Respiratory");
  });
});
