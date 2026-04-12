/**
 * Co-Pilot Decision Layer — converts intervention bundles into physician approval cards
 * Cards with confidence < 0.95 require explicit physician approval before execution.
 * Cards with confidence ≥ 0.95 can be auto-executed within scope.
 */

import { broadcastPatientUpdate } from "../realtime/patientStream";
import type { InterventionBundle } from "./autonomousCopilot";

export interface CopilotCard {
  id:               string;
  patientId:        string;
  recommendation:   string;
  actions:          any[];
  reasoning:        string[];
  confidence:       number;
  requiresApproval: boolean;
  status:           "pending" | "approved" | "rejected" | "auto-executed";
  generatedAt:      string;
}

const cardStore = new Map<string, CopilotCard>();

function cardId(): string {
  return `CP-${Date.now()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

function buildReasoning(bundle: InterventionBundle): string[] {
  const reasons: string[] = [...bundle.evidence];
  if (bundle.confidence >= 0.95) reasons.push("High confidence — auto-execution eligible");
  else                           reasons.push("Confidence below threshold — physician approval required");
  if (bundle.type === "ICU_ESCALATION") reasons.push("Escalation actions always require physician sign-off");
  return reasons;
}

export function buildCopilotCard(patientId: string, bundle: InterventionBundle): CopilotCard {
  const card: CopilotCard = {
    id:               cardId(),
    patientId,
    recommendation:   bundle.type,
    actions:          bundle.actions,
    reasoning:        buildReasoning(bundle),
    confidence:       bundle.confidence,
    requiresApproval: bundle.requiresApproval || bundle.confidence < 0.95,
    status:           bundle.confidence >= 0.95 && !bundle.requiresApproval ? "auto-executed" : "pending",
    generatedAt:      new Date().toISOString(),
  };

  cardStore.set(card.id, card);

  // Broadcast to physician dashboard
  broadcastPatientUpdate({ type: "COPILOT_CARD", payload: card });

  return card;
}

export function buildCopilotCards(patientId: string, bundles: InterventionBundle[]): CopilotCard[] {
  return bundles.map((b) => buildCopilotCard(patientId, b));
}

export function approveCard(cardId: string, physicianId: string): CopilotCard | null {
  const card = cardStore.get(cardId);
  if (!card) return null;
  card.status = "approved";
  broadcastPatientUpdate({ type: "COPILOT_APPROVED", payload: { cardId, physicianId } });
  return card;
}

export function rejectCard(cardId: string, physicianId: string, reason?: string): CopilotCard | null {
  const card = cardStore.get(cardId);
  if (!card) return null;
  card.status = "rejected";
  broadcastPatientUpdate({ type: "COPILOT_REJECTED", payload: { cardId, physicianId, reason } });
  return card;
}

export function getPendingCards(): CopilotCard[]     { return [...cardStore.values()].filter((c) => c.status === "pending"); }
export function getAllCards(): CopilotCard[]          { return [...cardStore.values()]; }
export function getCard(id: string): CopilotCard | undefined { return cardStore.get(id); }
