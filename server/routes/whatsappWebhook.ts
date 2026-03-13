import { Router } from "express"
import {
  addMessage,
  caseIdFromChannel,
  ensureConversation,
  setLastResult,
} from "../integrations/conversationStore"
import { addPatientMessage, addSystemMessage } from "../assistant/telemedicineSessionService"
import { runTelemedicineAssistant } from "../assistant/telemedicineAssistantService"
import { sendWhatsAppMessage } from "../whatsapp/send"

const router = Router()

function formatReplyForWhatsApp(result: any): string {
  const top = result?.differential?.[0]
  const level = (result?.triage?.level ?? "unknown").toUpperCase()
  const questions = (result?.nextQuestions ?? []).slice(0, 2).map((q: string) => `• ${q}`).join("\n")
  const actions = (result?.resources?.recommendedActions ?? [])
    .slice(0, 2)
    .map((a: any) => `• ${a.diagnosis}`)
    .join("\n")

  return [
    `*Triage:* ${level}`,
    top ? `*Most likely:* ${top.diagnosis}` : "",
    questions ? `\n*Suggested questions:*\n${questions}` : "",
    actions ? `\n*Recommendations:*\n${actions}` : "",
  ]
    .filter(Boolean)
    .join("\n")
}

// Twilio sends x-www-form-urlencoded: From=whatsapp:+1234...&Body=text
router.post("/whatsapp/webhook", async (req, res) => {
  // Twilio expects a 200 with TwiML or empty body immediately
  res.status(200).set("Content-Type", "text/xml").send("<Response></Response>")

  try {
    const from: string = String(req.body?.From ?? "").replace(/^whatsapp:/, "").trim()
    const text: string = String(req.body?.Body ?? "").trim()

    if (!from || !text) return

    const caseId = caseIdFromChannel("whatsapp", from)
    ensureConversation(caseId, "whatsapp", from)

    // Record patient message in conversation store
    addMessage(caseId, "patient", text, "whatsapp")

    // Record in telemed session
    addPatientMessage(caseId, text)

    // Run assistant analysis (async, doctor sees result in console)
    const result = await runTelemedicineAssistant(caseId, text)
    setLastResult(caseId, result)

    // Store assistant analysis as a system message so it's visible in the thread
    const summary = formatReplyForWhatsApp(result)
    addMessage(caseId, "assistant", summary, "whatsapp")
    addSystemMessage(caseId, `AI analysis updated — ${new Date().toLocaleTimeString()}`)

    // NOTE: We do NOT auto-send to patient here.
    // The doctor reviews the draft in the split-pane console and sends manually.
    // To enable auto-reply, uncomment:
    // await sendWhatsAppMessage(from, summary)
    void sendWhatsAppMessage // keep import alive for future use

    console.log(`[WhatsApp] caseId=${caseId} processed message from ${from}`)
  } catch (err: any) {
    console.error("[WhatsApp] Webhook error:", err?.message ?? err)
  }
})

// Twilio GET verification (some versions ping with GET)
router.get("/whatsapp/webhook", (_req, res) => {
  res.status(200).send("OK")
})

export default router
