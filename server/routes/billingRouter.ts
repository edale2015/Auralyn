import { Router } from 'express';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ domain: 'billing', ok: true });
});

export default router;
