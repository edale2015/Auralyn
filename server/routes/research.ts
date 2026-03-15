import { Router } from 'express';
import { requireRole } from '../middleware/requireRole';
import {
  registerSource, listSources, listAllSources, getSource,
  deactivateSource, getSourcesByTier, seedDefaultSources,
} from '../research/sourceRegistry';
import { clinicalKnowledgeIngestionEngine } from '../research/engines/clinicalKnowledgeIngestionEngine';
import { researchValidationEngine } from '../research/engines/researchValidationEngine';
import { sourcePromotionEngine, approveEdge, rejectEdge } from '../research/engines/sourcePromotionEngine';
import { attachProvenance, buildProvenanceReport, rankByProvenance } from '../research/engines/provenanceTrackingEngine';
import { metaAISupervisor } from '../supervisor/metaAISupervisor';
import { commentDistillationEngine } from '../services/distillation/commentDistillationEngine';
import type { KnowledgeEdge } from '../research/types/researchTypes';

export const researchRouter = Router();

// Seed defaults on first request
researchRouter.use((_req, _res, next) => { seedDefaultSources(); next(); });

// ── Source Registry ──────────────────────────────────────────────────────────
researchRouter.get('/sources', requireRole(['admin', 'physician']), (_req, res) => {
  res.json({ sources: listAllSources(), active: listSources().length });
});

researchRouter.get('/sources/tier/:tier', requireRole(['admin', 'physician']), (req, res) => {
  const tier = parseInt(req.params.tier) as 1 | 2 | 3 | 4;
  res.json(getSourcesByTier(tier));
});

researchRouter.get('/sources/:id', requireRole(['admin', 'physician']), (req, res) => {
  const src = getSource(req.params.id);
  if (!src) return res.status(404).json({ error: 'Source not found' });
  res.json(src);
});

researchRouter.post('/sources', requireRole(['admin']), (req, res) => {
  try {
    const source = registerSource(req.body);
    res.status(201).json(source);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

researchRouter.delete('/sources/:id', requireRole(['admin']), (req, res) => {
  const ok = deactivateSource(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Source not found' });
  res.json({ ok: true });
});

// ── Knowledge Ingestion ──────────────────────────────────────────────────────
researchRouter.post('/ingest', requireRole(['admin', 'physician']), (req, res) => {
  try {
    const { text, sourceId } = req.body;
    if (!text || !sourceId) return res.status(400).json({ error: 'text and sourceId are required' });
    const edges = clinicalKnowledgeIngestionEngine(text, sourceId);
    res.json({ edges, linesProcessed: text.split('\n').length, edgesExtracted: edges.length, sourceId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Validation ───────────────────────────────────────────────────────────────
researchRouter.post('/validate', requireRole(['admin', 'physician']), (req, res) => {
  try {
    const { edges } = req.body as { edges: KnowledgeEdge[] };
    if (!Array.isArray(edges)) return res.status(400).json({ error: 'edges array required' });
    res.json(researchValidationEngine(edges));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Provenance ───────────────────────────────────────────────────────────────
researchRouter.post('/provenance', requireRole(['admin', 'physician']), (req, res) => {
  try {
    const { edges } = req.body as { edges: KnowledgeEdge[] };
    if (!Array.isArray(edges)) return res.status(400).json({ error: 'edges array required' });
    const reports = edges.map(buildProvenanceReport);
    const ranked = rankByProvenance(edges);
    res.json({ reports, ranked });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Promotion ────────────────────────────────────────────────────────────────
researchRouter.post('/promote', requireRole(['admin', 'physician']), (req, res) => {
  try {
    const { edges, reviewerName, batchNotes, promoteAll } = req.body;
    if (!Array.isArray(edges)) return res.status(400).json({ error: 'edges array required' });
    const result = sourcePromotionEngine(edges, { reviewerName: reviewerName ?? 'unknown', batchNotes, promoteAll });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

researchRouter.post('/approve-edge', requireRole(['admin', 'physician']), (req, res) => {
  try {
    const { edge, reviewedBy, notes } = req.body;
    res.json(approveEdge(edge, reviewedBy ?? 'unknown', notes));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Full pipeline: ingest → validate → provenance ────────────────────────────
researchRouter.post('/pipeline', requireRole(['admin', 'physician']), (req, res) => {
  try {
    const { text, sourceId, reviewerName } = req.body;
    if (!text || !sourceId) return res.status(400).json({ error: 'text and sourceId are required' });

    const raw = clinicalKnowledgeIngestionEngine(text, sourceId);
    const { safe, rejected, rejectionReasons } = researchValidationEngine(raw);
    const reports = safe.map(buildProvenanceReport);
    const promoted = reviewerName ? sourcePromotionEngine(safe, { reviewerName }).promoted : [];

    res.json({
      ingested: raw.length,
      safe: safe.length,
      rejected: rejected.length,
      rejectionReasons,
      promoted: promoted.length,
      edges: safe,
      provenanceReports: reports,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Meta AI Supervisor ───────────────────────────────────────────────────────
researchRouter.post('/supervisor', requireRole(['admin', 'physician']), (req, res) => {
  try {
    res.json(metaAISupervisor(req.body));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Comment Distillation ─────────────────────────────────────────────────────
researchRouter.post('/distill', requireRole(['admin', 'physician']), (req, res) => {
  try {
    const { comments } = req.body as { comments: string[] };
    if (!Array.isArray(comments) || comments.length === 0) {
      return res.status(400).json({ error: 'comments array (non-empty) required' });
    }
    res.json(commentDistillationEngine(comments));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
