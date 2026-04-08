import type { QAResult } from "./qaAgent";

const qaLog: Array<QAResult & { timestamp: number }> = [];
const MAX_LOG = 500;

export function logQA(result: QAResult): void {
  qaLog.unshift({ ...result, timestamp: Date.now() });
  if (qaLog.length > MAX_LOG) qaLog.length = MAX_LOG;
}

export function getQAHistory(limit = 100): typeof qaLog {
  return qaLog.slice(0, limit);
}

export function getQAStats() {
  if (!qaLog.length) return { avgScore: 1, flagCounts: {}, totalCases: 0 };
  const avgScore = qaLog.reduce((s, q) => s + q.score, 0) / qaLog.length;
  const flagCounts: Record<string, number> = {};
  for (const entry of qaLog) {
    for (const flag of entry.flags) {
      flagCounts[flag.type] = (flagCounts[flag.type] ?? 0) + 1;
    }
  }
  return { avgScore: Math.round(avgScore * 100) / 100, flagCounts, totalCases: qaLog.length };
}
