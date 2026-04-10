const nonCriticalQueue: Array<{ fnName: string; payload: unknown }> = [];

export function enqueueNonCritical(item: { fnName: string; payload: unknown }): void {
  nonCriticalQueue.push(item);
}

export function drainNonCriticalQueue(): typeof nonCriticalQueue {
  return nonCriticalQueue.splice(0);
}

export function secondaryToModifiers(ctx: {
  complaint?: string;
  smoker?: boolean;
  [key: string]: unknown;
}): Record<string, string> {
  if (ctx.complaint === "chest_pain") {
    return { riskFactors: ctx.smoker ? "yes" : "no" };
  }
  if (ctx.complaint === "fever") {
    return { isolationNeeded: "check" };
  }
  return {};
}

export function smartFollowup(p: {
  complaint?: string;
  [key: string]: unknown;
}): string {
  if (p.complaint === "fever")      return "Check temp in 6h";
  if (p.complaint === "chest_pain") return "Call if worsening immediately";
  if (p.complaint === "cough")      return "Monitor O2 sat 12h";
  return "24h check";
}

export function dashboardInsights(state: {
  latency?: number;
  erRate?: number;
  safetyMismatchRate?: number;
  queueDepth?: number;
  [key: string]: unknown;
}): string[] {
  const insights: string[] = [];
  if ((state.latency ?? 0) > 2000)            insights.push("Latency high");
  if ((state.erRate ?? 0) > 0.25)             insights.push("High ER rate");
  if ((state.safetyMismatchRate ?? 0) > 0.01) insights.push("Safety mismatch spike");
  if ((state.queueDepth ?? 0) > 100)          insights.push("Queue depth critical");
  return insights;
}

export async function safeExternalCall(
  fn: (payload: unknown) => Promise<unknown>,
  payload: unknown
): Promise<unknown> {
  try {
    return await fn(payload);
  } catch {
    enqueueNonCritical({ fnName: fn.name ?? "anonymous", payload });
    return { queued: true };
  }
}
