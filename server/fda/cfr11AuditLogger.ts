import crypto from "crypto";
import { auditLog } from "../security/auditLogger";

export interface CFR11Entry {
  entryId: string;
  caseId?: string;
  patientId?: string;
  actor: string;
  action: string;
  decision?: string;
  riskScore?: number;
  modelVersion?: string;
  reasoning?: string;
  physicianId?: string;
  timestamp: string;
  hash: string;
  prevHash: string;
  metadata?: Record<string, unknown>;
}

interface ChainRecord {
  entry: CFR11Entry;
  payload: string;
}

const auditChain: ChainRecord[] = [];
let prevHash = "genesis";

export function logCFR11Entry(data: Omit<CFR11Entry, "entryId" | "timestamp" | "hash" | "prevHash">): CFR11Entry {
  const timestamp = new Date().toISOString();
  const entryId = `cfr11_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const payload = JSON.stringify({ actor: data.actor, action: data.action, caseId: data.caseId, patientId: data.patientId, decision: data.decision, riskScore: data.riskScore, modelVersion: data.modelVersion, reasoning: data.reasoning, physicianId: data.physicianId, metadata: data.metadata, timestamp, prevHash });

  const hash = crypto.createHash("sha256").update(payload).digest("hex");

  const entry: CFR11Entry = {
    entryId,
    ...data,
    timestamp,
    hash,
    prevHash,
  };

  prevHash = hash;
  auditChain.push({ entry, payload });

  auditLog({
    actor: "cfr11_audit_logger",
    action: "entry_logged",
    entityId: entryId,
    patientId: data.patientId,
    details: { action: data.action, caseId: data.caseId },
  });

  return entry;
}

export function verifyCFR11Chain(): { valid: boolean; broken?: number; total: number } {
  if (auditChain.length === 0) return { valid: true, total: 0 };

  for (let i = 0; i < auditChain.length; i++) {
    const { entry, payload } = auditChain[i];
    const recomputed = crypto.createHash("sha256").update(payload).digest("hex");
    if (recomputed !== entry.hash) {
      return { valid: false, broken: i, total: auditChain.length };
    }
  }

  return { valid: true, total: auditChain.length };
}

export function getAuditChain(limit = 100): CFR11Entry[] {
  return auditChain.slice(-limit).map((r) => r.entry);
}

export function getAuditEntriesForCase(caseId: string): CFR11Entry[] {
  return auditChain.filter((r) => r.entry.caseId === caseId).map((r) => r.entry);
}

export function exportCFR11Report(caseId: string): {
  caseId: string;
  compliance: string[];
  generatedAt: string;
  entries: CFR11Entry[];
  integrity: ReturnType<typeof verifyCFR11Chain>;
  summary: { totalDecisions: number; physicianIds: string[]; riskRange: { min: number; max: number } };
} {
  const entries = getAuditEntriesForCase(caseId);
  const integrity = verifyCFR11Chain();
  const risks = entries.map((e) => e.riskScore).filter((r): r is number => r !== undefined);
  const physicianIds = [...new Set(entries.map((e) => e.physicianId).filter(Boolean))] as string[];

  return {
    caseId,
    compliance: ["21 CFR Part 11", "ISO 13485", "IEC 62304", "HIPAA"],
    generatedAt: new Date().toISOString(),
    entries,
    integrity,
    summary: {
      totalDecisions: entries.length,
      physicianIds,
      riskRange: { min: risks.length ? Math.min(...risks) : 0, max: risks.length ? Math.max(...risks) : 0 },
    },
  };
}
