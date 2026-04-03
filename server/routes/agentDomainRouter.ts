import { Router } from 'express';
import { unifiedAgentRegistry } from '../agents/unifiedAgentRegistry';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ domain: 'agent', ok: true });
});

router.get('/registry', async (_req, res, next) => {
  try {
    const agents = await unifiedAgentRegistry.listAgents();
    res.json({ agents });
  } catch (err) {
    next(err);
  }
});

router.post('/registry/heartbeat', async (req, res, next) => {
  try {
    await unifiedAgentRegistry.upsertHeartbeat(req.body);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
