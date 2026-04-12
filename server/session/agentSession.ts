/**
 * Clinical Agent Session Persistence — Save, Resume, Fork
 *
 * Article: "A session that cannot be resumed is a session that cannot be trusted
 *  with long tasks. If the model is 30 minutes into a complex refactor and the
 *  terminal closes, everything is lost."
 *
 * Clinical translation:
 *   A physician ordering a complex diagnostic pipeline should not lose 15 minutes
 *   of triage work if the orchestrator crashes. Sessions save after every step.
 *   Fork enables: "show me what this patient's care path looks like if we assume
 *   sepsis vs. if we assume UTI" — two independent reasoning branches.
 *
 * Storage: in-memory Map (Redis-upgradeable using getRedisAsync() pattern).
 */

import { randomUUID } from "crypto";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SessionMessage {
  role:    "user" | "assistant" | "tool_result";
  content: string | Record<string, any>[];
  ts:      string;
}

export interface AgentSessionMeta {
  id:          string;
  title:       string;
  patientId?:  string;
  forkedFrom?: string;       // session ID this was forked from
  createdAt:   string;
  updatedAt:   string;
  messageCount: number;
  tags:        string[];
}

export interface AgentSession extends AgentSessionMeta {
  messages:   SessionMessage[];
  context:    Record<string, any>;   // arbitrary key-value clinical state
}

// ── Store ─────────────────────────────────────────────────────────────────────

const _sessions = new Map<string, AgentSession>();

function _now(): string { return new Date().toISOString(); }
function _shortId(): string { return randomUUID().slice(0, 8); }

// ── CRUD ──────────────────────────────────────────────────────────────────────

/** Create a new empty session */
export function newSession(title: string, patientId?: string, tags: string[] = []): AgentSession {
  const session: AgentSession = {
    id:           _shortId(),
    title,
    patientId,
    createdAt:    _now(),
    updatedAt:    _now(),
    messageCount: 0,
    tags,
    messages:     [],
    context:      {},
  };
  _sessions.set(session.id, session);
  return session;
}

/** Persist the current state of a session (called after every step) */
export function saveSession(session: AgentSession): void {
  session.updatedAt    = _now();
  session.messageCount = session.messages.length;
  _sessions.set(session.id, { ...session, messages: [...session.messages] });
}

/** Load a session by ID */
export function loadSession(sessionId: string): AgentSession | null {
  const s = _sessions.get(sessionId);
  return s ? { ...s, messages: [...s.messages], context: { ...s.context } } : null;
}

/** List all sessions, most recently updated first */
export function listSessions(patientId?: string): AgentSessionMeta[] {
  const all = [..._sessions.values()];
  const filtered = patientId ? all.filter((s) => s.patientId === patientId) : all;
  return filtered
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(({ messages: _, context: __, ...meta }) => meta);
}

/**
 * Fork a session — creates an independent copy starting from the same message
 * history. Changes to the fork do not affect the original.
 *
 * Use case: "What if we treat this as sepsis rather than UTI?"
 */
export function forkSession(sourceId: string, title?: string): AgentSession | null {
  const source = loadSession(sourceId);
  if (!source) return null;

  const fork: AgentSession = {
    ...source,
    id:         _shortId(),
    title:      title ?? `Fork of: ${source.title}`,
    forkedFrom: sourceId,
    createdAt:  _now(),
    updatedAt:  _now(),
    messages:   [...source.messages],
    context:    { ...source.context },
  };
  _sessions.set(fork.id, fork);
  return fork;
}

/** Delete a session */
export function deleteSession(sessionId: string): boolean {
  return _sessions.delete(sessionId);
}

// ── Append helpers ────────────────────────────────────────────────────────────

/** Append a message to the session's history */
export function appendMessage(
  session: AgentSession,
  role:    SessionMessage["role"],
  content: SessionMessage["content"]
): void {
  session.messages.push({ role, content, ts: _now() });
  session.messageCount = session.messages.length;
}

/** Merge key-value pairs into the session's clinical context */
export function mergeContext(session: AgentSession, data: Record<string, any>): void {
  Object.assign(session.context, data);
}

// ── Compression-aware summary ──────────────────────────────────────────────────

/**
 * Return a compact summary of the session suitable for re-injection
 * into a new context window (mirrors the article's .agent_memory.md pattern).
 */
export function sessionSummary(session: AgentSession): string {
  const lines = [
    `Session: ${session.id} — ${session.title}`,
    `Patient: ${session.patientId ?? "unknown"}`,
    `Messages: ${session.messageCount}`,
    `Context keys: ${Object.keys(session.context).join(", ") || "none"}`,
    `Created: ${session.createdAt}  Updated: ${session.updatedAt}`,
  ];
  if (session.forkedFrom) lines.push(`Forked from: ${session.forkedFrom}`);
  return lines.join("\n");
}
