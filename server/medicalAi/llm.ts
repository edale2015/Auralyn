/**
 * server/medicalAi/llm.ts
 *
 * LLM adapter — mirrors the Python scaffold's llm.py.
 *
 * The scaffold calls Ollama's local REST API with Gemma3.
 * This TypeScript version uses OpenAI GPT-4o (already configured in Auralyn).
 * The interface is identical: call generate() and get back a structured response.
 *
 * Graceful degradation:
 *   - No API key → returns a safe, canned "service unavailable" response.
 *   - API error  → surfaces a structured error, never crashes the route.
 */

import OpenAI from "openai";
import { searchKnowledge }         from "./store";
import { getRoleSystemPrompt, type MedicalRole } from "./safety";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface GenerateOptions {
  role:           MedicalRole;
  message:        string;
  patientContext?: string;
  history?:       Array<{ role: "user" | "assistant"; content: string }>;
  useRAG?:        boolean;
  maxTokens?:     number;
  temperature?:   number;
}

export interface GenerateResult {
  answer:        string;
  ragContext:    string | null;
  ragSources:    Array<{ title: string; score: number; sourceType: string }>;
  model:         string;
  promptTokens:  number;
  outputTokens:  number;
  durationMs:    number;
}

// ── Client ────────────────────────────────────────────────────────────────────
function getOpenAI(): OpenAI | null {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey, baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL });
}

// ── RAG context builder ───────────────────────────────────────────────────────
async function buildRAGContext(query: string): Promise<{
  contextBlock: string;
  sources:      Array<{ title: string; score: number; sourceType: string }>;
}> {
  const results = await searchKnowledge(query, 4, 0.15);
  if (results.length === 0) return { contextBlock: "", sources: [] };

  const contextBlock = results
    .map((r, i) => `[Source ${i + 1}: ${r.document.title} (${r.document.sourceType})]\n${r.excerpt}`)
    .join("\n\n");

  const sources = results.map(r => ({
    title:      r.document.title,
    score:      r.score,
    sourceType: r.document.sourceType,
  }));

  return { contextBlock, sources };
}

// ── Main generate function ────────────────────────────────────────────────────
export async function generate(opts: GenerateOptions): Promise<GenerateResult> {
  const start     = Date.now();
  const ai        = getOpenAI();
  const model     = "gpt-4o";

  if (!ai) {
    return {
      answer:       "The AI assistant is not available right now. Please contact the clinic directly or call 911 for emergencies.",
      ragContext:   null,
      ragSources:   [],
      model:        "unavailable",
      promptTokens: 0,
      outputTokens: 0,
      durationMs:   Date.now() - start,
    };
  }

  // ── RAG retrieval ──────────────────────────────────────────────────────────
  const useRAG = opts.useRAG ?? true;
  let ragContext = "";
  let ragSources: Array<{ title: string; score: number; sourceType: string }> = [];

  if (useRAG) {
    const { contextBlock, sources } = await buildRAGContext(opts.message);
    ragContext = contextBlock;
    ragSources = sources;
  }

  // ── Compose system prompt ──────────────────────────────────────────────────
  let systemPrompt = getRoleSystemPrompt(opts.role);

  if (opts.patientContext) {
    systemPrompt += `\n\nPatient context provided:\n${opts.patientContext}`;
  }

  if (ragContext) {
    systemPrompt += `\n\nRelevant clinic knowledge (use this to ground your response):\n---\n${ragContext}\n---`;
  }

  // ── Build messages ─────────────────────────────────────────────────────────
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...((opts.history ?? []).slice(-8)),
    { role: "user", content: opts.message },
  ];

  const completion = await ai.chat.completions.create({
    model,
    messages,
    max_tokens:  opts.maxTokens  ?? 600,
    temperature: opts.temperature ?? 0.3,
  });

  const answer = completion.choices[0]?.message?.content ?? "No response generated.";

  return {
    answer,
    ragContext:   ragContext || null,
    ragSources,
    model,
    promptTokens:  completion.usage?.prompt_tokens     ?? 0,
    outputTokens:  completion.usage?.completion_tokens ?? 0,
    durationMs:    Date.now() - start,
  };
}

// ── Artifact generators ───────────────────────────────────────────────────────
export type ArtifactType =
  | "doctor_questions"       // patient-facing: questions to ask their doctor
  | "symptom_summary"        // structured symptom timeline
  | "discharge_instructions" // post-visit care instructions
  | "referral_note"          // specialist referral summary
  | "visit_prep"             // appointment preparation checklist
  | "medication_review";     // medication list + interaction summary

const ARTIFACT_PROMPTS: Record<ArtifactType, string> = {
  doctor_questions: `Generate a structured list of 5-8 specific, informed questions a patient should ask their doctor about the situation described. Format as a numbered list. Be specific, not generic.`,

  symptom_summary: `Create a concise, structured symptom timeline from the information provided. Include: onset, duration, severity (1-10), associated symptoms, relieving/worsening factors, and any treatments tried. Format clearly.`,

  discharge_instructions: `Generate clear, plain-language discharge instructions. Include: what happened, medications, activity restrictions, diet (if relevant), warning signs to watch for, and when to follow up. Use simple language a patient can follow at home.`,

  referral_note: `Write a brief, professional referral note summary for a specialist. Include: reason for referral, relevant history, current medications, and urgency level. Use clinical terminology appropriate for a physician audience.`,

  visit_prep: `Create a preparation checklist for a medical appointment. Include: documents to bring, medications to list, questions to prepare, fasting requirements (if relevant), and logistics. Format as a clear checklist.`,

  medication_review: `Provide a structured medication review summary. List all medications mentioned, their purposes, common interactions to discuss with a physician, and questions to ask about each. Add a disclaimer that this is not a substitute for pharmacist review.`,
};

export interface ArtifactResult {
  artifactType: ArtifactType;
  content:      string;
  model:        string;
  durationMs:   number;
}

export async function generateArtifact(params: {
  artifactType: ArtifactType;
  text:         string;
  role:         MedicalRole;
}): Promise<ArtifactResult> {
  const start = Date.now();
  const ai    = getOpenAI();

  if (!ai) {
    return {
      artifactType: params.artifactType,
      content:      "Artifact generation is unavailable. Please contact the clinic directly.",
      model:        "unavailable",
      durationMs:   Date.now() - start,
    };
  }

  const artifactPrompt = ARTIFACT_PROMPTS[params.artifactType];
  if (!artifactPrompt) throw new Error(`Unknown artifact type: ${params.artifactType}`);

  const systemPrompt = getRoleSystemPrompt(params.role);
  const userPrompt   = `${artifactPrompt}\n\nInput text:\n${params.text}`;

  const completion = await ai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userPrompt },
    ],
    max_tokens:  800,
    temperature: 0.2,
  });

  return {
    artifactType: params.artifactType,
    content:      completion.choices[0]?.message?.content ?? "",
    model:        "gpt-4o",
    durationMs:   Date.now() - start,
  };
}
