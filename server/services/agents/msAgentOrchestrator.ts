import { setMemory, getMemory } from "./msAgentMemory";

export interface MsAgentStep {
  agentId: string;
  action: string;
  input: unknown;
  output?: unknown;
  timestamp: string;
}

export interface MsAgentSession {
  sessionId: string;
  steps: MsAgentStep[];
  status: "active" | "completed" | "failed";
  createdAt: string;
}

const sessions = new Map<string, MsAgentSession>();

export function createSession(): MsAgentSession {
  const session: MsAgentSession = {
    sessionId: `ms_session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    steps: [],
    status: "active",
    createdAt: new Date().toISOString(),
  };
  sessions.set(session.sessionId, session);
  return session;
}

export function addStep(sessionId: string, step: Omit<MsAgentStep, "timestamp">): MsAgentSession | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  session.steps.push({ ...step, timestamp: new Date().toISOString() });
  setMemory(`session:${sessionId}:lastStep`, step);
  return session;
}

export function completeSession(sessionId: string): MsAgentSession | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  session.status = "completed";
  return session;
}

export function getSession(sessionId: string): MsAgentSession | undefined { return sessions.get(sessionId); }
export function listSessions(): MsAgentSession[] { return Array.from(sessions.values()).reverse(); }
