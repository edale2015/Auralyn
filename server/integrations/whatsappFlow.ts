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

export async function whatsappWebhookHandler(req: Request, res: Response) {
  const body = req.body;

  // Wire follow-up response processing — no-op if sender has no active enrollment
  const inboundFrom = body?.From ?? body?.from ?? "";
  const inboundBody = body?.Body ?? body?.body ?? "";
  if (inboundFrom && inboundBody) {
    const { processPatientResponse } = await import("../followup/followUpService");
    processPatientResponse(inboundFrom, inboundBody).catch((err: Error) =>
      console.error("[WhatsApp] Follow-up response processing failed", err.message)
    );
  }

  res.json({ ok: true, received: !!body });
}
