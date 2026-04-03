import { Router } from 'express';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ domain: 'observability', ok: true });
});

export default router;
