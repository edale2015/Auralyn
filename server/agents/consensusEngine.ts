/**
 * consensusEngine.ts
 * Weighted consensus aggregator for multi-agent clinical reasoning.
 *
 * Each agent contributes its result weighted by its post-debate confidence score.
 * Disagreement is measured as the spread between max and min confidence.
 *
 * High disagreement (> 0.5) → triggers physician review regardless of risk score.
 * Weighted risk score → used for disposition in the absence of disagreement.
 *
 * The consensus engine runs AFTER the debate round has adjusted confidences.
 */

import type { AgentOutput } from "./debateEngine";

export interface ConsensusResult {
  weightedRisk:   number;
  disagreement:   number;
  avgConfidence:  number;
  dominantAgent:  string;
  highDisagreement: boolean;
}

export class ConsensusEngine {

  compute(outputs: AgentOutput[]): ConsensusResult {
    if (!outputs.length) {
      return {
        weightedRisk:     0,
        disagreement:     0,
        avgConfidence:    0,
        dominantAgent:    "none",
        highDisagreement: false,
      };
    }

    const totalWeight = outputs.reduce((sum, o) => sum + o.confidence, 0) || 1;

    const weightedRisk = outputs.reduce((sum, o) => {
      const r =
        o.result?.risk              ??
        o.result?.riskScore         ??
        (o.result?.riskLevel === "high"     ? 0.85 :
         o.result?.riskLevel === "moderate" ? 0.55 :
         o.result?.riskLevel === "low"      ? 0.2  : 0);
      return sum + r * o.confidence;
    }, 0) / totalWeight;

    const confidences   = outputs.map((o) => o.confidence);
    const maxConf       = Math.max(...confidences);
    const minConf       = Math.min(...confidences);
    const disagreement  = maxConf - minConf;
    const avgConfidence = totalWeight / outputs.length;

    const dominantAgent = outputs.reduce((best, o) =>
      o.confidence > best.confidence ? o : best,
    outputs[0]).agent;

    return {
      weightedRisk,
      disagreement,
      avgConfidence,
      dominantAgent,
      highDisagreement: disagreement > 0.5,
    };
  }
}

export const consensusEngine = new ConsensusEngine();
