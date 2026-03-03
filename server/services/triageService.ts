import { CaseTriage, Disposition } from "../models/caseTypes";
import { runGenericComplaintV1 } from "../engines/genericComplaintEngineV1";
import { CaseState } from "../../shared/agentTypes";

function mapDisposition(raw: string): Disposition {
  const normalized = raw.toLowerCase().replace(/[\s_-]+/g, "_");
  if (normalized === "er_send" || normalized === "emerg") return "er_send";
  if (normalized === "urgent_care" || normalized === "urgent") return "urgent_care";
  if (normalized === "pcp" || normalized === "routine" || normalized === "primary_care") return "pcp";
  if (normalized === "self_care" || normalized === "telehealth") return "self_care";
  return "urgent_care";
}

function buildMinimalCaseState(
  complaintSlug: string,
  answers: Record<string, unknown>
): CaseState {
  return {
    routing: { state: "INTAKE_PENDING" },
    system: "",
    normalizedComplaint: complaintSlug,
    answers: answers as Record<string, string | number>,
    scores: {},
    activeClusters: [],
    redFlags: [],
    disposition: "",
    dispositionReasonCodes: [],
    dispositionTemplate: "",
    redFlagGate: { evaluated: false, flagsFound: [], gateResult: "PASS" },
    questionQueue: [],
    requiredQuestionIdsMissing: [],
    clusterScores: {},
    clusterEvidence: {},
    diagnosisCandidates: [],
    caseConfidence: "LOW",
    scoringExplanation: null,
    spotInterventions: [],
    modifiers: {},
    answerSummary: {},
    fhirBundle: null,
    outputTemplate: "",
    outputRendered: "",
    planItems: [],
    events: [],
  } as unknown as CaseState;
}

export async function runTriage(params: {
  complaintSlug: string;
  answers: Record<string, unknown>;
  rulesetVersion: string;
  dxPriorityVersion: string;
}): Promise<CaseTriage> {
  const state = buildMinimalCaseState(params.complaintSlug, params.answers);
  const result = await runGenericComplaintV1(state, params.complaintSlug);

  const updated = result.state;
  const disposition = mapDisposition(updated.disposition || "urgent_care");
  const topCluster = updated.activeClusters?.[0] || "CL_UNSPECIFIED";
  const confidence = updated.caseConfidence || "LOW";
  const explanation = updated.scoringExplanation || {
    topRules: [],
    topSuppressors: [],
    rfTriggered: [],
    tieBreak: "none" as const,
    margin: 0,
    confidence: "LOW" as const,
  };

  return {
    disposition,
    topCluster,
    confidence,
    tieBreak: explanation.tieBreak,
    margin: explanation.margin,
    rfTriggered: updated.redFlags || [],
    explanation,
    engineVersion: {
      rulesetVersion: params.rulesetVersion,
      dxPriorityVersion: params.dxPriorityVersion,
    },
  };
}
