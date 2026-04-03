/**
 * Unified Physician Inbox Broker (Recommendation 4)
 *
 * Consolidates patient events from all entry channels (WhatsApp, Telegram, web form,
 * ChatGPT conversation) into one prioritized, deduplicated physician feed.
 *
 * Architecture:
 *   - Channels register handlers via registerChannelAdapter()
 *   - All events flow through normalizeInboxEvent() → deduplication → priority sort
 *   - Physician replies route back to the originating channel adapter
 *   - All routing decisions written to the audit chain
 */

import { appendAuditEvent } from "../governance/audit";

export type InboxChannel = "whatsapp" | "telegram" | "web" | "chatgpt" | "voice" | "sms";
export type InboxEventType = "new_case" | "patient_message" | "status_update" | "escalation" | "flag";
export type InboxPriority = "critical" | "high" | "normal" | "low";

export interface RawChannelEvent {
  channel: InboxChannel;
  externalId: string;
  patientId?: string;
  caseId?: string;
  eventType: InboxEventType;
  text: string;
  metadata?: Record<string, unknown>;
  receivedAt?: string;
}

export interface NormalizedInboxEvent {
  inboxId: string;
  channel: InboxChannel;
  externalId: string;
  patientId: string | null;
  caseId: string | null;
  eventType: InboxEventType;
  text: string;
  priority: InboxPriority;
  metadata: Record<string, unknown>;
  receivedAt: string;
  dedupKey: string;
}

export interface ChannelAdapter {
  channel: InboxChannel;
  sendReply: (externalId: string, message: string) => Promise<void>;
}

export type PhysicianReplyAction = "approve" | "escalate" | "override" | "flag" | "defer";

export interface PhysicianReply {
  inboxId: string;
  caseId: string;
  action: PhysicianReplyAction;
  text?: string;
  physicianId: string;
  tenantId: string;
}

const _adapters = new Map<InboxChannel, ChannelAdapter>();
const _events = new Map<string, NormalizedInboxEvent>();
let _eventList: NormalizedInboxEvent[] = [];

const MAX_INBOX_SIZE = 2000;

export function registerChannelAdapter(adapter: ChannelAdapter): void {
  _adapters.set(adapter.channel, adapter);
  console.log(`[PhysicianInbox] Channel adapter registered: ${adapter.channel}`);
}

function computePriority(event: RawChannelEvent): InboxPriority {
  if (event.eventType === "escalation") return "critical";
  if (event.eventType === "flag") return "high";
  const text = event.text.toLowerCase();
  if (/chest pain|can't breathe|shortness of breath|er|emergency|911|severe|unbearable/.test(text)) return "critical";
  if (/worse|getting worse|worsening|high fever|vomiting|fainting/.test(text)) return "high";
  if (event.eventType === "new_case") return "normal";
  return "low";
}

const PRIORITY_ORDER: Record<InboxPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export function ingestChannelEvent(raw: RawChannelEvent): NormalizedInboxEvent {
  const receivedAt = raw.receivedAt ?? new Date().toISOString();
  const dedupKey = `${raw.channel}::${raw.externalId}::${raw.eventType}`;
  const inboxId = `${dedupKey}::${receivedAt}`;

  if (_events.has(dedupKey)) {
    return _events.get(dedupKey)!;
  }

  const normalized: NormalizedInboxEvent = {
    inboxId,
    channel: raw.channel,
    externalId: raw.externalId,
    patientId: raw.patientId ?? null,
    caseId: raw.caseId ?? null,
    eventType: raw.eventType,
    text: raw.text,
    priority: computePriority(raw),
    metadata: raw.metadata ?? {},
    receivedAt,
    dedupKey,
  };

  _events.set(dedupKey, normalized);
  _eventList.push(normalized);

  // Trim to max size — drop oldest low-priority events first
  if (_eventList.length > MAX_INBOX_SIZE) {
    _eventList = _eventList
      .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
      .slice(0, MAX_INBOX_SIZE);
  }

  return normalized;
}

export function getPhysicianInbox(params: {
  priorityFilter?: InboxPriority | null;
  channelFilter?: InboxChannel | null;
  limit?: number;
  offset?: number;
}): { events: NormalizedInboxEvent[]; total: number; criticalCount: number } {
  let events = [..._eventList].sort(
    (a, b) =>
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
      new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime()
  );

  if (params.priorityFilter) events = events.filter(e => e.priority === params.priorityFilter);
  if (params.channelFilter) events = events.filter(e => e.channel === params.channelFilter);

  const criticalCount = events.filter(e => e.priority === "critical").length;
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;

  return { events: events.slice(offset, offset + limit), total: events.length, criticalCount };
}

export async function routePhysicianReply(reply: PhysicianReply): Promise<{ routed: boolean; channel?: InboxChannel }> {
  const event = [..._events.values()].find(e => e.caseId === reply.caseId);

  await appendAuditEvent({
    tenantId: reply.tenantId,
    actorId: reply.physicianId,
    action: `PHYSICIAN_REPLY_ROUTED`,
    entityType: "inbox_event",
    entityId: reply.inboxId,
    justification: reply.text ?? reply.action,
    payload: {
      caseId: reply.caseId,
      action: reply.action,
      channel: event?.channel ?? "unknown",
    },
  });

  if (!event) return { routed: false };

  const adapter = _adapters.get(event.channel);
  if (!adapter) return { routed: false, channel: event.channel };

  const messageMap: Record<PhysicianReplyAction, string> = {
    approve: "Your triage has been reviewed and approved by your care team. Please follow the instructions provided.",
    escalate: "Your case has been escalated to a physician for direct review. You will be contacted shortly.",
    override: reply.text ?? "Your care team has updated your care plan. Please check your instructions.",
    flag: "Your case has been flagged for priority review.",
    defer: "Your case is in the review queue. You will hear back soon.",
  };

  await adapter.sendReply(event.externalId, messageMap[reply.action]);
  return { routed: true, channel: event.channel };
}

export function clearInboxEvent(dedupKey: string): void {
  _events.delete(dedupKey);
  _eventList = _eventList.filter(e => e.dedupKey !== dedupKey);
}

export function getInboxStats(): { total: number; byChannel: Record<string, number>; byPriority: Record<string, number> } {
  const byChannel: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  for (const e of _eventList) {
    byChannel[e.channel] = (byChannel[e.channel] ?? 0) + 1;
    byPriority[e.priority] = (byPriority[e.priority] ?? 0) + 1;
  }
  return { total: _eventList.length, byChannel, byPriority };
}
