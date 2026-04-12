/**
 * Deterministic Replay — re-runs any historical scope decision through the CURRENT scope engine
 * Surfaces when re-run result differs from original (expected when scope rules change).
 * FDA use: "What did the system decide on date X, and what would it decide today?"
 */

import { scopeEngine }       from "../scope/agentScopeEngine";
import { logEvent }          from "../ops/auditEvents";
import type { ScopeDecision } from "../scope/agentScopeEngine";

export interface ReplayEvent {
  id?:       string;
  agent:     string;
  action:    string;
  context:   Record<string, any>;
  result:    Partial<ScopeDecision>;
  timestamp?: string;
}

export interface ReplayComparison {
  eventId?:         string;
  agent:            string;
  action:           string;
  original:         Partial<ScopeDecision>;
  replayed:         ScopeDecision;
  match:            boolean;
  divergenceReason?: string;
  replayedAt:       string;
}

export function rerunDecision(event: ReplayEvent): ReplayComparison {
  const replayed = scopeEngine.evaluate({
    agentRole: event.agent,
    action:    event.action,
    context:   event.context,
  });

  const origAllowed     = event.result.allowed;
  const replayAllowed   = replayed.allowed;
  const match           = origAllowed === replayAllowed;
  const divergenceReason = match ? undefined :
    `Original: allowed=${origAllowed}, Replayed: allowed=${replayAllowed} — scope rules may have changed`;

  const comparison: ReplayComparison = {
    eventId:         event.id,
    agent:           event.agent,
    action:          event.action,
    original:        event.result,
    replayed,
    match,
    divergenceReason,
    replayedAt:      new Date().toISOString(),
  };

  logEvent({
    actor:      "deterministic_replay",
    action:     `replay:${match ? "match" : "diverged"}`,
    entityType: "scope_decision",
    entityId:   event.id ?? `${event.agent}:${event.action}`,
    details:    comparison,
  });

  return comparison;
}

export function replayCaseEvents(events: ReplayEvent[]): { timeline: ReplayComparison[]; diverged: number; matched: number } {
  const timeline = events.map(rerunDecision);
  const diverged = timeline.filter((t) => !t.match).length;
  const matched  = timeline.length - diverged;
  return { timeline, diverged, matched };
}
