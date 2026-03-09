import type { SyntheticCase } from "./syntheticCaseGenerator";
import { runGenericComplaintV1 } from "../../engines/genericComplaintEngineV1";
import type { CaseState } from "../../../shared/agentTypes";

export interface EngineRunResult {
  caseId: string;
  complaintId: string;
  disposition?: string;
  expectedDisposition?: string;
  confidence?: string;
  topDiagnosis?: string;
  redFlags?: string[];
  diagnosisScores?: Record<string, number>;
  durationMs: number;
  error?: string;
}

function buildCaseState(sc: SyntheticCase): CaseState {
  const age = typeof sc.answers.Q_AGE === "number" ? sc.answers.Q_AGE : 35;
  return {
    caseId: sc.caseId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    chiefComplaint: sc.complaintId,
    demographics: { age, sex: "other" },
    answers: sc.answers as Record<string, string | number | boolean | null>,
    scores: {},
    activeClusters: [],
    diagnosisClusterIds: [],
    dispositionReasonCodes: [],
    candidateMeds: [],
    candidateDiagnoses: [],
    ruleTrace: [],
    scoringSystems: [],
    redFlags: [],
    requiredQuestionIdsMissing: [],
    recommendedActions: [],
    modifierAnswers: {},
  } as CaseState;
}

export async function runEngineOnCases(cases: SyntheticCase[]): Promise<EngineRunResult[]> {
  const results: EngineRunResult[] = [];
  const originalHarness = process.env.HARNESS_MODE;
  process.env.HARNESS_MODE = "true";

  for (const c of cases) {
    const start = Date.now();
    try {
      const state = buildCaseState(c);
      const graphResult = await runGenericComplaintV1(state, c.complaintId);

      const finalState = graphResult.state;
      const disposition = finalState.disposition || "UNKNOWN";
      const confidence = (finalState as any).caseConfidence || "UNKNOWN";

      const topDx = (finalState as any).likelyDx?.[0]?.label
        || finalState.candidateDiagnoses?.[0]?.diagnosisName
        || finalState.activeClusters?.[0]
        || "";

      const diagnosisScores: Record<string, number> = {};
      if ((finalState as any).clusterScores) {
        Object.assign(diagnosisScores, (finalState as any).clusterScores);
      }

      results.push({
        caseId: c.caseId,
        complaintId: c.complaintId,
        disposition,
        expectedDisposition: c.expectedDisposition,
        confidence,
        topDiagnosis: topDx,
        redFlags: finalState.redFlags || [],
        diagnosisScores,
        durationMs: Date.now() - start,
      });
    } catch (err: any) {
      results.push({
        caseId: c.caseId,
        complaintId: c.complaintId,
        expectedDisposition: c.expectedDisposition,
        durationMs: Date.now() - start,
        error: err?.message || "Unknown engine error",
      });
    }
  }

  if (originalHarness === undefined) {
    delete process.env.HARNESS_MODE;
  } else {
    process.env.HARNESS_MODE = originalHarness;
  }

  return results;
}
