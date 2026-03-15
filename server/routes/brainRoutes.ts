import { Router } from 'express';
import { runClinicalBrainCoordinator } from '../core/brain/coordinator';
import { CLINICAL_GRAPH_EDGES } from '../data/clinicalKnowledgeGraph';
import { BrainCaseInput } from '../../shared/brainEngineTypes';

export const brainRouter = Router();

/**
 * POST /api/brain/run
 * Runs the full Clinical Brain Coordinator pipeline (23-step, RankedItem type system).
 *
 * Body: BrainCaseInput
 * {
 *   caseId: string,
 *   complaint: string,
 *   symptoms: string[],
 *   ageYears?: number,
 *   sex?: 'male' | 'female' | 'other' | 'unknown',
 *   vitals?: { spo2?, heartRate?, systolicBP?, temperatureC? },
 *   riskFactors?: string[],
 *   meds?: string[],
 *   answeredQuestions?: string[],
 *   priorSnapshots?: PriorSnapshot[]
 * }
 */
brainRouter.post('/run', (req, res) => {
  try {
    const input = req.body as BrainCaseInput;
    if (!input?.caseId || !input?.complaint || !Array.isArray(input?.symptoms)) {
      return res.status(400).json({
        error: 'Invalid BrainCaseInput: caseId, complaint, and symptoms[] are required.'
      });
    }
    const output = runClinicalBrainCoordinator(input);
    return res.json({ ok: true, output });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[BrainRouter] Error running coordinator:', message);
    return res.status(500).json({ error: message });
  }
});

/**
 * GET /api/brain/graph-info
 * Returns stats about the clinical knowledge graph edges.
 */
brainRouter.get('/graph-info', (_req, res) => {
  const byRelation: Record<string, number> = {};
  for (const edge of CLINICAL_GRAPH_EDGES) {
    byRelation[edge.relation] = (byRelation[edge.relation] || 0) + 1;
  }
  return res.json({ totalEdges: CLINICAL_GRAPH_EDGES.length, byRelation });
});
