import { calculateCentorScore } from "../services/clinical/centorEngine";
import { calculateStrepProbability } from "../services/clinical/bayesianStrepEngine";
import { runClinicalDecision } from "../services/clinical/clinicalDecisionEngine";
import { applyDispositionGuardrail } from "../engines/dispositionGuardrail";

interface ToolCall {
  name:  string;
  input: Record<string, unknown>;
  id?:   string;
}

type ToolDispatchResult = Record<string, unknown> | string;

async function handleAskQuestion(input: Record<string, unknown>): Promise<ToolDispatchResult> {
  return {
    question_id: input.question_id,
    text:        `[KB question ${input.question_id} — text would be fetched from KB in production]`,
    type:        "boolean",
  };
}

async function handleRecordAnswer(input: Record<string, unknown>): Promise<ToolDispatchResult> {
  return {
    recorded:    true,
    question_id: input.question_id,
    answer:      input.answer,
  };
}

async function handleCheckRedFlags(input: Record<string, unknown>): Promise<ToolDispatchResult> {
  const features = (input.features as Record<string, boolean>) ?? {};
  const RED_FLAGS = ["stridor", "drooling", "altered_mental_status", "trismus", "neck_stiffness"];
  const triggered = RED_FLAGS.filter((f) => features[f]);
  return {
    red_flags_present: triggered.length > 0,
    triggered,
  };
}

async function handleCalculateScore(input: Record<string, unknown>): Promise<ToolDispatchResult> {
  const scoreType = (input.score_type as string) ?? "centor";
  const features  = (input.features as any) ?? {};

  if (scoreType === "centor") {
    const score = calculateCentorScore({
      fever:                       Boolean(features.fever),
      tonsillarExudate:            Boolean(features.exudate || features.tonsillarExudate),
      tenderAnteriorCervicalNodes: Boolean(features.nodes || features.tenderAnteriorCervicalNodes),
      absenceOfCough:              Boolean(features.absenceOfCough),
      age:                         Number(features.age ?? 30),
    });
    return { score_type: "centor", score };
  }

  if (scoreType === "bayesian_strep") {
    const prob = calculateStrepProbability({
      fever:   Boolean(features.fever),
      exudate: Boolean(features.exudate || features.tonsillarExudate),
      nodes:   Boolean(features.nodes),
      cough:   Boolean(features.cough),
    });
    return { score_type: "bayesian_strep", probability: prob };
  }

  if (scoreType === "full_clinical") {
    return runClinicalDecision({
      fever:                       Boolean(features.fever),
      tonsillarExudate:            Boolean(features.exudate || features.tonsillarExudate),
      tenderAnteriorCervicalNodes: Boolean(features.nodes),
      absenceOfCough:              Boolean(features.absenceOfCough),
      age:                         Number(features.age ?? 30),
    }) as unknown as Record<string, unknown>;
  }

  return { error: `Unknown score_type: ${scoreType}` };
}

async function handleGenerateDisposition(input: Record<string, unknown>): Promise<ToolDispatchResult> {
  const result = applyDispositionGuardrail({
    diagnosis:      (input.diagnosis as string) ?? "unknown",
    riskScore:      Number(input.risk_score ?? 0.3),
    redFlags:       (input.triggered_red_flags as string[]) ?? [],
    llmDisposition: (input.preferred_disposition as string) ?? "follow_up_primary_care",
    centorScore:    input.centor_score as number | undefined,
    probability:    input.probability  as number | undefined,
  });
  return result as unknown as Record<string, unknown>;
}

async function handleSummarizeVisit(_input: Record<string, unknown>): Promise<ToolDispatchResult> {
  return {
    summary: "Visit summary generated",
    timestamp: new Date().toISOString(),
  };
}

export async function dispatchTools(toolCall: ToolCall): Promise<ToolDispatchResult> {
  const { name, input } = toolCall;

  switch (name) {
    case "ask_question":        return handleAskQuestion(input);
    case "record_answer":       return handleRecordAnswer(input);
    case "check_red_flags":     return handleCheckRedFlags(input);
    case "calculate_score":     return handleCalculateScore(input);
    case "generate_disposition": return handleGenerateDisposition(input);
    case "summarize_visit":     return handleSummarizeVisit(input);

    default:
      return { error: `Unknown tool: ${name}`, tool: name };
  }
}

export async function dispatchParallel(
  toolCalls: ToolCall[]
): Promise<ToolDispatchResult[]> {
  return Promise.all(toolCalls.map((tc) => dispatchTools(tc)));
}
