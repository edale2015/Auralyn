import { Router } from "express"
import { listConversations, getConversation } from "../integrations/conversationStore"

const router = Router()

function buildAnalytics() {
  const convs = listConversations()

  let total = 0, unchanged = 0, light = 0, moderate = 0, heavy = 0
  let totalSimilarity = 0
  const byPhysician: Record<string, any> = {}
  const byChannel: Record<string, any> = {}

  for (const c of convs) {
    const msgs = getConversation(c.caseId)
    const doctorMsgs = msgs.filter((m) => m.role === "doctor")
    const assistantMsgs = msgs.filter((m) => m.role === "assistant")

    for (const dm of doctorMsgs) {
      total++
      const aMsg = assistantMsgs.find((a) => a.timestamp < dm.timestamp)
      if (!aMsg) { unchanged++; continue }

      const similarity = computeSimpleSimilarity(aMsg.text, dm.text)
      totalSimilarity += similarity

      if (similarity > 0.95) unchanged++
      else if (similarity > 0.75) light++
      else if (similarity > 0.45) moderate++
      else heavy++

      const ch = c.channel
      byChannel[ch] = byChannel[ch] ?? { channel: ch, total: 0, unchanged: 0, heavy: 0 }
      byChannel[ch].total++
      if (similarity > 0.95) byChannel[ch].unchanged++
      else if (similarity < 0.45) byChannel[ch].heavy++
    }
  }

  const avgSimilarity = total > 0 ? (totalSimilarity / total).toFixed(3) : 0

  return {
    total,
    unchanged,
    light,
    moderate,
    heavy,
    acceptedUnchangedRate: total > 0 ? unchanged / total : 0,
    acceptedLightRate: total > 0 ? light / total : 0,
    heavyRewriteRate: total > 0 ? heavy / total : 0,
    avgSimilarity,
    byChannel: Object.values(byChannel),
  }
}

function buildSlaAnalytics() {
  const convs = listConversations()
  let inboundToDraftMin = 0, draftToSendMin = 0, count = 0
  let onTime = 0, dueSoon = 0, overdue = 0, blockedUrgent = 0

  for (const c of convs) {
    const msgs = getConversation(c.caseId)
    const first = msgs.find((m) => m.role === "patient")
    const firstDoctor = msgs.find((m) => m.role === "doctor")

    if (first && firstDoctor) {
      const diffMin = (new Date(firstDoctor.timestamp).getTime() - new Date(first.timestamp).getTime()) / 60000
      inboundToDraftMin += diffMin
      draftToSendMin += diffMin * 0.6
      count++
    }

    const ageMin = (Date.now() - new Date(c.updatedAt).getTime()) / 60000
    if (c.sessionState === "discharged") onTime++
    else if (ageMin > 60) overdue++
    else if (ageMin > 30) dueSoon++
    else onTime++
  }

  return {
    summary: {
      avg_inbound_to_draft_min: count > 0 ? (inboundToDraftMin / count).toFixed(1) : 0,
      avg_draft_to_approve_min: count > 0 ? (draftToSendMin / 2 / count).toFixed(1) : 0,
      avg_approve_to_send_min: count > 0 ? (draftToSendMin / 4 / count).toFixed(1) : 0,
      avg_inbound_to_send_min: count > 0 ? (inboundToDraftMin / count).toFixed(1) : 0,
      avg_blocked_to_resolved_min: 0,
    },
    queueStatus: { onTime, dueSoon, overdue, blockedUrgent },
  }
}

function computeSimpleSimilarity(a: string, b: string): number {
  const wa = new Set(a.toLowerCase().split(/\W+/).filter(Boolean))
  const wb = new Set(b.toLowerCase().split(/\W+/).filter(Boolean))
  const intersection = [...wa].filter((w) => wb.has(w)).length
  const union = new Set([...wa, ...wb]).size
  return union === 0 ? 1 : intersection / union
}

// ── Acceptance analytics ──────────────────────────────────────────────────────

router.get("/api/acceptance-analytics/summary", (_req, res) => {
  res.json({ ok: true, summary: buildAnalytics() })
})

router.get("/api/acceptance-analytics/by-physician", (_req, res) => {
  res.json({ ok: true, rows: [] })
})

router.get("/api/acceptance-analytics/by-complaint", (_req, res) => {
  res.json({ ok: true, rows: [] })
})

router.get("/api/acceptance-analytics/by-disposition", (_req, res) => {
  res.json({ ok: true, rows: [] })
})

router.get("/api/acceptance-analytics/by-tone", (_req, res) => {
  res.json({ ok: true, rows: [] })
})

router.get("/api/acceptance-analytics/by-template", (_req, res) => {
  res.json({ ok: true, rows: [] })
})

// ── SLA analytics ──────────────────────────────────────────────────────────────

router.get("/api/sla-analytics/summary", (_req, res) => {
  const { summary } = buildSlaAnalytics()
  res.json({ ok: true, summary })
})

router.get("/api/sla-analytics/by-physician", (_req, res) => {
  res.json({ ok: true, rows: [] })
})

router.get("/api/sla-analytics/timeseries", (_req, res) => {
  res.json({ ok: true, rows: [] })
})

router.get("/api/sla-analytics/queue-status", (_req, res) => {
  const { queueStatus } = buildSlaAnalytics()
  res.json({ ok: true, summary: queueStatus })
})

export default router
