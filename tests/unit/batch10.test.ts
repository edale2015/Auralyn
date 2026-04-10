import { describe, it, expect, afterEach } from "vitest";

// ── Revenue Eligibility ────────────────────────────────────────────────────
import { checkEligibility, scrubClaim, revenueKPIs } from "../../server/revenue/eligibility";

describe("eligibility — checkEligibility()", () => {
  it("returns eligible=true in sandbox (no PAYER_API)", async () => {
    const r = await checkEligibility("P001");
    expect(r.patientId).toBe("P001");
    expect(typeof r.eligible).toBe("boolean");
  });

  it("result has patientId field", async () => {
    const r = await checkEligibility("P-XYZ");
    expect(r.patientId).toBe("P-XYZ");
  });
});

describe("eligibility — scrubClaim()", () => {
  it("returns ok=true for valid claim", () => {
    const r = scrubClaim({ patientId: "P1", insurance: "Private", cpt: "99213", disposition: "ROUTINE" });
    expect(r.ok).toBe(true);
    expect(r.issues).toHaveLength(0);
  });

  it("flags missing insurance", () => {
    const r = scrubClaim({ patientId: "P1", cpt: "99213" });
    expect(r.issues).toContain("missing_insurance");
    expect(r.ok).toBe(false);
  });

  it("flags missing CPT", () => {
    const r = scrubClaim({ patientId: "P1", insurance: "Medicaid" });
    expect(r.issues).toContain("missing_cpt");
  });

  it("flags missing patientId", () => {
    const r = scrubClaim({ insurance: "Private", cpt: "99213" });
    expect(r.issues).toContain("missing_patient_id");
  });

  it("fixes overcoding: 99285 + non-ER → 99284", () => {
    const r = scrubClaim({ patientId: "P1", insurance: "Private", cpt: "99285", disposition: "ROUTINE" });
    expect(r.issues).toContain("overcoding");
    expect(r.claim.cpt).toBe("99284");
  });

  it("no overcoding flag when 99285 + ER_NOW", () => {
    const r = scrubClaim({ patientId: "P1", insurance: "Private", cpt: "99285", disposition: "ER_NOW" });
    expect(r.issues).not.toContain("overcoding");
    expect(r.ok).toBe(true);
  });

  it("returns original claim reference in result", () => {
    const r = scrubClaim({ patientId: "P1", insurance: "Medicaid", cpt: "99213" });
    expect(r.claim.patientId).toBe("P1");
  });
});

describe("eligibility — revenueKPIs()", () => {
  it("returns all KPI fields", () => {
    const k = revenueKPIs([
      { denied: false, amount: 300 },
      { denied: true, amount: 500 },
      { denied: false, amount: 120 },
    ]);
    expect(k.total).toBe(3);
    expect(k.denialRate).toBeCloseTo(1 / 3, 4);
    expect(k.estimatedRevenue).toBe(920);
    expect(k.approvedCount).toBe(2);
  });

  it("returns zeros for empty array", () => {
    const k = revenueKPIs([]);
    expect(k.total).toBe(0);
    expect(k.denialRate).toBe(0);
    expect(k.estimatedRevenue).toBe(0);
  });

  it("denialRate is 1 when all denied", () => {
    const k = revenueKPIs([{ denied: true, amount: 100 }, { denied: true, amount: 200 }]);
    expect(k.denialRate).toBe(1);
    expect(k.approvedCount).toBe(0);
  });

  it("handles missing amount field", () => {
    const k = revenueKPIs([{ denied: false }, { denied: false }]);
    expect(k.estimatedRevenue).toBe(0);
  });
});

// ── Deck Builder ──────────────────────────────────────────────────────────
import { buildDeckMarkdown } from "../../server/exec/deckBuilder";

describe("deckBuilder — buildDeckMarkdown()", () => {
  it("returns a non-empty string", () => {
    const md = buildDeckMarkdown({ patients: 50_000, p95: 120, revenue: 5_000_000 });
    expect(typeof md).toBe("string");
    expect(md.length).toBeGreaterThan(100);
  });

  it("includes patient count", () => {
    const md = buildDeckMarkdown({ patients: 12345 });
    expect(md).toContain("12,345");
  });

  it("includes p95 latency", () => {
    const md = buildDeckMarkdown({ p95: 88 });
    expect(md).toContain("88");
  });

  it("includes revenue figure", () => {
    const md = buildDeckMarkdown({ revenue: 9_999_999 });
    expect(md).toContain("9,999,999");
  });

  it("includes moat items", () => {
    const md = buildDeckMarkdown({});
    expect(md.toLowerCase()).toContain("golden");
  });

  it("includes safety section", () => {
    const md = buildDeckMarkdown({});
    expect(md).toContain("Safety");
  });

  it("includes 510(k) regulatory reference", () => {
    const md = buildDeckMarkdown({});
    expect(md).toContain("510(k)");
  });

  it("includes regions when provided", () => {
    const md = buildDeckMarkdown({ regions: ["us-east-1", "eu-west-1"] });
    expect(md).toContain("eu-west-1");
  });

  it("defaults accuracy to 95%", () => {
    const md = buildDeckMarkdown({});
    expect(md).toContain("95.0%");
  });
});

// ── System Monitor ────────────────────────────────────────────────────────
import {
  saveConversation, getConversation, clearConversation,
  heartbeat, triageBudget, optimalFacility,
  maintenanceLoop, stopMaintenanceLoop,
} from "../../server/ops/systemMonitor";

describe("systemMonitor — conversation memory", () => {
  afterEach(() => {
    clearConversation("test-user");
  });

  it("saves and retrieves messages", () => {
    saveConversation("test-user", { role: "user", text: "hello" });
    const c = getConversation("test-user");
    expect(c).toHaveLength(1);
    expect(c[0].text).toBe("hello");
  });

  it("appends multiple messages in order", () => {
    saveConversation("test-user", { role: "user", text: "first" });
    saveConversation("test-user", { role: "assistant", text: "second" });
    const c = getConversation("test-user");
    expect(c).toHaveLength(2);
    expect(c[1].text).toBe("second");
  });

  it("returns empty array for unknown user", () => {
    expect(getConversation("nobody-xyz")).toEqual([]);
  });

  it("clearConversation removes all messages", () => {
    saveConversation("test-user", { role: "user", text: "hi" });
    clearConversation("test-user");
    expect(getConversation("test-user")).toEqual([]);
  });

  it("each message has a ts field", () => {
    saveConversation("test-user", { role: "user", text: "ts-test" });
    const c = getConversation("test-user");
    expect(typeof c[0].ts).toBe("number");
  });
});

describe("systemMonitor — heartbeat()", () => {
  it("returns all required fields", () => {
    const h = heartbeat();
    expect(typeof h.ts).toBe("number");
    expect(h.ts).toBeGreaterThan(0);
    expect(typeof h.uptimeSeconds).toBe("number");
    expect(typeof h.heapUsedMb).toBe("number");
    expect(typeof h.heapTotalMb).toBe("number");
    expect(typeof h.rss).toBe("number");
  });

  it("uptimeSeconds is positive", () => {
    expect(heartbeat().uptimeSeconds).toBeGreaterThan(0);
  });

  it("heapUsedMb is positive", () => {
    expect(heartbeat().heapUsedMb).toBeGreaterThan(0);
  });
});

describe("systemMonitor — triageBudget()", () => {
  it("returns 1 with no vitals", () => {
    expect(triageBudget()).toBe(1);
  });

  it("adds 2 for low systolic BP", () => {
    expect(triageBudget({ systolicBp: 80 })).toBeGreaterThanOrEqual(3);
  });

  it("adds 2 for low oxygen saturation", () => {
    expect(triageBudget({ oxygenSaturation: 88 })).toBeGreaterThanOrEqual(3);
  });

  it("adds 1 for high heart rate", () => {
    expect(triageBudget({ heartRate: 140 })).toBeGreaterThanOrEqual(2);
  });

  it("maxes out correctly for multi-alarm vitals", () => {
    const level = triageBudget({ systolicBp: 70, oxygenSaturation: 85, heartRate: 150 });
    expect(level).toBe(6);
  });

  it("no penalty for normal vitals", () => {
    expect(triageBudget({ systolicBp: 120, oxygenSaturation: 99, heartRate: 75 })).toBe(1);
  });
});

describe("systemMonitor — optimalFacility()", () => {
  const facilities = [
    { name: "Clinic A", distance: 2, load: 0.3 },
    { name: "Clinic B", distance: 1, load: 0.8 },
    { name: "Clinic C", distance: 0.5, load: 0.1 },
  ];

  it("returns the lowest distance + load facility", () => {
    const f = optimalFacility(facilities);
    expect(f?.name).toBe("Clinic C");
  });

  it("returns null for empty array", () => {
    expect(optimalFacility([])).toBeNull();
  });

  it("returns facility with lowest combined score", () => {
    const f = optimalFacility([
      { name: "X", distance: 10, load: 0 },
      { name: "Y", distance: 0, load: 5 },
    ]);
    expect(f?.name).toBe("Y");
  });

  it("does not mutate input array", () => {
    const arr = [
      { name: "A", distance: 5, load: 0.5 },
      { name: "B", distance: 1, load: 0.1 },
    ];
    const copy = [...arr];
    optimalFacility(arr);
    expect(arr[0].name).toBe(copy[0].name);
  });
});

describe("systemMonitor — maintenanceLoop()", () => {
  afterEach(() => {
    stopMaintenanceLoop();
  });

  it("does not throw on start", () => {
    expect(() => maintenanceLoop(9_999_999)).not.toThrow();
  });

  it("is idempotent (duplicate start does not throw)", () => {
    maintenanceLoop(9_999_999);
    expect(() => maintenanceLoop(9_999_999)).not.toThrow();
  });

  it("stopMaintenanceLoop does not throw", () => {
    maintenanceLoop(9_999_999);
    expect(() => stopMaintenanceLoop()).not.toThrow();
  });
});

// ── Chat Triage Bridge ────────────────────────────────────────────────────
import { scheduleFollowup, cancelFollowup, getPendingFollowups } from "../../server/patient/chatTriageBridge";

describe("chatTriageBridge — scheduleFollowup()", () => {
  afterEach(() => {
    cancelFollowup("TEST-PATIENT");
  });

  it("does not throw", () => {
    expect(() => scheduleFollowup("TEST-PATIENT", 9999)).not.toThrow();
  });

  it("adds patient to pending followups", () => {
    scheduleFollowup("TEST-PATIENT", 9999);
    expect(getPendingFollowups()).toContain("TEST-PATIENT");
  });

  it("cancelFollowup removes patient from pending", () => {
    scheduleFollowup("TEST-PATIENT", 9999);
    cancelFollowup("TEST-PATIENT");
    expect(getPendingFollowups()).not.toContain("TEST-PATIENT");
  });

  it("cancelFollowup returns false for unknown patient", () => {
    expect(cancelFollowup("NOBODY-XYZ")).toBe(false);
  });

  it("replaces existing timer on re-schedule", () => {
    scheduleFollowup("TEST-PATIENT", 9999);
    scheduleFollowup("TEST-PATIENT", 8888);
    const pending = getPendingFollowups();
    expect(pending.filter(p => p === "TEST-PATIENT")).toHaveLength(1);
  });
});

// ── Pilot Orchestrator ────────────────────────────────────────────────────
import { runPilot } from "../../server/pilot/pilotOrchestrator";

describe("pilotOrchestrator — runPilot()", () => {
  it("returns full result shape", async () => {
    const r = await runPilot({ patientId: "ORCH001", complaint: "sore throat", insurance: "Private" }, "");
    expect(r.patientId).toBe("ORCH001");
    expect(typeof r.disposition).toBe("string");
    expect(typeof r.cptCode).toBe("string");
    expect(["high", "low"]).toContain(r.denialRisk);
    expect(typeof r.claimId).toBe("string");
    expect(typeof r.fhirPushed).toBe("boolean");
  }, 10_000);

  it("CPT code starts with 99", async () => {
    const r = await runPilot({ patientId: "ORCH002", complaint: "fever" }, "");
    expect(r.cptCode.startsWith("99")).toBe(true);
  }, 10_000);

  it("claim ID is unique per call", async () => {
    const a = await runPilot({ patientId: "ORCH003", complaint: "headache" }, "");
    const b = await runPilot({ patientId: "ORCH003", complaint: "headache" }, "");
    expect(a.claimId).not.toBe(b.claimId);
  }, 15_000);

  it("handles missing insurance gracefully", async () => {
    const r = await runPilot({ patientId: "ORCH004", complaint: "cough" }, "");
    expect(["high", "low"]).toContain(r.denialRisk);
  }, 10_000);
});
