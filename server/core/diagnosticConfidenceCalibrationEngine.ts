import type { DifferentialScore } from '../../shared/clinicalEngineTypes';

export function calibrateDiagnosticConfidence(differentials: DifferentialScore[]): DifferentialScore[] {
  return differentials.map((d) => ({
    ...d,
    score: d.score > 0.85 ? 0.85 + (d.score - 0.85) * 0.25 : d.score
  }));
}
