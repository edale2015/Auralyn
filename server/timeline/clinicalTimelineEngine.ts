export interface TimelineEntry {
  time: string
  relativeTime: string
  type: string
  summary: string
  payload?: Record<string, any>
  severity?: "info" | "warning" | "critical"
}

const EVENT_LABELS: Record<string, string> = {
  SESSION_STARTED: "Session opened",
  PATIENT_MESSAGE: "Patient message received",
  COMPLAINT_IDENTIFIED: "Chief complaint identified",
  RED_FLAG_DETECTED: "⚠️ Red flag detected",
  ALERTS_UPDATED: "Alerts updated",
  SYMPTOMS_RECORDED: "Symptoms recorded",
  DIFFERENTIAL_UPDATED: "Differential updated",
  DISPOSITION_SET: "Disposition set",
  PATHWAY_EXECUTED: "Care pathway executed",
  CARE_PATHWAY_STARTED: "Care pathway initiated",
  FOLLOWUP_QUESTION_SUGGESTED: "Follow-up question suggested",
  FOLLOWUP_QUESTION_ANSWERED: "Follow-up question answered",
  QUESTION_ASKED: "Clarifying question asked",
  ADAPTIVE_QUESTIONS_READY: "Adaptive questions ready",
  DIAGNOSTIC_CONFIDENCE_READY: "Confidence scores updated",
  NOTE_READY: "Clinical note generated",
  DISCHARGE_READY: "Discharge instructions ready",
  UNCERTAINTY_DETECTED: "Diagnostic uncertainty detected",
  PHYSICIAN_REVIEWED: "Physician review completed",
  OUTCOME_RECORDED: "Case outcome recorded",
}

const CRITICAL_EVENTS = new Set([
  "RED_FLAG_DETECTED",
  "DISPOSITION_SET",
  "PHYSICIAN_REVIEWED",
  "UNCERTAINTY_DETECTED",
])

const WARNING_EVENTS = new Set([
  "ALERTS_UPDATED",
  "CARE_PATHWAY_STARTED",
])

export function buildClinicalTimeline(events: any[]): TimelineEntry[] {
  const sorted = [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )
  const startTime = sorted.length ? new Date(sorted[0].timestamp).getTime() : Date.now()

  return sorted.map((e) => {
    const elapsed = new Date(e.timestamp).getTime() - startTime
    const mins = Math.floor(elapsed / 60000)
    const secs = Math.floor((elapsed % 60000) / 1000)
    const relativeTime = elapsed === 0 ? "Start" : `+${mins}m ${secs}s`

    let summary = EVENT_LABELS[e.type] ?? e.type.replace(/_/g, " ").toLowerCase()
    const data = e.data ?? e.payload ?? {}

    if (e.type === "DISPOSITION_SET" && data.disposition) {
      summary = `Disposition: ${data.disposition}`
    } else if (e.type === "RED_FLAG_DETECTED" && data.redFlags?.length) {
      summary = `Red flag: ${data.redFlags.slice(0, 2).join(", ")}`
    } else if (e.type === "PATIENT_MESSAGE" && data.message) {
      summary = `Patient: "${data.message.slice(0, 60)}${data.message.length > 60 ? "…" : ""}"`
    }

    return {
      time: e.timestamp,
      relativeTime,
      type: e.type,
      summary,
      payload: Object.keys(data).length ? data : undefined,
      severity: CRITICAL_EVENTS.has(e.type)
        ? "critical"
        : WARNING_EVENTS.has(e.type)
        ? "warning"
        : "info",
    }
  })
}

export function getTimelineStats(events: any[]): Record<string, any> {
  const types: Record<string, number> = {}
  for (const e of events) {
    types[e.type] = (types[e.type] ?? 0) + 1
  }

  const sorted = [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )

  const durationMs =
    sorted.length >= 2
      ? new Date(sorted[sorted.length - 1].timestamp).getTime() -
        new Date(sorted[0].timestamp).getTime()
      : 0

  return {
    totalEvents: events.length,
    eventTypes: types,
    durationMs,
    durationMinutes: Math.round(durationMs / 60000),
    redFlagCount: types["RED_FLAG_DETECTED"] ?? 0,
    questionsAsked: (types["QUESTION_ASKED"] ?? 0) + (types["FOLLOWUP_QUESTION_SUGGESTED"] ?? 0),
  }
}
