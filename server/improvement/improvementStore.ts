export interface ImprovementRecord {
  id: string;
  timestamp: number;
  weaknesses: any[];
  improvements: any[];
  source: string;
  appliedCount: number;
}

const improvementLog: ImprovementRecord[] = [];

function uid() {
  return `imp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function saveImprovement(record: Omit<ImprovementRecord, "id">) {
  improvementLog.unshift({ id: uid(), ...record });
  if (improvementLog.length > 200) improvementLog.pop();
}

export function getImprovements(): ImprovementRecord[] {
  return improvementLog;
}

export function getLatestImprovement(): ImprovementRecord | null {
  return improvementLog[0] ?? null;
}

export function clearImprovements() {
  improvementLog.length = 0;
}

export function getImprovementStats() {
  const total = improvementLog.length;
  const totalSuggestions = improvementLog.reduce((s, r) => s + r.improvements.length, 0);
  const criticalCount = improvementLog.reduce(
    (s, r) => s + r.improvements.filter((i: any) => i.priority === "critical").length,
    0
  );
  return { total, totalSuggestions, criticalCount };
}
