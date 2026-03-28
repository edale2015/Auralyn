import { proposeEvolution, getLastProposal } from "./evolutionEngine";
import { runSandbox, getLastSandboxResult } from "./sandboxRunner";
import { validateEvolution } from "./evolutionValidator";
import { promote, getPromotionHistory } from "./promotionEngine";
import { getEvolutionStats } from "./evolutionStore";

let loopTimer: ReturnType<typeof setInterval> | null = null;
let cycleCount = 0;
let lastCycleAt: string | null = null;

export async function runEvolutionCycle(): Promise<{
  proposed: boolean;
  approved?: boolean;
  agent?: string;
  reason?: string;
}> {
  cycleCount++;
  lastCycleAt = new Date().toISOString();

  const proposal = proposeEvolution();
  if (!proposal) {
    return { proposed: false };
  }

  console.log(`[EvolutionEngine] 🧬 Proposed: ${proposal.agent} → ${proposal.change}`);

  const sandbox = await runSandbox(proposal.newConfig);
  const lastResult = getLastSandboxResult();

  const current = lastResult
    ? { passRate: lastResult.passRate * 0.95, safetyAccuracy: lastResult.safetyAccuracy, avgLatencyMs: lastResult.avgLatencyMs }
    : { passRate: 0, safetyAccuracy: 0.5, avgLatencyMs: 9999 };

  const verdict = validateEvolution(current, sandbox);
  const version = promote(proposal, sandbox, verdict);

  return {
    proposed: true,
    approved: verdict.approved,
    agent:    proposal.agent,
    reason:   verdict.reason,
  };
}

export function startEvolutionLoop(intervalMs = 600_000) {
  if (loopTimer) return;
  loopTimer = setInterval(() => { runEvolutionCycle().catch(() => {}); }, intervalMs);
  console.log(`[EvolutionEngine] Loop started (every ${intervalMs / 60_000}min)`);
}

export function stopEvolutionLoop() {
  if (loopTimer) { clearInterval(loopTimer); loopTimer = null; }
}

export function getEvolutionStatus() {
  return {
    cycleCount,
    lastCycleAt,
    lastProposal:      getLastProposal(),
    lastSandboxResult: getLastSandboxResult(),
    promotionHistory:  getPromotionHistory(10),
    stats:             getEvolutionStats(),
  };
}
