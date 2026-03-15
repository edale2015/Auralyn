import { Router } from 'express';
import { requireRole } from '../middleware/requireRole';
import { ENGINE_REGISTRY, ARCHITECTURE_LAYERS, getEnginesByLayer, getEngineById, getEngineStats } from '../core/engineRegistry';

export const engineRegistryRouter = Router();

engineRegistryRouter.get('/', requireRole(['admin', 'physician']), (_req, res) => {
  res.json({ engines: ENGINE_REGISTRY, layers: ARCHITECTURE_LAYERS, stats: getEngineStats() });
});

engineRegistryRouter.get('/stats', requireRole(['admin', 'physician']), (_req, res) => {
  res.json(getEngineStats());
});

engineRegistryRouter.get('/layer/:layer', requireRole(['admin', 'physician']), (req, res) => {
  const engines = getEnginesByLayer(req.params.layer as any);
  res.json({ layer: req.params.layer, engines, count: engines.length });
});

engineRegistryRouter.get('/:id', requireRole(['admin', 'physician']), (req, res) => {
  const engine = getEngineById(req.params.id);
  if (!engine) return res.status(404).json({ error: 'Engine not found' });
  res.json(engine);
});
