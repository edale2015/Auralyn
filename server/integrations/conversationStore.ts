export type ChatRole = "patient" | "doctor" | "assistant" | "system"

export type ChatMessage = {
  id: string
  role: ChatRole
  text: string
  timestamp: string
  channel?: "telegram" | "whatsapp" | "web"
}

export type ConversationMeta = {
  caseId: string
  channel: "telegram" | "whatsapp" | "web"
  externalId: string
  createdAt: string
  updatedAt: string
  lastAssistantResult?: any
}

const messages: Record<string, ChatMessage[]> = {}
const meta: Record<string, ConversationMeta> = {}

function msgId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

export function ensureConversation(
  caseId: string,
  channel: ConversationMeta["channel"],
  externalId: string
): ConversationMeta {
  if (!meta[caseId]) {
    meta[caseId] = {
      caseId,
      channel,
      externalId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    messages[caseId] = []
  }
  return meta[caseId]
}

export function addMessage(
  caseId: string,
  role: ChatRole,
  text: string,
  channel?: ConversationMeta["channel"]
): ChatMessage {
  if (!messages[caseId]) messages[caseId] = []
  const msg: ChatMessage = {
    id: msgId(),
    role,
    text,
    timestamp: new Date().toISOString(),
    channel,
  }
  messages[caseId].push(msg)
  if (meta[caseId]) meta[caseId].updatedAt = msg.timestamp
  return msg
}

export function getConversation(caseId: string): ChatMessage[] {
  return messages[caseId] ?? []
}

export function getMeta(caseId: string): ConversationMeta | null {
  return meta[caseId] ?? null
}

export function setLastResult(caseId: string, result: any) {
  if (!meta[caseId]) return
  meta[caseId].lastAssistantResult = result
  meta[caseId].updatedAt = new Date().toISOString()
}

export function getLastResult(caseId: string): any {
  return meta[caseId]?.lastAssistantResult ?? null
}

export function listConversations(): ConversationMeta[] {
  return Object.values(meta).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** Derive a stable caseId from channel + sender id */
export function caseIdFromChannel(channel: "telegram" | "whatsapp", externalId: string): string {
  const prefix = channel === "telegram" ? "tg" : "wa"
  return `${prefix}_${String(externalId).replace(/\D/g, "")}`
}
