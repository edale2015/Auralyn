export interface AgentVersion {
  agent: string;
  version: number;
  config: any;
  metrics?: {
    passRate: number;
    safetyAccuracy?: number;
    f1Score?: number;
    avgLatencyMs?: number;
  };
  approved: boolean;
  rejectionReason?: string;
  timestamp: number;
}

const versions: AgentVersion[] = [];
const MAX_VERSIONS = 500;

export function saveVersion(v: AgentVersion) {
  versions.push(v);
  if (versions.length > MAX_VERSIONS) versions.shift();
}

export function getLatestVersion(agent: string): AgentVersion | undefined {
  return versions
    .filter(v => v.agent === agent && v.approved)
    .sort((a, b) => b.version - a.version)[0];
}

export function getAllVersions(agent?: string): AgentVersion[] {
  const list = agent ? versions.filter(v => v.agent === agent) : versions;
  return list.slice().reverse();
}

export function getVersionHistory(limit = 20): AgentVersion[] {
  return versions.slice(-limit).reverse();
}

export function getEvolutionStats() {
  const total     = versions.length;
  const approved  = versions.filter(v => v.approved).length;
  const rejected  = total - approved;
  const byAgent   = versions.reduce((acc, v) => {
    acc[v.agent] = (acc[v.agent] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  return { total, approved, rejected, byAgent };
}
