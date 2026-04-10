import { autonomyLevel } from "./autonomyController";

export interface HighAutonomyResult {
  level: string;
  plan: string[];
  executed: string[];
}

const POLICY_ACTIONS: Record<string, () => void> = {
  scale_workers:       () => console.log("[Autonomy] Scaling workers"),
  retrain:             () => console.log("[Autonomy] Retraining model"),
  validate_templates:  () => console.log("[Autonomy] Validating templates"),
};

export async function runHighAutonomy(state: {
  ml?: { drift?: boolean };
  infrastructure?: { queueDepth?: number; healthy?: boolean };
  safety?: { mismatchRate?: number };
  [key: string]: unknown;
}): Promise<HighAutonomyResult> {
  const level = autonomyLevel(state);
  const plan: string[] = [];

  if (state.ml?.drift) plan.push("retrain");
  if ((state.infrastructure?.queueDepth ?? 0) > 50) plan.push("scale_workers");
  if (plan.length === 0) plan.push("validate_templates");

  const executed: string[] = [];

  for (const a of plan) {
    if (level === "manual") continue;
    if (level === "assist" && a !== "validate_templates") continue;
    POLICY_ACTIONS[a]?.();
    executed.push(a);
  }

  return { level, plan, executed };
}
