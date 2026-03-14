export type ReminderEvent = {
  id: string
  caseId: string
  patientId?: string
  type: "initial" | "follow_up" | "discharge" | "labs" | "referral"
  scheduledAt: string
  sentAt?: string
  status: "pending" | "sent" | "suppressed" | "cancelled"
  suppressReason?: string
  channel: "whatsapp" | "telegram" | "sms" | "email"
}

const reminders: ReminderEvent[] = []

export function scheduleReminder(
  caseId: string,
  type: ReminderEvent["type"],
  scheduledAt: string,
  channel: ReminderEvent["channel"],
  patientId?: string
): ReminderEvent {
  const r: ReminderEvent = {
    id: `rem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    caseId,
    patientId,
    type,
    scheduledAt,
    status: "pending",
    channel,
  }
  reminders.push(r)
  return r
}

export function getTimelineForCase(caseId: string): ReminderEvent[] {
  return reminders.filter((r) => r.caseId === caseId)
}

export function getAllReminders(): ReminderEvent[] {
  return [...reminders]
}

export function suppressReminder(id: string, reason: string): boolean {
  const r = reminders.find((x) => x.id === id)
  if (!r || r.status !== "pending") return false
  r.status = "suppressed"
  r.suppressReason = reason
  return true
}

export function markReminderSent(id: string): boolean {
  const r = reminders.find((x) => x.id === id)
  if (!r) return false
  r.status = "sent"
  r.sentAt = new Date().toISOString()
  return true
}

export function reminderTimelineStats() {
  return {
    total: reminders.length,
    pending: reminders.filter((r) => r.status === "pending").length,
    sent: reminders.filter((r) => r.status === "sent").length,
    suppressed: reminders.filter((r) => r.status === "suppressed").length,
    cancelled: reminders.filter((r) => r.status === "cancelled").length,
  }
}
