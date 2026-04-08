import type { AgentOutput, DebateMessage } from "./types";

export class GraphDebateEngine {
  generateCritiques(outputs: AgentOutput[]): DebateMessage[] {
    const messages: DebateMessage[] = [];

    for (const a of outputs) {
      for (const b of outputs) {
        if (a.agent === b.agent) continue;

        const riskA = Number(a.result.risk ?? 0);
        const riskB = Number(b.result.risk ?? 0);
        const confidenceDiff = Math.abs(a.confidence - b.confidence);
        const riskDiff = Math.abs(riskA - riskB);

        if (confidenceDiff > 0.35) {
          messages.push({
            from: a.agent,
            to: b.agent,
            critique: `Confidence mismatch ${a.confidence.toFixed(2)} vs ${b.confidence.toFixed(2)}`,
            scoreAdjustment: -0.05,
          });
        }

        if (riskDiff > 0.4) {
          messages.push({
            from: a.agent,
            to: b.agent,
            critique: `Risk mismatch ${riskA.toFixed(2)} vs ${riskB.toFixed(2)}`,
            scoreAdjustment: -0.08,
          });
        }

        const flagsA = new Set(a.flags || []);
        if (flagsA.has("critical") && riskB < 0.4) {
          messages.push({
            from: a.agent,
            to: b.agent,
            critique: `Critical flag conflicts with low risk estimate`,
            scoreAdjustment: -0.1,
          });
        }

        if (a.agent.includes("safety") && !(b.flags || []).includes("safe-plan")) {
          messages.push({
            from: a.agent,
            to: b.agent,
            critique: `Safety review requests more explicit safeguards`,
            scoreAdjustment: -0.04,
          });
        }
      }
    }

    return messages;
  }

  apply(messages: DebateMessage[], outputs: AgentOutput[]): AgentOutput[] {
    const byAgent = new Map(outputs.map(o => [o.agent, { ...o, result: { ...o.result }, flags: [...(o.flags || [])] }]));

    for (const m of messages) {
      const target = byAgent.get(m.to);
      if (!target) continue;
      target.confidence = Math.max(0, Math.min(1, target.confidence + m.scoreAdjustment));
      target.flags = [...new Set([...(target.flags || []), "debated"])];
    }

    return [...byAgent.values()];
  }
}

export const graphDebateEngine = new GraphDebateEngine();
