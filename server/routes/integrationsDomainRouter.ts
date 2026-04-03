import { Router } from 'express';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ domain: 'integrations', ok: true });
});

router.get('/status', (_req, res) => {
  res.json({
    ok: true,
    twilioConfigured: !!process.env.TWILIO_ACCOUNT_SID,
    telegramConfigured: !!process.env.TELEGRAM_BOT_TOKEN,
    whatsappConfigured: !!process.env.TWILIO_WHATSAPP_NUMBER || !!process.env.WHATSAPP_TOKEN,
  });
});

export default router;
