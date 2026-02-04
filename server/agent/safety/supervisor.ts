import type { CaseState } from "../../../shared/agentTypes";
import { detectRedFlags } from "./redFlags";

export type SupervisorDecision =
  | { allow: true }
  | { allow: false; reason: string; forceState?: CaseState["routing"]["state"] };

export function supervisorGate(state: CaseState): SupervisorDecision {
  // Always recompute red flags (state may have been mutated async)
  const liveFlags = detectRedFlags(state);
  if (liveFlags.length > 0 || state.redFlags.length > 0) {
    return { allow: false, reason: "Red flags present", forceState: "EMERGENT_ESCALATION" };
  }
  if (!state.disposition) {
    return { allow: false, reason: "No disposition set", forceState: "REVIEW_REQUIRED" };
  }
  return { allow: true };
}
