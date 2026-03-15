import { literatureScraperEngine } from './literatureScraperEngine';
import { clinicalKnowledgeIngestionEngine } from './engines/clinicalKnowledgeIngestionEngine';
import { applyWeightsToEdges } from './evidenceWeightingEngine';
import { graphDeduplicationEngine } from './graphDeduplicationEngine';
import { knowledgeGapEngine } from './knowledgeGapEngine';
import { COMPLAINTS } from '../../shared/complaints';

export interface PipelineResult {
  query: string;
  literature: {
    source: string;
    recordCount: number;
  };
  edges: {
    raw: number;
    safe: number;
    deduped: number;
  };
  weightedEdges: unknown[];
  gaps: unknown[];
  coverageScore: number;
  completedAt: string;
}

export async function researchPipelineController(
  query: string,
  options: { complaints?: string[]; sourceType?: string } = {}
): Promise<PipelineResult> {
  const litResult = await literatureScraperEngine(query);
  const combinedText = litResult.records
    .map((r) => `${r.title} ${r.abstract ?? ''}`)
    .join('\n');

  const rawEdges = clinicalKnowledgeIngestionEngine(combinedText || query, 'pubmed');
  const sourceType = options.sourceType ?? 'journal';

  const weightedEdges = applyWeightsToEdges(
    rawEdges.map((e) => ({ ...e, sourceType }))
  );

  const { deduped, removed } = graphDeduplicationEngine(weightedEdges);

  const targetComplaints = (options.complaints ?? COMPLAINTS).slice(0, 50);
  const gaps = knowledgeGapEngine({ edges: deduped }, targetComplaints);

  const critical = gaps.filter((g) => g.severity === 'critical').length;
  const moderate = gaps.filter((g) => g.severity === 'moderate').length;
  const coverageScore = Math.max(0, 1 - (critical * 0.08 + moderate * 0.03));

  return {
    query,
    literature: {
      source: litResult.source,
      recordCount: litResult.records.length,
    },
    edges: {
      raw: rawEdges.length,
      safe: rawEdges.length,
      deduped: deduped.length,
    },
    weightedEdges: deduped,
    gaps: gaps.slice(0, 20),
    coverageScore: parseFloat(coverageScore.toFixed(3)),
    completedAt: new Date().toISOString(),
  };
}
