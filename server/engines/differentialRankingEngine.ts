export interface DiagnosisCandidate {
  diagnosis: string;
  bayesianScore?: number;
  similarityScore?: number;
  guidelinePrior?: number;
  redFlagMatch?: boolean;
}

export interface RankedDiagnosis {
  diagnosis: string;
  probability: number;
  rank: number;
  contributors: string[];
}

export function rankDifferential(candidates: DiagnosisCandidate[]): RankedDiagnosis[] {
  const scored = candidates.map(d => {
    let probability = 0;
    const contributors: string[] = [];

    if (d.bayesianScore != null) {
      probability += d.bayesianScore * 0.4;
      contributors.push("bayesian");
    }
    if (d.similarityScore != null) {
      probability += d.similarityScore * 0.3;
      contributors.push("similarity");
    }
    if (d.guidelinePrior != null) {
      probability += d.guidelinePrior * 0.2;
      contributors.push("guideline");
    }
    if (d.redFlagMatch) {
      probability += 0.1;
      contributors.push("red_flag");
    }

    probability = Math.min(probability, 1);

    return {
      diagnosis: d.diagnosis,
      probability: Math.round(probability * 1000) / 1000,
      rank: 0,
      contributors,
    };
  });

  scored.sort((a, b) => b.probability - a.probability);
  scored.forEach((s, i) => { s.rank = i + 1; });

  return scored;
}
