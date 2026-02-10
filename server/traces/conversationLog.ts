import { z } from "zod";

export const ConversationTurnLogSchema = z.object({
  id: z.string(),
  caseId: z.string().optional(),
  encounterId: z.string().optional(),
  channel: z.enum(["whatsapp", "web", "telegram", "test"]),
  sender: z.enum(["patient", "provider", "agent", "system"]),
  messageText: z.string(),
  timestamp: z.string(),
  agentActionId: z.string().optional(),
  questionId: z.string().optional(),
  llmUsed: z.boolean().default(false),
  llmPromptTemplateId: z.string().optional(),
  llmModel: z.string().optional(),
  latencyMs: z.number().optional(),
  tokensIn: z.number().optional(),
  tokensOut: z.number().optional(),
  patientResponseTimeMs: z.number().optional(),
  patientAnswered: z.enum(["yes", "no", "partial"]).optional(),
  frictionSignals: z.array(z.string()).default([]),
});

export type ConversationTurnLog = z.infer<typeof ConversationTurnLogSchema>;

interface ConversationLogBackend {
  log(entry: ConversationTurnLog): Promise<void>;
  getByCaseId(caseId: string, limit?: number): Promise<ConversationTurnLog[]>;
  getByEncounterId(encounterId: string, limit?: number): Promise<ConversationTurnLog[]>;
}

class InMemoryConversationLog implements ConversationLogBackend {
  private logs: ConversationTurnLog[] = [];

  async log(entry: ConversationTurnLog) {
    this.logs.unshift(entry);
    if (this.logs.length > 1000) this.logs.length = 1000;
  }

  async getByCaseId(caseId: string, limit = 50) {
    return this.logs.filter(l => l.caseId === caseId).slice(0, limit);
  }

  async getByEncounterId(encounterId: string, limit = 50) {
    return this.logs.filter(l => l.encounterId === encounterId).slice(0, limit);
  }
}

class FirestoreConversationLog implements ConversationLogBackend {
  private get col() {
    const { getFirestore } = require("../firebase") as typeof import("../firebase");
    return getFirestore().collection("conversationTurnLogs");
  }

  async log(entry: ConversationTurnLog) {
    await this.col.doc(entry.id).set(entry);
  }

  async getByCaseId(caseId: string, limit = 50) {
    const snap = await this.col
      .where("caseId", "==", caseId)
      .orderBy("timestamp", "desc")
      .limit(limit)
      .get();
    return snap.docs.map(d => d.data() as ConversationTurnLog);
  }

  async getByEncounterId(encounterId: string, limit = 50) {
    const snap = await this.col
      .where("encounterId", "==", encounterId)
      .orderBy("timestamp", "desc")
      .limit(limit)
      .get();
    return snap.docs.map(d => d.data() as ConversationTurnLog);
  }
}

let backend: ConversationLogBackend;

export function initConversationLog() {
  const driver = process.env.STORAGE_DRIVER || "sqlite";
  if (driver === "firestore") {
    backend = new FirestoreConversationLog();
    console.log("[ConversationLog] Using Firestore backend");
  } else {
    backend = new InMemoryConversationLog();
    console.log("[ConversationLog] Using in-memory backend (dev)");
  }
}

export function getConversationLog(): ConversationLogBackend {
  if (!backend) initConversationLog();
  return backend;
}

export function detectFrictionSignals(text: string): string[] {
  const signals: string[] = [];
  const lower = text.toLowerCase();
  const profanity = /\b(damn|shit|fuck|hell|ass|wtf|stfu)\b/i;
  if (profanity.test(lower)) signals.push("profanity");
  if (lower.length < 3 && !["yes", "no", "y", "n"].includes(lower)) signals.push("very_short");
  if (text.length > 500) signals.push("long_rant");
  const refusalPhrases = ["i don't want", "i refuse", "none of your business", "stop asking", "leave me alone"];
  if (refusalPhrases.some(p => lower.includes(p))) signals.push("refusal");
  return signals;
}
