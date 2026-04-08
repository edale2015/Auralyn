export interface DiagnosisPrior {
  diagnosis: string;
  prior: number;
}

export interface Evidence {
  feature: string;
  likelihoodRatio: number;
  present: boolean;
}

export interface BayesianResult {
  diagnosis: string;
  prior: number;
  posterior: number;
  delta: number;
}

export function runBayesianUpdate(params: { priors: DiagnosisPrior[]; evidence: Evidence[] }): BayesianResult[] {
  const { priors, evidence } = params;

  const updated = priors.map(p => {
    const safePrior = Math.max(0.001, Math.min(0.999, p.prior));
    let odds = safePrior / (1 - safePrior);

    for (const e of evidence) {
      const lr = Math.max(0.01, e.likelihoodRatio);
      odds *= e.present ? lr : 1 / lr;
    }

    const posterior = odds / (1 + odds);
    return { diagnosis: p.diagnosis, prior: safePrior, posterior, delta: posterior - safePrior };
  });

  const total = updated.reduce((s, d) => s + d.posterior, 0) || 1;

  return updated
    .map(d => ({ ...d, posterior: Math.round((d.posterior / total) * 1000) / 1000, delta: Math.round(d.delta * 1000) / 1000 }))
    .sort((a, b) => b.posterior - a.posterior);
}

const COMPLAINT_EVIDENCE: Record<string, Evidence[]> = {
  "chest pain": [
    { feature: "diaphoresis", likelihoodRatio: 4.0, present: false },
    { feature: "radiation", likelihoodRatio: 3.0, present: false },
  ],
  "fever": [
    { feature: "tachycardia", likelihoodRatio: 2.5, present: false },
    { feature: "rigors", likelihoodRatio: 3.5, present: false },
  ],
  "cough": [
    { feature: "productive", likelihoodRatio: 2.0, present: false },
    { feature: "hemoptysis", likelihoodRatio: 5.0, present: false },
  ],
};

export function buildEvidenceFromResult(result: any): Evidence[] {
  const complaint = (result.complaint ?? "").toLowerCase();
  for (const [key, evList] of Object.entries(COMPLAINT_EVIDENCE)) {
    if (complaint.includes(key)) return evList;
  }
  return [];
}
