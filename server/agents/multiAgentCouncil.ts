/**
 * multiAgentCouncil.ts
 * Full multi-agent council with debate → consensus → final decision.
 *
 * Runs five specialist agents in parallel, applies one debate round
 * to adjust confidence scores, then computes weighted consensus.
 *
 * This is the base council used by hierarchicalCouncil.ts as one of
 * its specialist inputs when no specific specialty is activated.
 */

import { debateEngine }    from "./debateEngine";
import { consensusEngine } from "./consensusEngine";
import type { AgentOutput } from "./debateEngine";

export interface CouncilInput {
  patient:    any;
  features?:  number[];
  sequence?:  number[][];
}

export interface CouncilOutput {
  consensus:      ReturnType<typeof consensusEngine.compute>;
  agents:         AgentOutput[];
  debate:         any[];
  finalDecision:  {
    action:    string;
    urgency?:  string;
    reason?:   string;
  };
}

async function diagnosticAgent(input: CouncilInput): Promise<AgentOutput> {
  const symptoms    = (input.patient?.normalizedSymptoms ?? []).join(" ");
  const differentials = input.patient?.differentials ?? [];

  const topProb  = differentials[0]?.posteriorProbability ??
                   differentials[0]?.score ?? 0;
  const confidence = Math.min(0.95, topProb > 0 ? topProb : 0.3);

  return {
    agent:      "diagnostic",
    confidence,
    result:     { differentials, topProbability: topProb },
    reasoning:  `Bayesian differential analysis (top diff: ${topProb.toFixed(2)})`,
  };
}

async function riskAgent(input: CouncilInput): Promise<AgentOutput> {
  const risk     = input.patient?.risk;
  const riskScore = typeof risk?.riskScore === "number"
    ? risk.riskScore
    : (risk?.riskLevel === "high" ? 0.85 : risk?.riskLevel === "moderate" ? 0.55 : 0.2);

  return {
    agent:      "risk",
    confidence: Math.min(0.95, riskScore),
    result:     { risk: riskScore, riskLevel: risk?.riskLevel ?? "unknown" },
    reasoning:  `Risk stratification: score=${riskScore.toFixed(2)}`,
  };
}

async function treatmentAgent(input: CouncilInput): Promise<AgentOutput> {
  const treatments    = input.patient?.treatments ?? [];
  const hasActions    = treatments.length > 0;
  const confidence    = hasActions ? 0.7 : 0.2;

  return {
    agent:      "treatment",
    confidence,
    result:     { recommendations: treatments },
    reasoning:  hasActions
      ? `${treatments.length} treatment recommendation(s) available`
      : "No treatment recommendations generated",
  };
}

async function safetyAgent(input: CouncilInput): Promise<AgentOutput> {
  const redFlags     = input.patient?.redFlags ?? [];
  const governance   = input.patient?.governance;
  const hasAlerts    = redFlags.length > 0 || governance?.supervisorDecision === "ER_NOW";

  const confidence   = hasAlerts ? 0.95 : 0.1;

  return {
    agent:      "safety",
    confidence,
    result:     { alerts: redFlags, governanceDecision: governance?.supervisorDecision },
    reasoning:  hasAlerts
      ? `Safety flags: ${redFlags.slice(0, 3).join(", ")}`
      : "No active safety flags",
  };
}

async function memoryAgent(input: CouncilInput): Promise<AgentOutput> {
  const similar    = input.patient?.memoryCases ?? [];
  const confidence = similar.length > 0 ? 0.6 + similar[0]?.score * 0.3 : 0.1;

  return {
    agent:      "memory",
    confidence: Math.min(0.9, confidence),
    result:     { similarCases: similar },
    reasoning:  `${similar.length} similar historical case(s) found`,
  };
}

export class MultiAgentCouncil {

  async run(input: CouncilInput): Promise<CouncilOutput> {
    let outputs = await Promise.all([
      diagnosticAgent(input),
      riskAgent(input),
      treatmentAgent(input),
      safetyAgent(input),
      memoryAgent(input),
    ]);

    const critiques = debateEngine.generateCritiques(outputs);
    outputs         = debateEngine.apply(critiques, outputs);
    const consensus = consensusEngine.compute(outputs);

    return {
      consensus,
      agents:        outputs,
      debate:        critiques,
      finalDecision: this.finalize(consensus, outputs),
    };
  }

  private finalize(
    consensus: ReturnType<typeof consensusEngine.compute>,
    outputs:   AgentOutput[],
  ): CouncilOutput["finalDecision"] {
    const treatment = outputs.find((o) => o.agent === "treatment")?.result;

    if (consensus.highDisagreement) {
      return { action: "physician_review", reason: "high_agent_disagreement" };
    }

    if (consensus.weightedRisk >= 0.8) {
      return { action: "emergent_care", urgency: "emergent", reason: "high_composite_risk" };
    }

    if (consensus.weightedRisk >= 0.5) {
      return { action: "urgent_care", urgency: "urgent", reason: "moderate_composite_risk" };
    }

    return { action: "outpatient", urgency: "routine" };
  }
}

export const multiAgentCouncil = new MultiAgentCouncil();
