import type { Agent, AgentContext, AgentOutput } from "./orchestrator";
import { classifyRisk } from "../compliance/riskEngine";
import { publish } from "./eventBus";
import { logAgent } from "./tracking";

const EMERGENCY_PATTERNS = [
  { pattern: /shortness of breath/i, flag: "RF_SOB" },
  { pattern: /chest pain/i, flag: "RF_CHEST_PAIN" },
  { pattern: /crushing/i, flag: "RF_CRUSHING_CHEST" },
  { pattern: /can'?t breathe/i, flag: "RF_RESP_DISTRESS" },
  { pattern: /stridor/i, flag: "RF_STRIDOR" },
  { pattern: /unable to swallow/i, flag: "RF_DROOLING" },
  { pattern: /altered mental/i, flag: "RF_AMS" },
  { pattern: /unresponsive/i, flag: "RF_UNRESPONSIVE" },
  { pattern: /unconscious/i, flag: "RF_UNCONSCIOUS" },
  { pattern: /suicid/i, flag: "RF_SUICIDAL" },
  { pattern: /anaphyla/i, flag: "RF_ANAPHYLAXIS" },
  { pattern: /severe bleed/i, flag: "RF_HEMORRHAGE" },
  { pattern: /seizure.*active/i, flag: "RF_ACTIVE_SEIZURE" },
  { pattern: /stroke/i, flag: "RF_STROKE" },
  { pattern: /sudden weakness/i, flag: "RF_STROKE_SYMPTOMS" },
  { pattern: /face droop/i, flag: "RF_STROKE_SYMPTOMS" },
  { pattern: /slurred speech/i, flag: "RF_STROKE_SYMPTOMS" },
  { pattern: /st elevation/i, flag: "RF_STEMI" },
  { pattern: /kussmaul/i, flag: "RF_DKA" },
  { pattern: /fruity breath/i, flag: "RF_DKA" },
];

const CRITICAL_FLAGS = new Set([
  "RF_UNRESPONSIVE", "RF_UNCONSCIOUS", "RF_ANAPHYLAXIS", "RF_HEMORRHAGE",
  "RF_ACTIVE_SEIZURE", "RF_STEMI", "RF_STROKE", "RF_STROKE_SYMPTOMS",
]);

export const safetyAgent: Agent = {
  name: "safety",
  priority: 5,

  run: async (ctx: AgentContext, priorResults): Promise<AgentOutput> => {
    const start = Date.now();
    const redFlags: string[] = [];

    for (const { pattern, flag } of EMERGENCY_PATTERNS) {
      if (pattern.test(ctx.text)) {
        redFlags.push(flag);
      }
    }

    const uniqueFlags = [...new Set(redFlags)];
    const hasCritical = uniqueFlags.some((f) => CRITICAL_FLAGS.has(f));

    let alert: string | null = null;
    if (hasCritical || uniqueFlags.length >= 3) {
      alert = "ER_NOW";
    } else if (uniqueFlags.length >= 1) {
      alert = "EMERGENCY";
    }

    const triageSeverity = priorResults.triage?.severity;
    let inferredTriage: string | undefined;
    if (alert === "ER_NOW") inferredTriage = "emergency";
    else if (alert === "EMERGENCY") inferredTriage = "ER";
    else if (triageSeverity === "high") inferredTriage = "urgent";

    const riskClassification = classifyRisk({
      triage: inferredTriage,
      confidence: uniqueFlags.length > 0 ? Math.max(0.3, 1 - uniqueFlags.length * 0.1) : undefined,
    });

    const result = {
      alert,
      redFlags: uniqueFlags,
      redFlagCount: uniqueFlags.length,
      riskClassification,
      safetyGate: alert ? "BLOCKED" : "PASS",
    };

    if (alert) {
      publish("safety:alert", { alert, redFlags: uniqueFlags, patientId: ctx.patientId });
    }

    logAgent("safety", { alert, redFlagCount: uniqueFlags.length, riskLevel: riskClassification.level }, Date.now() - start);
    return result;
  },
};
