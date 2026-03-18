import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/requireRole';
import { tuneRuleWeights } from '../engines/rlhfWeightTuningEngine';
import { findSimilarCases, boostFromMemory } from '../engines/caseMemoryEngine';
import { telegramWebhookHandler } from '../integrations/telegramBot';
import { whatsappWebhookHandler } from '../integrations/whatsappFlow';

const router = Router();
const auth = requireRole(["admin", "physician"]);

router.post('/rlhf/tune', auth, (req: Request, res: Response) => {
  try {
    const updates = tuneRuleWeights(req.body.outcomes ?? [], req.body.weights ?? {});
    res.json({ count: updates.length, updates });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/memory/similar', auth, (req: Request, res: Response) => {
  try {
    const { complaint, symptoms } = req.body.currentCase ?? {};
    const limit = req.body.limit ?? 5;
    const similar = findSimilarCases({ complaint: complaint ?? '', symptoms: symptoms ?? [] }, limit);
    res.json({ similar, boost: boostFromMemory(similar) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/telegram/webhook', telegramWebhookHandler);
router.post('/whatsapp/webhook', whatsappWebhookHandler);

export default router;
