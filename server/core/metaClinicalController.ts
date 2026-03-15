import { metaClinicalIntelligenceEngine } from './metaClinicalIntelligenceEngine';
import { longitudinalPatientEngine, type VisitRecord } from './longitudinalPatientEngine';
import { guidelineEngine } from './guidelineEngine';
import { architectureDiagramEngine } from './architectureDiagramEngine';
import { clinicalPathVisualizer } from './clinicalPathVisualizer';
import { telepresenceController } from '../services/telepresence/telepresenceController';
import type { BrainCaseInput } from '../../shared/clinicalEngineTypes';

export interface MetaClinicalInput {
  caseInput: BrainCaseInput;
  patientHistory?: VisitRecord[];
  currentDiagnosis?: string;
  currentDisposition?: string;
  tests?: string[];
  treatments?: string[];
  brainOutput?: {
    differentials?: { diagnosis: string; score: number }[];
    entropy?: number;
    severityScore?: number;
    safetyTriggered?: boolean;
    questionCompleteness?: number;
    graphCoverage?: number;
    similarityConfidence?: number;
  };
}

export interface MetaClinicalOutput {
  meta: ReturnType<typeof metaClinicalIntelligenceEngine>;
  longitudinal: ReturnType<typeof longitudinalPatientEngine>;
  guideline: ReturnType<typeof guidelineEngine>;
  telepresence: ReturnType<typeof telepresenceController>;
  clinicalPath: ReturnType<typeof clinicalPathVisualizer>;
  architectureDiagram: string;
  processingTimeMs: number;
  timestamp: string;
}

export async function metaClinicalController(
  input: MetaClinicalInput
): Promise<MetaClinicalOutput> {
  const t0 = Date.now();

  const { caseInput, patientHistory, brainOutput, tests, treatments } = input;
  const differentials = brainOutput?.differentials ?? [];

  // ── Meta intelligence: adjust engine weights based on reasoning state ─────
  const meta = metaClinicalIntelligenceEngine({
    entropy: brainOutput?.entropy ?? 1.0,
    similarityConfidence: brainOutput?.similarityConfidence ?? 0.5,
    graphCoverage: brainOutput?.graphCoverage ?? 0.6,
    topDifferentialScore: differentials[0]?.score ?? 0,
    safetyTriggered: brainOutput?.safetyTriggered ?? false,
    contradictionsFound: 0,
    questionCompleteness: brainOutput?.questionCompleteness ?? 0.8,
  });

  // ── Longitudinal tracking ─────────────────────────────────────────────────
  const longitudinal = longitudinalPatientEngine(
    {
      complaint: caseInput.complaint ?? '',
      symptoms: caseInput.symptoms ?? [],
      diagnosis: input.currentDiagnosis,
      disposition: input.currentDisposition,
      severityScore: brainOutput?.severityScore,
    },
    patientHistory ?? []
  );

  // ── Clinical guideline scoring (Centor, Wells, CURB-65) ──────────────────
  const guideline = guidelineEngine({
    complaint: caseInput.complaint,
    symptoms: caseInput.symptoms,
    answers: caseInput.answers as Record<string, unknown>,
    vitals: caseInput.vitals as Record<string, number>,
    profile: caseInput.profile,
  });

  // ── Telepresence device control plan ─────────────────────────────────────
  const telepresence = telepresenceController({
    tests: [...(guideline.requiredTests ?? []), ...(tests ?? [])],
    complaint: caseInput.complaint,
    requirePhysician: input.currentDisposition === 'NEEDS_PHYSICIAN_REVIEW',
  });

  // ── Clinical path visualization ───────────────────────────────────────────
  const clinicalPath = clinicalPathVisualizer(
    caseInput.symptoms ?? [],
    differentials,
    guideline.requiredTests ?? [],
    treatments ?? [],
    input.currentDisposition ?? 'UNKNOWN'
  );

  // ── Live architecture diagram ─────────────────────────────────────────────
  const { content: architectureDiagram } = architectureDiagramEngine('mermaid');

  return {
    meta,
    longitudinal,
    guideline,
    telepresence,
    clinicalPath,
    architectureDiagram,
    processingTimeMs: Date.now() - t0,
    timestamp: new Date().toISOString(),
  };
}
