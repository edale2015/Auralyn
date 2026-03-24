import type { ChannelName } from "./types";

export type ChatSessionState = "awaiting_consent" | "intake_ready" | "collecting" | "physician_review";

export interface ChatSession {
  sessionId: string;
  channel: ChannelName;
  externalUserId: string;
  createdAt: number;
  updatedAt: number;
  state: ChatSessionState;
  complaint?: string;
  answers: Record<string, any>;
}

const sessions = new Map<string, ChatSession>();

function sessionKey(channel: ChannelName, externalUserId: string): string {
  return `${channel}:${externalUserId}`;
}

export function getOrCreateChatSession(channel: ChannelName, externalUserId: string): ChatSession {
  const k = sessionKey(channel, externalUserId);
  const existing = sessions.get(k);
  if (existing) {
    existing.updatedAt = Date.now();
    return existing;
  }
  const created: ChatSession = {
    sessionId: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    channel,
    externalUserId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    state: "awaiting_consent",
    answers: {},
  };
  sessions.set(k, created);
  return created;
}

export function saveChatSession(session: ChatSession): void {
  session.updatedAt = Date.now();
  sessions.set(sessionKey(session.channel, session.externalUserId), session);
}

export function listChatSessions(): ChatSession[] {
  return [...sessions.values()];
}

export function resetChatSession(channel: ChannelName, externalUserId: string): void {
  const k = sessionKey(channel, externalUserId);
  const s = sessions.get(k);
  if (s) {
    s.state = "awaiting_consent";
    s.answers = {};
    s.complaint = undefined;
    s.updatedAt = Date.now();
    sessions.set(k, s);
  }
}
