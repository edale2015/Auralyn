import { clinicalReasoning, ClinicalFusionInput } from "../orchestrator/clinicalFusion";
import { improveAgent, getAgentPrompt } from "../agents/selfModify";
import { requiresReview, processReviewDecision } from "../physician/reviewLoop";
import { executeClinicalAction } from "../orchestrator/decisionBridge";

const BRAIN_AGENT_ID = "autonomous-brain-v1";

export interface BrainRunInput extends ClinicalFusionInput {
  patientId: string;
}

export interface BrainRunResult {
  status: "autonomous_action" | "physician_review" | "guardrail_blocked";
  reasoning: Awaited<ReturnType<typeof clinicalReasoning>>;
  reviewDecision?: ReturnType<typeof requiresReview>;
  roboticResult?: Awaited<ReturnType<typeof executeClinicalAction>>;
  agentPromptUsed: string;
  cycleCompletedAt: string;
}

export async function runBrain(input: BrainRunInput): Promise<BrainRunResult> {
  const agentPromptUsed = getAgentPrompt(BRAIN_AGENT_ID);

  const reasoning = await clinicalReasoning({
    patientId: input.patientId,
    complaints: input.complaints,
    vitals: input.vitals,
    history: input.history,
    embedding: input.embedding,
  });

  if (!reasoning.guardrailResult.allowed) {
    return {
      status: "guardrail_blocked",
      reasoning,
      agentPromptUsed,
      cycleCompletedAt: new Date().toISOString(),
    };
  }

  const reviewDecision = processReviewDecision({
    caseId: `brain-run-${Date.now()}`,
    patientId: input.patientId,
    riskScore: reasoning.scores.overallRisk === "high" ? 0.85
      : reasoning.scores.overallRisk === "moderate" ? 0.55 : 0.25,
    triage: reasoning.scores.overallRisk === "high" ? "immediate"
      : reasoning.scores.overallRisk === "moderate" ? "urgent" : "routine",
    scores: {
      centor: reasoning.scores.centor?.score,
      curb65: reasoning.scores.curb65?.score,
    },
    complaints: input.complaints,
  });

  if (reviewDecision.requiresReview) {
    return {
      status: "physician_review",
      reasoning,
      reviewDecision,
      agentPromptUsed,
      cycleCompletedAt: new Date().toISOString(),
    };
  }

  const roboticResult = await executeClinicalAction({
    patientId: input.patientId,
    complaints: input.complaints,
    vitalSigns: input.vitals,
  });

  const successRate = roboticResult.guardrailsPassed
    ? (reasoning.scores.primaryScore > 0 ? 0.8 : 0.6)
    : 0.3;

  improveAgent(BRAIN_AGENT_ID, {
    successRate,
    failedActions: roboticResult.guardrailsPassed ? [] : roboticResult.recommendedActions,
    dominantComplaint: input.complaints[0],
    averageRiskScore: roboticResult.riskScore,
  });

  return {
    status: "autonomous_action",
    reasoning,
    reviewDecision,
    roboticResult,
    agentPromptUsed,
    cycleCompletedAt: new Date().toISOString(),
  };
}

export function getBrainAgentConfig() {
  return { agentId: BRAIN_AGENT_ID, prompt: getAgentPrompt(BRAIN_AGENT_ID) };
}
