export type ScriptGroup = "A" | "B";

export function assignABGroup(patientId: string): ScriptGroup {
  const hash = patientId.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return hash % 2 === 0 ? "A" : "B";
}

export function getABScript(group: ScriptGroup, baseScript: string): string {
  if (group === "A") {
    return baseScript;
  }

  return `I understand your concern, and I want to make sure we're using the most effective treatment for what's actually happening.

${baseScript}

The key is timing treatment so it works—not just starting it early.`;
}

export function getABTestStats(outcomes: Array<{ group: ScriptGroup; antibioticAvoided: boolean }>): Record<ScriptGroup, { total: number; avoided: number; rate: number }> {
  const stats: Record<ScriptGroup, { total: number; avoided: number; rate: number }> = {
    A: { total: 0, avoided: 0, rate: 0 },
    B: { total: 0, avoided: 0, rate: 0 },
  };

  for (const o of outcomes) {
    stats[o.group].total++;
    if (o.antibioticAvoided) stats[o.group].avoided++;
  }

  for (const g of (["A", "B"] as ScriptGroup[])) {
    stats[g].rate = stats[g].total > 0
      ? Math.round((stats[g].avoided / stats[g].total) * 100) / 100
      : 0;
  }

  return stats;
}
