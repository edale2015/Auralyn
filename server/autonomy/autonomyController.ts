export type AutonomyLevel = "manual" | "assist" | "semi" | "auto";

export const SAFE_ACTIONS = ["scale_workers", "refresh_simulation", "validate_templates"] as const;

export function autonomyLevel(state: {
  safety?: { mismatchRate?: number };
  ml?: { drift?: boolean };
  infrastructure?: { healthy?: boolean };
  [key: string]: unknown;
}): AutonomyLevel {
  if ((state.safety?.mismatchRate ?? 0) > 0.01) return "manual";
  if (state.ml?.drift) return "assist";
  if (state.infrastructure?.healthy) return "semi";
  return "auto";
}

export async function executeAutonomy(actions: string[], level: AutonomyLevel): Promise<string[]> {
  const executed: string[] = [];
  for (const a of actions) {
    if (level === "manual") continue;
    if (level === "assist" && !(SAFE_ACTIONS as readonly string[]).includes(a)) continue;
    console.log(`[Autonomy:${level}] Executing: ${a}`);
    executed.push(a);
  }
  return executed;
}
