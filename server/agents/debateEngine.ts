/**
 * debateEngine.ts
 * Multi-agent debate layer — agents critique each other before consensus.
 *
 * The debate engine generates a list of critiques (confidence adjustments)
 * based on pairwise analysis of agent outputs:
 *   - Confidence divergence between agents
 *   - High risk with no actionable treatment
 *   - Safety agent flagging high alerts while others are confident
 *
 * After generating critiques, apply() adjusts agent confidence scores
 * so that disagreement is reflected in the final output.
 *
 * The debate round happens BEFORE the consensus engine computes the
 * final weighted decision.
 */

export interface AgentOutput {
  agent:      string;
  confidence: number;
  result:     any;
  reasoning?: string;
}

export interface DebateMessage {
  from:            string;
  to:              string;
  critique:        string;
  scoreAdjustment: number;
}

export class DebateEngine {

  generateCritiques(outputs: AgentOutput[]): DebateMessage[] {
    const messages: DebateMessage[] = [];
    const agentMap = new Map(outputs.map((o) => [o.agent, o]));

    for (const a of outputs) {
      for (const b of outputs) {
        if (a.agent === b.agent) continue;

        const diff = Math.abs(a.confidence - b.confidence);
        if (diff > 0.3) {
          messages.push({
            from:            a.agent,
            to:              b.agent,
            critique:        `Confidence divergence: ${a.agent} (${a.confidence.toFixed(2)}) vs ${b.agent} (${b.confidence.toFixed(2)})`,
            scoreAdjustment: -0.1,
          });
        }
      }
    }

    const risk      = agentMap.get("risk");
    const treatment = agentMap.get("treatment");
    if (risk && treatment) {
      const riskScore = risk.result?.risk ?? risk.result?.riskLevel === "high" ? 0.8 : 0;
      if (riskScore > 0.7 && !treatment.result?.recommendation && !treatment.result?.recommendations?.length) {
        messages.push({
          from:            "risk",
          to:              "treatment",
          critique:        "High risk score without actionable treatment recommendation",
          scoreAdjustment: -0.2,
        });
      }
    }

    const safety = agentMap.get("safety");
    if (safety && (safety.result?.length > 0 || safety.result?.alerts?.length > 0)) {
      for (const o of outputs) {
        if (o.agent === "safety") continue;
        if (o.confidence > 0.8) {
          messages.push({
            from:            "safety",
            to:              o.agent,
            critique:        "Safety alerts raised — high confidence may be premature",
            scoreAdjustment: -0.15,
          });
        }
      }
    }

    const memory  = agentMap.get("memory");
    const diag    = agentMap.get("diagnostic");
    if (memory && diag) {
      const similarFound = memory.result?.length > 0 || memory.result?.cases?.length > 0;
      if (similarFound && diag.confidence < 0.5) {
        messages.push({
          from:            "memory",
          to:              "diagnostic",
          critique:        "Similar historical cases found — diagnostic confidence may be underestimated",
          scoreAdjustment: +0.1,
        });
      }
    }

    return messages;
  }

  apply(messages: DebateMessage[], outputs: AgentOutput[]): AgentOutput[] {
    const adjusted = outputs.map((o) => ({ ...o }));

    for (const m of messages) {
      const target = adjusted.find((a) => a.agent === m.to);
      if (!target) continue;
      target.confidence = Math.max(0, Math.min(1, target.confidence + m.scoreAdjustment));
    }

    return adjusted;
  }
}

export const debateEngine = new DebateEngine();
