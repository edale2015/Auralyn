import type { TraceStep, TraceEvent, NormalizedResult, AgentRunResponse } from "../../shared/testingTypes";

export interface StoredTrace {
  runId: string;
  caseId: string;
  scenarioId: string | null;
  isTest: boolean;
  chiefComplaint: string;
  sheetEnv: string;
  rulesetHash: string;
  commitSha: string;
  stopReason: string;
  steps: TraceStep[];
  events: TraceEvent[];
  normalized: NormalizedResult;
  normalizedHash: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface TraceFilter {
  scenarioId?: string;
  chiefComplaint?: string;
  isTest?: boolean;
  limit?: number;
}

let store: TraceStoreBackend;

interface TraceStoreBackend {
  save(trace: StoredTrace): Promise<void>;
  getByRunId(runId: string): Promise<StoredTrace | null>;
  list(filter: TraceFilter): Promise<StoredTrace[]>;
  getLatest(): Promise<StoredTrace | null>;
}

class InMemoryTraceStore implements TraceStoreBackend {
  private traces: StoredTrace[] = [];

  async save(trace: StoredTrace) {
    this.traces.unshift(trace);
    if (this.traces.length > 200) this.traces.length = 200;
  }

  async getByRunId(runId: string) {
    return this.traces.find(t => t.runId === runId) ?? null;
  }

  async list(filter: TraceFilter) {
    let results = [...this.traces];
    if (filter.scenarioId) results = results.filter(t => t.scenarioId === filter.scenarioId);
    if (filter.chiefComplaint) results = results.filter(t => t.chiefComplaint === filter.chiefComplaint);
    if (filter.isTest !== undefined) results = results.filter(t => t.isTest === filter.isTest);
    return results.slice(0, filter.limit ?? 50);
  }

  async getLatest() {
    return this.traces[0] ?? null;
  }
}

class FirestoreTraceStore implements TraceStoreBackend {
  private get col() {
    const { getFirestore } = require("../firebase") as typeof import("../firebase");
    return getFirestore().collection("agentTraces");
  }

  async save(trace: StoredTrace) {
    await this.col.doc(trace.runId).set(trace);
  }

  async getByRunId(runId: string) {
    const doc = await this.col.doc(runId).get();
    if (!doc.exists) return null;
    return doc.data() as StoredTrace;
  }

  async list(filter: TraceFilter) {
    let query: FirebaseFirestore.Query = this.col.orderBy("createdAt", "desc");
    if (filter.scenarioId) query = query.where("scenarioId", "==", filter.scenarioId);
    if (filter.chiefComplaint) query = query.where("chiefComplaint", "==", filter.chiefComplaint);
    if (filter.isTest !== undefined) query = query.where("isTest", "==", filter.isTest);
    query = query.limit(filter.limit ?? 50);
    const snap = await query.get();
    return snap.docs.map(d => d.data() as StoredTrace);
  }

  async getLatest() {
    const snap = await this.col.orderBy("createdAt", "desc").limit(1).get();
    if (snap.empty) return null;
    return snap.docs[0].data() as StoredTrace;
  }
}

export function initTraceStore() {
  const driver = process.env.STORAGE_DRIVER || "sqlite";
  if (driver === "firestore") {
    store = new FirestoreTraceStore();
    console.log("[TraceStore] Using Firestore backend");
  } else {
    store = new InMemoryTraceStore();
    console.log("[TraceStore] Using in-memory backend (dev)");
  }
}

export function getTraceStore(): TraceStoreBackend {
  if (!store) initTraceStore();
  return store;
}

export function agentRunResponseToStoredTrace(
  response: AgentRunResponse,
  opts: { caseId?: string; scenarioId?: string | null; isTest?: boolean; chiefComplaint?: string }
): StoredTrace {
  return {
    runId: response.runId,
    caseId: opts.caseId ?? response.runId,
    scenarioId: opts.scenarioId ?? null,
    isTest: opts.isTest ?? false,
    chiefComplaint: opts.chiefComplaint ?? "unknown",
    sheetEnv: response.env.sheetEnv,
    rulesetHash: response.env.rulesetHash,
    commitSha: response.env.commit,
    stopReason: "completed",
    steps: response.trace.steps,
    events: response.trace.events,
    normalized: response.normalized.final,
    normalizedHash: response.normalized.hash,
    createdAt: new Date().toISOString(),
  };
}
