/**
 * Run Full Triage Command — one-click full clinical pipeline
 * Gather → Skills → Agents → Hooks → Interventions → Co-Pilot Cards
 */

import { runAgentLoop, type AgentLoopInput } from "../engine/agentLoop";
import { broadcastPatientUpdate }            from "../realtime/patientStream";
import { logEvent }                          from "../ops/auditEvents";

export interface FullTriageResult {
  patient:       AgentLoopInput;
  loop:          Awaited<ReturnType<typeof runAgentLoop>>;
  summary: {
    disposition:   string;
    urgency?:      string;
    sepsisFlag:    boolean;
    pendingCards:  number;
    hooks:         string[];
  };
  timestamp: string;
}

export async function runFullTriage(patient: AgentLoopInput): Promise<FullTriageResult> {
  const loop = await runAgentLoop(patient);

  const result: FullTriageResult = {
    patient,
    loop,
    summary: {
      disposition:  loop.finalDecision.disposition as string,
      urgency:      loop.agentCouncil.topDecision?.urgency ?? undefined,
      sepsisFlag:   loop.sepsisRisk.highRisk,
      pendingCards: loop.copilotCards.filter((c) => c.status === "pending").length,
      hooks:        loop.finalDecision.appliedHooks,
    },
    timestamp: new Date().toISOString(),
  };

  // Broadcast to all dashboards
  broadcastPatientUpdate({ type: "TRIAGE_COMPLETE", payload: result });

  // Audit log
  logEvent({
    actor:      "full_triage_command",
    action:     "triage:complete",
    entityType: "patient",
    entityId:   patient.id,
    details:    { disposition: result.summary.disposition, sepsisFlag: result.summary.sepsisFlag, durationMs: loop.durationMs },
  });

  return result;
}
