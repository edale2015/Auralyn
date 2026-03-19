interface AgentLogEntry {
  agent: string;
  timestamp: string;
  durationMs: number;
  status: "success" | "error";
  resultSummary: Record<string, any>;
  errorMessage?: string;
}

const agentLog: AgentLogEntry[] = [];
const agentStats: Record<string, { runs: number; successes: number; failures: number; totalMs: number }> = {};

export function logAgent(
  agentName: string,
  result: Record<string, any>,
  durationMs: number,
  status: "success" | "error" = "success",
  errorMessage?: string,
) {
  const entry: AgentLogEntry = {
    agent: agentName,
    timestamp: new Date().toISOString(),
    durationMs,
    status,
    resultSummary: result,
    errorMessage,
  };
  agentLog.push(entry);
  if (agentLog.length > 1000) agentLog.splice(0, agentLog.length - 1000);

  if (!agentStats[agentName]) {
    agentStats[agentName] = { runs: 0, successes: 0, failures: 0, totalMs: 0 };
  }
  agentStats[agentName].runs++;
  agentStats[agentName].totalMs += durationMs;
  if (status === "success") agentStats[agentName].successes++;
  else agentStats[agentName].failures++;
}

export function getAgentLog(limit = 100): AgentLogEntry[] {
  return agentLog.slice(-limit);
}

export function getAgentStats(): Record<string, {
  runs: number;
  successes: number;
  failures: number;
  avgMs: number;
  successRate: number;
}> {
  const out: Record<string, any> = {};
  for (const [name, stats] of Object.entries(agentStats)) {
    out[name] = {
      runs: stats.runs,
      successes: stats.successes,
      failures: stats.failures,
      avgMs: stats.runs > 0 ? Math.round(stats.totalMs / stats.runs) : 0,
      successRate: stats.runs > 0 ? Math.round((stats.successes / stats.runs) * 100) : 0,
    };
  }
  return out;
}

export function resetAgentStats() {
  agentLog.length = 0;
  for (const key of Object.keys(agentStats)) delete agentStats[key];
}
