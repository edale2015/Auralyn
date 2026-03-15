import { Router } from 'express';
import { requireRole } from '../middleware/requireRole';
import { metaClinicalController } from '../core/metaClinicalController';
import { architectureDiagramEngine } from '../core/architectureDiagramEngine';
import { clinicalPathVisualizer, toMermaidFormat, toCytoscapeFormat } from '../core/clinicalPathVisualizer';
import { clinicalPathImporter } from '../core/clinicalPathImporter';
import { clinicalKnowledgeExtractionEngine, extractFromCsv } from '../core/clinicalKnowledgeExtractionEngine';
import { guidelineEngine } from '../core/guidelineEngine';
import { longitudinalPatientEngine } from '../core/longitudinalPatientEngine';
import { metaClinicalIntelligenceEngine } from '../core/metaClinicalIntelligenceEngine';
import { telepresenceController } from '../services/telepresence/telepresenceController';
import { CAPABILITY_BUTTONS, getButtonsByCategory } from '../ui/capabilityButtons';

export const metaClinicalRouter = Router();

// ── Full meta-clinical analysis ───────────────────────────────────────────
metaClinicalRouter.post('/analyze', requireRole(['admin', 'physician']), async (req, res) => {
  try {
    const result = await metaClinicalController(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Guideline scoring only ────────────────────────────────────────────────
metaClinicalRouter.post('/guidelines', requireRole(['admin', 'physician']), (req, res) => {
  try {
    const result = guidelineEngine(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Longitudinal analysis ─────────────────────────────────────────────────
metaClinicalRouter.post('/longitudinal', requireRole(['admin', 'physician']), (req, res) => {
  try {
    const { current, history } = req.body;
    const result = longitudinalPatientEngine(current, history ?? []);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Meta intelligence state ───────────────────────────────────────────────
metaClinicalRouter.post('/meta-state', requireRole(['admin', 'physician']), (req, res) => {
  try {
    const result = metaClinicalIntelligenceEngine(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Telepresence device plan ──────────────────────────────────────────────
metaClinicalRouter.post('/device-plan', requireRole(['admin', 'physician']), (req, res) => {
  try {
    const result = telepresenceController(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Architecture diagram ──────────────────────────────────────────────────
metaClinicalRouter.get('/diagram', requireRole(['admin', 'physician']), (req, res) => {
  const format = (req.query.format as string) || 'mermaid';
  const result = architectureDiagramEngine(format as any);
  res.json(result);
});

// ── Clinical path visualization ───────────────────────────────────────────
metaClinicalRouter.post('/path', requireRole(['admin', 'physician']), (req, res) => {
  try {
    const { symptoms, differentials, tests, treatments, disposition, outputFormat } = req.body;
    const graph = clinicalPathVisualizer(symptoms ?? [], differentials ?? [], tests ?? [], treatments ?? [], disposition ?? 'UNKNOWN');
    const output = outputFormat === 'cytoscape' ? toCytoscapeFormat(graph) : outputFormat === 'mermaid' ? { mermaid: toMermaidFormat(graph) } : graph;
    res.json(output);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Clinical path import ──────────────────────────────────────────────────
metaClinicalRouter.post('/import-path', requireRole(['admin']), (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required' });
    res.json(clinicalPathImporter(text));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Clinical knowledge extraction ─────────────────────────────────────────
metaClinicalRouter.post('/extract-knowledge', requireRole(['admin']), (req, res) => {
  try {
    const { text, csv, source } = req.body;
    if (!text && !csv) return res.status(400).json({ error: 'text or csv required' });
    const result = csv ? extractFromCsv(csv, source) : clinicalKnowledgeExtractionEngine(text, source);
    res.json({ edges: result, count: result.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Capability buttons catalog ────────────────────────────────────────────
metaClinicalRouter.get('/capabilities', requireRole(['admin', 'physician']), (req, res) => {
  const category = req.query.category as string;
  const buttons = category ? getButtonsByCategory(category as any) : CAPABILITY_BUTTONS;
  res.json(buttons);
});
