export interface SystemHealth {
  healthy: boolean;
  issues: string[];
  mismatchRate: number;
  status: "green" | "yellow" | "red";
}

export function systemHealth(state: {
  safety?: { mismatchRate?: number };
  [key: string]: unknown;
}): SystemHealth {
  const rate = state.safety?.mismatchRate ?? 0;
  const issues: string[] = [];
  if (rate > 0.01) issues.push("safety_mismatch");
  if ((state as any).ml?.drift) issues.push("ml_drift");

  const status = rate < 0.005 ? "green" : rate < 0.01 ? "yellow" : "red";

  return {
    healthy: rate < 0.01,
    issues,
    mismatchRate: rate,
    status,
  };
}

export function troubleshoot(error: string): string {
  if (error.includes("FHIR") || error.includes("Epic")) return "Restart Epic FHIR integration";
  if (error.includes("selector") || error.includes("template")) return "Trigger template repair";
  if (error.includes("Redis") || error.includes("cache")) return "Flush Redis cache and reconnect";
  if (error.includes("timeout")) return "Check network latency and retry with backoff";
  if (error.includes("ML") || error.includes("model")) return "Reload model checkpoint";
  return "Escalate to engineer";
}

export function maintenanceTasks(): string[] {
  return [
    "retrain ML on new outcomes",
    "validate clinical templates",
    "check model drift",
    "run simulation batch",
    "flush stale Redis keys",
    "review denial prediction accuracy",
  ];
}
