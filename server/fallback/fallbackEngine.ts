import type { ClinicalInput, ClinicalFlowResult } from "../orchestrator/clinicalOrchestrator";
import { emitEvent } from "../controlTower/eventBus";

export interface FallbackResult extends ClinicalFlowResult {
  fallback: true;
}

const SAFE_MESSAGES: Record<string, string> = {
  chest_pain: "You reported chest pain. Please seek immediate emergency care or call 911 if symptoms worsen.",
  difficulty_breathing: "You reported breathing difficulty. Please seek immediate emergency care or call 911.",
  high_fever: "You reported a high fever. Please contact a physician promptly or visit an urgent care center.",
  default:
    "We are temporarily unable to process your request due to a technical issue. If your symptoms are severe or worsening, please seek care immediately. Otherwise, please try again shortly.",
};

function selectSafeMessage(complaint: string): string {
  const lower = complaint.toLowerCase();
  if (lower.includes("chest") || lower.includes("heart")) return SAFE_MESSAGES.chest_pain;
  if (lower.includes("breath") || lower.includes("oxygen") || lower.includes("wheez")) return SAFE_MESSAGES.difficulty_breathing;
  if (lower.includes("fever") || lower.includes("temperature")) return SAFE_MESSAGES.high_fever;
  return SAFE_MESSAGES.default;
}

export function safeFallbackResponse(input: ClinicalInput, originalError?: string): FallbackResult {
  emitEvent({
    type: "ALERT",
    payload: {
      message: `Fallback response triggered for complaint: "${input.complaint}"${originalError ? ` — cause: ${originalError}` : ""}`,
      severity: "HIGH",
      source: "fallbackEngine",
      patientId: input.patientId,
    },
    timestamp: Date.now(),
  });

  console.error(`[FallbackEngine] Degraded response triggered — complaint: "${input.complaint}", error: ${originalError ?? "unknown"}`);

  return {
    success: true,
    fallback: true,
    patientId: input.patientId,
    complaint: input.complaint,
    blocked: false,
    learningTriggered: false,
    latencyMs: 0,
    timestamp: new Date().toISOString(),
    error: undefined,
    safetyGate: {
      allowed: false,
      level: "HIGH",
      reasons: ["System degraded — fallback response issued"],
    },
    explanation: {
      summary: selectSafeMessage(input.complaint),
      reasoning: ["System is currently experiencing technical difficulties"],
      safetyChecks: ["Manual physician review required — automated triage unavailable"],
      confidenceStatement: "Automated assessment unavailable. Seek care if symptoms worsen.",
      differentialSummary: [],
      engineTransparency: ["Fallback mode active"],
    },
  };
}
