import { Router } from 'express';
import { evolutionService } from '../evolution/evolutionService';
import { tenantConfigService } from '../tenancy/tenantConfigService';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ domain: 'admin', ok: true });
});

router.get('/evolution/proposals', async (req, res, next) => {
  try {
    const status = req.query.status as string | undefined;
    const proposals = await evolutionService.listProposals(status as any);
    res.json({ proposals });
  } catch (err) {
    next(err);
  }
});

router.post('/evolution/proposals', async (req, res, next) => {
  try {
    await evolutionService.createProposal(req.body);
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/evolution/proposals/:id/approve', async (req, res, next) => {
  try {
    const approvedBy = (req as any).user?.email ?? 'system';
    await evolutionService.approveProposal(req.params.id, approvedBy);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/evolution/proposals/:id/rollback', async (req, res, next) => {
  try {
    const { reason } = req.body;
    await evolutionService.rollbackProposal(req.params.id, reason ?? 'manual rollback');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/tenants', async (_req, res, next) => {
  try {
    const tenants = await tenantConfigService.listAllTenants();
    res.json({ tenants });
  } catch (err) {
    next(err);
  }
});

router.put('/tenants/:tenantId/config', async (req, res, next) => {
  try {
    const config = await tenantConfigService.upsertTenantConfig({
      tenantId: req.params.tenantId,
      ...req.body,
    });
    res.json({ config });
  } catch (err) {
    next(err);
  }
});

export default router;
