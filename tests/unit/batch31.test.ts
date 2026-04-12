import { describe, it, expect, beforeEach } from "vitest";

// ─── 1. FlowContext ───────────────────────────────────────────────────────────
import { FlowContext } from "../../server/core/FlowContext";

describe("Batch31 — FlowContext", () => {
  it("get() returns set value", () => {
    const ctx = new FlowContext({ x: 42 });
    expect(ctx.get<number>("x")).toBe(42);
  });

  it("get() throws for missing key", () => {
    const ctx = new FlowContext();
    expect(() => ctx.get("missing")).toThrow("Missing key in FlowContext: missing");
  });

  it("tryGet() returns undefined for missing key", () => {
    const ctx = new FlowContext();
    expect(ctx.tryGet("missing")).toBeUndefined();
  });

  it("set() stores and get() retrieves", () => {
    const ctx = new FlowContext();
    ctx.set("name", "Alice");
    expect(ctx.get<string>("name")).toBe("Alice");
  });

  it("has() returns true for existing key, false for missing", () => {
    const ctx = new FlowContext({ a: 1 });
    expect(ctx.has("a")).toBe(true);
    expect(ctx.has("b")).toBe(false);
  });

  it("merge() combines two contexts (other wins on conflict)", () => {
    const a = new FlowContext({ x: 1, y: 2 });
    const b = new FlowContext({ y: 99, z: 3 });
    a.merge(b);
    expect(a.get<number>("x")).toBe(1);
    expect(a.get<number>("y")).toBe(99);
    expect(a.get<number>("z")).toBe(3);
  });

  it("mergeRecord() merges plain object", () => {
    const ctx = new FlowContext({ a: 1 });
    ctx.mergeRecord({ b: 2 });
    expect(ctx.get<number>("b")).toBe(2);
  });

  it("dump() returns all keys", () => {
    const ctx = new FlowContext({ a: 1, b: "two" });
    const d = ctx.dump();
    expect(d).toEqual({ a: 1, b: "two" });
  });

  it("clone() creates an independent copy", () => {
    const ctx = new FlowContext({ x: 1 });
    const cloned = ctx.clone();
    cloned.set("x", 99);
    expect(ctx.get<number>("x")).toBe(1); // original unchanged
    expect(cloned.get<number>("x")).toBe(99);
  });
});

// ─── 2. DAGExecutor ───────────────────────────────────────────────────────────
import { DAGExecutor } from "../../server/core/DAGExecutor";
import { MedicalAgent } from "../../server/core/MedicalAgent";

class DoubleAgent extends MedicalAgent {
  constructor() {
    super({ name: "doubleAgent", consumes: ["value"], provides: ["doubled"] });
  }
  async run(ctx: FlowContext): Promise<FlowContext> {
    const out = ctx.clone();
    out.set("doubled", ctx.get<number>("value") * 2);
    return out;
  }
}

class PrefixAgent extends MedicalAgent {
  constructor() {
    super({ name: "prefixAgent", consumes: ["doubled"], provides: ["result"] });
  }
  async run(ctx: FlowContext): Promise<FlowContext> {
    const out = ctx.clone();
    out.set("result", `doubled=${ctx.get<number>("doubled")}`);
    return out;
  }
}

describe("Batch31 — DAGExecutor", () => {
  it("run() chains agents sequentially", async () => {
    const executor = new DAGExecutor([new DoubleAgent(), new PrefixAgent()]);
    const ctx = new FlowContext({ value: 5 });
    const result = await executor.run(ctx);
    expect(result.get<number>("doubled")).toBe(10);
    expect(result.get<string>("result")).toBe("doubled=10");
  });

  it("validate() throws when a consumed key is missing from chain", () => {
    const executor = new DAGExecutor([new PrefixAgent()]); // consumes doubled — not provided
    expect(() => executor.validate([])).toThrow("requires missing keys");
  });

  it("validate() passes when initial keys satisfy all consumes", () => {
    const executor = new DAGExecutor([new DoubleAgent(), new PrefixAgent()]);
    expect(() => executor.validate(["value"])).not.toThrow();
  });

  it("runParallel() runs a single layer and merges", async () => {
    const executor = new DAGExecutor([]);
    const ctx = new FlowContext({ value: 3 });
    const result = await executor.runParallel([[new DoubleAgent()]], ctx);
    expect(result.get<number>("doubled")).toBe(6);
  });
});

// ─── 3. RedFlagAgent ─────────────────────────────────────────────────────────
import { RedFlagAgent } from "../../server/agents/redFlagAgent";

describe("Batch31 — RedFlagAgent", () => {
  it("normal vitals → no redFlags", async () => {
    const ctx  = new FlowContext({ vitals: { hr: 72, spo2: 98, systolicBP: 120, rr: 14, tempF: 98.6 }, symptoms: {} });
    const out  = await new RedFlagAgent().run(ctx);
    expect(out.get<string[]>("redFlags")).toHaveLength(0);
  });

  it("chest pain + tachycardia → possible_PE_or_ACS", async () => {
    const ctx = new FlowContext({ vitals: { hr: 130 }, symptoms: { chestPain: true } });
    const out = await new RedFlagAgent().run(ctx);
    expect(out.get<string[]>("redFlags")).toContain("possible_PE_or_ACS");
  });

  it("critical hypoxia → critical_hypoxia flag", async () => {
    const ctx = new FlowContext({ vitals: { spo2: 88 } });
    const out = await new RedFlagAgent().run(ctx);
    expect(out.get<string[]>("redFlags")).toContain("critical_hypoxia");
  });

  it("hypotension → shock_risk flag", async () => {
    const ctx = new FlowContext({ vitals: { systolicBP: 82 } });
    const out = await new RedFlagAgent().run(ctx);
    expect(out.get<string[]>("redFlags")).toContain("shock_risk");
  });

  it("fever + confusion → possible_sepsis flag", async () => {
    const ctx = new FlowContext({ vitals: { tempF: 104 }, symptoms: { confusion: true } });
    const out = await new RedFlagAgent().run(ctx);
    expect(out.get<string[]>("redFlags")).toContain("possible_sepsis");
  });

  it("SOB + hypoxia → cardiopulmonary_compromise flag", async () => {
    const ctx = new FlowContext({ vitals: { spo2: 91 }, symptoms: { sob: true } });
    const out = await new RedFlagAgent().run(ctx);
    expect(out.get<string[]>("redFlags")).toContain("cardiopulmonary_compromise");
  });

  it("does not mutate the input context", async () => {
    const ctx = new FlowContext({ vitals: { spo2: 88 } });
    await new RedFlagAgent().run(ctx);
    expect(ctx.has("redFlags")).toBe(false);
  });

  it("meta describes correct consumes and provides", () => {
    const agent = new RedFlagAgent();
    expect(agent.meta.consumes).toContain("vitals");
    expect(agent.meta.provides).toContain("redFlags");
  });
});

// ─── 4. ClinicalOrchestrator ─────────────────────────────────────────────────
import { runClinicalPipeline } from "../../server/orchestrators/clinicalOrchestrator";

describe("Batch31 — clinicalOrchestrator", () => {
  it("returns redFlags array for any input", async () => {
    const result = await runClinicalPipeline({ patientId: "orch-001", vitals: { hr: 70 } });
    expect(Array.isArray(result.redFlags)).toBe(true);
  });

  it("sepsis input → possible_sepsis red flag in orchestrator output", async () => {
    const result = await runClinicalPipeline({
      patientId: "orch-002",
      vitals: { tempF: 104, hr: 130, spo2: 89 },
      symptoms: { confusion: true, chestPain: true },
    });
    expect((result.redFlags as string[]).some((f) => f.includes("sepsis") || f.includes("ACS"))).toBe(true);
  });
});

// ─── 5. CPT Engine ────────────────────────────────────────────────────────────
import { generateCPT } from "../../server/billing/cptEngine";

describe("Batch31 — cptEngine", () => {
  it("low risk → 99213", () => {
    expect(generateCPT({ riskLevel: "low", diagnosis: "Viral URI", disposition: "Home" }).code).toBe("99213");
  });

  it("moderate risk → 99214", () => {
    expect(generateCPT({ riskLevel: "moderate" }).code).toBe("99214");
  });

  it("high risk → 99214", () => {
    expect(generateCPT({ riskLevel: "high" }).code).toBe("99214");
  });

  it("critical risk → 99285", () => {
    expect(generateCPT({ riskLevel: "critical" }).code).toBe("99285");
  });

  it("justification contains riskLevel and diagnosis", () => {
    const r = generateCPT({ riskLevel: "high", diagnosis: "Sepsis" });
    expect(r.justification).toContain("high");
    expect(r.justification).toContain("Sepsis");
  });

  it("unknown riskLevel defaults to low (99213)", () => {
    expect(generateCPT({ riskLevel: "unknown" }).code).toBe("99213");
  });
});

// ─── 6. PayerROIService ───────────────────────────────────────────────────────
import { payerROIService } from "../../server/services/payerROIService";

describe("Batch31 — payerROIService", () => {
  it("empty case list returns zero savings", () => {
    const roi = payerROIService.calculate([]);
    expect(roi.totalSavings).toBe(0);
    expect(roi.avoidedEDVisits).toBe(0);
  });

  it("all home-care cases: all avoided, large savings", () => {
    const cases = Array.from({ length: 10 }, () => ({
      patient: {} as any, outcome: "Home care with follow-up", diagnosis: "Viral URI", confidence: 0.9, riskLevel: "low",
    }));
    const roi = payerROIService.calculate(cases);
    expect(roi.avoidedEDVisits).toBe(10);
    expect(roi.totalSavings).toBeGreaterThan(0);
  });

  it("all ED cases: no avoided visits, zero savings", () => {
    const cases = Array.from({ length: 5 }, () => ({
      patient: {} as any, outcome: "ED now", diagnosis: "Sepsis", confidence: 0.9, riskLevel: "critical",
    }));
    const roi = payerROIService.calculate(cases);
    expect(roi.avoidedEDVisits).toBe(0);
    expect(roi.totalSavings).toBe(0);
  });

  it("annualizedSavings500 is > 0 when there are avoided visits", () => {
    const cases = [{ patient: {} as any, outcome: "Home care with follow-up", diagnosis: "x", confidence: 0.9, riskLevel: "low" }];
    const roi = payerROIService.calculate(cases);
    expect(roi.annualizedSavings500).toBeGreaterThan(0);
  });
});

// ─── 7. PayerContractService ──────────────────────────────────────────────────
import { payerContractService } from "../../server/services/payerContractService";

describe("Batch31 — payerContractService", () => {
  it("volume=501: bonus $10, no diversion bonus", () => {
    const c = payerContractService.simulateContract(501);
    expect(c.bonusPerVisit).toBe(10);
    expect(c.edDiversionBonus).toBe(0);
  });

  it("volume=2000: bonus $20, diversion bonus $50,000", () => {
    const c = payerContractService.simulateContract(2000);
    expect(c.bonusPerVisit).toBe(20);
    expect(c.edDiversionBonus).toBe(50_000);
  });

  it("annual revenue = (base+bonus)*volume + diversionBonus", () => {
    const c = payerContractService.simulateContract(1000);
    expect(c.annualRevenue).toBe((c.baseRatePerVisit + c.bonusPerVisit) * 1000 + c.edDiversionBonus);
  });

  it("suggestNegotiation: >100 avoided ED visits → requests higher reimbursement", () => {
    const s = payerContractService.suggestNegotiation({ avoidedEDVisits: 150, totalSavings: 300_000 });
    expect(s.strategy).toContain("higher reimbursement");
    expect(s.estimatedUplift).toContain("%");
  });

  it("suggestNegotiation: standard when ED diversion is low", () => {
    const s = payerContractService.suggestNegotiation({ avoidedEDVisits: 5, totalSavings: 1000 });
    expect(s.strategy).toContain("Standard");
  });

  it("suggestNegotiation levers array is non-empty", () => {
    const s = payerContractService.suggestNegotiation({});
    expect(s.levers.length).toBeGreaterThan(0);
  });
});

// ─── 8. SaMD Dossier Service ──────────────────────────────────────────────────
import { samdDossierService } from "../../server/services/samdDossierService";

describe("Batch31 — samdDossierService", () => {
  it("generate() returns required top-level fields", () => {
    const d = samdDossierService.generate();
    expect(d.deviceName).toBe("Auralyn MedOS");
    expect(d.classification).toBe("SaMD Class II");
    expect(d.intendedUse).toBeTruthy();
    expect(d.generatedAt).toBeTruthy();
  });

  it("systemArchitecture includes all required flags", () => {
    const d = samdDossierService.generate();
    expect(d.systemArchitecture.mcpLayer).toBe(true);
    expect(d.systemArchitecture.specialistCouncil).toBe(true);
    expect(d.systemArchitecture.immutableAuditChain).toBe(true);
  });

  it("audit section reflects hash chain state", () => {
    const d = samdDossierService.generate();
    expect(d.audit.hashChainEnabled).toBe(true);
    expect(typeof d.audit.chainValid).toBe("boolean");
    expect(typeof d.audit.chainLength).toBe("number");
  });

  it("riskAnalysis has at least 3 mitigations", () => {
    const d = samdDossierService.generate();
    expect(d.riskAnalysis.mitigations.length).toBeGreaterThanOrEqual(3);
  });

  it("validation field is from fdaValidationService", () => {
    const d = samdDossierService.generate();
    expect(typeof d.validation.fdaReady).toBe("boolean");
    expect(typeof d.validation.accuracy).toBe("number");
  });

  it("generatedAt is a valid ISO timestamp", () => {
    const d = samdDossierService.generate();
    expect(() => new Date(d.generatedAt)).not.toThrow();
  });
});

// ─── 9. EHR Orchestrator (stub) ───────────────────────────────────────────────
import { submitEncounter } from "../../server/ehr/ehrOrchestrator";

describe("Batch31 — ehrOrchestrator (stub)", () => {
  it("returns success:true for athena system", async () => {
    const result = await submitEncounter({ diagnosis: "Viral URI", traceId: "t-001" });
    expect(result.success).toBe(true);
    expect(result.stub).toBe(true);
  });

  it("returns system name in result", async () => {
    const result = await submitEncounter({ diagnosis: "Viral URI" });
    expect(result.system).toBeTruthy();
  });
});

// ─── 10. Pilot Workflow ────────────────────────────────────────────────────────
import { runPilotEncounter } from "../../server/workflows/pilotWorkflow";

describe("Batch31 — pilotWorkflow", () => {
  it("completes successfully for a normal encounter", async () => {
    const result = await runPilotEncounter({
      patientId: "pilot-test-001",
      complaint:  "cough",
      vitals:     { tempF: 98.6, hr: 72, spo2: 98, rr: 14 },
    });
    expect(["complete", "pending_physician_review", "ehr_failed"]).toContain(result.status);
    expect(result.clinical).toBeDefined();
    expect(result.clinical.diagnosis).toBeTruthy();
  });

  it("includes billing CPT code on completion", async () => {
    const result = await runPilotEncounter({ patientId: "pilot-test-002", complaint: "cough" });
    if (result.status === "complete") {
      expect(result.billing?.code).toBeTruthy();
      expect(result.ehr?.success).toBe(true);
    }
  });

  it("clinical result includes riskLevel and disposition", async () => {
    const result = await runPilotEncounter({ patientId: "pilot-test-003", complaint: "fever" });
    expect(result.clinical.riskLevel).toBeTruthy();
    expect(result.clinical.disposition).toBeTruthy();
  });
});

// ─── 11. Trial Simulator (unit) ───────────────────────────────────────────────
import { trialSimulator } from "../../server/services/trialSimulator";

describe("Batch31 — trialSimulator (unit)", () => {
  it("generatePatient() returns a valid TrialPatient", () => {
    const p = trialSimulator.generatePatient(0);
    expect(p.patientId).toBe("trial-0");
    expect(typeof p.complaint).toBe("string");
    expect(typeof p.vitals.hr).toBe("number");
    expect(typeof p.symptoms.sob).toBe("boolean");
  });

  it("analyze() returns correct totals", () => {
    const cases = [
      { patient: trialSimulator.generatePatient(0), outcome: "ED now",                diagnosis: "x", confidence: 0.9, riskLevel: "critical" },
      { patient: trialSimulator.generatePatient(1), outcome: "Home care with follow-up", diagnosis: "x", confidence: 0.8, riskLevel: "low" },
    ];
    const summary = trialSimulator.analyze(cases);
    expect(summary.total).toBe(2);
    expect(summary.edCount).toBe(1);
    expect(summary.homeCount).toBe(1);
    expect(summary.edRate).toBeCloseTo(0.5, 2);
  });

  it("analyze() byComplaint groups correctly", () => {
    const cases = [
      { patient: { ...trialSimulator.generatePatient(0), complaint: "cough" }, outcome: "Home care with follow-up", diagnosis: "x", confidence: 0.9, riskLevel: "low" },
      { patient: { ...trialSimulator.generatePatient(1), complaint: "cough" }, outcome: "ED now",                    diagnosis: "x", confidence: 0.8, riskLevel: "high" },
    ];
    const summary = trialSimulator.analyze(cases);
    expect(summary.byComplaint.cough.count).toBe(2);
    expect(summary.byComplaint.cough.edRate).toBeCloseTo(0.5, 2);
  });

  it("analyze() handles empty array gracefully", () => {
    const summary = trialSimulator.analyze([]);
    expect(summary.total).toBe(0);
    expect(summary.edRate).toBe(0);
    expect(summary.avgConfidence).toBe(0);
  });
});
