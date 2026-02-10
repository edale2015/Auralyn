import type { Channel } from "./messageEvent";
import { createHash } from "crypto";

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

export interface ConversationStateBackend {
  getOrCreate(conversationId: string, channel: Channel, externalUserId: string): Promise<ConversationState>;
  update(conversationId: string, patch: Partial<ConversationState>): Promise<ConversationState>;
  appendMessage(conversationId: string, msg: { from: "patient" | "system"; text: string; ts: string }): Promise<void>;
  recordFriction(conversationId: string, signals: string[]): Promise<ConversationState>;
  checkDedupe(channel: string, messageId: string, bodyHash?: string): Promise<DedupeResult>;
  markSeen(channel: string, messageId: string, bodyHash?: string): Promise<void>;
  getByExternalUser(channel: Channel, externalUserId: string): Promise<ConversationState | null>;
}

export const MAX_LAST_MESSAGES = 20;
const DEDUPE_TTL_MS = 300_000;
const MAX_DEDUPE_SIZE = 10_000;

function makeDedupeKey(channel: string, messageId: string, bodyHash?: string): string {
  return bodyHash ? `${channel}:${messageId}:${bodyHash}` : `${channel}:${messageId}`;
}

export function hashBody(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function makeDefaultState(conversationId: string, channel: Channel, externalUserId: string): ConversationState {
  const now = new Date().toISOString();
  return {
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
}

class InMemoryConversationStateStore implements ConversationStateBackend {
  private states = new Map<string, ConversationState>();
  private seenMessages = new Map<string, number>();

  async getOrCreate(conversationId: string, channel: Channel, externalUserId: string): Promise<ConversationState> {
    const existing = this.states.get(conversationId);
    if (existing) return { ...existing };

    const state = makeDefaultState(conversationId, channel, externalUserId);
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

  async checkDedupe(channel: string, messageId: string, bodyHash?: string): Promise<DedupeResult> {
    const key = makeDedupeKey(channel, messageId, bodyHash);
    const ts = this.seenMessages.get(key);
    if (ts && Date.now() - ts < DEDUPE_TTL_MS) {
      return { seen: true };
    }
    return { seen: false };
  }

  async markSeen(channel: string, messageId: string, bodyHash?: string): Promise<void> {
    const key = makeDedupeKey(channel, messageId, bodyHash);
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

class FirestoreCachedConversationStateStore implements ConversationStateBackend {
  private cache = new Map<string, ConversationState>();
  private seenMessages = new Map<string, number>();

  private getCollection() {
    const { getFirestore } = require("../firebase") as typeof import("../firebase");
    return getFirestore().collection("conversationStates");
  }

  private getDedupeCollection() {
    const { getFirestore } = require("../firebase") as typeof import("../firebase");
    return getFirestore().collection("messageDedup");
  }

  async getOrCreate(conversationId: string, channel: Channel, externalUserId: string): Promise<ConversationState> {
    const cached = this.cache.get(conversationId);
    if (cached) return { ...cached };

    try {
      const doc = await this.getCollection().doc(conversationId).get();
      if (doc.exists) {
        const data = doc.data() as ConversationState;
        data.lastNMessages = data.lastNMessages || [];
        data.requiredMissing = data.requiredMissing || [];
        this.cache.set(conversationId, data);
        return { ...data };
      }
    } catch (err: any) {
      console.warn(`[ConvState] Firestore read failed for ${conversationId}, creating new:`, err?.message);
    }

    const state = makeDefaultState(conversationId, channel, externalUserId);
    this.cache.set(conversationId, state);
    this.persistAsync(conversationId, state);
    return { ...state };
  }

  async update(conversationId: string, patch: Partial<ConversationState>): Promise<ConversationState> {
    let state = this.cache.get(conversationId);
    if (!state) {
      try {
        const doc = await this.getCollection().doc(conversationId).get();
        if (doc.exists) {
          state = doc.data() as ConversationState;
        }
      } catch { /* fall through */ }
    }
    if (!state) throw new Error(`Conversation not found: ${conversationId}`);

    Object.assign(state, patch, { updatedAt: new Date().toISOString() });
    this.cache.set(conversationId, state);
    this.persistAsync(conversationId, state);
    return { ...state };
  }

  async appendMessage(conversationId: string, msg: { from: "patient" | "system"; text: string; ts: string }): Promise<void> {
    let state = this.cache.get(conversationId);
    if (!state) return;
    state.lastNMessages.push(msg);
    if (state.lastNMessages.length > MAX_LAST_MESSAGES) {
      state.lastNMessages = state.lastNMessages.slice(-MAX_LAST_MESSAGES);
    }
    state.updatedAt = new Date().toISOString();
    this.persistAsync(conversationId, state);
  }

  async recordFriction(conversationId: string, signals: string[]): Promise<ConversationState> {
    const state = this.cache.get(conversationId);
    if (!state) throw new Error(`Conversation not found: ${conversationId}`);
    state.frictionScore += signals.length;
    state.frictionEvents += 1;
    state.lastFrictionAt = new Date().toISOString();
    state.updatedAt = new Date().toISOString();
    this.persistAsync(conversationId, state);
    return { ...state };
  }

  async checkDedupe(channel: string, messageId: string, bodyHash?: string): Promise<DedupeResult> {
    const key = makeDedupeKey(channel, messageId, bodyHash);
    const ts = this.seenMessages.get(key);
    if (ts && Date.now() - ts < DEDUPE_TTL_MS) {
      return { seen: true };
    }

    try {
      const doc = await this.getDedupeCollection().doc(key).get();
      if (doc.exists) {
        const data = doc.data();
        if (data && data.seenAt && Date.now() - data.seenAt < DEDUPE_TTL_MS) {
          this.seenMessages.set(key, data.seenAt);
          return { seen: true };
        }
      }
    } catch {
    }

    return { seen: false };
  }

  async markSeen(channel: string, messageId: string, bodyHash?: string): Promise<void> {
    const key = makeDedupeKey(channel, messageId, bodyHash);
    const now = Date.now();
    this.seenMessages.set(key, now);

    this.getDedupeCollection().doc(key).set({
      channel,
      messageId,
      bodyHash: bodyHash || null,
      seenAt: now,
      expiresAt: new Date(now + DEDUPE_TTL_MS).toISOString(),
    }).catch(err => console.warn("[ConvState] Dedupe persist failed:", err?.message));

    if (this.seenMessages.size > MAX_DEDUPE_SIZE) {
      const cutoff = Date.now() - DEDUPE_TTL_MS;
      for (const [k, t] of this.seenMessages) {
        if (t < cutoff) this.seenMessages.delete(k);
      }
    }
  }

  async getByExternalUser(channel: Channel, externalUserId: string): Promise<ConversationState | null> {
    const key = `${channel}:${externalUserId}`;
    const cached = this.cache.get(key);
    if (cached) return { ...cached };

    try {
      const doc = await this.getCollection().doc(key).get();
      if (doc.exists) {
        const data = doc.data() as ConversationState;
        this.cache.set(key, data);
        return { ...data };
      }
    } catch { /* fall through */ }

    return null;
  }

  private persistAsync(conversationId: string, state: ConversationState): void {
    const snapshot = {
      ...state,
      lastNMessages: state.lastNMessages.slice(-MAX_LAST_MESSAGES),
    };
    this.getCollection().doc(conversationId).set(snapshot, { merge: true })
      .catch(err => console.warn(`[ConvState] Firestore persist failed for ${conversationId}:`, err?.message));
  }
}

let backend: ConversationStateBackend;

export function initConversationStateStore(driver?: "memory" | "firestore") {
  const resolvedDriver = driver || (process.env.STORAGE_DRIVER === "firestore" ? "firestore" : "memory");

  if (resolvedDriver === "firestore") {
    backend = new FirestoreCachedConversationStateStore();
    console.log("[ConversationState] Using Firestore-cached backend (in-memory cache + Firestore persistence)");
  } else {
    backend = new InMemoryConversationStateStore();
    console.log("[ConversationState] Using in-memory backend");
  }
}

export function getConversationStateStore(): ConversationStateBackend {
  if (!backend) initConversationStateStore();
  return backend;
}
