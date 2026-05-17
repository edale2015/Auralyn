/**
 * T021 — Integration: chest_pain full encounter
 *
 * Runs a realistic chest-pain encounter through all 13 pipeline steps and
 * asserts the artifact publication matrix is satisfied:
 *   ≥ 15 artifacts published
 *   ≥ 4 distinct artifact types
 *   Every artifact has a non-empty provenance.source
 *   0 bus contract violations
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ComplaintConfig } from "../../server/services/complaintConfigLoader";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../../server/services/complaintConfigLoader", () => ({
  loadComplaintConfig: vi.fn(),
}));
vi.mock("../../server/clinical/pipelineAuditWriter", () => ({
  writePipelineAudit: vi.fn().mockResolvedValue({ auditId: "test-audit-cp-001", staleWarning: undefined }),
  hashConfigVersion:  vi.fn().mockReturnValue("v-test-1"),
}));
vi.mock("../../server/retrieval/kbQueryLayer", () => ({
  queryKBCached:    vi.fn().mockResolvedValue({
    matchedRules: [
      { ruleId: "RULE_KB_001", explanation: "ACS guideline: immediate ECG if SpO2 < 90" },
      { ruleId: "RULE_KB_002", explanation: "Troponin indicated for chest pain + diaphoresis" },
    ],
    rulesFired: ["RULE_KB_001", "RULE_KB_002"],
    kbPromptBlock: "KB: ACS protocol active",
  }),
  buildKBPromptBlock: vi.fn().mockReturnValue("KB: ACS protocol active"),
}));
vi.mock("../../server/routes/contextInspector.routes", () => ({
  storeEncounterContext:  vi.fn(),
  appendCompactionEvent:  vi.fn(),
}));
vi.mock("../../server/context/memoryWriters", () => ({
  writeSupervisorHardConstraint:      vi.fn().mockResolvedValue({ accepted: true, key: "test" }),
  writeSupervisorDispositionOverride: vi.fn().mockResolvedValue({ accepted: true, key: "test" }),
  fetchLearnedContext:                vi.fn().mockResolvedValue([]),
  getMemoryStore:                     vi.fn(),
}));

import { loadComplaintConfig } from "../../server/services/complaintConfigLoader";

const MOCK_CONFIG: ComplaintConfig = {
  registry: { ccId: "chest_pain", version: "1", engineType: "WORLD_B" } as any,
  coreQuestions: [
    { qId: "pain_character",   questionText: "What does the pain feel like?", askIf: null as any },
    { qId: "pain_onset",       questionText: "When did the pain start?",       askIf: null as any },
    { qId: "diaphoresis",      questionText: "Any sweating?",                   askIf: null as any },
    { qId: "radiation",        questionText: "Does pain radiate to arm/jaw?",   askIf: null as any },
  ],
  redFlagRules: [
    {
      rfId: "RF_HYPOXIA",
      label: "SpO2 < 90%",
      triggerExpr: "spo2 < 90",
      severity: "HARD",
      action: "ER_SEND",
      rationale: "Critical hypoxia",
    } as any,
    {
      rfId: "RF_CRUSHING_PAIN",
      label: "Crushing chest pain with diaphoresis",
      triggerExpr: "pain_character == crushing AND diaphoresis == true",
      severity: "SOFT",
      action: "ESCALATE",
      rationale: "High-risk ACS pattern",
    } as any,
  ],
  dxCandidates: [
    { CC_ID: "chest_pain", DX_ID: "DX_ACS",     DX_LABEL: "Acute Coronary Syndrome",  BASE_SCORE: 85, RANK: 1,  BEST_CLUSTER_ID: "cardiac" } as any,
    { CC_ID: "chest_pain", DX_ID: "DX_PE",      DX_LABEL: "Pulmonary Embolism",        BASE_SCORE: 45, RANK: 2,  BEST_CLUSTER_ID: "pulm"    } as any,
    { CC_ID: "chest_pain", DX_ID: "DX_GERD",    DX_LABEL: "GERD / Esophageal",         BASE_SCORE: 30, RANK: 3,  BEST_CLUSTER_ID: null      } as any,
    { CC_ID: "chest_pain", DX_ID: "DX_MSK",     DX_LABEL: "Musculoskeletal",            BASE_SCORE: 20, RANK: 4,  BEST_CLUSTER_ID: null      } as any,
    { CC_ID: "chest_pain", DX_ID: "DX_ANXIETY", DX_LABEL: "Panic / Anxiety",            BASE_SCORE: 2,  RANK: 5,  BEST_CLUSTER_ID: null      } as any,
  ],
  dispositionRules: [
    { dispRuleId: "DISP_ER",   dispositionLevel: "ER_SEND",  whenExpr: "spo2 < 90"    } as any,
    { dispRuleId: "DISP_UC",   dispositionLevel: "urgent_consult", whenExpr: "pain_character == crushing" } as any,
    { dispRuleId: "DISP_HOME", dispositionLevel: "home_with_rx", whenExpr: "true"      } as any,
  ],
  clusterScoringRules: [
    { ruleId: "CS_001", clusterId: "cardiac", whenExpr: "pain_character == crushing", points: 3 } as any,
    { ruleId: "CS_002", clusterId: "cardiac", whenExpr: "radiation == true",           points: 2 } as any,
    { ruleId: "CS_003", clusterId: "pulm",    whenExpr: "spo2 < 92",                   points: 2 } as any,
  ],
  modifiers: [],
  globalMedicationsMaster: [
    { MED_GROUP: "aspirin_antiplatelet", WHEN: "true" } as any,
  ],
  medConditionIntelligenceRules: [],
  urgentCareSpotInterventions: [
    { INTERVENTION: "12-lead ECG", WHEN: "true" } as any,
    { INTERVENTION: "Troponin I",  WHEN: "true" } as any,
  ],
  outputTemplates: [
    { DISPOSITION_LEVEL: "ER_SEND", TEMPLATE_TEXT: "Transfer to ED for {complaint}. Top dx: {top_dx}. Meds: {med_groups}. Workup: {workup}." } as any,
    { DISPOSITION_LEVEL: "home_with_rx", TEMPLATE_TEXT: "Home with treatment for {complaint}." } as any,
  ],
} as any;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("chest_pain_full_encounter (T021)", () => {
  beforeEach(() => {
    vi.mocked(loadComplaintConfig).mockResolvedValue(MOCK_CONFIG);
  });

  it("produces ≥ 15 artifacts across the full 13-step pipeline", async () => {
    const { runClinicalPipeline } = await import("../../server/clinical/unifiedClinicalPipeline");

    const result = await runClinicalPipeline({
      complaintId:  "chest_pain",
      patientInput: {
        symptoms:    ["chest_pain", "shortness_of_breath"],
        answers:     { pain_character: "crushing", pain_onset: "sudden", diaphoresis: true, radiation: true },
        vitals:      { spo2: 89, hr: 110, sbp: 145, dbp: 92 },
        age:         58,
        sex:         "M",
        allergies:   ["penicillin"],
        pmh:         ["hypertension", "diabetes"],
        currentMeds: ["metformin", "lisinopril"],
      },
      physicianId: "physician-test-001",
      sessionId:   `test-session-cp-${Date.now()}`,
    });

    const ctx = result.encounterContext!;
    const artifacts = ctx.artifacts;

    // ≥ 15 artifacts
    expect(artifacts.length).toBeGreaterThanOrEqual(15);

    // ≥ 4 distinct types
    const distinctTypes = new Set(artifacts.map(a => a.type));
    expect(distinctTypes.size).toBeGreaterThanOrEqual(4);

    // Every artifact has non-empty provenance.source
    for (const a of artifacts) {
      expect(
        a.provenance?.source,
        `Artifact ${a.id} (${a.type}) has empty provenance.source`,
      ).toBeTruthy();
    }

    // 13 steps completed
    expect(result.steps.length).toBe(13);
  });

  it("produces 0 bus contract violations", async () => {
    // ContractViolation errors are thrown — if this test completes, count = 0
    const { runClinicalPipeline } = await import("../../server/clinical/unifiedClinicalPipeline");

    await expect(
      runClinicalPipeline({
        complaintId:  "chest_pain",
        patientInput: {
          symptoms: ["chest_pain"],
          answers:  { pain_character: "crushing", diaphoresis: true },
          vitals:   { spo2: 89 },
          age: 45, sex: "M",
        },
        physicianId: "physician-test-001",
        sessionId:   `test-session-cv-${Date.now()}`,
      }),
    ).resolves.toBeDefined();
  });

  it("red flags present in immutables when SpO2 < 90", async () => {
    const { runClinicalPipeline } = await import("../../server/clinical/unifiedClinicalPipeline");

    const result = await runClinicalPipeline({
      complaintId:  "chest_pain",
      patientInput: {
        symptoms: ["chest_pain"],
        answers:  {},
        vitals:   { spo2: 89, hr: 105 },
        age: 60, sex: "F",
      },
      physicianId: "physician-test-001",
      sessionId:   `test-session-rf-${Date.now()}`,
    });

    expect(result.hardStopFired).toBe(true);
    expect(result.redFlagsHit).toContain("RF_HYPOXIA");

    const immutableFlags = result.encounterContext!.immutables.redFlagsIdentified;
    expect(immutableFlags.some(f => f.id === "RF_HYPOXIA")).toBe(true);
  });

  it("supervisor gate fires ADD_CONSTRAINT when hard red flag + non-ER disposition", async () => {
    // Temporarily mutate config so a hard red flag fires but default disposition is not ER
    const modifiedConfig = {
      ...MOCK_CONFIG,
      redFlagRules: [
        { rfId: "RF_HYPOXIA", label: "SpO2 < 90%", triggerExpr: "spo2 < 90", severity: "HARD", action: "ESCALATE", rationale: "Hypoxia" } as any,
      ],
      dispositionRules: [
        { dispRuleId: "DISP_HOME", dispositionLevel: "home_with_rx", whenExpr: "true" } as any,
      ],
    };
    vi.mocked(loadComplaintConfig).mockResolvedValueOnce(modifiedConfig as any);

    const { runClinicalPipeline } = await import("../../server/clinical/unifiedClinicalPipeline");

    const result = await runClinicalPipeline({
      complaintId:  "chest_pain",
      patientInput: {
        symptoms: ["chest_pain"],
        answers:  {},
        vitals:   { spo2: 89 },
        age: 55, sex: "M",
      },
      physicianId: "physician-test-001",
      sessionId:   `test-session-sv-${Date.now()}`,
    });

    // Supervisor should have overridden disposition to ER_SEND
    expect(result.finalDisposition).toBe("ER_SEND");

    const constraints = result.encounterContext!.immutables.hardConstraints;
    expect(constraints.length).toBeGreaterThanOrEqual(1);
    expect(constraints[0]).toMatch(/supervisor gate/i);
  });
});
