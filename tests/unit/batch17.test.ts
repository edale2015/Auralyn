import { describe, it, expect, beforeEach } from "vitest";

// ── Real Clinic Loop ──────────────────────────────────────────────────────────
import {
  enqueuePatient, getNextPatient, getClinicLoopStatus,
  startClinicLoop, stopClinicLoop,
} from "../../server/pilot/realClinicLoop";

describe("realClinicLoop", () => {
  beforeEach(() => stopClinicLoop());

  it("getClinicLoopStatus returns stopped initially", () => {
    expect(getClinicLoopStatus().running).toBe(false);
  });

  it("enqueuePatient adds to queue", async () => {
    enqueuePatient({ patientId: "P001", complaint: "chest_pain" });
    expect(getClinicLoopStatus().queueLength).toBeGreaterThan(0);
    await getNextPatient(); // drain
  });

  it("getNextPatient returns null when queue empty", async () => {
    expect(await getNextPatient()).toBeNull();
  });

  it("getNextPatient returns and removes queued patient", async () => {
    enqueuePatient({ patientId: "P002", complaint: "fever" });
    const p = await getNextPatient();
    expect(p?.patientId).toBe("P002");
    expect(getClinicLoopStatus().queueLength).toBe(0);
  });

  it("startClinicLoop sets running=true", () => {
    startClinicLoop(100_000); // very long interval so it doesn't fire
    expect(getClinicLoopStatus().running).toBe(true);
    stopClinicLoop();
  });

  it("stopClinicLoop sets running=false", () => {
    startClinicLoop(100_000);
    stopClinicLoop();
    expect(getClinicLoopStatus().running).toBe(false);
  });

  it("double-start does not create duplicate timers", () => {
    startClinicLoop(100_000);
    startClinicLoop(100_000);
    expect(getClinicLoopStatus().running).toBe(true);
    stopClinicLoop();
  });
});

// ── Payer API ─────────────────────────────────────────────────────────────────
import { submitRealClaim, estimateReimbursement } from "../../server/revenue/payerAPI";

describe("payerAPI — submitRealClaim()", () => {
  it("returns status:skipped when env vars absent", async () => {
    delete process.env.REAL_PAYER_API;
    delete process.env.PAYER_TOKEN;
    const r = await submitRealClaim({ patientId: "P001", cpt: "99283", insurance: "Aetna" });
    expect(r.status).toBe("skipped");
  });
});

describe("payerAPI — estimateReimbursement()", () => {
  it("returns positive number for known CPT + insurance", () => {
    expect(estimateReimbursement("99283", "Aetna")).toBeGreaterThan(0);
  });

  it("Aetna pays more than Medicaid for same CPT", () => {
    expect(estimateReimbursement("99283", "Aetna"))
      .toBeGreaterThan(estimateReimbursement("99283", "Medicaid"));
  });

  it("higher-acuity CPT yields higher reimbursement", () => {
    expect(estimateReimbursement("99285", "Aetna"))
      .toBeGreaterThan(estimateReimbursement("99281", "Aetna"));
  });

  it("falls back gracefully for unknown insurance", () => {
    expect(estimateReimbursement("99283", "UNKNOWN")).toBeGreaterThan(0);
  });
});

// ── National Expansion Engine ─────────────────────────────────────────────────
import { nationalRollout, scoreExpansionTarget } from "../../server/national/expansionEngine";

describe("expansionEngine — nationalRollout()", () => {
  it("deploys qualifying regions (load<0.5, pop>500k)", async () => {
    const r = await nationalRollout([
      { name: "NYC", load: 0.3, population: 8_000_000 },
      { name: "BOS", load: 0.7, population: 700_000 },
    ]);
    expect(r.deployed).toContain("NYC");
    expect(r.skipped).toContain("BOS");
  });

  it("skips regions with load >= 0.5", async () => {
    const r = await nationalRollout([{ name: "X", load: 0.5, population: 1_000_000 }]);
    expect(r.skipped).toContain("X");
  });

  it("skips regions with population <= 500k", async () => {
    const r = await nationalRollout([{ name: "Y", load: 0.2, population: 400_000 }]);
    expect(r.skipped).toContain("Y");
  });

  it("returns empty arrays for empty input", async () => {
    const r = await nationalRollout([]);
    expect(r.deployed).toHaveLength(0);
    expect(r.skipped).toHaveLength(0);
  });
});

describe("expansionEngine — scoreExpansionTarget()", () => {
  it("returns a number between 0 and 1", () => {
    const s = scoreExpansionTarget({ name: "NYC", load: 0.3, population: 800_000 });
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
  });

  it("low load → higher score", () => {
    const s1 = scoreExpansionTarget({ name: "A", load: 0.1, population: 1_000_000 });
    const s2 = scoreExpansionTarget({ name: "B", load: 0.9, population: 1_000_000 });
    expect(s1).toBeGreaterThan(s2);
  });
});

// ── Marketplace Matcher ───────────────────────────────────────────────────────
import { matchPatient, rankProviders } from "../../server/marketplace/matcher";

const PROVIDERS = [
  { id: "p1", name: "Dr. A", specialty: "chest_pain", distance: 5,  rating: 4.5 },
  { id: "p2", name: "Dr. B", specialty: "chest_pain", distance: 2,  rating: 3.8 },
  { id: "p3", name: "Dr. C", specialty: "fever",      distance: 1,  rating: 4.9 },
];

describe("matcher — matchPatient()", () => {
  it("returns closest matching provider", () => {
    const m = matchPatient({ complaint: "chest_pain" }, PROVIDERS);
    expect(m?.id).toBe("p2");
  });

  it("returns null when no specialty match", () => {
    expect(matchPatient({ complaint: "unknown" }, PROVIDERS)).toBeNull();
  });

  it("ignores unavailable providers", () => {
    const providers = [
      { id: "x", name: "X", specialty: "fever", distance: 0.5, available: false },
      { id: "y", name: "Y", specialty: "fever", distance: 2,   available: true  },
    ];
    const m = matchPatient({ complaint: "fever" }, providers);
    expect(m?.id).toBe("y");
  });

  it("returns null for empty providers list", () => {
    expect(matchPatient({ complaint: "chest_pain" }, [])).toBeNull();
  });
});

describe("matcher — rankProviders()", () => {
  it("returns providers sorted by specialty match", () => {
    const ranked = rankProviders({ complaint: "chest_pain" }, PROVIDERS);
    expect(ranked.every(p => p.specialty === "chest_pain")).toBe(true);
  });

  it("returns empty for unknown specialty", () => {
    expect(rankProviders({ complaint: "broken_arm" }, PROVIDERS)).toHaveLength(0);
  });
});

// ── UI Engine ─────────────────────────────────────────────────────────────────
import { trackAutomation, syncEHRs, runParallel } from "../../server/automation/uiEngine";

describe("uiEngine — trackAutomation()", () => {
  it("returns success=true for ok result", () => {
    expect(trackAutomation({ ok: true, time: 500 })).toEqual({ success: true, time: 500 });
  });

  it("returns success=false for failed result", () => {
    expect(trackAutomation({ ok: false, time: 100, error: "timeout" })).toEqual({ success: false, time: 100 });
  });
});

describe("uiEngine — syncEHRs()", () => {
  it("returns ecw and epic status keys", async () => {
    delete process.env.EPIC_TOKEN;
    delete process.env.FHIR_BASE;
    const r = await syncEHRs({ patientId: "P001", disposition: "ROUTINE" });
    expect(r).toHaveProperty("ecw");
    expect(r).toHaveProperty("epic");
  });

  it("epic is 'skipped' when no FHIR_BASE configured", async () => {
    delete process.env.FHIR_BASE;
    const r = await syncEHRs({ patientId: "P001", disposition: "ER_NOW" });
    expect(r.epic).toBe("skipped");
  });
});

describe("uiEngine — runParallel()", () => {
  it("returns empty array for empty input", async () => {
    const results = await runParallel([]);
    expect(results).toHaveLength(0);
  });

  it("returns AutomationResult for each template", async () => {
    const results = await runParallel([{ url: "about:blank", steps: [] }]);
    expect(results).toHaveLength(1);
    expect(results[0]).toHaveProperty("ok");
    expect(results[0]).toHaveProperty("time");
  });
});
