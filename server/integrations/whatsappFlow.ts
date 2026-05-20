import type { Request, Response } from 'express';

export type WhatsAppFlowQuestion = {
  id: string;
  text: string;
  options?: string[];
};

export function buildWhatsAppFlow(packId: string, title: string, questions: WhatsAppFlowQuestion[]) {
  return {
    version: '7.1',
    data_api_version: '3.0',
    routing_model: { START: ['SCREEN_1'] },
    screens: [
      {
        id: 'SCREEN_1',
        title,
        data: { packId },
        layout: {
          type: 'SingleColumnLayout',
          children: questions.map((q) => ({
            type: 'RadioButtonsGroup',
            name: q.id,
            label: q.text,
            data_source: (q.options ?? ['Yes', 'No']).map((value) => ({ id: value, title: value })),
          })),
        },
      },
    ],
  };
}

// ── In-memory per-phone processing lock ───────────────────────────────────────
// Prevents a second WhatsApp message arriving while the first is still being
// processed from causing a race condition.  Queue depth is capped at 1 —
// only the latest pending message is kept.
interface PhoneSlot {
  inProgress: boolean;
  pending: { from: string; text: string; messageSid: string } | null;
}
const phoneSlots = new Map<string, PhoneSlot>();

function getSlot(phone: string): PhoneSlot {
  if (!phoneSlots.has(phone)) phoneSlots.set(phone, { inProgress: false, pending: null });
  return phoneSlots.get(phone)!;
}

async function processIncomingAsync(from: string, text: string, messageSid: string): Promise<void> {
  const phone = from.replace(/^whatsapp:/, "").replace(/^\+/, "");
  const slot  = getSlot(phone);

  if (slot.inProgress) {
    // Keep only the latest message — earlier ones are stale while processing
    slot.pending = { from, text, messageSid };
    return;
  }

  slot.inProgress = true;
  console.log("[T1] processIncomingAsync started", Date.now());
  try {
    const { handleWhatsAppKBIntake } = await import("../whatsapp/kbIntake");
    await handleWhatsAppKBIntake({ from, text, messageSid }).catch((e: any) =>
      console.error("[WhatsApp] handleWhatsAppKBIntake error:", e?.message)
    );
  } finally {
    slot.inProgress = false;
    // If a message arrived while we were busy, process it now
    if (slot.pending) {
      const next = slot.pending;
      slot.pending = null;
      setImmediate(() => processIncomingAsync(next.from, next.text, next.messageSid));
    }
  }
}

// ── WhatsApp Twilio Webhook ───────────────────────────────────────────────────
//
// Architecture (4-step hot path):
//   Step 1 — Reply to Twilio IMMEDIATELY with empty TwiML (<Response/>).
//             This ACKs Twilio within <100 ms and stops any retry/timeout.
//   Step 2 — setImmediate defers the actual intake work to the next event-loop
//             tick, AFTER Express has flushed the HTTP response.
//   Step 3 — Intake: complaint match → next question from pre-written library
//             (getNextRequiredQuestion — zero LLM calls).  Sends via REST API.
//   Step 4 — runOrchestratorTriage() fires completely async AFTER the patient
//             already has their question.  Never blocks the patient reply.
//
export async function whatsappWebhookHandler(req: Request, res: Response) {
  const body        = req.body ?? {};
  const from        = String(body.From ?? body.from ?? "").trim();
  const text        = String(body.Body ?? body.body ?? "").trim();
  const messageSid  = String(body.MessageSid ?? body.messageSid ?? "");

  // ── Step 1: Immediate TwiML ACK — Twilio gets a 200 in <100 ms ─────────────
  res.type("text/xml").send("<Response/>");

  if (!from || !text) return;

  // ── Step 2: Defer all processing to after the HTTP response is flushed ──────
  setImmediate(() => {
    // Follow-up response processing (fire-and-forget — runs in parallel)
    import("../followup/followUpService")
      .then(({ processPatientResponse }) =>
        processPatientResponse(from, text).catch((e: any) =>
          console.error("[WhatsApp] followup response error:", e?.message)
        )
      )
      .catch(() => {});

    // ── Steps 3 + 4: Intake pipeline with per-phone serialisation ────────────
    processIncomingAsync(from, text, messageSid);
  });
}
