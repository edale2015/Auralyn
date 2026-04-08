/**
 * brainBehavior.ts
 * Determines the brain's cognitive mode based on clinical context.
 *
 * Modes:
 *   "fast-safe"     → High-risk patient: skip expensive engines, prioritise safety signals.
 *   "deep-think"    → High uncertainty: expand engine set, run re-query loop.
 *   "fallback-safe" → System severely degraded: restrict outputs, escalate disposition.
 *   "balanced"      → Normal operation: full engine set, standard timeouts.
 *
 * This is the top-level heuristic.  The adaptive planner and re-query loop
 * translate mode into concrete engine execution decisions.
 */

export type ThinkingMode = "fast-safe" | "deep-think" | "fallback-safe" | "balanced";

export interface BrainBehaviorContext {
  riskLevel?:        "low" | "moderate" | "high" | "unknown";
  uncertainty?:      number;
  degradedSeverity?: "high" | "moderate" | "low" | "none";
  engineFailureCount?: number;
}

/**
 * Returns the thinking mode the brain should adopt for this clinical encounter.
 * Priority order: safety > degradation > uncertainty > default.
 */
export function adjustThinkingMode(ctx: BrainBehaviorContext): ThinkingMode {
  if (ctx.riskLevel === "high") {
    return "fast-safe";
  }

  if (ctx.degradedSeverity === "high" || (ctx.engineFailureCount ?? 0) >= 5) {
    return "fallback-safe";
  }

  if ((ctx.uncertainty ?? 0) > 0.65) {
    return "deep-think";
  }

  return "balanced";
}

/**
 * Returns per-mode timeout scale factors.
 * In "fast-safe" mode, timeouts are tighter so the encounter resolves quickly.
 * In "deep-think" mode, timeouts are relaxed slightly to allow richer reasoning.
 */
export function timeoutScaleForMode(mode: ThinkingMode): number {
  switch (mode) {
    case "fast-safe":    return 0.6;
    case "deep-think":   return 1.3;
    case "fallback-safe": return 0.8;
    case "balanced":     return 1.0;
  }
}

/**
 * True if the mode requires the re-query loop to be activated.
 */
export function shouldRequery(mode: ThinkingMode): boolean {
  return mode === "deep-think";
}

/**
 * True if the mode requires restricting outputs and auto-escalating disposition.
 */
export function shouldEscalateDisposition(mode: ThinkingMode): boolean {
  return mode === "fallback-safe";
}
