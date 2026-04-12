/**
 * FSM Inter-Agent Communication Protocol
 *
 * Article: "Each agent has four states — IDLE, REQUESTING, WAITING, RESPONDING —
 *  and one strict rule: no agent transitions to REQUESTING while already in WAITING.
 *  This single rule eliminates the entire class of coordination deadlocks."
 *
 * Clinical translation:
 *   When cardiologyAgent and sepsisAgent simultaneously try to report findings
 *   to the clinical orchestrator, this FSM ensures they queue correctly —
 *   the orchestrator never receives two overlapping responses with no sequencing.
 *
 *   States:
 *     IDLE        — ready to send or receive
 *     REQUESTING  — sending a message, waiting for delivery confirmation
 *     WAITING     — awaiting response to a sent message (BLOCKS further sends)
 *     RESPONDING  — processing a received message, generating reply
 */

import { randomUUID } from "crypto";

// ── State Machine ─────────────────────────────────────────────────────────────

export const AgentState = {
  IDLE:       "idle",
  REQUESTING: "requesting",
  WAITING:    "waiting",
  RESPONDING: "responding",
} as const;

export type AgentStateValue = typeof AgentState[keyof typeof AgentState];

export interface AgentMessage {
  id:        string;
  from:      string;
  to:        string;
  body:      string;
  timestamp: string;
  replyTo?:  string;    // message ID being replied to
}

export interface ProtocolAgent {
  id:       string;
  name:     string;
  state:    AgentStateValue;
  inbox:    AgentMessage[];
}

// ── Registry ──────────────────────────────────────────────────────────────────

const _agents   = new Map<string, ProtocolAgent>();
const _stateLog: { agentId: string; from: AgentStateValue; to: AgentStateValue; timestamp: string }[] = [];

function _transition(agent: ProtocolAgent, to: AgentStateValue): void {
  _stateLog.push({ agentId: agent.id, from: agent.state, to, timestamp: new Date().toISOString() });
  agent.state = to;
}

export function registerAgent(name: string, id = randomUUID().slice(0, 8)): ProtocolAgent {
  const agent: ProtocolAgent = { id, name, state: AgentState.IDLE, inbox: [] };
  _agents.set(id, agent);
  return agent;
}

export function getAgent(idOrName: string): ProtocolAgent | null {
  return _agents.get(idOrName) ??
    [..._agents.values()].find((a) => a.name === idOrName) ??
    null;
}

export function listAgents(): ProtocolAgent[] {
  return [..._agents.values()];
}

// ── Protocol operations ───────────────────────────────────────────────────────

/**
 * Send a message from one agent to another.
 * Enforces the FSM rule: cannot send while WAITING.
 */
export function protocolSend(
  fromId: string,
  toId:   string,
  body:   string,
  replyTo?: string
): { ok: boolean; message?: AgentMessage; error?: string } {
  const sender    = getAgent(fromId);
  const recipient = getAgent(toId);

  if (!sender)    return { ok: false, error: `Sender agent "${fromId}" not registered` };
  if (!recipient) return { ok: false, error: `Recipient agent "${toId}" not registered` };

  // FSM rule: cannot send while waiting for a response
  if (sender.state === AgentState.WAITING) {
    return { ok: false, error: `Agent "${sender.name}" cannot send while in WAITING state — deadlock prevention` };
  }

  _transition(sender, AgentState.REQUESTING);

  const msg: AgentMessage = {
    id:        randomUUID().slice(0, 8),
    from:      fromId,
    to:        toId,
    body,
    timestamp: new Date().toISOString(),
    replyTo,
  };

  recipient.inbox.push(msg);
  _transition(sender, AgentState.WAITING);

  return { ok: true, message: msg };
}

/**
 * Receive and process the next message in an agent's inbox.
 * Sets agent to RESPONDING while processing, returns to IDLE after.
 */
export function protocolReceive(agentId: string): AgentMessage | null {
  const agent = getAgent(agentId);
  if (!agent || agent.inbox.length === 0) return null;

  const msg = agent.inbox.shift()!;
  _transition(agent, AgentState.RESPONDING);
  return msg;
}

/**
 * Mark processing complete — agent returns to IDLE.
 * Call this after finishing a protocolReceive.
 */
export function protocolComplete(agentId: string): void {
  const agent = getAgent(agentId);
  if (!agent) return;
  _transition(agent, AgentState.IDLE);
}

/**
 * Mark a waiting agent as unblocked — its response arrived.
 * Call this when an expected reply lands.
 */
export function protocolUnblock(agentId: string): void {
  const agent = getAgent(agentId);
  if (!agent) return;
  if (agent.state === AgentState.WAITING) _transition(agent, AgentState.IDLE);
}

// ── Observability ─────────────────────────────────────────────────────────────

export function getStateLog(): typeof _stateLog {
  return [..._stateLog];
}

export function getAgentState(idOrName: string): AgentStateValue | null {
  return getAgent(idOrName)?.state ?? null;
}

/** Return a readable FSM trace for audit */
export function formatStateLog(limit = 20): string {
  const recent = _stateLog.slice(-limit);
  return recent
    .map((e) => `[${e.timestamp.slice(11, 23)}] ${e.agentId} ${e.from} → ${e.to}`)
    .join("\n");
}
