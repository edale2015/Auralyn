import { evaluateAgents } from "./agentGovernor";
import { updateRLHFWeights, getRLHFState } from "../warroom/warRoomEngine";
import { getClaimOutcomeStats } from "../billing/claimOutcomeLearning";

let loopActive = false;
let iterationCount = 0;

export function startGovernorLoop(intervalMs = 30000): void {
  if (loopActive) return;
  loopActive = true;

  console.log(`[Governor] Autonomous agent governor loop started (interval: ${intervalMs}ms)`);

  setInterval(async () => {
    iterationCount++;
    try {
      const statuses = await evaluateAgents();
      const failing = statuses.filter(s => s.health === "failing");
      const degraded = statuses.filter(s => s.health === "degraded");

      if (failing.length > 0) {
        console.log(`[Governor] ⚠️ Iteration ${iterationCount}: ${failing.length} agents FAILING:`, failing.map(a => a.agent).join(", "));
      } else if (degraded.length > 0) {
        console.log(`[Governor] 🟡 Iteration ${iterationCount}: ${degraded.length} agents degraded — monitoring`);
      } else if (iterationCount % 10 === 0) {
        console.log(`[Governor] ✅ Iteration ${iterationCount}: All agents healthy`);
      }

      runRLHFUpdate();

    } catch (e: any) {
      console.error(`[Governor] Loop error on iteration ${iterationCount}:`, e?.message);
    }
  }, intervalMs);
}

function runRLHFUpdate(): void {
  try {
    const stats = getClaimOutcomeStats();
    const current = getRLHFState();

    const paidRate = stats.paidRate || 0.85;
    const accuracy = paidRate;
    const escalationRate = stats.denialRate || 0.09;
    const avgOutcome = paidRate;

    const newDiagnosisWeight = Math.max(0.5, Math.min(2.0, current.diagnosisWeight * (1 + (accuracy - 0.85) * 0.05)));
    const newEscalationPenalty = Math.max(0.5, Math.min(2.0, current.escalationPenalty * (1 + (escalationRate - 0.15) * 0.04)));
    const newOutcomeWeight = Math.max(0.5, Math.min(2.0, current.outcomeWeight * (1 + (avgOutcome - 0.80) * 0.04)));

    updateRLHFWeights({
      diagnosisWeight: Math.round(newDiagnosisWeight * 1000) / 1000,
      escalationPenalty: Math.round(newEscalationPenalty * 1000) / 1000,
      outcomeWeight: Math.round(newOutcomeWeight * 1000) / 1000,
      totalAdjustments: current.totalAdjustments + 1,
    });
  } catch (_e) {}
}

export function getGovernorStatus() {
  return {
    active: loopActive,
    iterationCount,
    startedAt: loopActive ? new Date(Date.now() - iterationCount * 30000).toISOString() : null,
  };
}
