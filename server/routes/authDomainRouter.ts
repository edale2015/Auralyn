import { Router } from 'express';
import { requireRole } from '../middleware/requireRole';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ domain: 'auth', ok: true });
});

router.get('/me', requireRole(['admin', 'physician', 'nurse', 'staff']), (req: any, res) => {
  res.json({ ok: true, user: req.user ?? null });
});

export default router;
