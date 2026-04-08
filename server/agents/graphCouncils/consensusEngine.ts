import type { AgentOutput, ConsensusResult } from "./types";
import { clamp, dedupeStrings, mergeStringArrays, urgencyFromRisk } from "./utils";

export class GraphConsensusEngine {
  compute(outputs: AgentOutput[]): ConsensusResult {
    const weights = outputs.map(o => o.confidence || 0.01);
    const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;

    const weightedRisk =
      outputs.reduce((sum, o) => sum + Number(o.result.risk ?? 0) * o.confidence, 0) / totalWeight;

    const confidences = outputs.map(o => o.confidence);
    const maxConf = confidences.length > 0 ? Math.max(...confidences) : 0;
    const minConf = confidences.length > 0 ? Math.min(...confidences) : 0;
    const disagreement = clamp((maxConf - minConf) + this.actionDisagreement(outputs));

    const allFlags = dedupeStrings(outputs.flatMap(o => o.flags || []));
    const recommendedTests = mergeStringArrays(outputs, "recommendedTests");

    const recommendations = outputs
      .map(o => typeof o.result.recommendation === "string" ? o.result.recommendation : undefined)
      .filter(Boolean) as string[];

    const recommendation = recommendations.sort((a, b) => {
      const aw = outputs.find(o => o.result.recommendation === a)?.confidence || 0;
      const bw = outputs.find(o => o.result.recommendation === b)?.confidence || 0;
      return bw - aw;
    })[0];

    return {
      risk: clamp(weightedRisk),
      urgency: urgencyFromRisk(weightedRisk),
      confidence: clamp(totalWeight / Math.max(1, outputs.length)),
      disagreement,
      recommendation,
      recommendedTests,
      flags: allFlags,
    };
  }

  private actionDisagreement(outputs: AgentOutput[]): number {
    const actions = outputs
      .map(o => typeof o.result.recommendation === "string" ? o.result.recommendation : "")
      .filter(Boolean);

    return actions.length > 1 && new Set(actions).size > 1 ? 0.15 : 0;
  }
}

export const graphConsensusEngine = new GraphConsensusEngine();
