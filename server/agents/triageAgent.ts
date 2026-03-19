import type { Agent, AgentContext, AgentOutput } from "./orchestrator";
import { computeUrgencyScore } from "../triage/triagePrioritizationEngine";
import { publish } from "./eventBus";
import { logAgent } from "./tracking";

const HIGH_RISK_KEYWORDS = [
  "chest pain", "shortness of breath", "stroke", "seizure", "unconscious",
  "unresponsive", "bleeding heavily", "suicidal", "anaphylaxis", "severe allergic",
  "difficulty breathing", "altered mental status", "crushing chest", "sudden weakness",
];

const MODERATE_KEYWORDS = [
  "fever", "vomiting", "abdominal pain", "head injury", "laceration",
  "dizziness", "fainting", "blood in", "swelling", "persistent cough",
];

function assessSeverity(text: string): { severity: string; urgencyScore: number; matchedKeywords: string[] } {
  const lower = text.toLowerCase();
  const matchedHigh = HIGH_RISK_KEYWORDS.filter((kw) => lower.includes(kw));
  const matchedModerate = MODERATE_KEYWORDS.filter((kw) => lower.includes(kw));

  if (matchedHigh.length > 0) {
    const urgencyScore = computeUrgencyScore({
      caseId: "triage-agent",
      complaint: matchedHigh[0].replace(/\s+/g, "_"),
      disposition: matchedHigh.length >= 2 ? "er_now" : "er_today",
      redFlags: matchedHigh,
      createdAt: new Date().toISOString(),
    });
    return { severity: matchedHigh.length >= 2 ? "critical" : "high", urgencyScore, matchedKeywords: matchedHigh };
  }

  if (matchedModerate.length > 0) {
    const urgencyScore = computeUrgencyScore({
      caseId: "triage-agent",
      complaint: matchedModerate[0].replace(/\s+/g, "_"),
      disposition: "urgent_care",
      createdAt: new Date().toISOString(),
    });
    return { severity: "moderate", urgencyScore, matchedKeywords: matchedModerate };
  }

  return { severity: "low", urgencyScore: 0.15, matchedKeywords: [] };
}

export const triageAgent: Agent = {
  name: "triage",
  priority: 10,

  run: async (ctx: AgentContext): Promise<AgentOutput> => {
    const start = Date.now();
    const { severity, urgencyScore, matchedKeywords } = assessSeverity(ctx.text);

    let disposition = "self_care";
    if (severity === "critical") disposition = "er_now";
    else if (severity === "high") disposition = "er_today";
    else if (severity === "moderate") disposition = "urgent_care";
    else disposition = "telemedicine";

    const result = {
      complaint: ctx.text,
      severity,
      disposition,
      urgencyScore,
      matchedKeywords,
    };

    if (severity === "critical" || severity === "high") {
      publish("triage:high_severity", { severity, disposition, text: ctx.text });
    }

    logAgent("triage", { severity, disposition, urgencyScore }, Date.now() - start);
    return result;
  },
};
