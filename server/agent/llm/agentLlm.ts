import OpenAI from "openai";
import type { AgentRunConfig, CaseState } from "../../../shared/agentTypes";
import { buildLlmCallLogEntry, getLlmCallLog } from "../../traces/llmCallLog";
import {
  checkRunBudget,
  recordLlmCall,
  isCircuitOpen,
  recordCircuitError,
  recordCircuitSuccess,
} from "./llmGuardrails";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const AGENT_MODEL = "gpt-5-mini";

export interface LlmCallContext {
  runId?: string;
  caseId?: string;
  channel?: "whatsapp" | "web" | "test" | "api";
  stepNo?: number;
}

export class LlmGuardrailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmGuardrailError";
  }
}

function enforceGuardrails(ctx: LlmCallContext): void {
  if (isCircuitOpen()) {
    throw new LlmGuardrailError("LLM circuit breaker is open — automatic fallback active");
  }

  if (ctx.runId) {
    const check = checkRunBudget(ctx.runId);
    if (!check.allowed) {
      throw new LlmGuardrailError(check.reason!);
    }
  }
}

export async function reframeQuestion(
  questionId: string,
  originalPrompt: string,
  toneProfile: string,
  state: CaseState,
  cfg: AgentRunConfig,
  ctx: LlmCallContext
): Promise<{ reframedText: string; model: string; tokensIn?: number; tokensOut?: number }> {
  enforceGuardrails(ctx);

  const systemPrompt = `You are a medical intake assistant. Your task is to rephrase clinical questions for patients in a warm, clear way.
Tone profile: ${toneProfile}
- empathetic: gentle, caring, acknowledging discomfort
- concise: brief, clear, no extra words
- pediatric: simple language for parents/children
- elderly: respectful, clear, larger concept explanations

Rules:
- Keep medical accuracy
- Do NOT add medical advice
- Output ONLY the rephrased question text, nothing else
- Keep it to 1-2 sentences max`;

  const userPrompt = `Original clinical question ID: ${questionId}
Original prompt: "${originalPrompt}"
Patient chief complaint: ${state.chiefComplaint}
Patient age: ${state.demographics?.age ?? "unknown"}

Rephrase this question for the patient using the "${toneProfile}" tone.`;

  const startMs = Date.now();

  const llmConfig = cfg.llm ?? { enabled: true };
  const temperature = llmConfig.temperature ?? 0;
  const seed = llmConfig.seed;
  const model = llmConfig.model ?? AGENT_MODEL;

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature,
    ...(seed !== undefined ? { seed } : {}),
    max_completion_tokens: 256,
  });

  const latencyMs = Date.now() - startMs;
  const outputText = response.choices[0]?.message?.content?.trim() ?? originalPrompt;
  const tokensIn = response.usage?.prompt_tokens;
  const tokensOut = response.usage?.completion_tokens;

  recordCircuitSuccess();
  if (ctx.runId) {
    recordLlmCall(ctx.runId, tokensIn ?? 0, tokensOut ?? 0);
  }

  const logEntry = buildLlmCallLogEntry({
    purpose: "reframe_question",
    model,
    inputText: userPrompt,
    outputText,
    latencyMs,
    runId: ctx.runId,
    caseId: ctx.caseId,
    channel: ctx.channel ?? "api",
    temperature,
    seed,
    promptTemplateId: "reframe_question",
    promptTemplateVersion: "v1",
    tokensIn,
    tokensOut,
    linkedActionStep: ctx.stepNo,
    metadata: { questionId, toneProfile },
  });

  await getLlmCallLog().log(logEntry).catch(err =>
    console.error("[AgentLLM] Failed to log reframe call:", err)
  );

  return { reframedText: outputText, model, tokensIn, tokensOut };
}

export async function draftSummary(
  style: "clinician" | "patient",
  state: CaseState,
  cfg: AgentRunConfig,
  ctx: LlmCallContext
): Promise<{ summaryText: string; model: string; tokensIn?: number; tokensOut?: number }> {
  enforceGuardrails(ctx);

  const answersText = Object.entries(state.answers)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  const scoresText = Object.entries(state.scores)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ") || "none";

  const systemPrompt = style === "clinician"
    ? `You are a clinical documentation assistant. Generate a concise clinical summary suitable for a physician review.
Include: chief complaint, key positive/negative findings, scores, red flags, disposition, and recommended actions.
Use standard medical abbreviations. Be factual and concise. No patient-facing language.`
    : `You are a patient communication assistant. Generate a clear, easy-to-understand summary for the patient.
Include: what was found, what happens next, and any safety-net advice.
Use simple language. Be reassuring but honest. Avoid medical jargon.`;

  const userPrompt = `Chief Complaint: ${state.chiefComplaint}
Demographics: age ${state.demographics?.age ?? "unknown"}, sex ${state.demographics?.sex ?? "unknown"}
Answers:
${answersText}
Scores: ${scoresText}
Red Flags: ${state.redFlags.length > 0 ? state.redFlags.join(", ") : "none"}
Disposition: ${state.disposition ?? "not set"}
Reason Codes: ${state.dispositionReasonCodes.join(", ") || "none"}
Recommended Actions: ${(state.recommendedActions ?? []).map(a => `${a.type} (${a.priority})`).join(", ") || "none"}
Diagnoses: ${state.diagnosisClusterIds.join(", ") || "none"}

Generate a ${style === "clinician" ? "clinical" : "patient-friendly"} summary.`;

  const startMs = Date.now();

  const llmConfig = cfg.llm ?? { enabled: true };
  const temperature = llmConfig.temperature ?? 0;
  const seed = llmConfig.seed;
  const model = llmConfig.model ?? AGENT_MODEL;

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature,
    ...(seed !== undefined ? { seed } : {}),
    max_completion_tokens: 512,
  });

  const latencyMs = Date.now() - startMs;
  const outputText = response.choices[0]?.message?.content?.trim() ?? "[summary generation failed]";
  const tokensIn = response.usage?.prompt_tokens;
  const tokensOut = response.usage?.completion_tokens;

  recordCircuitSuccess();
  if (ctx.runId) {
    recordLlmCall(ctx.runId, tokensIn ?? 0, tokensOut ?? 0);
  }

  const logEntry = buildLlmCallLogEntry({
    purpose: "draft_summary",
    model,
    inputText: userPrompt,
    outputText,
    latencyMs,
    runId: ctx.runId,
    caseId: ctx.caseId,
    channel: ctx.channel ?? "api",
    temperature,
    seed,
    promptTemplateId: `draft_summary_${style}`,
    promptTemplateVersion: "v1",
    tokensIn,
    tokensOut,
    linkedActionStep: ctx.stepNo,
    metadata: { style },
  });

  await getLlmCallLog().log(logEntry).catch(err =>
    console.error("[AgentLLM] Failed to log summary call:", err)
  );

  return { summaryText: outputText, model, tokensIn, tokensOut };
}
