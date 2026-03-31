/**
 * Bayesian Differential Diagnosis Engine
 *
 * Implements a Naive Bayes classifier for differential diagnosis.
 * Can be used standalone or as a scoring layer within the
 * hybrid-reasoning/hybridController.ts ensemble.
 *
 * The existing server/core/engines/bayesianEngine.ts handles training
 * on outcomes. This module provides:
 *  1. A symptom-to-diagnosis prior probability table (clinical literature)
 *  2. Bayesian posterior update given observed symptoms
 *  3. Ranked differential output with confidence bands
 */

export interface DiagnosisPrior {
  diagnosis: string;
  baseProbability: number;                     // P(D) — unconditional prevalence
  featureLikelihoods: Record<string, number>;  // P(symptom | D)
}

export interface DifferentialResult {
  diagnosis:   string;
  posterior:   number;     // P(D | symptoms), normalized
  confidence:  "high" | "moderate" | "low";
  matchedFeatures: string[];
}

// ── Prior probability table (ENT/Flu-slice + Musculoskeletal scope) ──────────
export const PRIORS_COUNT = 12; // updated when new entries are added to PRIORS below

const PRIORS: DiagnosisPrior[] = [
  {
    diagnosis: "Influenza A",
    baseProbability: 0.18,
    featureLikelihoods: {
      "fever":            0.92, "body aches":        0.85,
      "headache":         0.75, "cough":             0.80,
      "fatigue":          0.88, "sore throat":       0.50,
      "runny nose":       0.55, "chills":            0.78,
    },
  },
  {
    diagnosis: "COVID-19",
    baseProbability: 0.14,
    featureLikelihoods: {
      "fever":             0.88, "cough":              0.75,
      "loss of smell":     0.65, "loss of taste":      0.60,
      "fatigue":           0.82, "shortness of breath": 0.45,
      "headache":          0.60, "sore throat":        0.52,
    },
  },
  {
    diagnosis: "Strep Pharyngitis",
    baseProbability: 0.12,
    featureLikelihoods: {
      "sore throat":       0.96, "fever":              0.78,
      "tonsillar exudate": 0.70, "lymphadenopathy":    0.75,
      "headache":          0.45, "absence of cough":   0.80,
    },
  },
  {
    diagnosis: "Viral URI",
    baseProbability: 0.25,
    featureLikelihoods: {
      "runny nose":        0.90, "congestion":         0.88,
      "sore throat":       0.70, "cough":              0.65,
      "mild fever":        0.35, "sneezing":           0.80,
    },
  },
  {
    diagnosis: "Sinusitis",
    baseProbability: 0.10,
    featureLikelihoods: {
      "sinus pressure":    0.88, "facial pain":        0.75,
      "congestion":        0.82, "headache":           0.65,
      "purulent discharge": 0.70, "fever":             0.30,
      "post-nasal drip":   0.72,
    },
  },
  {
    diagnosis: "Otitis Media",
    baseProbability: 0.08,
    featureLikelihoods: {
      "ear pain":          0.95, "fever":              0.65,
      "hearing loss":      0.55, "ear fullness":       0.72,
      "discharge":         0.35,
    },
  },
  {
    diagnosis: "Pneumonia",
    baseProbability: 0.06,
    featureLikelihoods: {
      "fever":             0.88, "productive cough":   0.82,
      "shortness of breath": 0.72, "chest pain":       0.55,
      "fatigue":           0.78, "rigors":             0.60,
    },
  },
  {
    diagnosis: "Allergic Rhinitis",
    baseProbability: 0.07,
    featureLikelihoods: {
      "sneezing":          0.88, "runny nose":         0.85,
      "itchy eyes":        0.80, "congestion":         0.78,
      "no fever":          0.90, "seasonal pattern":   0.70,
    },
  },

  // ── Musculoskeletal / Shoulder ────────────────────────────────────────────
  {
    diagnosis: "Rotator Cuff Injury",
    baseProbability: 0.30,    // most common shoulder dx in adults > 40
    featureLikelihoods: {
      "shoulder pain":        0.95, "painful arc":           0.82,
      "weakness":             0.75, "lateral pain":          0.78,
      "no trauma":            0.60, "gradual onset":         0.70,
      "night pain":           0.68, "overhead activity pain": 0.80,
      "age over 40":          0.72, "loss of external rotation": 0.55,
    },
  },
  {
    diagnosis: "Shoulder Dislocation",
    baseProbability: 0.08,
    featureLikelihoods: {
      "trauma":               0.92, "deformity":             0.85,
      "arm held at side":     0.80, "severe pain":           0.90,
      "loss of external rotation": 0.75, "young male":       0.55,
      "shoulder pain":        0.95, "inability to move arm": 0.88,
    },
  },
  {
    diagnosis: "AC Joint Injury",
    baseProbability: 0.12,
    featureLikelihoods: {
      "trauma":               0.88, "top of shoulder tender": 0.92,
      "step deformity":       0.70, "direct fall onto shoulder": 0.80,
      "shoulder pain":        0.95, "arm adduction pain":    0.72,
      "cross-body pain":      0.68,
    },
  },
  {
    diagnosis: "Cervical Radiculopathy",
    baseProbability: 0.15,
    featureLikelihoods: {
      "neck pain":            0.85, "arm pain":              0.82,
      "tingling":             0.78, "numbness fingers":      0.75,
      "shoulder pain":        0.70, "weakness arm":          0.65,
      "radiation to hand":    0.72, "no trauma":             0.60,
    },
  },
];

/**
 * Perform a Bayesian posterior update across all diagnoses
 * given a list of observed symptoms.
 *
 * Uses log-sum-exp for numerical stability.
 */
export function bayesianUpdate(
  priors: DiagnosisPrior[],
  evidence: string[]
): DifferentialResult[] {
  const observedSet = new Set(evidence.map((s) => s.toLowerCase().trim()));

  // Compute log-posterior (unnormalized)
  const logScores = priors.map((prior) => {
    let logP = Math.log(prior.baseProbability);

    for (const sym of Array.from(observedSet)) {
      const likelihood = prior.featureLikelihoods[sym];
      if (likelihood !== undefined) {
        logP += Math.log(likelihood);
      } else {
        // Unknown symptom — mild penalisation
        logP += Math.log(0.3);
      }
    }
    return { prior, logP };
  });

  // Softmax normalization (log-sum-exp)
  const maxLog = Math.max(...logScores.map((x) => x.logP));
  const expSum  = logScores.reduce((s, x) => s + Math.exp(x.logP - maxLog), 0);

  return logScores
    .map(({ prior, logP }) => {
      const posterior = Math.exp(logP - maxLog) / expSum;
      const matched   = Array.from(observedSet).filter(
        (s) => prior.featureLikelihoods[s] !== undefined
      );
      return {
        diagnosis: prior.diagnosis,
        posterior: Number(posterior.toFixed(4)),
        confidence: posterior >= 0.35 ? "high" : posterior >= 0.15 ? "moderate" : "low",
        matchedFeatures: matched,
      } as DifferentialResult;
    })
    .sort((a, b) => b.posterior - a.posterior);
}

/** Run the differential engine with the built-in prior table */
export function runDifferential(symptoms: string[]): DifferentialResult[] {
  return bayesianUpdate(PRIORS, symptoms);
}

/** Return the top N differentials above a minimum confidence threshold */
export function topDifferentials(
  symptoms: string[],
  n = 5,
  minPosterior = 0.03
): DifferentialResult[] {
  return runDifferential(symptoms)
    .filter((d) => d.posterior >= minPosterior)
    .slice(0, n);
}
