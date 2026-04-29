/**
 * bayesianConfidenceUpdater.ts
 * server/reasoning/bayesianConfidenceUpdater.ts
 *
 * Incremental Bayesian belief updating as each symptom answer arrives.
 * Each observation raises or lowers the probability of each differential
 * diagnosis using Bayes' theorem in log-odds form, with likelihood ratios
 * derived from clinical evidence bases (Centor, HEART score, Wells, etc.).
 *
 * Fisher information approximation tracks how much each observation
 * moved the needle — surfaces as "why the AI said this" in the physician UI.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DiagnosisHypothesis {
  diagnosis:  string;
  icdCode?:   string;
  prior:      number;
  posterior:  number;
  logOdds:    number;
  urgency:    "emergent" | "urgent" | "routine";
}

export interface EvidenceContribution {
  questionId:       string;
  answerValue:      string;
  diagnosis:        string;
  likelihoodRatio:  number;
  informationGain:  number;
  direction:        "supporting" | "contradicting" | "neutral";
}

export interface BeliefState {
  complaintSlug:          string;
  observationCount:       number;
  differential:           DiagnosisHypothesis[];
  evidencePath:           EvidenceContribution[];
  topDiagnosis:           DiagnosisHypothesis;
  uncertainty:            number;
  entropyBits:            number;
  requiresMoreEvidence:   boolean;
  suggestedNextQuestions: string[];
}

// ─── Clinical likelihood ratios ───────────────────────────────────────────────

interface LikelihoodRatioTable {
  [questionId: string]: {
    [answerValue: string]: {
      [diagnosis: string]: number;
    };
  };
}

const SORE_THROAT_LR: LikelihoodRatioTable = {
  fever: {
    yes: {
      "Group A Streptococcal Pharyngitis": 1.8,
      "Viral Pharyngitis":                 0.7,
      "Infectious Mononucleosis":          1.4,
    },
    no: {
      "Group A Streptococcal Pharyngitis": 0.5,
      "Viral Pharyngitis":                 1.3,
      "Infectious Mononucleosis":          0.8,
    },
  },
  cough: {
    yes: {
      "Group A Streptococcal Pharyngitis": 0.53,
      "Viral Pharyngitis":                 1.6,
      "Infectious Mononucleosis":          0.9,
    },
    no: {
      "Group A Streptococcal Pharyngitis": 1.5,
      "Viral Pharyngitis":                 0.7,
      "Infectious Mononucleosis":          1.1,
    },
  },
  exudate: {
    yes: {
      "Group A Streptococcal Pharyngitis": 2.2,
      "Viral Pharyngitis":                 0.6,
      "Infectious Mononucleosis":          1.8,
    },
    no: {
      "Group A Streptococcal Pharyngitis": 0.6,
      "Viral Pharyngitis":                 1.2,
      "Infectious Mononucleosis":          0.7,
    },
  },
  lymphadenopathy: {
    yes: {
      "Group A Streptococcal Pharyngitis": 1.7,
      "Viral Pharyngitis":                 0.8,
      "Infectious Mononucleosis":          2.5,
    },
    no: {
      "Group A Streptococcal Pharyngitis": 0.7,
      "Viral Pharyngitis":                 1.1,
      "Infectious Mononucleosis":          0.4,
    },
  },
  age_under_15: {
    yes: {
      "Group A Streptococcal Pharyngitis": 1.4,
      "Viral Pharyngitis":                 0.9,
      "Infectious Mononucleosis":          1.2,
    },
    no: {
      "Group A Streptococcal Pharyngitis": 0.8,
      "Viral Pharyngitis":                 1.1,
      "Infectious Mononucleosis":          0.9,
    },
  },
};

const CHEST_PAIN_LR: LikelihoodRatioTable = {
  radiation_left_arm: {
    yes: {
      "Acute Coronary Syndrome":    2.8,
      "Musculoskeletal Chest Pain": 0.4,
      "GERD/Esophageal":            0.6,
      "Pleuritis":                  0.7,
    },
    no: {
      "Acute Coronary Syndrome":    0.6,
      "Musculoskeletal Chest Pain": 1.3,
      "GERD/Esophageal":            1.2,
      "Pleuritis":                  1.1,
    },
  },
  diaphoresis: {
    yes: {
      "Acute Coronary Syndrome":    2.3,
      "Musculoskeletal Chest Pain": 0.3,
      "GERD/Esophageal":            0.5,
      "Pleuritis":                  0.6,
    },
    no: {
      "Acute Coronary Syndrome":    0.7,
      "Musculoskeletal Chest Pain": 1.2,
      "GERD/Esophageal":            1.1,
      "Pleuritis":                  1.0,
    },
  },
  pleuritic: {
    yes: {
      "Acute Coronary Syndrome":    0.4,
      "Musculoskeletal Chest Pain": 1.2,
      "GERD/Esophageal":            0.8,
      "Pleuritis":                  3.2,
    },
    no: {
      "Acute Coronary Syndrome":    1.3,
      "Musculoskeletal Chest Pain": 0.9,
      "GERD/Esophageal":            1.1,
      "Pleuritis":                  0.5,
    },
  },
  reproducible_palpation: {
    yes: {
      "Acute Coronary Syndrome":    0.3,
      "Musculoskeletal Chest Pain": 3.5,
      "GERD/Esophageal":            0.8,
      "Pleuritis":                  0.7,
    },
    no: {
      "Acute Coronary Syndrome":    1.4,
      "Musculoskeletal Chest Pain": 0.5,
      "GERD/Esophageal":            1.1,
      "Pleuritis":                  1.0,
    },
  },
  known_cad: {
    yes: {
      "Acute Coronary Syndrome":    2.1,
      "Musculoskeletal Chest Pain": 0.8,
      "GERD/Esophageal":            0.9,
      "Pleuritis":                  0.9,
    },
    no: {
      "Acute Coronary Syndrome":    0.8,
      "Musculoskeletal Chest Pain": 1.0,
      "GERD/Esophageal":            1.0,
      "Pleuritis":                  1.0,
    },
  },
};

const LR_TABLES: Record<string, LikelihoodRatioTable> = {
  sore_throat: SORE_THROAT_LR,
  chest_pain:  CHEST_PAIN_LR,
};

const PRIORS: Record<string, Record<string, number>> = {
  sore_throat: {
    "Viral Pharyngitis":                 0.60,
    "Group A Streptococcal Pharyngitis": 0.30,
    "Infectious Mononucleosis":          0.07,
    "Peritonsillar Abscess":             0.03,
  },
  chest_pain: {
    "Musculoskeletal Chest Pain": 0.40,
    "GERD/Esophageal":            0.25,
    "Acute Coronary Syndrome":    0.15,
    "Pleuritis":                  0.10,
    "Panic/Anxiety":              0.10,
  },
};

// ─── Math utilities ───────────────────────────────────────────────────────────

function logit(p: number): number {
  const clamped = Math.max(0.001, Math.min(0.999, p));
  return Math.log(clamped / (1 - clamped));
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function shannonEntropy(probs: number[]): number {
  return -probs.reduce((sum, p) => {
    if (p <= 0) return sum;
    return sum + p * Math.log2(p);
  }, 0);
}

function fisherInformationGain(prior: number, posterior: number): number {
  const delta = Math.abs(posterior - prior);
  return delta / Math.max(prior, 1 - prior);
}

// ─── Bayesian Confidence Updater ──────────────────────────────────────────────

export class BayesianConfidenceUpdater {
  private complaintSlug: string;
  private hypotheses:    Map<string, DiagnosisHypothesis>;
  private evidencePath:  EvidenceContribution[] = [];
  private lrTable:       LikelihoodRatioTable | null;

  constructor(complaintSlug: string) {
    this.complaintSlug = complaintSlug;
    this.lrTable       = LR_TABLES[complaintSlug] ?? null;
    this.hypotheses    = new Map();

    const priors = PRIORS[complaintSlug] ?? { "Undifferentiated Complaint": 1.0 };
    for (const [diagnosis, prior] of Object.entries(priors)) {
      this.hypotheses.set(diagnosis, {
        diagnosis,
        prior,
        posterior: prior,
        logOdds:   logit(prior),
        urgency:   this.inferUrgency(diagnosis),
      });
    }
  }

  observe(questionId: string, answerValue: string): void {
    if (!this.lrTable) return;
    const questionLRs = this.lrTable[questionId];
    if (!questionLRs) return;
    const answerLRs = questionLRs[String(answerValue).toLowerCase()];
    if (!answerLRs) return;

    for (const [diagnosis, hypothesis] of this.hypotheses.entries()) {
      const lr = answerLRs[diagnosis];
      if (lr === undefined) continue;

      const prevPosterior = hypothesis.posterior;
      const newLogOdds    = hypothesis.logOdds + Math.log(lr);
      const newPosterior  = sigmoid(newLogOdds);
      const infoGain      = fisherInformationGain(prevPosterior, newPosterior);

      this.evidencePath.push({
        questionId,
        answerValue:     String(answerValue),
        diagnosis,
        likelihoodRatio: lr,
        informationGain: infoGain,
        direction: lr > 1.05 ? "supporting" :
                   lr < 0.95 ? "contradicting" : "neutral",
      });

      this.hypotheses.set(diagnosis, {
        ...hypothesis,
        posterior: newPosterior,
        logOdds:   newLogOdds,
      });
    }

    this.normalize();
  }

  private normalize(): void {
    const total = Array.from(this.hypotheses.values())
      .reduce((sum, h) => sum + h.posterior, 0);
    if (total <= 0) return;

    for (const [diagnosis, hypothesis] of this.hypotheses.entries()) {
      const normalized = hypothesis.posterior / total;
      this.hypotheses.set(diagnosis, {
        ...hypothesis,
        posterior: normalized,
        logOdds:   logit(normalized),
      });
    }
  }

  getBeliefState(): BeliefState {
    const differential = Array.from(this.hypotheses.values())
      .sort((a, b) => b.posterior - a.posterior);

    const posteriors   = differential.map(h => h.posterior);
    const entropy      = shannonEntropy(posteriors);
    const maxEntropy   = Math.log2(Math.max(differential.length, 1));
    const uncertainty  = maxEntropy > 0 ? entropy / maxEntropy : 0;
    const topDiagnosis = differential[0];

    return {
      complaintSlug:          this.complaintSlug,
      observationCount:       this.evidencePath.length,
      differential,
      evidencePath:           this.evidencePath,
      topDiagnosis,
      uncertainty,
      entropyBits:            entropy,
      requiresMoreEvidence:   uncertainty > 0.6 && this.evidencePath.length < 3,
      suggestedNextQuestions: this.suggestNextQuestions(differential),
    };
  }

  private suggestNextQuestions(differential: DiagnosisHypothesis[]): string[] {
    if (!this.lrTable) return [];
    const top2 = differential.slice(0, 2).map(h => h.diagnosis);
    const answered = new Set(this.evidencePath.map(e => e.questionId));
    const scores: Array<{ questionId: string; discriminatingPower: number }> = [];

    for (const [qId, answers] of Object.entries(this.lrTable)) {
      if (answered.has(qId)) continue;
      let maxDiff = 0;
      for (const answerLRs of Object.values(answers)) {
        const lrs = top2.map(dx => answerLRs[dx] ?? 1.0);
        const diff = Math.abs(Math.log(lrs[0] ?? 1) - Math.log(lrs[1] ?? 1));
        maxDiff = Math.max(maxDiff, diff);
      }
      scores.push({ questionId: qId, discriminatingPower: maxDiff });
    }

    return scores
      .sort((a, b) => b.discriminatingPower - a.discriminatingPower)
      .slice(0, 3)
      .map(q => q.questionId);
  }

  private inferUrgency(diagnosis: string): "emergent" | "urgent" | "routine" {
    const emergent = ["Acute Coronary Syndrome", "Pulmonary Embolism", "Peritonsillar Abscess", "Appendicitis"];
    const urgent   = ["Group A Streptococcal Pharyngitis", "Infectious Mononucleosis", "DVT", "Hypertensive Urgency"];
    if (emergent.some(d => diagnosis.includes(d))) return "emergent";
    if (urgent.some(d => diagnosis.includes(d)))   return "urgent";
    return "routine";
  }
}

// ─── Evidence path summarizer ─────────────────────────────────────────────────

export function summarizeEvidencePath(belief: BeliefState): string {
  const top = belief.topDiagnosis;

  const supporting = belief.evidencePath
    .filter(e => e.diagnosis === top.diagnosis && e.direction === "supporting")
    .sort((a, b) => b.informationGain - a.informationGain)
    .slice(0, 3);

  const contradicting = belief.evidencePath
    .filter(e => e.diagnosis === top.diagnosis && e.direction === "contradicting")
    .sort((a, b) => b.informationGain - a.informationGain)
    .slice(0, 2);

  const lines: string[] = [
    `Top diagnosis: ${top.diagnosis} (${Math.round(top.posterior * 100)}% probability)`,
  ];

  if (supporting.length > 0) {
    lines.push(`Supporting: ${supporting.map(e =>
      `${e.questionId}=${e.answerValue} (LR ${e.likelihoodRatio.toFixed(1)})`
    ).join(", ")}`);
  }

  if (contradicting.length > 0) {
    lines.push(`Against: ${contradicting.map(e =>
      `${e.questionId}=${e.answerValue} (LR ${e.likelihoodRatio.toFixed(1)})`
    ).join(", ")}`);
  }

  if (belief.uncertainty > 0.6) {
    lines.push(`⚠ High uncertainty (${Math.round(belief.uncertainty * 100)}%) — ${
      belief.requiresMoreEvidence ? "more evidence needed" : "physician judgment essential"
    }`);
  }

  return lines.join("\n");
}
