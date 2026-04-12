/**
 * LangSmith Observability — full trace + FDA audit logging
 * Provides: per-case trace, RLHF training data capture, debugging
 * Falls back gracefully when LANGSMITH_API_KEY is not configured.
 */

import { Client } from "langsmith";

let _client: Client | null = null;

function getLangSmithClient(): Client | null {
  if (!process.env.LANGCHAIN_API_KEY && !process.env.LANGSMITH_API_KEY) return null;
  if (!_client) {
    _client = new Client({
      apiKey: process.env.LANGCHAIN_API_KEY ?? process.env.LANGSMITH_API_KEY,
    });
  }
  return _client;
}

export interface CaseTrace {
  runId?:     string;
  name:       string;
  inputs:     Record<string, any>;
  outputs:    Record<string, any>;
  tags?:      string[];
  metadata?:  Record<string, any>;
  startTime?: Date;
  endTime?:   Date;
}

export interface TraceResult {
  logged:   boolean;
  runId?:   string;
  provider: "langsmith" | "local";
}

// ── Local audit log (always runs — FDA backup) ─────────────────────────────────
const localAuditLog: CaseTrace[] = [];
const MAX_LOCAL = 500;

function appendLocalAudit(trace: CaseTrace): void {
  if (localAuditLog.length >= MAX_LOCAL) localAuditLog.shift();
  localAuditLog.push({ ...trace, startTime: trace.startTime ?? new Date() });
}

export function getLocalAuditLog(): CaseTrace[] {
  return [...localAuditLog];
}

// ── Primary: log to LangSmith (when configured) + always local ────────────────
export async function logCase(
  input: Record<string, any>,
  output: Record<string, any>,
  options: { name?: string; tags?: string[]; metadata?: Record<string, any> } = {}
): Promise<TraceResult> {
  const trace: CaseTrace = {
    name:      options.name ?? "triage-case",
    inputs:    input,
    outputs:   output,
    tags:      options.tags ?? ["production", "triage"],
    metadata:  { ...options.metadata, traceAt: new Date().toISOString() },
    startTime: new Date(),
    endTime:   new Date(),
  };

  appendLocalAudit(trace);

  const client = getLangSmithClient();
  if (!client) {
    return { logged: true, provider: "local" };
  }

  try {
    const run = await client.createRun({
      name:       trace.name,
      run_type:   "chain",
      inputs:     trace.inputs,
      outputs:    trace.outputs,
      tags:       trace.tags,
      extra:      { metadata: trace.metadata },
      start_time: trace.startTime?.getTime(),
      end_time:   trace.endTime?.getTime(),
    });

    return { logged: true, runId: (run as any)?.id, provider: "langsmith" };
  } catch (err) {
    console.warn("[LangSmith] Failed to log — falling back to local:", String(err));
    return { logged: true, provider: "local" };
  }
}

// ── Convenience: log a triage session ────────────────────────────────────────
export async function logTriageSession(
  patient: { id?: string; symptoms: string },
  result:  Record<string, any>
): Promise<TraceResult> {
  return logCase(
    { patientId: patient.id ?? "anon", symptoms: patient.symptoms },
    result,
    {
      name:     "triage-session",
      tags:     ["production", "triage", "fda-audit"],
      metadata: { version: "1.0", engine: "auralyn-orchestrator" },
    }
  );
}
