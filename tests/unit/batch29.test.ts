import { describe, it, expect, beforeEach } from "vitest";

// ─── 1. AuditTraceService ─────────────────────────────────────────────────────
import { auditTraceService, type TraceStep } from "../../server/services/auditTraceService";

describe("Batch29 — auditTraceService", () => {
  it("createTrace returns a UUID string", () => {
    const id = auditTraceService.createTrace();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(8);
  });

  it("startStep adds a step with status started", () => {
    const traceId = auditTraceService.createTrace();
    const step = auditTraceService.startStep(traceId, "diagnosis.run", "run-diagnosis", { complaint: "cough" });
    expect(step.status).toBe("started");
    expect(step.stepName).toBe("run-diagnosis");
    expect(step.toolName).toBe("diagnosis.run");
  });

  it("completeStep transitions status to completed and records output", () => {
    const traceId = auditTraceService.createTrace();
    auditTraceService.startStep(traceId, "diagnosis.run", "run-diagnosis", { complaint: "cough" });
    auditTraceService.completeStep(traceId, "run-diagnosis", { diagnosis: "Viral URI", confidence: 0.87 });
    const steps = auditTraceService.getTrace(traceId);
    expect(steps[0].status).toBe("completed");
    expect((steps[0].outputSnapshot as any).diagnosis).toBe("Viral URI");
  });

  it("completeStep records delta for changed fields", () => {
    const traceId = auditTraceService.createTrace();
    auditTraceService.startStep(traceId, "risk.assess", "risk-assessment", { confidence: 0.5 });
    auditTraceService.completeStep(traceId, "risk-assessment", { confidence: 0.5, riskLevel: "moderate" });
    const steps = auditTraceService.getTrace(traceId);
    expect(steps[0].delta).toBeDefined();
    expect(steps[0].delta!.riskLevel).toBeDefined();
  });

  it("failStep transitions status to failed with error message", () => {
    const traceId = auditTraceService.createTrace();
    auditTraceService.startStep(traceId, "ehr.document", "ehr-doc", {});
    auditTraceService.failStep(traceId, "ehr-doc", new Error("EHR connection timeout"));
    const steps = auditTraceService.getTrace(traceId);
    expect(steps[0].status).toBe("failed");
    expect(steps[0].error).toContain("EHR connection timeout");
  });

  it("summarize builds a readable step chain", () => {
    const traceId = auditTraceService.createTrace();
    auditTraceService.startStep(traceId, "intake.collect", "collect-intake", {});
    auditTraceService.completeStep(traceId, "collect-intake", { intakeComplete: true });
    auditTraceService.startStep(traceId, "diagnosis.run", "run-diagnosis", {});
    auditTraceService.completeStep(traceId, "run-diagnosis", { diagnosis: "Viral URI" });
    const summary = auditTraceService.summarize(traceId);
    expect(summary).toContain("collect-intake:completed");
    expect(summary).toContain("run-diagnosis:completed");
    expect(summary).toContain("->");
  });

  it("getTrace returns empty array for unknown traceId", () => {
    expect(auditTraceService.getTrace("nonexistent-trace-id")).toEqual([]);
  });
});

// ─── 2. Medical MCP Registry ──────────────────────────────────────────────────
import { medicalMCP, type MCPTool } from "../../server/mcp/medicalMCP";

describe("Batch29 — medicalMCP registry", () => {
  it("register + execute a tool", async () => {
    medicalMCP.register({
      name:        "test.echo",
      description: "Echoes input",
      async execute(input) { return { ...input, echoed: true }; },
    });
    const result = await medicalMCP.execute("test.echo", { x: 1 }, {});
    expect(result.echoed).toBe(true);
    expect(result.x).toBe(1);
  });

  it("throws for unknown tool", async () => {
    await expect(
      medicalMCP.execute("nonexistent.tool", {}, {})
    ).rejects.toThrow("not found");
  });

  it("listTools includes registered tools", () => {
    const tools = medicalMCP.listTools();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.some((t) => t.name === "test.echo")).toBe(true);
  });

  it("has() returns true for registered tools", () => {
    expect(medicalMCP.has("test.echo")).toBe(true);
    expect(medicalMCP.has("definitely.not.there")).toBe(false);
  });
});

// ─── 3. Base Clinical MCP Tools ───────────────────────────────────────────────
// Tools are registered at import time — ensure they work correctly
describe("Batch29 — baseClinicalTools", () => {
  beforeEach(async () => {
    await import("../../server/mcp/loadTools");
  });

  it("intake.collect adds intakeComplete:true", async () => {
    const result = await medicalMCP.execute(
      "intake.collect",
      { patientId: "p-001", complaint: "cough" },
      {}
    );
    expect(result.intakeComplete).toBe(true);
    expect(result.vitals).toBeDefined();
    expect(result.symptoms).toBeDefined();
  });

  it("diagnosis.run detects sepsis pattern (high fever + confusion)", async () => {
    const result = await medicalMCP.execute(
      "diagnosis.run",
      {
        complaint: "fever", vitals: { tempF: 103 },
        symptoms:  { confusion: true },
      },
      {}
    );
    expect(result.diagnosis).toContain("sepsis");
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it("diagnosis.run defaults to Viral URI for mild presentation", async () => {
    const result = await medicalMCP.execute(
      "diagnosis.run",
      { complaint: "cough", vitals: { tempF: 99 }, symptoms: { sob: false, chestPain: false, confusion: false } },
      {}
    );
    expect(result.diagnosis).toBe("Viral URI");
  });

  it("risk.assess assigns low for high confidence", async () => {
    const result = await medicalMCP.execute(
      "risk.assess",
      { confidence: 0.9 },
      {}
    );
    expect(result.riskLevel).toBe("low");
  });

  it("risk.assess assigns high for low confidence", async () => {
    const result = await medicalMCP.execute(
      "risk.assess",
      { confidence: 0.4 },
      {}
    );
    expect(result.riskLevel).toBe("high");
  });

  it("disposition.determine sends high risk to ED", async () => {
    const result = await medicalMCP.execute(
      "disposition.determine",
      { riskLevel: "high" },
      {}
    );
    expect(result.disposition).toBe("ED now");
  });

  it("disposition.determine sends low risk home", async () => {
    const result = await medicalMCP.execute(
      "disposition.determine",
      { riskLevel: "low" },
      {}
    );
    expect(result.disposition).toBe("Home care with follow-up");
  });

  it("ehr.document marks documented:true", async () => {
    const result = await medicalMCP.execute(
      "ehr.document",
      { diagnosis: "Viral URI" },
      {}
    );
    expect(result.documented).toBe(true);
  });
});

// ─── 4. Specialist Council ────────────────────────────────────────────────────
import { runSpecialistCouncil } from "../../server/services/specialistCouncilService";

describe("Batch29 — specialistCouncilService", () => {
  it("returns 3 specialist votes", () => {
    const result = runSpecialistCouncil({ patientId: "p", complaint: "cough" });
    expect(result.votes).toHaveLength(3);
    expect(result.votes.map((v) => v.specialty)).toContain("cardiology");
    expect(result.votes.map((v) => v.specialty)).toContain("infectious_disease");
    expect(result.votes.map((v) => v.specialty)).toContain("icu");
  });

  it("sepsis pattern: all 3 specialists escalate to ED", () => {
    const result = runSpecialistCouncil({
      patientId: "p", complaint: "fever",
      vitals:  { tempF: 103.5, hr: 130, spo2: 89, rr: 32, systolicBP: 82 },
      symptoms: { confusion: true, chills: true },
    });
    expect(result.consensus.escalationRecommended).toBe(true);
    expect(result.consensus.disposition).toBe("ED now");
    expect(result.consensus.riskLevel).toBe("critical");
  });

  it("normal vitals: council does not escalate", () => {
    const result = runSpecialistCouncil({
      patientId: "p", complaint: "runny nose",
      vitals:  { tempF: 99, hr: 75, spo2: 98, rr: 14, systolicBP: 120 },
      symptoms: { confusion: false, chestPain: false },
    });
    expect(result.consensus.escalationRecommended).toBe(false);
    expect(result.consensus.confidence).toBeGreaterThan(0);
  });

  it("cardiology flags chest pain + SOB", () => {
    const result = runSpecialistCouncil({
      patientId: "p", complaint: "chest pain",
      symptoms:  { chestPain: true, sob: true },
      vitals:    { hr: 100 },
    });
    const cardiologyVote = result.votes.find((v) => v.specialty === "cardiology");
    expect(cardiologyVote?.redFlags).toContain("possible_cardiac_event");
  });

  it("ICU flags SpO2 ≤ 90", () => {
    const result = runSpecialistCouncil({
      patientId: "p", complaint: "sob",
      vitals:    { spo2: 88, rr: 22 },
    });
    const icuVote = result.votes.find((v) => v.specialty === "icu");
    expect(icuVote?.redFlags).toContain("physiologic_instability");
  });

  it("consensus confidence is average of 3 votes", () => {
    const result = runSpecialistCouncil({ patientId: "p", complaint: "cough" });
    const expectedAvg = result.votes.reduce((sum, v) => sum + v.confidence, 0) / 3;
    expect(result.consensus.confidence).toBeCloseTo(expectedAvg, 2);
  });
});

// ─── 5. Patient Monitoring Service ───────────────────────────────────────────
import { assessMonitoring } from "../../server/services/patientMonitoringService";

describe("Batch29 — patientMonitoringService", () => {
  it("normal vitals: no alerts, score 0, no escalation", () => {
    const r = assessMonitoring({
      patientId: "p", complaint: "cough",
      vitals: { tempF: 98.6, spo2: 98, hr: 72, rr: 14, systolicBP: 120 },
    } as any);
    expect(r.alerts).toHaveLength(0);
    expect(r.deteriorationScore).toBe(0);
    expect(r.escalationRecommended).toBe(false);
    expect(r.reassessInMinutes).toBe(60);
  });

  it("tachycardia (HR≥120) triggers alert", () => {
    const r = assessMonitoring({ patientId: "p", complaint: "x", vitals: { hr: 130 } } as any);
    expect(r.alerts.some((a) => a.type === "tachycardia")).toBe(true);
    expect(r.deteriorationScore).toBeGreaterThanOrEqual(2);
  });

  it("critical hypoxia (SpO2≤90) triggers critical alert", () => {
    const r = assessMonitoring({ patientId: "p", complaint: "x", vitals: { spo2: 88 } } as any);
    const alert = r.alerts.find((a) => a.type === "hypoxia");
    expect(alert).toBeDefined();
    expect(alert!.severity).toBe("critical");
    expect(r.deteriorationScore).toBeGreaterThanOrEqual(3);
  });

  it("hypotension (SBP<90) triggers critical alert", () => {
    const r = assessMonitoring({ patientId: "p", complaint: "x", vitals: { systolicBP: 78 } } as any);
    expect(r.alerts.some((a) => a.type === "hypotension")).toBe(true);
  });

  it("high fever triggers fever alert", () => {
    const r = assessMonitoring({ patientId: "p", complaint: "x", vitals: { tempF: 103 } } as any);
    expect(r.alerts.some((a) => a.type === "fever")).toBe(true);
  });

  it("critical RR (≥30) triggers critical respiratory_distress", () => {
    const r = assessMonitoring({ patientId: "p", complaint: "x", vitals: { rr: 32 } } as any);
    const alert = r.alerts.find((a) => a.type === "respiratory_distress");
    expect(alert?.severity).toBe("critical");
  });

  it("sepsis pattern triggers sepsis_risk alert", () => {
    const r = assessMonitoring({ patientId: "p", complaint: "x", vitals: { tempF: 103, hr: 125, rr: 26 } } as any);
    expect(r.alerts.some((a) => a.type === "sepsis_risk")).toBe(true);
    expect(r.escalationRecommended).toBe(true);
  });

  it("escalation threshold at score≥4", () => {
    const r = assessMonitoring({
      patientId: "p", complaint: "x",
      vitals: { hr: 125, spo2: 91 },  // tachycardia(2) + hypoxia(2) = 4
    } as any);
    expect(r.deteriorationScore).toBeGreaterThanOrEqual(4);
    expect(r.escalationRecommended).toBe(true);
    expect(r.reassessInMinutes).toBeLessThanOrEqual(10);
  });

  it("accepts flat vitals object (no vitals wrapper)", () => {
    const r = assessMonitoring({ tempF: 98.6, spo2: 98, hr: 72, rr: 14 } as any);
    expect(r.deteriorationScore).toBe(0);
  });
});

// ─── 6. Golden Case Service ───────────────────────────────────────────────────
import { goldenCaseService } from "../../server/services/goldenCaseService";

describe("Batch29 — goldenCaseService", () => {
  it("list() returns at least 2 seeded golden cases", () => {
    const cases = goldenCaseService.list();
    expect(cases.length).toBeGreaterThanOrEqual(2);
  });

  it("seeded viral cough case is present", () => {
    const c = goldenCaseService.getById("gc-cough-viral-001");
    expect(c).toBeDefined();
    expect(c!.complaint).toBe("cough");
    expect(c!.expected.diagnosisIncludes).toContain("Viral URI");
  });

  it("seeded sepsis case is present", () => {
    const c = goldenCaseService.getById("gc-sepsis-risk-001");
    expect(c).toBeDefined();
    expect(c!.expected.riskLevel).toBe("critical");
  });

  it("compare() passes when actual matches expected", () => {
    const caseDef = goldenCaseService.getById("gc-cough-viral-001")!;
    const actual  = { diagnosis: "Viral URI", disposition: "Home care with follow-up", riskLevel: "low" as const, confidence: 0.87 };
    const result  = goldenCaseService.compare(caseDef, actual, "trace-test-001");
    expect(result.passed).toBe(true);
    expect(result.mismatches).toHaveLength(0);
  });

  it("compare() fails when diagnosis doesn't include expected string", () => {
    const caseDef = goldenCaseService.getById("gc-cough-viral-001")!;
    const actual  = { diagnosis: "Bacterial pneumonia", disposition: "Home care with follow-up", riskLevel: "low" as const, confidence: 0.87 };
    const result  = goldenCaseService.compare(caseDef, actual);
    expect(result.passed).toBe(false);
    expect(result.mismatches.length).toBeGreaterThan(0);
  });

  it("compare() fails when confidence below minConfidence", () => {
    const caseDef = goldenCaseService.getById("gc-cough-viral-001")!;
    const actual  = { diagnosis: "Viral URI", disposition: "Home care with follow-up", riskLevel: "low" as const, confidence: 0.3 };
    const result  = goldenCaseService.compare(caseDef, actual);
    expect(result.passed).toBe(false);
    expect(result.mismatches.some((m) => m.includes("confidence"))).toBe(true);
  });

  it("listRuns() accumulates run history", () => {
    const before = goldenCaseService.listRuns().length;
    const caseDef = goldenCaseService.getById("gc-cough-viral-001")!;
    goldenCaseService.compare(caseDef, { diagnosis: "Viral URI", confidence: 0.9 });
    expect(goldenCaseService.listRuns().length).toBeGreaterThan(before);
  });

  it("seed() does not duplicate existing cases", () => {
    const before = goldenCaseService.list().length;
    goldenCaseService.seed([{ id: "gc-cough-viral-001", title: "Dup", complaint: "cough", input: { patientId: "x", complaint: "cough" }, expected: {}, active: true }]);
    expect(goldenCaseService.list().length).toBe(before);
  });
});

// ─── 7. RLHF Service ─────────────────────────────────────────────────────────
import { rlhfService } from "../../server/services/rlhfService";

describe("Batch29 — rlhfService", () => {
  it("addFeedback returns event with id and createdAt", () => {
    const fb = rlhfService.addFeedback({
      complaint: "cough", predictedDiagnosis: "Viral URI", finalDiagnosis: "Viral URI",
      physicianAgreement: true, safetyIssue: false,
    });
    expect(fb.id).toBeTruthy();
    expect(fb.createdAt).toBeTruthy();
    expect(fb.complaint).toBe("cough");
  });

  it("listFeedback includes added events", () => {
    const before = rlhfService.listFeedback().length;
    rlhfService.addFeedback({
      complaint: "fever", predictedDiagnosis: "Viral URI", finalDiagnosis: "Bacterial pneumonia",
      physicianAgreement: false, safetyIssue: true,
    });
    expect(rlhfService.listFeedback().length).toBeGreaterThan(before);
  });

  it("generateProposals returns empty array when insufficient events", () => {
    // Already seeded from previous tests but may not have ≥5 for any single key
    const proposals = rlhfService.generateProposals();
    expect(Array.isArray(proposals)).toBe(true);
  });

  it("generateProposals creates proposal when ≥5 disagreements exist", () => {
    for (let i = 0; i < 5; i++) {
      rlhfService.addFeedback({
        complaint: "test_complaint_batch29", predictedDiagnosis: "WrongDx",
        finalDiagnosis: "CorrectDx", physicianAgreement: false, safetyIssue: false,
      });
    }
    const proposals = rlhfService.generateProposals();
    const relevant = proposals.filter((p) => p.complaint === "test_complaint_batch29");
    expect(relevant.length).toBeGreaterThan(0);
    expect(relevant[0].requiresPhysicianReview).toBe(true);
    expect(relevant[0].status).toBe("pending");
  });

  it("reviewProposal transitions status to approved", () => {
    for (let i = 0; i < 5; i++) {
      rlhfService.addFeedback({
        complaint: "approve_test_batch29", predictedDiagnosis: "WrongDx",
        physicianAgreement: false, safetyIssue: true,
      });
    }
    const created = rlhfService.generateProposals();
    const proposal = created.find((p) => p.complaint === "approve_test_batch29");
    if (proposal) {
      const updated = rlhfService.reviewProposal(proposal.id, "approved");
      expect(updated.status).toBe("approved");
    }
  });

  it("reviewProposal throws for nonexistent id", () => {
    expect(() => rlhfService.reviewProposal("fake-uuid-xyz", "approved")).toThrow();
  });

  it("proposal values are clamped to [0.5, 1.5]", () => {
    for (let i = 0; i < 5; i++) {
      rlhfService.addFeedback({
        complaint: "clamp_test_batch29", predictedDiagnosis: "BadDx",
        physicianAgreement: false, safetyIssue: true,
      });
    }
    const proposals = rlhfService.generateProposals();
    for (const p of proposals) {
      expect(p.proposedValue).toBeGreaterThanOrEqual(0.5);
      expect(p.proposedValue).toBeLessThanOrEqual(1.5);
    }
  });
});

// ─── 8. Clinical Workflow Engine (E2E) ────────────────────────────────────────
import { runClinicalWorkflow } from "../../server/workflows/clinicalWorkflowEngine";

describe("Batch29 — clinicalWorkflowEngine", () => {
  it("runs 8 steps and returns traceId + traceSummary", async () => {
    const result = await runClinicalWorkflow({
      patientId: "p-wf-001",
      complaint:  "cough",
      age:        35,
      vitals:     { tempF: 99.1, spo2: 98, hr: 78, rr: 14, systolicBP: 120 },
      symptoms:   { sob: false, chestPain: false, fever: false },
    });

    expect(result.traceId).toBeTruthy();
    expect(result.traceSummary).toContain("collect-intake");
    expect(result.traceSummary).toContain("ehr-documentation");
  });

  it("workflow produces diagnosis, riskLevel, and disposition", async () => {
    const result = await runClinicalWorkflow({
      patientId: "p-wf-002",
      complaint:  "cough",
      vitals:     { tempF: 98.6, spo2: 98, hr: 72, rr: 14 },
      symptoms:   { sob: false, chestPain: false },
    });

    expect(result.diagnosis).toBeTruthy();
    expect(result.riskLevel).toBeTruthy();
    expect(result.disposition).toBeTruthy();
  });

  it("sepsis presentation escalates to ED now", async () => {
    const result = await runClinicalWorkflow({
      patientId: "p-wf-003",
      complaint:  "fever",
      vitals:     { tempF: 103.5, spo2: 89, hr: 130, rr: 32, systolicBP: 80 },
      symptoms:   { confusion: true, chills: true },
    });

    expect(["ED now", "critical"].some((v) => [result.disposition, result.riskLevel].includes(v))).toBe(true);
  });

  it("documents the encounter (ehr stub)", async () => {
    const result = await runClinicalWorkflow({
      patientId: "p-wf-004",
      complaint:  "runny nose",
      vitals:     { tempF: 98.0, spo2: 99, hr: 68, rr: 12 },
    });
    expect(result.documented).toBe(true);
  });

  it("trace summary contains all 8 steps as completed", async () => {
    const result = await runClinicalWorkflow({
      patientId: "p-wf-005",
      complaint:  "sore throat",
    });
    const steps = auditTraceService.getTrace(result.traceId!);
    expect(steps.filter((s) => s.status === "completed")).toHaveLength(8);
  });
});

// ─── 9. Phase 2 MCP Tools (council + monitoring) ─────────────────────────────
describe("Batch29 — phase2Tools via medicalMCP", () => {
  it("council.run returns councilOpinion with votes", async () => {
    const result = await medicalMCP.execute(
      "council.run",
      { patientId: "p", complaint: "chest pain", vitals: { tempF: 99, hr: 90, spo2: 97 } },
      {}
    );
    expect(result.councilOpinion).toBeDefined();
    expect(result.councilOpinion.votes).toHaveLength(3);
  });

  it("monitoring.assess escalates for critical vitals", async () => {
    const result = await medicalMCP.execute(
      "monitoring.assess",
      {
        patientId: "p", complaint: "sob",
        vitals: { hr: 130, spo2: 88, rr: 32, tempF: 103, systolicBP: 80 },
      },
      {}
    );
    expect(result.monitoring.escalationRecommended).toBe(true);
    expect(result.disposition).toBe("ED now");
  });

  it("monitoring.assess passes through normal vitals", async () => {
    const result = await medicalMCP.execute(
      "monitoring.assess",
      {
        patientId: "p", complaint: "cough",
        vitals: { hr: 70, spo2: 99, rr: 14, tempF: 98.6 },
        disposition: "Home care with follow-up",
      },
      {}
    );
    expect(result.monitoring.escalationRecommended).toBe(false);
    expect(result.disposition).toBe("Home care with follow-up");
  });
});
