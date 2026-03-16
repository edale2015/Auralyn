import { Router } from 'express';
import { requireRole } from '../middleware/requireRole';
import { runSystemReview, getModuleSuggestions, SystemModules } from '../brain/systemReviewEngine';
import { getAllEngines, getEngineCounts, getEnginesByLevel, EngineRegistry } from '../brain/engineRegistry';
import { listProtocols, getProtocol, selectProtocol } from '../brain/protocolSelector';
import { listComplaintsWithSkills, getSkillsForComplaint } from '../brain/skillGraph';
import { clinicalSimulationEngine } from '../engines/clinicalSimulationEngine';
import { physicianLearningStore } from '../engines/physicianLearningEngine';

export const systemReviewRouter = Router();

systemReviewRouter.get('/review', requireRole(['admin', 'physician']), (_req, res) => {
  try {
    res.json(runSystemReview());
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'System review failed' });
  }
});

systemReviewRouter.get('/review/modules', requireRole(['admin', 'physician']), (_req, res) => {
  res.json({ modules: SystemModules });
});

systemReviewRouter.get('/review/modules/:module', requireRole(['admin', 'physician']), (req, res) => {
  const suggestions = getModuleSuggestions(req.params.module);
  res.json({ module: req.params.module, suggestions });
});

systemReviewRouter.get('/engines', requireRole(['admin', 'physician']), (_req, res) => {
  const enginesWithLayer = Object.entries(EngineRegistry).flatMap(([level, engines]) =>
    engines.map((e) => ({ ...e, layer: level }))
  );
  res.json({
    engines: enginesWithLayer,
    counts: getEngineCounts(),
    total: enginesWithLayer.length,
  });
});

systemReviewRouter.get('/engines/counts', requireRole(['admin', 'physician']), (_req, res) => {
  res.json(getEngineCounts());
});

systemReviewRouter.get('/engines/level/:level', requireRole(['admin', 'physician']), (req, res) => {
  const level = req.params.level as keyof typeof EngineRegistry;
  const engines = getEnginesByLevel(level as any);
  if (!engines.length && !(level in EngineRegistry)) {
    res.status(404).json({ error: `Unknown level: ${level}` });
    return;
  }
  res.json({ level, engines, count: engines.length });
});

systemReviewRouter.get('/protocols', requireRole(['admin', 'physician']), (_req, res) => {
  res.json({ protocols: listProtocols() });
});

systemReviewRouter.get('/protocols/:id', requireRole(['admin', 'physician']), (req, res) => {
  const protocol = getProtocol(req.params.id);
  if (!protocol) { res.status(404).json({ error: 'Protocol not found' }); return; }
  res.json(protocol);
});

systemReviewRouter.get('/protocols/for/:complaint', requireRole(['admin', 'physician']), (req, res) => {
  res.json(selectProtocol(req.params.complaint));
});

systemReviewRouter.get('/skills', requireRole(['admin', 'physician']), (_req, res) => {
  const complaints = listComplaintsWithSkills();
  const atlas = Object.fromEntries(complaints.map((c) => [c, getSkillsForComplaint(c)]));
  res.json({ complaints, atlas });
});

systemReviewRouter.get('/skills/:complaint', requireRole(['admin', 'physician']), (req, res) => {
  const skills = getSkillsForComplaint(req.params.complaint);
  res.json({ complaint: req.params.complaint, skills, count: skills.length });
});

systemReviewRouter.post('/simulate', requireRole(['admin', 'physician']), (req, res) => {
  const { complaint, n = 1 } = req.body;
  const count = Math.min(Number(n) || 1, 50);
  if (count === 1) {
    res.json(clinicalSimulationEngine.generateCase(complaint));
  } else {
    res.json({ cases: clinicalSimulationEngine.generateBatch(count, complaint) });
  }
});

systemReviewRouter.get('/physician-learning/stats', requireRole(['admin', 'physician']), (_req, res) => {
  res.json(physicianLearningStore.getStats());
});

systemReviewRouter.get('/physician-learning/patterns', requireRole(['admin', 'physician']), (_req, res) => {
  res.json({ patterns: physicianLearningStore.getPatterns() });
});
