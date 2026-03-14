import { Router } from "express"
import {
  addMessage,
  getConversation,
  getMeta,
  getLastResult,
  listConversations,
  caseIdFromChannel,
  ensureConversation,
  setSessionState,
  type SessionState,
} from "../integrations/conversationStore"
import { addDoctorMessage } from "../assistant/telemedicineSessionService"
import { runTelemedicineAssistant } from "../assistant/telemedicineAssistantService"
import { sendWhatsAppMessage } from "../whatsapp/send"
import { telegramSendMessage } from "../services/telegramClient"

const router = Router()

// ── List all active conversations ────────────────────────────────────────────
router.get("/api/conversations", (_req, res) => {
  res.json({ ok: true, conversations: listConversations() })
})

// ── Get full conversation thread + last AI result ────────────────────────────
router.get("/api/conversations/:caseId", (req, res) => {
  const { caseId } = req.params
  const msgs = getConversation(caseId)
  const m = getMeta(caseId)
  const lastResult = getLastResult(caseId)
  res.json({ ok: true, caseId, messages: msgs, meta: m, lastResult })
})

// ── Doctor sends a message (review + optional push to patient channel) ────────
router.post("/api/conversations/:caseId/doctor-message", async (req, res) => {
  try {
    const { caseId } = req.params
    const text = String(req.body.text ?? "").trim()
    const send = req.body.send !== false  // default: true — actually deliver to patient

    if (!text) return res.status(400).json({ ok: false, error: "text required" })

    // Record in conversation store
    addMessage(caseId, "doctor", text)
    // Record in telemed session
    addDoctorMessage(caseId, text)

    // Deliver to patient channel if requested
    const m = getMeta(caseId)
    if (send && m) {
      if (m.channel === "whatsapp") {
        await sendWhatsAppMessage(m.externalId, text).catch((e: any) =>
          console.warn("[conversationRoutes] WA send failed:", e?.message)
        )
      } else if (m.channel === "telegram") {
        const token = process.env.TELEGRAM_BOT_TOKEN
        if (token) {
          await telegramSendMessage({ botToken: token, chatId: Number(m.externalId) || m.externalId, text }).catch((e: any) =>
            console.warn("[conversationRoutes] TG send failed:", e?.message)
          )
        }
      }
    }

    // Re-run assistant so reasoning panel stays fresh
    const result = await runTelemedicineAssistant(caseId)

    res.json({
      ok: true,
      messages: getConversation(caseId),
      result,
    })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message })
  }
})

// ── Simulate an inbound patient message (for testing without Telegram/WA) ────
router.post("/api/conversations/:caseId/patient-message", async (req, res) => {
  try {
    const { caseId } = req.params
    const text = String(req.body.text ?? "").trim()
    const channel: "web" | "telegram" | "whatsapp" = req.body.channel ?? "web"

    if (!text) return res.status(400).json({ ok: false, error: "text required" })

    ensureConversation(caseId, channel, caseId)
    addMessage(caseId, "patient", text, channel)

    const result = await runTelemedicineAssistant(caseId, text)

    res.json({ ok: true, messages: getConversation(caseId), result })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message })
  }
})

// ── Re-run AI analysis for an existing conversation ──────────────────────────
router.post("/api/conversations/:caseId/analyze", async (req, res) => {
  try {
    const { caseId } = req.params
    const msgs = getConversation(caseId)
    const patientText = msgs.filter((m) => m.role === "patient").map((m) => m.text).join(" ")
    const result = await runTelemedicineAssistant(caseId, patientText)
    res.json({ ok: true, result, messages: msgs })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message })
  }
})

// ── Update session state ──────────────────────────────────────────────────────
router.patch("/api/conversations/:caseId/state", (req, res) => {
  const valid: SessionState[] = ["active", "waiting_for_patient", "doctor_reviewing", "discharged"]
  const state: SessionState = req.body.state
  if (!valid.includes(state)) return res.status(400).json({ ok: false, error: "invalid state" })
  setSessionState(req.params.caseId, state)
  res.json({ ok: true, state })
})

export default router
