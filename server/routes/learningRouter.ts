import { Router } from 'express';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ domain: 'learning', ok: true });
});

export default router;
