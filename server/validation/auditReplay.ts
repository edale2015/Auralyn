/**
 * Audit Replay Engine
 * Reconstructs the step-by-step reasoning trace for any clinical encounter.
 * Supports regulatory review, incident investigation, and model debugging.
 */

export interface AuditTraceStep {
  step: number;
  action: string;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
  timestamp?: string;
  durationMs?: number;
}

export interface ReplayReport {
  traceId: string;
  steps: AuditTraceStep[];
  summary: {
    totalSteps: number;
    startTime?: string;
    endTime?: string;
    finalDisposition?: string;
    finalConfidence?: number;
    failedSteps: string[];
  };
}

export function replayCase(trace: any[]): ReplayReport {
  const steps: AuditTraceStep[] = trace.map((step, i) => ({
    step: i,
    action:    step.action   ?? step.step ?? `step_${i}`,
    input:     step.input    ?? null,
    output:    step.output   ?? null,
    metadata:  step.metadata ?? {},
    timestamp: step.timestamp ?? step.isoTime ?? null,
    durationMs: step.durationMs ?? null,
  }));

  const failedSteps = steps
    .filter(s => (s.output as any)?.error || (s.metadata as any)?.failed)
    .map(s => s.action);

  const lastStep = steps[steps.length - 1];
  const finalDisposition =
    (lastStep?.output as any)?.safetyDisposition ??
    (lastStep?.metadata as any)?.disposition ??
    undefined;

  return {
    traceId: (trace[0] as any)?.traceId ?? "unknown",
    steps,
    summary: {
      totalSteps:       steps.length,
      startTime:        steps[0]?.timestamp ?? undefined,
      endTime:          lastStep?.timestamp  ?? undefined,
      finalDisposition,
      finalConfidence:  (lastStep?.output as any)?.confidence ?? undefined,
      failedSteps,
    },
  };
}

export function diffTraces(traceA: any[], traceB: any[]): {
  divergedAt?: number;
  dispositionMatch: boolean;
  stepCountMatch: boolean;
} {
  const rA = replayCase(traceA);
  const rB = replayCase(traceB);

  let divergedAt: number | undefined;
  const minLen = Math.min(rA.steps.length, rB.steps.length);

  for (let i = 0; i < minLen; i++) {
    if (JSON.stringify(rA.steps[i].output) !== JSON.stringify(rB.steps[i].output)) {
      divergedAt = i;
      break;
    }
  }

  return {
    divergedAt,
    dispositionMatch: rA.summary.finalDisposition === rB.summary.finalDisposition,
    stepCountMatch:   rA.summary.totalSteps === rB.summary.totalSteps,
  };
}
