import type { Request, Response } from 'express';

export type TelegramQuestion = {
  id: string;
  text: string;
  type: 'yes_no' | 'single_select' | 'free_text';
  options?: string[];
};

export function buildTelegramMiniAppSchema(packId: string, title: string, questions: TelegramQuestion[]) {
  return {
    version: '1.0',
    packId,
    title,
    steps: questions.map((q) => ({
      id: q.id,
      label: q.text,
      input: q.type,
      options: q.options ?? [],
    })),
  };
}

export async function telegramWebhookHandler(req: Request, res: Response) {
  const update = req.body;
  res.json({ ok: true, received: !!update });
}
