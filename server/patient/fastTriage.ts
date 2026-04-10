import { runFinalPipeline } from "../clinical/finalPipeline";
import { nextSecondaryQuestion, collectModifiers, fastTrack } from "../clinical/intakeDynamic";

export interface FastTriageResult {
  disposition?: string;
  ask?: string;
  durationMs: number;
  path: "fast-track" | "progressive" | "full";
}

export async function fastTriageFlow(input: Record<string, any>): Promise<FastTriageResult> {
  const start = Date.now();

  const modifiers = collectModifiers(input);
  const fast = fastTrack({ ...input, ...modifiers });

  if (fast) {
    return { disposition: fast, durationMs: Date.now() - start, path: "fast-track" };
  }

  const q = nextSecondaryQuestion({ ...input, ...modifiers });
  if (q) {
    return { ask: q, durationMs: Date.now() - start, path: "progressive" };
  }

  const res = runFinalPipeline(input);
  return {
    disposition: res.safetyDisposition,
    durationMs: Date.now() - start,
    path: "full",
  };
}
