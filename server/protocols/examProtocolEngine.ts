import { trace } from "../lib/traceLogger";

export type ExamStep =
  | { type: "ask"; question: string; field: string }
  | { type: "vision"; target: "throat" | "ear" | "rash" | "wound" }
  | { type: "robot"; action: Record<string, unknown> }
  | { type: "device"; device: "bp" | "spo2" | "ekg" | "temp" }
  | { type: "score"; fn: (ctx: ExamContext) => number; field: string; threshold?: number; escalateAbove?: number }
  | { type: "decision"; rule: (ctx: ExamContext) => boolean; next: string; escalate?: boolean };

export type ExamContext = Record<string, unknown>;

export interface ExamProtocol {
  id: string;
  complaint: string;
  steps: ExamStep[];
}

export interface ProtocolRunContext {
  ask: (question: string, field: string) => Promise<unknown>;
  vision: (target: string) => Promise<Record<string, unknown>>;
  robot: (cmd: Record<string, unknown>) => Promise<Record<string, unknown>>;
  device: (device: string) => Promise<Record<string, unknown>>;
}

export interface ProtocolResult {
  protocolId: string;
  complaint: string;
  complete?: boolean;
  pending?: boolean;
  escalate?: boolean;
  escalateReason?: string;
  next?: string;
  context: ExamContext;
  stepsRun: number;
  latencyMs: number;
}

export async function runExamProtocol(
  protocol: ExamProtocol,
  runCtx: ProtocolRunContext
): Promise<ProtocolResult> {
  const start = Date.now();
  const ctx: ExamContext = {};
  let stepsRun = 0;

  trace("protocol_engine", "protocol_started", {
    protocolId: protocol.id,
    complaint: protocol.complaint,
    totalSteps: protocol.steps.length,
  });

  for (const step of protocol.steps) {
    stepsRun++;

    switch (step.type) {
      case "ask": {
        const answer = await runCtx.ask(step.question, step.field);
        if (answer === undefined || answer === null) {
          return {
            protocolId: protocol.id,
            complaint: protocol.complaint,
            pending: true,
            context: ctx,
            stepsRun,
            latencyMs: Date.now() - start,
          };
        }
        ctx[step.field] = answer;
        break;
      }

      case "vision": {
        const result = await runCtx.vision(step.target);
        ctx[step.target] = result;

        if (Array.isArray(result.redFlags) && result.redFlags.length > 0) {
          trace("protocol_engine", "vision_red_flag", {
            protocolId: protocol.id,
            target: step.target,
            redFlags: result.redFlags,
          });
          return {
            protocolId: protocol.id,
            complaint: protocol.complaint,
            escalate: true,
            escalateReason: `vision_red_flag:${step.target}`,
            context: ctx,
            stepsRun,
            latencyMs: Date.now() - start,
          };
        }
        break;
      }

      case "robot": {
        const cmdResult = await runCtx.robot(step.action);
        ctx[`robot_${step.action.type ?? "cmd"}`] = cmdResult;
        break;
      }

      case "device": {
        const reading = await runCtx.device(step.device);
        ctx[step.device] = reading;

        if (step.device === "ekg") {
          const waveform = reading.waveform as number[] | undefined;
          if (waveform && detectSTElevation(waveform)) {
            trace("protocol_engine", "stemi_detected", { protocolId: protocol.id });
            return {
              protocolId: protocol.id,
              complaint: protocol.complaint,
              escalate: true,
              escalateReason: "STEMI_detected",
              context: ctx,
              stepsRun,
              latencyMs: Date.now() - start,
            };
          }
        }

        if (step.device === "spo2") {
          const spo2 = reading.value as number | undefined;
          if (spo2 !== undefined && spo2 < 90) {
            return {
              protocolId: protocol.id,
              complaint: protocol.complaint,
              escalate: true,
              escalateReason: "hypoxia_spo2_below_90",
              context: ctx,
              stepsRun,
              latencyMs: Date.now() - start,
            };
          }
        }
        break;
      }

      case "score": {
        const score = step.fn(ctx);
        ctx[step.field] = score;

        if (step.escalateAbove !== undefined && score > step.escalateAbove) {
          return {
            protocolId: protocol.id,
            complaint: protocol.complaint,
            escalate: true,
            escalateReason: `score_${step.field}_above_${step.escalateAbove}`,
            context: ctx,
            stepsRun,
            latencyMs: Date.now() - start,
          };
        }
        break;
      }

      case "decision": {
        if (step.rule(ctx)) {
          trace("protocol_engine", "decision_branch", {
            protocolId: protocol.id,
            next: step.next,
            escalate: step.escalate ?? false,
          });
          return {
            protocolId: protocol.id,
            complaint: protocol.complaint,
            escalate: step.escalate ?? false,
            escalateReason: step.escalate ? step.next : undefined,
            next: step.next,
            context: ctx,
            stepsRun,
            latencyMs: Date.now() - start,
          };
        }
        break;
      }
    }
  }

  trace("protocol_engine", "protocol_complete", {
    protocolId: protocol.id,
    stepsRun,
    latencyMs: Date.now() - start,
  });

  return {
    protocolId: protocol.id,
    complaint: protocol.complaint,
    complete: true,
    context: ctx,
    stepsRun,
    latencyMs: Date.now() - start,
  };
}

function detectSTElevation(waveform: number[]): boolean {
  if (waveform.length < 10) return false;
  const mid = Math.floor(waveform.length / 2);
  const baseline = waveform.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
  const stSegment = waveform.slice(mid, mid + 4).reduce((a, b) => a + b, 0) / 4;
  return stSegment - baseline > 2.0;
}

export const protocolRegistry: Record<string, ExamProtocol> = {};

export function registerProtocol(p: ExamProtocol): void {
  protocolRegistry[p.id] = p;
  protocolRegistry[p.complaint] = p;
}
