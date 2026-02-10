import type { Channel } from "./messageEvent";

export interface ConversationState {
  conversationId: string;
  channel: Channel;
  externalUserId: string;
  caseId: string | null;
  encounterId: number | null;
  patientId: number | null;
  routingState: string;
  lastQuestionIdAsked: string | null;
  requiredMissing: string[];
  toneProfile: string;
  lastNMessages: { from: "patient" | "system"; text: string; ts: string }[];
  frictionScore: number;
  frictionEvents: number;
  lastFrictionAt: string | null;
  isStaff: boolean;
  isStopped: boolean;
  stopReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DedupeResult {
  seen: boolean;
}

interface ConversationStateBackend {
  getOrCreate(conversationId: string, channel: Channel, externalUserId: string): Promise<ConversationState>;
  update(conversationId: string, patch: Partial<ConversationState>): Promise<ConversationState>;
  appendMessage(conversationId: string, msg: { from: "patient" | "system"; text: string; ts: string }): Promise<void>;
  recordFriction(conversationId: string, signals: string[]): Promise<ConversationState>;
  checkDedupe(channel: string, messageId: string): Promise<DedupeResult>;
  markSeen(channel: string, messageId: string): Promise<void>;
  getByExternalUser(channel: Channel, externalUserId: string): Promise<ConversationState | null>;
}

const MAX_LAST_MESSAGES = 20;
const DEDUPE_TTL_MS = 300_000;
const MAX_DEDUPE_SIZE = 10_000;

class InMemoryConversationStateStore implements ConversationStateBackend {
  private states = new Map<string, ConversationState>();
  private seenMessages = new Map<string, number>();

  async getOrCreate(conversationId: string, channel: Channel, externalUserId: string): Promise<ConversationState> {
    const existing = this.states.get(conversationId);
    if (existing) return { ...existing };

    const now = new Date().toISOString();
    const state: ConversationState = {
      conversationId,
      channel,
      externalUserId,
      caseId: null,
      encounterId: null,
      patientId: null,
      routingState: "NEW",
      lastQuestionIdAsked: null,
      requiredMissing: [],
      toneProfile: "empathetic",
      lastNMessages: [],
      frictionScore: 0,
      frictionEvents: 0,
      lastFrictionAt: null,
      isStaff: false,
      isStopped: false,
      stopReason: null,
      createdAt: now,
      updatedAt: now,
    };

    this.states.set(conversationId, state);
    return { ...state };
  }

  async update(conversationId: string, patch: Partial<ConversationState>): Promise<ConversationState> {
    const state = this.states.get(conversationId);
    if (!state) throw new Error(`Conversation not found: ${conversationId}`);
    Object.assign(state, patch, { updatedAt: new Date().toISOString() });
    return { ...state };
  }

  async appendMessage(conversationId: string, msg: { from: "patient" | "system"; text: string; ts: string }): Promise<void> {
    const state = this.states.get(conversationId);
    if (!state) return;
    state.lastNMessages.push(msg);
    if (state.lastNMessages.length > MAX_LAST_MESSAGES) {
      state.lastNMessages = state.lastNMessages.slice(-MAX_LAST_MESSAGES);
    }
    state.updatedAt = new Date().toISOString();
  }

  async recordFriction(conversationId: string, signals: string[]): Promise<ConversationState> {
    const state = this.states.get(conversationId);
    if (!state) throw new Error(`Conversation not found: ${conversationId}`);
    state.frictionScore += signals.length;
    state.frictionEvents += 1;
    state.lastFrictionAt = new Date().toISOString();
    state.updatedAt = new Date().toISOString();
    return { ...state };
  }

  async checkDedupe(channel: string, messageId: string): Promise<DedupeResult> {
    const key = `${channel}:${messageId}`;
    const ts = this.seenMessages.get(key);
    if (ts && Date.now() - ts < DEDUPE_TTL_MS) {
      return { seen: true };
    }
    return { seen: false };
  }

  async markSeen(channel: string, messageId: string): Promise<void> {
    const key = `${channel}:${messageId}`;
    this.seenMessages.set(key, Date.now());
    if (this.seenMessages.size > MAX_DEDUPE_SIZE) {
      const cutoff = Date.now() - DEDUPE_TTL_MS;
      for (const [k, t] of this.seenMessages) {
        if (t < cutoff) this.seenMessages.delete(k);
      }
    }
  }

  async getByExternalUser(channel: Channel, externalUserId: string): Promise<ConversationState | null> {
    const key = `${channel}:${externalUserId}`;
    return this.states.get(key) ?? null;
  }
}

let backend: ConversationStateBackend;

export function initConversationStateStore() {
  backend = new InMemoryConversationStateStore();
  console.log("[ConversationState] Using in-memory backend");
}

export function getConversationStateStore(): ConversationStateBackend {
  if (!backend) initConversationStateStore();
  return backend;
}
