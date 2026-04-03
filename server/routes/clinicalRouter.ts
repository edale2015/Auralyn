import { Router } from 'express';
import { fastPathExpressHandler } from '../clinical/fastPathRouter';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ domain: 'clinical', ok: true });
});

router.post('/fast-path', fastPathExpressHandler);

export default router;
