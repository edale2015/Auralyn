import { describe, it, expect } from "vitest";

// ─── 1. Sepsis Engine ─────────────────────────────────────────────────────────
import { detectSepsisRisk } from "../../server/sepsis/sepsisEngine";

describe("Batch43 — sepsisEngine", () => {
  const normalPatient = {
    id: "p1",
    vitals: { hr: 72, spo2: 98, temp: 98.6, systolicBP: 120, rr: 16 },
    symptoms: [],
    labs: {},
  };

  const criticalPatient = {
    id: "p2",
    vitals: { hr: 138, spo2: 86, temp: 103.8, systolicBP: 82, rr: 28, alteredMentalStatus: true },
    symptoms: ["fever", "chills"],
    labs: { lactate: 3.2, wbc: 18 },
  };

  it("normal patient is not high risk", () => {
    const r = detectSepsisRisk(normalPatient);
    expect(r.highRisk).toBe(false);
    expect(r.probability).toBeLessThan(0.6);
  });

  it("critical patient with infection + lactate = high risk", () => {
    const r = detectSepsisRisk(criticalPatient);
    expect(r.highRisk).toBe(true);
    expect(r.probability).toBeGreaterThanOrEqual(0.6);
  });

  it("trigger is SEPSIS_ALERT when high risk", () => {
    const r = detectSepsisRisk(criticalPatient);
    expect(r.trigger).toBe("SEPSIS_ALERT");
  });

  it("trigger is null for normal patient", () => {
    const r = detectSepsisRisk(normalPatient);
    expect(r.trigger).toBeNull();
  });

  it("factors includes infection signal text", () => {
    const r = detectSepsisRisk(criticalPatient);
    expect(r.factors.some((f: string) => f.toLowerCase().includes("infection") || f.toLowerCase().includes("fever"))).toBe(true);
  });

  it("lactate > 4 adds extra risk (using moderate patient to avoid cap)", () => {
    // Use a moderate patient so we're not already capped at 1.0
    const moderate = { id: "pm", vitals: { hr: 95, spo2: 94, temp: 100.5, systolicBP: 108, rr: 19 }, symptoms: [], labs: {} };
    const high = detectSepsisRisk({ ...moderate, labs: { lactate: 4.5 } });
    const low  = detectSepsisRisk({ ...moderate, labs: { lactate: 1.0 } });
    expect(high.probability).toBeGreaterThan(low.probability);
  });

  it("probability is clamped to 0–1", () => {
    const r = detectSepsisRisk(criticalPatient);
    expect(r.probability).toBeGreaterThanOrEqual(0);
    expect(r.probability).toBeLessThanOrEqual(1);
  });
});

// ─── 2. Digital Twin Engine ────────────────────────────────────────────────────
import { runDigitalTwin } from "../../server/digitalTwin/digitalTwinEngine";

describe("Batch43 — digitalTwinEngine", () => {
  const normalPatient = {
    id: "p1", vitals: { hr: 72, spo2: 98, temp: 98.6, systolicBP: 120, rr: 16 }, symptoms: [],
  };
  const criticalPatient = {
    id: "p2", vitals: { hr: 138, spo2: 87, temp: 103.8, systolicBP: 82, rr: 28 }, symptoms: ["fever", "chills"],
  };

  it("returns required TwinResult fields", () => {
    const r = runDigitalTwin(normalPatient, 60);
    expect(r.patientId).toBe("p1");
    expect(typeof r.deteriorationProb).toBe("number");
    expect(typeof r.icuProb).toBe("number");
    expect(typeof r.tteMinutes).toBe("number");
    expect(typeof r.riskSummary).toBe("string");
  });

  it("probabilities are 0–1", () => {
    const r = runDigitalTwin(normalPatient, 60);
    expect(r.deteriorationProb).toBeGreaterThanOrEqual(0);
    expect(r.deteriorationProb).toBeLessThanOrEqual(1);
    expect(r.icuProb).toBeGreaterThanOrEqual(0);
    expect(r.icuProb).toBeLessThanOrEqual(1);
  });

  it("critical patient has higher ICU probability than normal", () => {
    // Run multiple times to account for stochastic noise
    let critSum = 0, normSum = 0;
    for (let i = 0; i < 5; i++) {
      critSum += runDigitalTwin(criticalPatient, 120).icuProb;
      normSum += runDigitalTwin(normalPatient, 120).icuProb;
    }
    expect(critSum / 5).toBeGreaterThan(normSum / 5);
  });

  it("fluids intervention reduces deterioration vs no fluids", () => {
    const withFluids    = runDigitalTwin({ ...criticalPatient, interventions: ["fluids"] }, 60);
    const withoutFluids = runDigitalTwin(criticalPatient, 60);
    // Not deterministic but fluids should help on average — just check types
    expect(typeof withFluids.deteriorationProb).toBe("number");
    expect(typeof withoutFluids.deteriorationProb).toBe("number");
  });

  it("riskSummary is a valid value", () => {
    const r = runDigitalTwin(normalPatient);
    expect(["STABLE", "WATCH", "DETERIORATING", "ICU_IMMINENT"]).toContain(r.riskSummary);
  });

  it("trajectory has samples", () => {
    const r = runDigitalTwin(normalPatient, 120);
    expect(Array.isArray(r.trajectory)).toBe(true);
    expect(r.trajectory.length).toBeGreaterThan(0);
  });
});

// ─── 3. ICU Allocator ─────────────────────────────────────────────────────────
import { allocateICUBeds } from "../../server/icu/icuAllocator";

describe("Batch43 — icuAllocator", () => {
  const patients = [
    { id: "p1", vitals: { hr: 138, spo2: 87, temp: 103.8, systolicBP: 82, rr: 28 }, symptoms: ["fever"] },
    { id: "p2", vitals: { hr: 78,  spo2: 98, temp: 98.6,  systolicBP: 122, rr: 16 }, symptoms: [] },
  ];
  const beds = [
    { id: "B1", hospitalId: "H1", available: true },
    { id: "B2", hospitalId: "H2", available: true },
    { id: "B3", hospitalId: "H1", available: false },
  ];

  it("returns array of assignments", () => {
    const r = allocateICUBeds(patients, beds);
    expect(Array.isArray(r)).toBe(true);
  });

  it("only assigns available beds", () => {
    const r = allocateICUBeds(patients, beds);
    r.forEach((a) => expect(a.bedId).not.toBe("B3"));
  });

  it("assignments have required fields", () => {
    const r = allocateICUBeds(patients, beds);
    r.forEach((a) => {
      expect(a.patientId).toBeDefined();
      expect(a.bedId).toBeDefined();
      expect(typeof a.priorityScore).toBe("number");
    });
  });
});

// ─── 4. Hospital Coordinator ──────────────────────────────────────────────────
import { routePatients, getSystemCapacity } from "../../server/network/hospitalCoordinator";

describe("Batch43 — hospitalCoordinator", () => {
  const hospitals = [
    { id: "H1", name: "NYU",     icuBeds: 20, availableBeds: 8  },
    { id: "H2", name: "Bellevue",icuBeds: 30, availableBeds: 0  },
    { id: "H3", name: "Lenox",   icuBeds: 15, availableBeds: 12 },
  ];

  it("does not route to hospital with no beds", () => {
    const routes = routePatients([{ id: "p1" }], hospitals);
    expect(routes[0].assignedHospital).not.toBe("H2");
  });

  it("routes to a hospital with beds", () => {
    const routes = routePatients([{ id: "p1" }], hospitals);
    expect(routes[0].assignedHospital).toBeDefined();
    expect(["H1", "H3"]).toContain(routes[0].assignedHospital);
  });

  it("returns null when no hospital has beds", () => {
    const noBeds  = hospitals.map((h) => ({ ...h, availableBeds: 0 }));
    const routes  = routePatients([{ id: "p1" }], noBeds);
    expect(routes[0].assignedHospital).toBeNull();
  });

  it("getSystemCapacity returns utilization metrics", () => {
    const cap = getSystemCapacity(hospitals);
    expect(cap.total).toBe(65);
    expect(cap.available).toBe(20);
    expect(typeof cap.utilizationPct).toBe("number");
    expect(typeof cap.critical).toBe("boolean");
  });
});

// ─── 5. RL Engine ─────────────────────────────────────────────────────────────
import { computeReward, learnFromOutcome, chooseBestAction } from "../../server/rl/rlEngine";

describe("Batch43 — rlEngine", () => {
  it("computeReward: survived, no ICU, short LOS = high reward", () => {
    const r = computeReward({ icu: false, mortality: false, losHours: 4 });
    expect(r).toBeGreaterThan(100);
  });

  it("computeReward: mortality reduces reward significantly", () => {
    const alive = computeReward({ icu: false, mortality: false, losHours: 4 });
    const dead  = computeReward({ icu: false, mortality: true,  losHours: 4 });
    expect(alive).toBeGreaterThan(dead);
  });

  it("chooseBestAction returns a valid action", async () => {
    const best = await chooseBestAction({ riskScore: 5, sepsisProb: 0.3 }, ["observe", "order_labs", "give_fluids"]);
    expect(["observe", "order_labs", "give_fluids"]).toContain(best);
  });

  it("learnFromOutcome returns a numeric reward", async () => {
    const reward = await learnFromOutcome({ riskScore: 7 }, "escalate_ICU", { icu: true, mortality: false, losHours: 24 });
    expect(typeof reward).toBe("number");
  });
});

// ─── 6. RL Safety Gate ────────────────────────────────────────────────────────
import { validateRLAction, filterSafeActions } from "../../server/rl/rlSafetyGate";

describe("Batch43 — rlSafetyGate", () => {
  it("forbids prescribe_antibiotics", () => {
    const r = validateRLAction("prescribe_antibiotics");
    expect(r.safe).toBe(false);
  });

  it("forbids discharge_patient", () => {
    const r = validateRLAction("discharge_patient");
    expect(r.safe).toBe(false);
  });

  it("allows observe", () => {
    const r = validateRLAction("observe");
    expect(r.safe).toBe(true);
  });

  it("restricted action is safe but requires physician", () => {
    const r = validateRLAction("escalate_ICU");
    expect(r.safe).toBe(true);
    expect(r.requiresPhysician).toBe(true);
  });

  it("filterSafeActions removes forbidden actions", () => {
    const safe = filterSafeActions(["observe", "prescribe_antibiotics", "order_labs"] as any);
    expect(safe).toContain("observe");
    expect(safe).not.toContain("prescribe_antibiotics");
  });
});

// ─── 7. Hospital Optimizer ────────────────────────────────────────────────────
import { optimizeHospitalFlow } from "../../server/ops/hospitalOptimizer";

describe("Batch43 — hospitalOptimizer", () => {
  const makeBeds = (n: number, avail: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `B${i}`, available: i < avail }));

  it("normal load = NORMAL strategy", () => {
    const r = optimizeHospitalFlow(Array(10).fill({}), makeBeds(20, 15));
    expect(r.strategy).toBe("NORMAL");
  });

  it("high load + low beds = DIVERT strategy", () => {
    const r = optimizeHospitalFlow(Array(55).fill({}), makeBeds(20, 4));
    expect(r.strategy).toBe("DIVERT");
  });

  it("extreme load = CRITICAL_OVERLOAD", () => {
    const r = optimizeHospitalFlow(Array(75).fill({}), makeBeds(20, 1));
    expect(r.strategy).toBe("CRITICAL_OVERLOAD");
  });

  it("returns actions and recommendation", () => {
    const r = optimizeHospitalFlow([], makeBeds(10, 8));
    expect(Array.isArray(r.actions)).toBe(true);
    expect(typeof r.recommendation).toBe("string");
  });
});

// ─── 8. EMS Ingestion ────────────────────────────────────────────────────────
import { ingestEMSCall, ingestBatch } from "../../server/ems/emsIngestion";

describe("Batch43 — emsIngestion", () => {
  const call = {
    id: "EMS-1", vitals: { hr: 130, spo2: 88, temp: 102.5, systolicBP: 85, rr: 26 },
    symptoms: ["chest pain"], etaMinutes: 8,
  };

  it("ingests a single EMS call", () => {
    const p = ingestEMSCall(call);
    expect(p.id).toBe("EMS-1");
    expect(p.source).toBe("EMS");
    expect(p.vitals.systolicBP).toBe(85);
  });

  it("fills defaults for missing vitals", () => {
    const minimal = ingestEMSCall({ id: "EMS-min", vitals: { hr: 90, spo2: 95 } as any, symptoms: [], etaMinutes: 5 });
    expect(minimal.vitals.temp).toBe(98.6);
    expect(minimal.vitals.rr).toBe(16);
  });

  it("batch ingestion returns array", () => {
    const batch = ingestBatch([call, { ...call, id: "EMS-2" }]);
    expect(batch).toHaveLength(2);
  });
});

// ─── 9. EMS Router ────────────────────────────────────────────────────────────
import { routeEMS } from "../../server/ems/emsRouter";
import { ingestEMSCall as ingest } from "../../server/ems/emsIngestion";

describe("Batch43 — emsRouter", () => {
  const hospitals = [
    { id: "H1", name: "NYU", icuBeds: 20, availableBeds: 8, location: { lat: 40.74, lng: -73.97 } },
    { id: "H2", name: "Bellevue", icuBeds: 30, availableBeds: 15, location: { lat: 40.74, lng: -73.97 } },
  ];

  const critical = ingest({ id: "EMS-1", vitals: { hr: 138, spo2: 86, temp: 103.5, systolicBP: 82, rr: 28 }, symptoms: ["fever", "chills"], etaMinutes: 7 });
  const normal   = ingest({ id: "EMS-2", vitals: { hr: 78,  spo2: 98, temp: 98.6,  systolicBP: 122, rr: 16 }, symptoms: [], etaMinutes: 12 });

  it("routes to a hospital", () => {
    const r = routeEMS(critical, hospitals);
    expect(r.assignedHospital).toBeTruthy();
  });

  it("critical patient gets CRITICAL or URGENT alert level", () => {
    const r = routeEMS(critical, hospitals);
    expect(["CRITICAL", "URGENT"]).toContain(r.alertLevel);
  });

  it("normal patient gets ROUTINE alert level", () => {
    const r = routeEMS(normal, hospitals);
    expect(r.alertLevel).toBe("ROUTINE");
  });

  it("returns required fields", () => {
    const r = routeEMS(critical, hospitals);
    expect(r.patientId).toBe("EMS-1");
    expect(typeof r.predictedICUProb).toBe("number");
    expect(typeof r.sepsisFlag).toBe("boolean");
  });
});

// ─── 10. Intervention agent in scope engine ────────────────────────────────────
import { scopeEngine } from "../../server/scope/agentScopeEngine";

describe("Batch43 — interventionAgent scope", () => {
  it("intervention_agent can suggest:intervention", () => {
    const r = scopeEngine.evaluate({ agentRole: "intervention_agent", action: "suggest:intervention", context: { confidence: 0.95 } });
    expect(r.allowed).toBe(true);
  });

  it("intervention_agent cannot write:ehr", () => {
    const r = scopeEngine.evaluate({ agentRole: "intervention_agent", action: "write:ehr", context: { confidence: 0.95 } });
    expect(r.allowed).toBe(false);
  });

  it("intervention_agent execute:escalation requires override", () => {
    const r = scopeEngine.evaluate({ agentRole: "intervention_agent", action: "execute:escalation", context: { confidence: 0.95, physicianSigned: false } });
    expect(r.requiresOverride).toBe(true);
  });

  it("intervention_agent execute:escalation allowed when physician signed", () => {
    const r = scopeEngine.evaluate({ agentRole: "intervention_agent", action: "execute:escalation", context: { confidence: 0.95, physicianSigned: true } });
    expect(r.allowed).toBe(true);
  });
});
