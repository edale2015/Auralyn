import { randomUUID } from "crypto";
import { SkillContext } from "../skills/shared/skillTypes";

// ─── AuditTraceService (Batch 29 — Medical MCP clinical trace) ────────────────

export interface TraceStep {
  traceId:         string;
  stepName:        string;
  toolName:        string;
  startedAt:       string;
  completedAt?:    string;
  status:          "started" | "completed" | "failed";
  inputSnapshot:   unknown;
  outputSnapshot?: unknown;
  delta?:          Record<string, unknown>;
  notes?:          string[];
  error?:          string;
}

function deepClone<T>(value: T): T {
  try { return JSON.parse(JSON.stringify(value)); } catch { return value; }
}

function computeDelta(input: unknown, output: unknown): Record<string, unknown> {
  if (typeof input !== "object" || !input || typeof output !== "object" || !output) return {};
  const a = input as Record<string, unknown>;
  const b = output as Record<string, unknown>;
  const delta: Record<string, unknown> = {};
  for (const key of Object.keys(b)) {
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) delta[key] = { before: a[key], after: b[key] };
  }
  return delta;
}

class AuditTraceService {
  private readonly traces = new Map<string, TraceStep[]>();

  createTrace(seed?: string): string {
    const traceId = seed ?? randomUUID();
    if (!this.traces.has(traceId)) this.traces.set(traceId, []);
    return traceId;
  }

  startStep(traceId: string, toolName: string, stepName: string, inputSnapshot: unknown, notes: string[] = []): TraceStep {
    const step: TraceStep = {
      traceId, stepName, toolName, startedAt: new Date().toISOString(), status: "started",
      inputSnapshot: deepClone(inputSnapshot), notes,
    };
    const steps = this.traces.get(traceId) ?? [];
    steps.push(step);
    this.traces.set(traceId, steps);
    return step;
  }

  completeStep(traceId: string, stepName: string, outputSnapshot: unknown, notes: string[] = []): void {
    const steps = this.traces.get(traceId) ?? [];
    const step = [...steps].reverse().find((s) => s.stepName === stepName && s.status === "started");
    if (!step) return;
    step.status = "completed";
    step.completedAt = new Date().toISOString();
    step.outputSnapshot = deepClone(outputSnapshot);
    step.delta = computeDelta(step.inputSnapshot, outputSnapshot);
    step.notes = [...(step.notes ?? []), ...notes];
  }

  failStep(traceId: string, stepName: string, error: unknown): void {
    const steps = this.traces.get(traceId) ?? [];
    const step = [...steps].reverse().find((s) => s.stepName === stepName && s.status === "started");
    if (!step) return;
    step.status = "failed";
    step.completedAt = new Date().toISOString();
    step.error = error instanceof Error ? error.message : String(error);
  }

  getTrace(traceId: string): TraceStep[] { return this.traces.get(traceId) ?? []; }

  summarize(traceId: string): string {
    return this.getTrace(traceId).map((s) => `${s.stepName}:${s.status}`).join(" -> ");
  }

  listTraces(): string[] { return [...this.traces.keys()]; }
}

export const auditTraceService = new AuditTraceService();

// ─── Legacy: SkillContext audit trace ─────────────────────────────────────────

export function buildAuditTrace(context: SkillContext) {
  const outputs = context.priorSkillOutputs ?? {};

  return Object.entries(outputs).map(([skillName, result]: any) => ({
    skillName,
    status: result?.status ?? "unknown",
    confidence: result?.confidence ?? null,
    ruleHits: result?.audit?.ruleHits ?? [],
    missingData: result?.audit?.missingData ?? [],
    nextRecommendedSkills: result?.nextRecommendedSkills ?? [],
  }));
}
