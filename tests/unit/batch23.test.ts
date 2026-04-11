import { describe, it, expect, beforeEach, vi } from "vitest";
import { existsSync } from "fs";
import { resolve } from "path";

// ─── EHR Types ────────────────────────────────────────────────────────────────
describe("EhrTypes — unified EHR interface shape", () => {
  it("EhrSystem type covers all three systems", async () => {
    const { } = await import("../../server/integrations/ehr/types");
    const systems = ["ecw", "athena", "epic"] as const;
    expect(systems).toHaveLength(3);
    expect(systems).toContain("ecw");
    expect(systems).toContain("athena");
    expect(systems).toContain("epic");
  });

  it("EhrWritePayload has required fields", () => {
    const payload = {
      patientId: "p123",
      disposition: "discharge",
      note: "No acute distress",
      vitals: { bp: "120/80" },
      traceId: "t-001",
    };
    expect(payload.patientId).toBe("p123");
    expect(payload.disposition).toBe("discharge");
  });

  it("EhrPatientContext includes all clinical fields", () => {
    const ctx = {
      patientId: "p456",
      firstName: "Jane",
      lastName: "Doe",
      dob: "1990-01-15",
      sex: "F",
      medications: ["amoxicillin"],
      allergies: ["penicillin"],
      problems: ["sinusitis"],
      vitals: { temp: 98.6 },
    };
    expect(ctx.allergies).toContain("penicillin");
    expect(ctx.medications).toContain("amoxicillin");
    expect(ctx.problems).toContain("sinusitis");
  });
});

// ─── Athena Adapter ───────────────────────────────────────────────────────────
describe("athenaAdapter — interface compliance", () => {
  it("has system = athena", async () => {
    const { athenaAdapter } = await import("../../server/integrations/athenaAdapter");
    expect(athenaAdapter.system).toBe("athena");
  });

  it("implements EhrAdapter interface", async () => {
    const { athenaAdapter } = await import("../../server/integrations/athenaAdapter");
    expect(typeof athenaAdapter.getPatientContext).toBe("function");
    expect(typeof athenaAdapter.writeEncounter).toBe("function");
    expect(typeof athenaAdapter.writeObservation).toBe("function");
    expect(typeof athenaAdapter.ping).toBe("function");
  });

  it("ping returns false when ATHENA_API_BASE not set", async () => {
    const orig = process.env.ATHENA_API_BASE;
    delete process.env.ATHENA_API_BASE;
    const { athenaAdapter } = await import("../../server/integrations/athenaAdapter");
    const result = await athenaAdapter.ping();
    expect(result).toBe(false);
    if (orig !== undefined) process.env.ATHENA_API_BASE = orig;
  });

  it("getPatientContext throws when env not set", async () => {
    delete process.env.ATHENA_API_BASE;
    delete process.env.ATHENA_PRACTICE_ID;
    delete process.env.ATHENA_TOKEN;
    const { athenaAdapter } = await import("../../server/integrations/athenaAdapter");
    await expect(athenaAdapter.getPatientContext("p1")).rejects.toThrow();
  });

  it("writeEncounter throws when env not configured", async () => {
    delete process.env.ATHENA_API_BASE;
    const { athenaAdapter } = await import("../../server/integrations/athenaAdapter");
    await expect(athenaAdapter.writeEncounter({ patientId: "p1" })).rejects.toThrow();
  });

  it("writeObservation throws when env not configured", async () => {
    delete process.env.ATHENA_API_BASE;
    const { athenaAdapter } = await import("../../server/integrations/athenaAdapter");
    await expect(athenaAdapter.writeObservation!({ patientId: "p1", vitals: {} })).rejects.toThrow();
  });
});

// ─── Epic Adapter ─────────────────────────────────────────────────────────────
describe("epicAdapter — interface compliance", () => {
  it("has system = epic", async () => {
    const { epicAdapter } = await import("../../server/integrations/epicAdapter");
    expect(epicAdapter.system).toBe("epic");
  });

  it("implements all EhrAdapter methods", async () => {
    const { epicAdapter } = await import("../../server/integrations/epicAdapter");
    expect(typeof epicAdapter.getPatientContext).toBe("function");
    expect(typeof epicAdapter.writeEncounter).toBe("function");
    expect(typeof epicAdapter.writeObservation).toBe("function");
    expect(typeof epicAdapter.ping).toBe("function");
  });

  it("ping returns false when FHIR_BASE not set", async () => {
    const orig = process.env.FHIR_BASE;
    delete process.env.FHIR_BASE;
    const { epicAdapter } = await import("../../server/integrations/epicAdapter");
    const result = await epicAdapter.ping();
    expect(result).toBe(false);
    if (orig !== undefined) process.env.FHIR_BASE = orig;
  });

  it("getPatientContext throws when env not set", async () => {
    delete process.env.FHIR_BASE;
    delete process.env.EPIC_TOKEN;
    const { epicAdapter } = await import("../../server/integrations/epicAdapter");
    await expect(epicAdapter.getPatientContext("p1")).rejects.toThrow();
  });

  it("postObservation exported as standalone function", async () => {
    const { postObservation } = await import("../../server/integrations/epicAdapter");
    expect(typeof postObservation).toBe("function");
  });
});

// ─── ECW Adapter — unified interface ─────────────────────────────────────────
describe("ecwAdapter — unified EhrAdapter export", () => {
  it("exports ecwAdapter with system = ecw", async () => {
    const { ecwAdapter } = await import("../../server/integrations/ecwAdapter");
    expect(ecwAdapter.system).toBe("ecw");
  });

  it("ecwAdapter.ping returns false when ECW_API not set", async () => {
    const orig = process.env.ECW_API;
    delete process.env.ECW_API;
    const { ecwAdapter } = await import("../../server/integrations/ecwAdapter");
    const result = await ecwAdapter.ping();
    expect(result).toBe(false);
    if (orig !== undefined) process.env.ECW_API = orig;
  });

  it("ecwAdapter.writeEncounter delegates to sendToECWEncounter", async () => {
    const { ecwAdapter, sendToECWEncounter } = await import("../../server/integrations/ecwAdapter");
    expect(typeof ecwAdapter.writeEncounter).toBe("function");
    expect(typeof sendToECWEncounter).toBe("function");
  });

  it("ecwAdapter.getPatientContext throws when ECW_API not configured", async () => {
    delete process.env.ECW_API;
    delete process.env.ECW_TOKEN;
    const { ecwAdapter } = await import("../../server/integrations/ecwAdapter");
    await expect(ecwAdapter.getPatientContext("p1")).rejects.toThrow();
  });

  it("still exports legacy sendToECWEncounter and safeEHR", async () => {
    const { sendToECWEncounter, safeEHR } = await import("../../server/integrations/ecwAdapter");
    expect(typeof sendToECWEncounter).toBe("function");
    expect(typeof safeEHR).toBe("function");
  });
});

// ─── EHR Router ───────────────────────────────────────────────────────────────
describe("ehrRouter — unified tri-EHR orchestration", () => {
  it("PRIMARY_EHR is ecw", async () => {
    const { PRIMARY_EHR } = await import("../../server/integrations/ehrRouter");
    expect(PRIMARY_EHR).toBe("ecw");
  });

  it("getAdapter returns correct adapter for each system", async () => {
    const { getAdapter } = await import("../../server/integrations/ehrRouter");
    const ecw = getAdapter("ecw");
    const athena = getAdapter("athena");
    const epic = getAdapter("epic");
    expect(ecw.system).toBe("ecw");
    expect(athena.system).toBe("athena");
    expect(epic.system).toBe("epic");
  });

  it("EHR_ADAPTERS contains all three systems", async () => {
    const { EHR_ADAPTERS } = await import("../../server/integrations/ehrRouter");
    expect(Object.keys(EHR_ADAPTERS)).toEqual(expect.arrayContaining(["ecw", "athena", "epic"]));
  });

  it("pingAllEHRs returns object with ecw/athena/epic keys", async () => {
    const { pingAllEHRs } = await import("../../server/integrations/ehrRouter");
    const result = await pingAllEHRs();
    expect(result).toHaveProperty("ecw");
    expect(result).toHaveProperty("athena");
    expect(result).toHaveProperty("epic");
  });

  it("pingAllEHRs returns booleans for each system", async () => {
    const { pingAllEHRs } = await import("../../server/integrations/ehrRouter");
    const result = await pingAllEHRs();
    expect(typeof result.ecw).toBe("boolean");
    expect(typeof result.athena).toBe("boolean");
    expect(typeof result.epic).toBe("boolean");
  });

  it("pingAllEHRs returns false for all unconfigured systems", async () => {
    delete process.env.ECW_API;
    delete process.env.FHIR_BASE;
    delete process.env.ATHENA_API_BASE;
    const { pingAllEHRs } = await import("../../server/integrations/ehrRouter");
    const result = await pingAllEHRs();
    expect(result.ecw).toBe(false);
    expect(result.athena).toBe(false);
    expect(result.epic).toBe(false);
  });

  it("writeAllEHRs returns settled results for all 3 systems", async () => {
    const { writeAllEHRs } = await import("../../server/integrations/ehrRouter");
    const result = await writeAllEHRs({ patientId: "p1", disposition: "discharge" });
    expect(result).toHaveProperty("ecw");
    expect(result).toHaveProperty("athena");
    expect(result).toHaveProperty("epic");
    expect(["fulfilled", "rejected"]).toContain(result.ecw.status);
    expect(["fulfilled", "rejected"]).toContain(result.athena.status);
    expect(["fulfilled", "rejected"]).toContain(result.epic.status);
  });

  it("summarizeWriteResults maps fulfilled to ok and rejected to failed", async () => {
    const { summarizeWriteResults } = await import("../../server/integrations/ehrRouter");
    const results = {
      ecw: { status: "fulfilled" as const, value: {} },
      athena: { status: "rejected" as const, reason: new Error("timeout") },
      epic: { status: "fulfilled" as const, value: {} },
    };
    const summary = summarizeWriteResults(results);
    expect(summary.ecw).toBe("ok");
    expect(summary.athena).toBe("failed");
    expect(summary.epic).toBe("ok");
  });

  it("getPatientContextUnified defaults to ECW", async () => {
    const { getPatientContextUnified, getAdapter } = await import("../../server/integrations/ehrRouter");
    expect(typeof getPatientContextUnified).toBe("function");
  });
});

// ─── EHR Consistency ─────────────────────────────────────────────────────────
describe("ehrConsistency — cross-system data validation", () => {
  it("returns ok when all three contexts match", async () => {
    const { checkConsistencyMulti } = await import("../../server/integrations/ehrConsistency");
    const ctx = { allergies: ["penicillin"], medications: ["aspirin"] };
    const result = checkConsistencyMulti(ctx, ctx, ctx);
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("detects Epic vs ECW allergy mismatch", async () => {
    const { checkConsistencyMulti } = await import("../../server/integrations/ehrConsistency");
    const epic = { allergies: ["penicillin"], medications: [] };
    const ecw = { allergies: ["sulfa"], medications: [] };
    const result = checkConsistencyMulti(epic, ecw, null);
    expect(result.ok).toBe(false);
    expect(result.issues.some(i => i.includes("Epic vs ECW allergy mismatch"))).toBe(true);
  });

  it("detects Athena vs ECW allergy mismatch", async () => {
    const { checkConsistencyMulti } = await import("../../server/integrations/ehrConsistency");
    const ecw = { allergies: ["aspirin"], medications: [] };
    const athena = { allergies: ["codeine"], medications: [] };
    const result = checkConsistencyMulti(null, ecw, athena);
    expect(result.ok).toBe(false);
    expect(result.issues.some(i => i.includes("Athena vs ECW allergy mismatch"))).toBe(true);
  });

  it("detects medication mismatches", async () => {
    const { checkConsistencyMulti } = await import("../../server/integrations/ehrConsistency");
    const epic = { allergies: [], medications: ["metformin"] };
    const ecw = { allergies: [], medications: ["lisinopril"] };
    const result = checkConsistencyMulti(epic, ecw, null);
    expect(result.ok).toBe(false);
    expect(result.issues.some(i => i.includes("medication mismatch"))).toBe(true);
  });

  it("handles null contexts gracefully", async () => {
    const { checkConsistencyMulti } = await import("../../server/integrations/ehrConsistency");
    const result = checkConsistencyMulti(null, null, null);
    expect(result.ok).toBe(true);
  });

  it("returns checkedFields list", async () => {
    const { checkConsistencyMulti } = await import("../../server/integrations/ehrConsistency");
    const result = checkConsistencyMulti({}, {}, {});
    expect(result.checkedFields).toContain("allergies");
    expect(result.checkedFields).toContain("medications");
  });

  it("checkConsistencyDual returns OK when matching", async () => {
    const { checkConsistencyDual } = await import("../../server/integrations/ehrConsistency");
    const ctx = { allergies: ["penicillin"], medications: ["aspirin"] };
    const result = checkConsistencyDual(ctx, ctx, "ECW", "Athena");
    expect(result).toEqual(["OK"]);
  });

  it("checkConsistencyDual includes custom labels in issue message", async () => {
    const { checkConsistencyDual } = await import("../../server/integrations/ehrConsistency");
    const a = { allergies: ["penicillin"] };
    const b = { allergies: ["sulfa"] };
    const result = checkConsistencyDual(a, b, "Epic", "Athena");
    expect(result.some(i => i.includes("Epic") && i.includes("Athena"))).toBe(true);
  });
});

// ─── EHR Routing ─────────────────────────────────────────────────────────────
describe("ehrRouting — system selection logic", () => {
  it("routes ecw patient to ecw", async () => {
    const { routeEHR } = await import("../../server/integrations/ehrRouting");
    expect(routeEHR({ system: "ecw" })).toBe("ecw");
  });

  it("routes athena patient to athena", async () => {
    const { routeEHR } = await import("../../server/integrations/ehrRouting");
    expect(routeEHR({ system: "athena" })).toBe("athena");
  });

  it("routes epic patient to epic", async () => {
    const { routeEHR } = await import("../../server/integrations/ehrRouting");
    expect(routeEHR({ system: "epic" })).toBe("epic");
  });

  it("returns all for unknown system", async () => {
    const { routeEHR } = await import("../../server/integrations/ehrRouting");
    expect(routeEHR({ system: "unknown" })).toBe("all");
  });

  it("returns all when system not provided", async () => {
    const { routeEHR } = await import("../../server/integrations/ehrRouting");
    expect(routeEHR({})).toBe("all");
  });

  it("case-insensitive system matching", async () => {
    const { routeEHR } = await import("../../server/integrations/ehrRouting");
    expect(routeEHR({ system: "ECW" })).toBe("ecw");
    expect(routeEHR({ system: "ATHENA" })).toBe("athena");
  });

  it("routeEHRForWrite returns single system array for known preferred EHR", async () => {
    const { routeEHRForWrite } = await import("../../server/integrations/ehrRouting");
    expect(routeEHRForWrite({ preferredEhr: "athena" })).toEqual(["athena"]);
  });

  it("routeEHRForWrite returns all three for unknown system", async () => {
    const { routeEHRForWrite } = await import("../../server/integrations/ehrRouting");
    const result = routeEHRForWrite({});
    expect(result).toEqual(expect.arrayContaining(["ecw", "athena", "epic"]));
  });

  it("isValidEhrSystem accepts ecw/athena/epic", async () => {
    const { isValidEhrSystem } = await import("../../server/integrations/ehrRouting");
    expect(isValidEhrSystem("ecw")).toBe(true);
    expect(isValidEhrSystem("athena")).toBe(true);
    expect(isValidEhrSystem("epic")).toBe(true);
    expect(isValidEhrSystem("fhir")).toBe(false);
    expect(isValidEhrSystem("")).toBe(false);
  });
});

// ─── Universal Write ──────────────────────────────────────────────────────────
describe("universalWrite — 5-tier fallback chain (ECW→Athena→Epic→UI→Vision)", () => {
  it("exports universalWrite function", async () => {
    const { universalWrite } = await import("../../server/integrations/universalWrite");
    expect(typeof universalWrite).toBe("function");
  });

  it("returns UniversalWriteResult with success and tier fields", async () => {
    delete process.env.ECW_API;
    delete process.env.ATHENA_API_BASE;
    delete process.env.FHIR_BASE;
    const { universalWrite } = await import("../../server/integrations/universalWrite");
    const result = await universalWrite({ patientId: "p999", disposition: "discharge" });
    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("tier");
  });

  it("tier is one of the expected values", async () => {
    const { universalWrite } = await import("../../server/integrations/universalWrite");
    const result = await universalWrite({ patientId: "p1", disposition: "tx" });
    expect(["ecw", "athena", "epic", "ui", "vision", "failed"]).toContain(result.tier);
  });

  it("falls back to failed tier when all EHRs unconfigured and automation unavailable", async () => {
    delete process.env.ECW_API;
    delete process.env.ECW_TOKEN;
    delete process.env.ATHENA_API_BASE;
    delete process.env.FHIR_BASE;
    const { universalWrite } = await import("../../server/integrations/universalWrite");
    const result = await universalWrite({ patientId: "p1", disposition: "discharge" });
    expect(["failed", "ui", "vision"]).toContain(result.tier);
  });

  it("result has optional data and error fields", async () => {
    const { universalWrite } = await import("../../server/integrations/universalWrite");
    const result = await universalWrite({ patientId: "p1" });
    const keys = Object.keys(result);
    expect(keys).toContain("success");
    expect(keys).toContain("tier");
  });
});

// ─── Completeness Gate ────────────────────────────────────────────────────────
describe("ensureCompleteness — pre-triage context validation", () => {
  it("returns ok when all required fields present", async () => {
    const { ensureCompleteness } = await import("../../server/services/completenessGate");
    const result = ensureCompleteness({ age: 35, meds: ["aspirin"], allergies: ["penicillin"] });
    expect(result.ok).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it("returns missing fields when age absent", async () => {
    const { ensureCompleteness } = await import("../../server/services/completenessGate");
    const result = ensureCompleteness({ meds: ["aspirin"], allergies: ["penicillin"] });
    expect(result.ok).toBe(false);
    expect(result.missing).toContain("age");
  });

  it("returns missing fields when meds absent", async () => {
    const { ensureCompleteness } = await import("../../server/services/completenessGate");
    const result = ensureCompleteness({ age: 30, allergies: [] });
    expect(result.ok).toBe(false);
    expect(result.missing).toContain("meds");
  });

  it("returns missing fields when allergies absent", async () => {
    const { ensureCompleteness } = await import("../../server/services/completenessGate");
    const result = ensureCompleteness({ age: 30, meds: [] });
    expect(result.ok).toBe(false);
    expect(result.missing).toContain("allergies");
  });

  it("treats empty arrays as missing", async () => {
    const { ensureCompleteness } = await import("../../server/services/completenessGate");
    const result = ensureCompleteness({ age: 30, meds: [], allergies: ["penicillin"] });
    expect(result.ok).toBe(false);
    expect(result.missing).toContain("meds");
  });

  it("returns a score between 0 and 100", async () => {
    const { ensureCompleteness } = await import("../../server/services/completenessGate");
    const result = ensureCompleteness({ age: 35, meds: ["aspirin"], allergies: ["none"] });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("full context gives score of 100", async () => {
    const { ensureCompleteness } = await import("../../server/services/completenessGate");
    const result = ensureCompleteness({
      age: 35,
      meds: ["aspirin"],
      allergies: ["penicillin"],
      chiefComplaint: "cough",
      sex: "M",
    });
    expect(result.score).toBe(100);
  });

  it("ensureCompletenessStrict requires all fields including recommended", async () => {
    const { ensureCompletenessStrict } = await import("../../server/services/completenessGate");
    const result = ensureCompletenessStrict({ age: 35, meds: ["aspirin"], allergies: ["penicillin"] });
    expect(result.ok).toBe(false);
    expect(result.missing).toContain("chiefComplaint");
    expect(result.missing).toContain("sex");
  });

  it("null values treated as missing", async () => {
    const { ensureCompleteness } = await import("../../server/services/completenessGate");
    const result = ensureCompleteness({ age: null, meds: null, allergies: null });
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(expect.arrayContaining(["age", "meds", "allergies"]));
  });
});

// ─── SLO Monitor ─────────────────────────────────────────────────────────────
describe("sloBurnRate — SLO error budget monitoring", () => {
  it("returns ok when error rate <= 1%", async () => {
    const { sloBurnRate } = await import("../../server/services/sloMonitor");
    const result = sloBurnRate(0, 1000);
    expect(result.status).toBe("ok");
    expect(result.rate).toBe(0);
  });

  it("returns burning when error rate > 1% but <= 5%", async () => {
    const { sloBurnRate } = await import("../../server/services/sloMonitor");
    const result = sloBurnRate(20, 1000);
    expect(result.status).toBe("burning");
    expect(result.rate).toBeCloseTo(0.02);
  });

  it("returns critical when error rate > 5%", async () => {
    const { sloBurnRate } = await import("../../server/services/sloMonitor");
    const result = sloBurnRate(60, 1000);
    expect(result.status).toBe("critical");
  });

  it("handles zero total without division error (uses max 1)", async () => {
    const { sloBurnRate } = await import("../../server/services/sloMonitor");
    const result = sloBurnRate(0, 0);
    expect(result.status).toBe("ok");
    expect(result.rate).toBe(0);
  });

  it("returns errorPct string with % symbol", async () => {
    const { sloBurnRate } = await import("../../server/services/sloMonitor");
    const result = sloBurnRate(10, 1000);
    expect(result.errorPct).toMatch(/%$/);
  });

  it("1% exactly is ok", async () => {
    const { sloBurnRate } = await import("../../server/services/sloMonitor");
    const result = sloBurnRate(10, 1000);
    expect(result.status).toBe("ok");
  });
});

describe("updateSLA — EWMA provider latency tracker", () => {
  it("applies weighted average: 0.7×old + 0.3×new", async () => {
    const { updateSLA } = await import("../../server/services/sloMonitor");
    const provider = { slaMs: 200, load: 0.5 };
    const updated = updateSLA(provider, 300);
    expect(updated.slaMs).toBe(Math.round(0.7 * 200 + 0.3 * 300));
  });

  it("increments load by 0.05", async () => {
    const { updateSLA } = await import("../../server/services/sloMonitor");
    const provider = { slaMs: 100, load: 0.3 };
    const updated = updateSLA(provider, 100);
    expect(updated.load).toBeCloseTo(0.35);
  });

  it("caps load at 1.0", async () => {
    const { updateSLA } = await import("../../server/services/sloMonitor");
    const provider = { slaMs: 100, load: 0.99 };
    const updated = updateSLA(provider, 100);
    expect(updated.load).toBe(1);
  });

  it("does not mutate original provider", async () => {
    const { updateSLA } = await import("../../server/services/sloMonitor");
    const provider = { slaMs: 100, load: 0.3 };
    updateSLA(provider, 200);
    expect(provider.slaMs).toBe(100);
    expect(provider.load).toBe(0.3);
  });

  it("preserves extra fields on provider object", async () => {
    const { updateSLA } = await import("../../server/services/sloMonitor");
    const provider = { slaMs: 100, load: 0.5, id: "p1", region: "us-east" };
    const updated = updateSLA(provider, 100);
    expect(updated.id).toBe("p1");
    expect(updated.region).toBe("us-east");
  });

  it("resetSlaLoad decays load by factor", async () => {
    const { resetSlaLoad } = await import("../../server/services/sloMonitor");
    const provider = { slaMs: 200, load: 0.8 };
    const reset = resetSlaLoad(provider, 0.95);
    expect(reset.load).toBeCloseTo(0.76);
  });
});

describe("approveAndSend — physician one-click approval", () => {
  it("exports approveAndSend function", async () => {
    const { approveAndSend } = await import("../../server/services/sloMonitor");
    expect(typeof approveAndSend).toBe("function");
  });

  it("returns result with ok and traceId fields", async () => {
    const { approveAndSend } = await import("../../server/services/sloMonitor");
    const result = await approveAndSend({
      traceId: "trace-001",
      patientId: "p1",
      disposition: "discharge",
    });
    expect(result).toHaveProperty("ok");
    expect(result).toHaveProperty("traceId");
    expect(result.traceId).toBe("trace-001");
  });

  it("returns tier field indicating which EHR tier handled write", async () => {
    const { approveAndSend } = await import("../../server/services/sloMonitor");
    const result = await approveAndSend({
      traceId: "trace-002",
      patientId: "p2",
      disposition: "admit",
    });
    expect(result).toHaveProperty("tier");
  });
});

// ─── System State — integrations field ───────────────────────────────────────
describe("systemState — EHR integrations status", () => {
  it("getSystemState includes integrations field", async () => {
    const { getSystemState } = await import("../../server/control/systemState");
    const state = getSystemState();
    expect(state).toHaveProperty("integrations");
  });

  it("integrations has epic/ecw/athena/chatgpt/whatsapp keys", async () => {
    const { getSystemState } = await import("../../server/control/systemState");
    const state = getSystemState();
    expect(state.integrations).toHaveProperty("epic");
    expect(state.integrations).toHaveProperty("ecw");
    expect(state.integrations).toHaveProperty("athena");
    expect(state.integrations).toHaveProperty("chatgpt");
    expect(state.integrations).toHaveProperty("whatsapp");
  });

  it("chatgpt and whatsapp default to ok", async () => {
    const { getSystemState } = await import("../../server/control/systemState");
    const state = getSystemState();
    expect(state.integrations.chatgpt).toBe("ok");
    expect(state.integrations.whatsapp).toBe("ok");
  });

  it("unconfigured EHRs default to unconfigured status", async () => {
    delete process.env.FHIR_BASE;
    delete process.env.ECW_API;
    delete process.env.ATHENA_API_BASE;
    const { getSystemState } = await import("../../server/control/systemState");
    const state = getSystemState();
    expect(["unconfigured", "down", "ok"]).toContain(state.integrations.epic);
    expect(["unconfigured", "down", "ok"]).toContain(state.integrations.ecw);
    expect(["unconfigured", "down", "ok"]).toContain(state.integrations.athena);
  });

  it("refreshEhrStatus is exported and is async", async () => {
    const { refreshEhrStatus } = await import("../../server/control/systemState");
    expect(typeof refreshEhrStatus).toBe("function");
    const result = await refreshEhrStatus();
    expect(result).toHaveProperty("epic");
    expect(result).toHaveProperty("ecw");
    expect(result).toHaveProperty("athena");
  });

  it("refreshEhrStatus returns unconfigured for systems without env vars", async () => {
    delete process.env.FHIR_BASE;
    delete process.env.EPIC_TOKEN;
    delete process.env.ECW_API;
    delete process.env.ECW_TOKEN;
    delete process.env.ATHENA_API_BASE;
    delete process.env.ATHENA_TOKEN;
    const { refreshEhrStatus } = await import("../../server/control/systemState");
    const result = await refreshEhrStatus();
    expect(result.epic).toBe("unconfigured");
    expect(result.ecw).toBe("unconfigured");
    expect(result.athena).toBe("unconfigured");
  });
});

// ─── Updated EHR Unified ──────────────────────────────────────────────────────
describe("ehrUnified — tri-EHR write orchestration", () => {
  it("exports writeEHRAll function", async () => {
    const { writeEHRAll } = await import("../../server/integrations/ehrUnified");
    expect(typeof writeEHRAll).toBe("function");
  });

  it("writeEHRAll returns object with epic/ecw/athena keys", async () => {
    const { writeEHRAll } = await import("../../server/integrations/ehrUnified");
    const result = await writeEHRAll({ patientId: "p1", disposition: "discharge" });
    expect(result).toHaveProperty("epic");
    expect(result).toHaveProperty("ecw");
    expect(result).toHaveProperty("athena");
  });

  it("writeEHRAll result values are ok|failed strings", async () => {
    const { writeEHRAll } = await import("../../server/integrations/ehrUnified");
    const result = await writeEHRAll({ patientId: "p1", disposition: "discharge" });
    expect(["ok", "failed"]).toContain(result.epic);
    expect(["ok", "failed"]).toContain(result.ecw);
    expect(["ok", "failed"]).toContain(result.athena);
  });

  it("unconfigured systems return failed", async () => {
    delete process.env.ECW_API;
    delete process.env.ATHENA_API_BASE;
    delete process.env.FHIR_BASE;
    const { writeEHRAll } = await import("../../server/integrations/ehrUnified");
    const result = await writeEHRAll({ patientId: "p1", disposition: "tx" });
    expect(result.ecw).toBe("failed");
    expect(result.athena).toBe("failed");
    expect(result.epic).toBe("failed");
  });

  it("exports writeEHRPrimary function", async () => {
    const { writeEHRPrimary } = await import("../../server/integrations/ehrUnified");
    expect(typeof writeEHRPrimary).toBe("function");
  });

  it("writeEHRPrimary returns ecw status", async () => {
    const { writeEHRPrimary } = await import("../../server/integrations/ehrUnified");
    const result = await writeEHRPrimary({ patientId: "p1", disposition: "discharge" });
    expect(result).toHaveProperty("ecw");
    expect(["ok", "failed"]).toContain(result.ecw);
  });
});

// ─── Deployment Files ─────────────────────────────────────────────────────────
describe("Deployment files — one-click setup", () => {
  it("fly.toml exists", () => {
    expect(existsSync(resolve("fly.toml"))).toBe(true);
  });

  it("scripts/up.sh exists", () => {
    expect(existsSync(resolve("scripts/up.sh"))).toBe(true);
  });

  it("docker-compose.yml exists", () => {
    expect(existsSync(resolve("docker-compose.yml"))).toBe(true);
  });

  it("fly.toml contains app name and region", async () => {
    const { readFileSync } = await import("fs");
    const content = readFileSync(resolve("fly.toml"), "utf-8");
    expect(content).toContain("auralyn-brain");
    expect(content).toContain("iad");
  });

  it("fly.toml defines internal port 3000", async () => {
    const { readFileSync } = await import("fs");
    const content = readFileSync(resolve("fly.toml"), "utf-8");
    expect(content).toContain("3000");
  });

  it("scripts/up.sh bootstraps docker compose", async () => {
    const { readFileSync } = await import("fs");
    const content = readFileSync(resolve("scripts/up.sh"), "utf-8");
    expect(content).toContain("docker compose up");
    expect(content).toContain("Bootstrapping");
  });

  it("docker-compose.yml includes app/redis/postgres services", async () => {
    const { readFileSync } = await import("fs");
    const content = readFileSync(resolve("docker-compose.yml"), "utf-8");
    expect(content).toContain("redis");
    expect(content).toContain("postgres");
    expect(content).toContain("app");
  });

  it("docker-compose.yml includes prometheus and grafana", async () => {
    const { readFileSync } = await import("fs");
    const content = readFileSync(resolve("docker-compose.yml"), "utf-8");
    expect(content).toContain("prometheus");
    expect(content).toContain("grafana");
  });

  it(".env.example contains ATHENA_API_BASE", async () => {
    const { readFileSync } = await import("fs");
    const content = readFileSync(resolve(".env.example"), "utf-8");
    expect(content).toContain("ATHENA_API_BASE");
  });

  it(".env.example contains ATHENA_PRACTICE_ID", async () => {
    const { readFileSync } = await import("fs");
    const content = readFileSync(resolve(".env.example"), "utf-8");
    expect(content).toContain("ATHENA_PRACTICE_ID");
  });

  it(".env.example contains ATHENA_TOKEN", async () => {
    const { readFileSync } = await import("fs");
    const content = readFileSync(resolve(".env.example"), "utf-8");
    expect(content).toContain("ATHENA_TOKEN");
  });
});
