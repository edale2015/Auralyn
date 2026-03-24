import { getAgents, deregisterAgent } from "./agentRegistry";
import { sendPhysicianAlert } from "../alerts/physicianAlertService";

export type AuditFinding = {
  agent: string;
  issue: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  at: string;
};

const findingLog: AuditFinding[] = [];
const STALE_MS = 60_000;
const DEAD_MS = 5 * 60_000;
const GRACE_MS = 30_000;

export async function auditAgents(): Promise<AuditFinding[]> {
  const agents = getAgents();
  const now = Date.now();
  const findings: AuditFinding[] = [];

  for (const a of agents) {
    const lastSeen = new Date(a.lastSeenAt).getTime();
    const registeredAt = new Date(a.registeredAt).getTime();
    const ageMs = now - registeredAt;
    const staleMs = now - lastSeen;

    if (staleMs > DEAD_MS) {
      deregisterAgent(a.id);
      console.warn(`[Governance] Purged dead agent ${a.id} (silent for ${Math.round(staleMs / 60000)}m)`);
      continue;
    }

    if (ageMs < GRACE_MS) continue;

    const stale = staleMs > STALE_MS;

    if (!a.lastAction || stale) {
      findings.push({
        agent: a.id,
        issue: stale ? "STALE_AGENT" : "NO_ACTIVITY",
        severity: stale ? "HIGH" : "MEDIUM",
        at: new Date().toISOString(),
      });
    }

    if (a.health === "critical") {
      findings.push({
        agent: a.id,
        issue: "CRITICAL_HEALTH",
        severity: "CRITICAL",
        at: new Date().toISOString(),
      });
    }

    if (a.health === "warning") {
      findings.push({
        agent: a.id,
        issue: "DEGRADED_HEALTH",
        severity: "MEDIUM",
        at: new Date().toISOString(),
      });
    }
  }

  findingLog.push(...findings);
  if (findingLog.length > 200) findingLog.splice(0, findingLog.length - 200);

  return findings;
}

export async function enforceGovernance(findings: AuditFinding[]): Promise<void> {
  for (const f of findings) {
    if (f.severity === "CRITICAL" || f.severity === "HIGH") {
      console.error(`[Governance] ${f.severity} finding — agent=${f.agent} issue=${f.issue}`);
      await sendPhysicianAlert({
        caseId: "system",
        priority: f.severity === "CRITICAL" ? "CRITICAL" : "HIGH",
        reason: `Agent governance: ${f.agent} — ${f.issue}`,
      }).catch(() => {});
    } else {
      console.warn(`[Governance] ${f.severity} finding — agent=${f.agent} issue=${f.issue}`);
    }
  }
}

let _loop: ReturnType<typeof setInterval> | null = null;

export function startGovernanceLoop(intervalMs = 15_000): void {
  if (_loop) return;
  _loop = setInterval(async () => {
    const findings = await auditAgents();
    if (findings.length) await enforceGovernance(findings);
  }, intervalMs);
  console.log(`[Governance] Audit loop started (interval=${intervalMs}ms)`);
}

export function stopGovernanceLoop(): void {
  if (_loop) { clearInterval(_loop); _loop = null; }
}

export function getAuditLog(): AuditFinding[] {
  return findingLog.slice(-100);
}
