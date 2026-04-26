import { runAgentFleet, type AgentTask, type AgentFleetResult } from "./agentFleetOrchestrator";
import type { PatientVitals } from "./brainOrchestrator";

export type RiskLevel = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

export interface DeterministicRiskLike {
  score: number;
  level: RiskLevel | string;
  flags: string[];
}

export interface ClinicalDecisionBridgeResult {
  mode: "RULE_ONLY" | "RULE_PLUS_FLEET" | "RULE_PLUS_FLEET_FALLBACK";
  finalRisk: RiskLevel;
  deterministicRisk: DeterministicRiskLike;
  fleet?: AgentFleetResult;
  requiresPhysicianReview: boolean;
  recommendation: string;
  basis: {
    intendedUse: string;
    deterministicSignals: string[];
    patientSpecificInputsUsed: string[];
    knownUnknowns: string[];
    modelNames: string[];
    downgradeBlocked: boolean;
    independentReview: string;
  };
  error?: string;
}

const RISK_RANK: Record<RiskLevel, number> = { LOW: 0, MODERATE: 1, HIGH: 2, CRITICAL: 3 };

function normalizeRisk(level: unknown): RiskLevel {
  const up = String(level ?? "LOW").toUpperCase();
  if (up === "CRITICAL" || up === "HIGH" || up === "MODERATE" || up === "LOW") return up;
  return "LOW";
}

function highestRisk(a: unknown, b: unknown): RiskLevel {
  const ra = normalizeRisk(a);
  const rb = normalizeRisk(b);
  return RISK_RANK[rb] > RISK_RANK[ra] ? rb : ra;
}

function needsFleet(vitals: PatientVitals, risk: DeterministicRiskLike): boolean {
  if (process.env.AURALYN_DISABLE_LLM_FLEET === "true") return false;
  const level = normalizeRisk(risk.level);
  if (level === "HIGH" || level === "CRITICAL") return true;
  if (risk.score >= 0.45) return true;
  if ((risk.flags?.length ?? 0) >= 2) return true;
  if (typeof vitals.complaint === "string" && vitals.complaint.trim().length > 0 && level !== "LOW") return true;
  return false;
}

function redactedClinicalInput(vitals: PatientVitals, risk: DeterministicRiskLike) {
  return {
    complaint: vitals.complaint ?? "not provided",
    vitals: {
      hr: vitals.hr,
      spo2: vitals.spo2,
      tempF: vitals.temp,
      sbp: vitals.sbp,
      dbp: vitals.dbp,
      rr: vitals.rr,
    },
    deterministicRisk: {
      score: risk.score,
      level: normalizeRisk(risk.level),
      flags: risk.flags ?? [],
    },
    missingContext: [
      "age not provided",
      "sex assigned at birth not provided",
      "pregnancy status not provided",
      "medication list not provided",
      "allergies not provided",
      "past medical history not provided",
      "physical exam not provided",
    ],
    instruction: "Return physician-reviewable decision support only. Do not present as an autonomous diagnosis or final disposition.",
  };
}

function buildFleetTasks(vitals: PatientVitals, risk: DeterministicRiskLike): AgentTask[] {
  const model = process.env.AURALYN_FLEET_MODEL || "gpt-4o";
  const input = redactedClinicalInput(vitals, risk);
  return [
    { id: "ed-triage", type: "triage", model, role: "emergency medicine triage physician", input },
    { id: "icu-severity", type: "risk_score", model, role: "ICU intensivist assessing deterioration risk", input },
    { id: "safe-disposition", type: "disposition", model, role: "clinical safety reviewer focused on cannot-miss diagnoses and safe discharge blockers", input },
  ];
}

function reviewBasis(vitals: PatientVitals, risk: DeterministicRiskLike, models: string[], downgradeBlocked = false) {
  return {
    intendedUse: "Physician-facing clinical decision support for triage review; not an autonomous diagnosis or treatment order.",
    deterministicSignals: risk.flags?.length ? risk.flags : ["No deterministic red flags triggered"],
    patientSpecificInputsUsed: [
      "heart rate",
      "oxygen saturation",
      "temperature",
      "systolic blood pressure",
      "diastolic blood pressure",
      "respiratory rate",
      ...(vitals.complaint ? ["chief complaint text"] : []),
    ],
    knownUnknowns: [
      "No physical exam findings supplied",
      "No medication/allergy list supplied",
      "No past medical history supplied",
      "No age/sex/pregnancy status supplied unless provided elsewhere",
      "No local bed/capacity signal included in this model call",
    ],
    modelNames: models,
    downgradeBlocked,
    independentReview: "The output includes rules triggered, patient inputs used, and known unknowns so a licensed clinician can independently review the recommendation basis before acting.",
  };
}

export async function runClinicalDecisionBridge(
  vitals: PatientVitals,
  deterministicRisk: DeterministicRiskLike,
  options: { forceFleet?: boolean; saveArtifact?: boolean } = {},
): Promise<ClinicalDecisionBridgeResult> {
  const deterministicLevel = normalizeRisk(deterministicRisk.level);
  const shouldRunFleet = options.forceFleet || needsFleet(vitals, deterministicRisk);

  if (!shouldRunFleet) {
    return {
      mode: "RULE_ONLY",
      finalRisk: deterministicLevel,
      deterministicRisk,
      requiresPhysicianReview: RISK_RANK[deterministicLevel] >= RISK_RANK.HIGH,
      recommendation: RISK_RANK[deterministicLevel] >= RISK_RANK.HIGH ? "Physician review required" : "Continue standard triage workflow",
      basis: reviewBasis(vitals, deterministicRisk, []),
    };
  }

  const tasks = buildFleetTasks(vitals, deterministicRisk);

  try {
    const fleet = await runAgentFleet(tasks, {
      saveArtifactOnComplete: options.saveArtifact === true,
      patientId: vitals.patientId,
    });

    const finalRisk = highestRisk(deterministicLevel, fleet.consensus.riskLevel);
    const downgradeBlocked = RISK_RANK[normalizeRisk(fleet.consensus.riskLevel)] < RISK_RANK[deterministicLevel];
    const lowAgreement = fleet.consensus.agreementRate < 0.67;

    return {
      mode: "RULE_PLUS_FLEET",
      finalRisk,
      deterministicRisk,
      fleet,
      requiresPhysicianReview: RISK_RANK[finalRisk] >= RISK_RANK.HIGH || lowAgreement,
      recommendation: lowAgreement
        ? "Physician review required due to low agent agreement"
        : fleet.consensus.recommendation || "Physician review recommended",
      basis: reviewBasis(vitals, deterministicRisk, tasks.map(t => t.model), downgradeBlocked),
    };
  } catch (err: any) {
    return {
      mode: "RULE_PLUS_FLEET_FALLBACK",
      finalRisk: deterministicLevel,
      deterministicRisk,
      requiresPhysicianReview: true,
      recommendation: "Physician review required; LLM fleet unavailable or failed",
      basis: reviewBasis(vitals, deterministicRisk, tasks.map(t => t.model)),
      error: err?.message || "Unknown fleet error",
    };
  }
}
