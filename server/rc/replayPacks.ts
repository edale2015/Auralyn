import { randomUUID } from "crypto";
import { getTraceStore, type StoredTrace } from "../traces/traceStore";
import type { CaseState } from "../../shared/agentTypes";

export interface RedactedMessage {
  step: number;
  from: "system" | "patient";
  text: string;
  questionId?: string;
}

export interface ReplayPack {
  id: string;
  sourceRunId: string;
  createdAt: string;
  chiefComplaint: string;
  scenarioId: string | null;
  redactedTranscript: RedactedMessage[];
  caseStateSnapshot: Record<string, unknown>;
  answers: Record<string, unknown>;
  demographics?: Record<string, unknown>;
  modifiers?: Record<string, unknown>;
  rulesetHash: string;
  metadata?: Record<string, unknown>;
}

const PHI_PATTERNS = [
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  /\b\d{3}-\d{2}-\d{4}\b/g,
  /\b\d{1,5}\s+\w+\s+(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct)\b/gi,
  /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi,
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
];

const NAME_PATTERN = /\b(Mr\.|Mrs\.|Ms\.|Dr\.|Miss)\s+[A-Z][a-z]+\b/g;

function redactText(text: string): string {
  let result = text;
  for (const pattern of PHI_PATTERNS) {
    result = result.replace(pattern, "[REDACTED]");
  }
  result = result.replace(NAME_PATTERN, "[REDACTED_NAME]");
  return result;
}

function extractRedactedTranscript(trace: StoredTrace): RedactedMessage[] {
  const messages: RedactedMessage[] = [];

  for (const step of trace.steps) {
    const action = step.action as Record<string, unknown>;
    const outputs = step.outputs as Record<string, unknown>;

    if (action.type === "ASK_QUESTION" || action.type === "REFRAME_QUESTION") {
      const prompt = String(outputs?.reframedText ?? outputs?.prompt ?? action.originalPrompt ?? action.prompt ?? "");
      if (prompt) {
        messages.push({
          step: step.step,
          from: "system",
          text: redactText(prompt),
          questionId: action.questionId as string,
        });
      }

      if (outputs?.answer !== undefined) {
        messages.push({
          step: step.step,
          from: "patient",
          text: redactText(String(outputs.answer)),
          questionId: action.questionId as string,
        });
      }
    }
  }

  return messages;
}

function extractCaseStateSnapshot(trace: StoredTrace): Record<string, unknown> {
  const lastStep = trace.steps[trace.steps.length - 1];
  if (!lastStep) return {};

  return {
    chiefComplaint: trace.chiefComplaint,
    disposition: trace.normalized.disposition,
    scores: trace.normalized.scores,
    redFlags: trace.normalized.redFlags,
    dx: trace.normalized.dx,
    stopReason: trace.stopReason,
    stepCount: trace.steps.length,
    normalized: {
      disposition: trace.normalized.disposition,
      diagnosis: trace.normalized.dx || [],
      scores: trace.normalized.scores || {},
      redFlags: trace.normalized.redFlags || [],
    },
  };
}

function redactAnswer(answer: unknown): unknown {
  if (typeof answer === "string") {
    return redactText(answer);
  }
  return answer;
}

function extractAnswers(trace: StoredTrace): Record<string, unknown> {
  const answers: Record<string, unknown> = {};

  for (const step of trace.steps) {
    const action = step.action as Record<string, unknown>;
    const outputs = step.outputs as Record<string, unknown>;

    if (action.type === "ASK_QUESTION" || action.type === "REFRAME_QUESTION") {
      const qId = action.questionId as string;
      if (qId && outputs?.answer !== undefined) {
        answers[qId] = redactAnswer(outputs.answer);
      }
    }
  }

  return answers;
}

export async function exportReplayPack(runId: string): Promise<ReplayPack> {
  const trace = await getTraceStore().getByRunId(runId);
  if (!trace) {
    throw new Error(`Trace not found: ${runId}`);
  }

  const pack: ReplayPack = {
    id: randomUUID().slice(0, 12),
    sourceRunId: runId,
    createdAt: new Date().toISOString(),
    chiefComplaint: trace.chiefComplaint,
    scenarioId: trace.scenarioId,
    redactedTranscript: extractRedactedTranscript(trace),
    caseStateSnapshot: extractCaseStateSnapshot(trace),
    answers: extractAnswers(trace),
    rulesetHash: trace.rulesetHash,
    metadata: trace.metadata,
  };

  await getReplayPackStore().save(pack);
  return pack;
}

interface ReplayPackBackend {
  save(pack: ReplayPack): Promise<void>;
  getById(id: string): Promise<ReplayPack | null>;
  list(limit?: number): Promise<ReplayPack[]>;
}

class InMemoryReplayPackStore implements ReplayPackBackend {
  private packs: ReplayPack[] = [];

  async save(pack: ReplayPack) {
    this.packs.unshift(pack);
    if (this.packs.length > 200) this.packs.length = 200;
  }

  async getById(id: string) {
    return this.packs.find(p => p.id === id) ?? null;
  }

  async list(limit = 50) {
    return this.packs.slice(0, limit);
  }
}

let store: ReplayPackBackend;

export function getReplayPackStore(): ReplayPackBackend {
  if (!store) {
    store = new InMemoryReplayPackStore();
    console.log("[ReplayPacks] Using in-memory backend");
  }
  return store;
}
