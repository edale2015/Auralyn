import { saveVersion, getLatestVersion, type AgentVersion } from "./evolutionStore";
import { dispatchAlert } from "../alerting/alertDispatcher";
import type { SandboxResult } from "./sandboxRunner";
import type { EvolutionProposal } from "./evolutionEngine";
import type { ValidationVerdict } from "./evolutionValidator";

export interface PromotionRecord {
  agent: string;
  proposal: EvolutionProposal;
  sandbox: SandboxResult;
  verdict: ValidationVerdict;
  promotedAt: string;
}

const promotionHistory: PromotionRecord[] = [];

export function promote(
  proposal: EvolutionProposal,
  sandbox: SandboxResult,
  verdict: ValidationVerdict
): AgentVersion {
  const version: AgentVersion = {
    agent:     proposal.agent,
    version:   Date.now(),
    config:    proposal.newConfig,
    metrics: {
      passRate:      sandbox.passRate,
      safetyAccuracy: sandbox.safetyAccuracy,
      f1Score:        sandbox.f1Score,
      avgLatencyMs:   sandbox.avgLatencyMs,
    },
    approved:  verdict.approved,
    rejectionReason: verdict.approved ? undefined : verdict.reason,
    timestamp: Date.now(),
  };

  saveVersion(version);

  promotionHistory.push({
    agent:       proposal.agent,
    proposal,
    sandbox,
    verdict,
    promotedAt:  new Date().toISOString(),
  });
  if (promotionHistory.length > 100) promotionHistory.shift();

  if (verdict.approved) {
    console.log(`[EvolutionEngine] 🚀 Promoted ${proposal.agent} v${version.version} — ${verdict.reason}`);
    dispatchAlert({
      level:   "info",
      type:    "EvolutionPromoted",
      message: `${proposal.agent}: ${proposal.change} — ${verdict.reason}`,
    }).catch(() => {});
  } else {
    console.log(`[EvolutionEngine] ❌ Rejected ${proposal.agent} — ${verdict.reason}`);
  }

  return version;
}

export function getPromotionHistory(limit = 20): PromotionRecord[] {
  return promotionHistory.slice(-limit).reverse();
}

export function getAgentCurrentVersion(agent: string) {
  return getLatestVersion(agent);
}
