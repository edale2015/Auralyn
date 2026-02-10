import { z } from "zod";
import { createHash } from "crypto";

export const LlmCallLogSchema = z.object({
  id: z.string(),
  runId: z.string().optional(),
  caseId: z.string().optional(),
  channel: z.enum(["whatsapp", "web", "test", "api"]).default("api"),
  purpose: z.string(),
  model: z.string(),
  temperature: z.number().optional(),
  seed: z.number().optional(),
  promptTemplateId: z.string().optional(),
  inputHash: z.string(),
  outputHash: z.string(),
  outputText: z.string().optional(),
  latencyMs: z.number(),
  tokensIn: z.number().optional(),
  tokensOut: z.number().optional(),
  linkedActionStep: z.number().optional(),
  timestamp: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

export type LlmCallLog = z.infer<typeof LlmCallLogSchema>;

interface LlmCallLogBackend {
  log(entry: LlmCallLog): Promise<void>;
  getByRunId(runId: string, limit?: number): Promise<LlmCallLog[]>;
  getByCaseId(caseId: string, limit?: number): Promise<LlmCallLog[]>;
  getRecent(limit?: number): Promise<LlmCallLog[]>;
}

class InMemoryLlmCallLog implements LlmCallLogBackend {
  private logs: LlmCallLog[] = [];

  async log(entry: LlmCallLog) {
    this.logs.unshift(entry);
    if (this.logs.length > 500) this.logs.length = 500;
  }

  async getByRunId(runId: string, limit = 50) {
    return this.logs.filter(l => l.runId === runId).slice(0, limit);
  }

  async getByCaseId(caseId: string, limit = 50) {
    return this.logs.filter(l => l.caseId === caseId).slice(0, limit);
  }

  async getRecent(limit = 50) {
    return this.logs.slice(0, limit);
  }
}

class FirestoreLlmCallLog implements LlmCallLogBackend {
  private get col() {
    const { getFirestore } = require("../firebase") as typeof import("../firebase");
    return getFirestore().collection("llmCallLogs");
  }

  async log(entry: LlmCallLog) {
    await this.col.doc(entry.id).set(entry);
  }

  async getByRunId(runId: string, limit = 50) {
    const snap = await this.col
      .where("runId", "==", runId)
      .orderBy("timestamp", "desc")
      .limit(limit)
      .get();
    return snap.docs.map(d => d.data() as LlmCallLog);
  }

  async getByCaseId(caseId: string, limit = 50) {
    const snap = await this.col
      .where("caseId", "==", caseId)
      .orderBy("timestamp", "desc")
      .limit(limit)
      .get();
    return snap.docs.map(d => d.data() as LlmCallLog);
  }

  async getRecent(limit = 50) {
    const snap = await this.col
      .orderBy("timestamp", "desc")
      .limit(limit)
      .get();
    return snap.docs.map(d => d.data() as LlmCallLog);
  }
}

let backend: LlmCallLogBackend;

export function initLlmCallLog() {
  const driver = process.env.STORAGE_DRIVER || "sqlite";
  if (driver === "firestore") {
    backend = new FirestoreLlmCallLog();
    console.log("[LlmCallLog] Using Firestore backend");
  } else {
    backend = new InMemoryLlmCallLog();
    console.log("[LlmCallLog] Using in-memory backend (dev)");
  }
}

export function getLlmCallLog(): LlmCallLogBackend {
  if (!backend) initLlmCallLog();
  return backend;
}

export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

export function buildLlmCallLogEntry(opts: {
  purpose: string;
  model: string;
  inputText: string;
  outputText: string;
  latencyMs: number;
  runId?: string;
  caseId?: string;
  channel?: LlmCallLog["channel"];
  temperature?: number;
  seed?: number;
  promptTemplateId?: string;
  tokensIn?: number;
  tokensOut?: number;
  linkedActionStep?: number;
  metadata?: Record<string, unknown>;
}): LlmCallLog {
  const { randomUUID } = require("crypto");
  return {
    id: randomUUID(),
    runId: opts.runId,
    caseId: opts.caseId,
    channel: opts.channel ?? "api",
    purpose: opts.purpose,
    model: opts.model,
    temperature: opts.temperature,
    seed: opts.seed,
    promptTemplateId: opts.promptTemplateId,
    inputHash: hashContent(opts.inputText),
    outputHash: hashContent(opts.outputText),
    outputText: opts.outputText,
    latencyMs: opts.latencyMs,
    tokensIn: opts.tokensIn,
    tokensOut: opts.tokensOut,
    linkedActionStep: opts.linkedActionStep,
    timestamp: new Date().toISOString(),
    metadata: opts.metadata,
  };
}
