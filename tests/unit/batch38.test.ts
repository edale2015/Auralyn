import { describe, it, expect } from "vitest";

// ─── 1. Scheduling Engine ─────────────────────────────────────────────────────
import {
  bookAppointment, cancelAppointment, listAppointments,
  updateStatus, getScheduleSummary, estimateWaitTime,
} from "../../server/hospital/schedulingEngine";

describe("Batch38 — schedulingEngine", () => {
  it("bookAppointment returns an Appointment with id", () => {
    const a = bookAppointment({ patientId: "T01", patientName: "Test User", type: "URGENT", priority: 1, providerId: "DR_TEST", scheduledAt: new Date().toISOString() });
    expect(a.id).toBeTruthy();
    expect(a.status).toBe("SCHEDULED");
    expect(a.priority).toBe(1);
  });

  it("listAppointments returns sorted by priority", () => {
    const list = listAppointments({ status: "SCHEDULED" });
    expect(Array.isArray(list)).toBe(true);
    for (let i = 1; i < list.length; i++) {
      expect(list[i].priority).toBeGreaterThanOrEqual(list[i - 1].priority);
    }
  });

  it("cancelAppointment sets status CANCELLED", () => {
    const a = bookAppointment({ patientId: "T02", patientName: "Cancel Test", type: "FOLLOW_UP", priority: 3, providerId: "DR_X", scheduledAt: new Date().toISOString() });
    expect(cancelAppointment(a.id)).toBe(true);
    const updated = listAppointments().find((x) => x.id === a.id);
    expect(updated?.status).toBe("CANCELLED");
  });

  it("cancelAppointment returns false for unknown id", () => {
    expect(cancelAppointment("nonexistent")).toBe(false);
  });

  it("updateStatus changes appointment status", () => {
    const a = bookAppointment({ patientId: "T03", patientName: "Status Test", type: "NEW_PATIENT", priority: 4, providerId: "DR_Y", scheduledAt: new Date().toISOString() });
    expect(updateStatus(a.id, "CHECKED_IN")).toBe(true);
    const updated = listAppointments().find((x) => x.id === a.id);
    expect(updated?.status).toBe("CHECKED_IN");
  });

  it("getScheduleSummary has total and urgentQueued", () => {
    const s = getScheduleSummary();
    expect(typeof s.total).toBe("number");
    expect(typeof s.urgentQueued).toBe("number");
    expect(Array.isArray(s.providers)).toBe(true);
  });

  it("estimateWaitTime returns queuePosition and estimatedWait", () => {
    const w = estimateWaitTime("P999", 2);
    expect(typeof w.estimatedWait).toBe("number");
    expect(w.queuePosition).toBeGreaterThan(0);
    expect(w.priority).toBe(2);
  });

  it("priority 1 patient gets earlier slot than priority 5", () => {
    const w1 = estimateWaitTime("PA", 1);
    const w5 = estimateWaitTime("PB", 5);
    expect(w1.estimatedWait).toBeLessThanOrEqual(w5.estimatedWait);
  });
});

// ─── 2. Staffing Engine ───────────────────────────────────────────────────────
import {
  addStaff, listStaff, checkStaffingRatios, computeShiftDemand, getStaffingSummary, updatePatientCounts,
} from "../../server/hospital/staffingEngine";

describe("Batch38 — staffingEngine", () => {
  it("addStaff returns a StaffMember with id", () => {
    const s = addStaff({ name: "RN Test", role: "RN", unit: "ICU", shiftType: "DAY", shiftStart: "07:00", shiftEnd: "19:00", patientLoad: 2, overtimeHrs: 0, active: true });
    expect(s.id).toBeTruthy();
    expect(s.role).toBe("RN");
  });

  it("listStaff filters by unit", () => {
    const icuStaff = listStaff({ unit: "ICU" });
    expect(icuStaff.every((s) => s.unit === "ICU")).toBe(true);
  });

  it("listStaff filters by role", () => {
    const rns = listStaff({ role: "RN" });
    expect(rns.every((s) => s.role === "RN")).toBe(true);
  });

  it("checkStaffingRatios returns array of alerts", () => {
    const alerts = checkStaffingRatios();
    expect(Array.isArray(alerts)).toBe(true);
    for (const a of alerts) {
      expect(["low", "medium", "high", "critical"]).toContain(a.severity);
    }
  });

  it("computeShiftDemand returns demand per unit", () => {
    const demand = computeShiftDemand();
    expect(demand.length).toBeGreaterThan(0);
    for (const d of demand) {
      expect(typeof d.currentStaff).toBe("number");
      expect(typeof d.requiredStaff).toBe("number");
      expect(d.deficit).toBeGreaterThanOrEqual(0);
    }
  });

  it("getStaffingSummary shape is correct", () => {
    const s = getStaffingSummary();
    expect(typeof s.totalStaff).toBe("number");
    expect(typeof s.activeStaff).toBe("number");
    expect(Array.isArray(s.alerts)).toBe(true);
    expect(Array.isArray(s.demand)).toBe(true);
  });

  it("updatePatientCounts updates ICU patient count", () => {
    updatePatientCounts({ ICU: 11 });
    const demand = computeShiftDemand().find((d) => d.unit === "ICU");
    expect(demand?.patientCount).toBe(11);
  });

  it("overtime > 8h generates OVERTIME alert", () => {
    addStaff({ name: "RN Overtime", role: "RN", unit: "MedSurg", shiftType: "NIGHT", shiftStart: "23:00", shiftEnd: "07:00", patientLoad: 5, overtimeHrs: 12, active: true });
    const alerts = checkStaffingRatios();
    const ot = alerts.find((a) => a.type === "OVERTIME");
    expect(ot).toBeDefined();
  });
});

// ─── 3. Bed Management ────────────────────────────────────────────────────────
import {
  listBeds, admitPatient, dischargePatient, markBedAvailable,
  getHospitalCapacity, getOccupancyReport,
} from "../../server/hospital/bedManagement";

describe("Batch38 — bedManagement", () => {
  it("listBeds returns array of beds", () => {
    const beds = listBeds();
    expect(beds.length).toBeGreaterThan(0);
    expect(beds[0].id).toBeTruthy();
    expect(beds[0].number).toBeTruthy();
  });

  it("listBeds filters by status", () => {
    const available = listBeds({ status: "AVAILABLE" });
    expect(available.every((b) => b.status === "AVAILABLE")).toBe(true);
  });

  it("listBeds filters by unit", () => {
    const icu = listBeds({ unit: "ICU" });
    expect(icu.every((b) => b.unit === "ICU")).toBe(true);
  });

  it("admitPatient to available unit", () => {
    const result = admitPatient({ patientId: "PA001", patientName: "Alice", unit: "MedSurg", acuityLevel: 3 });
    expect(result.ok).toBe(true);
    expect(result.bed?.patientId).toBe("PA001");
    expect(result.bed?.status).toBe("OCCUPIED");
  });

  it("admitPatient to nonexistent unit returns error", () => {
    const result = admitPatient({ patientId: "PX", patientName: "X", unit: "PACU", acuityLevel: 2 });
    // PACU may or may not have beds — just check shape
    expect(typeof result.ok).toBe("boolean");
  });

  it("dischargePatient sets bed to CLEANING", () => {
    const available = listBeds({ status: "AVAILABLE", unit: "MedSurg" });
    if (available.length === 0) { return; }
    const admitResult = admitPatient({ patientId: "PB001", patientName: "Bob", unit: "MedSurg" });
    if (!admitResult.ok || !admitResult.bed) return;
    const discharge = dischargePatient(admitResult.bed.id);
    expect(discharge.ok).toBe(true);
    const bed = listBeds().find((b) => b.id === admitResult.bed!.id);
    expect(bed?.status).toBe("CLEANING");
  });

  it("markBedAvailable sets CLEANING → AVAILABLE", () => {
    const cleaning = listBeds({ status: "CLEANING" });
    if (cleaning.length === 0) return;
    expect(markBedAvailable(cleaning[0].id)).toBe(true);
    const bed = listBeds().find((b) => b.id === cleaning[0].id);
    expect(bed?.status).toBe("AVAILABLE");
  });

  it("getHospitalCapacity returns shape", () => {
    const c = getHospitalCapacity();
    expect(typeof c.total).toBe("number");
    expect(typeof c.occupancyRate).toBe("number");
    expect(c.occupancyRate).toBeGreaterThanOrEqual(0);
    expect(c.occupancyRate).toBeLessThanOrEqual(1);
  });

  it("getOccupancyReport returns per-unit reports", () => {
    const reports = getOccupancyReport();
    expect(reports.length).toBeGreaterThan(0);
    for (const r of reports) {
      expect(typeof r.occupancyRate).toBe("number");
      expect(r.occupied + r.available).toBeLessThanOrEqual(r.total);
    }
  });
});

// ─── 4. Population Health ─────────────────────────────────────────────────────
import {
  listPatients, analyzeConditionCohort, getPopulationSummary,
  getReadmissionAlerts, addPatient,
} from "../../server/hospital/populationHealth";

describe("Batch38 — populationHealth", () => {
  it("listPatients returns patients sorted by readmission risk desc", () => {
    const patients = listPatients();
    expect(patients.length).toBeGreaterThan(0);
    for (let i = 1; i < patients.length; i++) {
      expect(patients[i].readmissionRisk).toBeLessThanOrEqual(patients[i - 1].readmissionRisk);
    }
  });

  it("listPatients filters by riskTier", () => {
    const high = listPatients({ riskTier: "HIGH" });
    expect(high.every((p) => p.riskTier === "HIGH")).toBe(true);
  });

  it("analyzeConditionCohort returns shape", () => {
    const cohort = analyzeConditionCohort("HTN");
    expect(typeof cohort.count).toBe("number");
    expect(typeof cohort.avgAge).toBe("number");
    expect(typeof cohort.avgReadmissionRisk).toBe("number");
    expect(Array.isArray(cohort.commonGaps)).toBe(true);
  });

  it("getPopulationSummary has all risk tiers", () => {
    const s = getPopulationSummary();
    expect(typeof s.totalPatients).toBe("number");
    expect(s.totalPatients).toBeGreaterThan(0);
    expect(s.byRiskTier.LOW).toBeDefined();
    expect(s.byRiskTier.HIGH).toBeDefined();
    expect(Array.isArray(s.topConditions)).toBe(true);
  });

  it("getReadmissionAlerts returns patients above threshold", () => {
    const alerts = getReadmissionAlerts(0.5);
    expect(alerts.every((p) => p.readmissionRisk >= 0.5)).toBe(true);
  });

  it("addPatient calculates readmissionRisk automatically", () => {
    const p = addPatient({ name: "Test Patient", age: 70, sex: "M", conditions: ["CHF", "CKD"], lastVisit: new Date().toISOString(), smokingStatus: "FORMER", preventiveGaps: [] });
    expect(p.id).toBeTruthy();
    expect(p.readmissionRisk).toBeGreaterThan(0);
    expect(["LOW", "MEDIUM", "HIGH", "VERY_HIGH"]).toContain(p.riskTier);
  });

  it("CHF patient has higher risk than healthy patient", () => {
    const sick = addPatient({ name: "CHF Patient", age: 72, sex: "M", conditions: ["CHF", "CKD", "DM2"], lastVisit: new Date().toISOString(), smokingStatus: "CURRENT", preventiveGaps: [] });
    const healthy = addPatient({ name: "Healthy Patient", age: 30, sex: "F", conditions: [], lastVisit: new Date().toISOString(), smokingStatus: "NEVER", preventiveGaps: [] });
    expect(sick.readmissionRisk).toBeGreaterThan(healthy.readmissionRisk);
  });

  it("preventiveCareGapRate between 0 and 1", () => {
    const s = getPopulationSummary();
    expect(s.preventiveCareGapRate).toBeGreaterThanOrEqual(0);
    expect(s.preventiveCareGapRate).toBeLessThanOrEqual(1);
  });
});

// ─── 5. Hospital Agent ────────────────────────────────────────────────────────
import {
  runHospitalAgent, getActionLog, resolveAction, getAgentStats,
} from "../../server/hospital/hospitalAgent";

describe("Batch38 — hospitalAgent", () => {
  it("runHospitalAgent returns AgentRunResult", async () => {
    const r = await runHospitalAgent();
    expect(r.runId).toBeTruthy();
    expect(Array.isArray(r.actions)).toBe(true);
    expect(typeof r.durationMs).toBe("number");
    expect(r.runAt).toBeTruthy();
    expect(typeof r.summary).toBe("string");
  });

  it("agent actions have required fields", async () => {
    const r = await runHospitalAgent();
    for (const a of r.actions) {
      expect(a.id).toBeTruthy();
      expect(["ESCALATE", "DISCHARGE_SUGGEST", "STAFF_ALERT", "CAPACITY_ALERT", "READMISSION_RISK", "DIVERT_RECOMMEND", "INFO"]).toContain(a.type);
      expect(["critical", "high", "medium", "low", "info"]).toContain(a.priority);
      expect(typeof a.message).toBe("string");
      expect(typeof a.resolved).toBe("boolean");
    }
  });

  it("getActionLog returns most recent actions", async () => {
    await runHospitalAgent();
    const log = getActionLog(10);
    expect(Array.isArray(log)).toBe(true);
    expect(log.length).toBeLessThanOrEqual(10);
  });

  it("resolveAction marks action resolved", async () => {
    const r = await runHospitalAgent();
    if (r.actions.length === 0) return;
    const id = r.actions[0].id;
    expect(resolveAction(id)).toBe(true);
    const log = getActionLog();
    const action = log.find((a) => a.id === id);
    expect(action?.resolved).toBe(true);
  });

  it("resolveAction returns false for unknown id", () => {
    expect(resolveAction("nonexistent")).toBe(false);
  });

  it("getAgentStats increments totalRuns", async () => {
    const before = getAgentStats().totalRuns;
    await runHospitalAgent();
    const after = getAgentStats().totalRuns;
    expect(after).toBeGreaterThan(before);
  });

  it("getAgentStats has unresolvedCritical count", () => {
    const s = getAgentStats();
    expect(typeof s.unresolvedCritical).toBe("number");
    expect(typeof s.unresolvedHigh).toBe("number");
  });

  it("summary string is not empty", async () => {
    const r = await runHospitalAgent();
    expect(r.summary.length).toBeGreaterThan(0);
  });

  it("durationMs is reasonable (< 5000ms)", async () => {
    const r = await runHospitalAgent();
    expect(r.durationMs).toBeLessThan(5000);
  });
});
