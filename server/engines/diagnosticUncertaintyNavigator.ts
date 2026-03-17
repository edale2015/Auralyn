export interface DiagnosisProb {
  diagnosis: string;
  probability: number;
}

export interface QuestionOutcome {
  answer: string;
  probabilities: DiagnosisProb[];
}

export interface CandidateQuestion {
  id: string;
  text: string;
  outcomes: QuestionOutcome[];
}

export interface NavigatorResult {
  bestQuestion: CandidateQuestion | null;
  informationGain: number;
  currentEntropy: number;
  rankings: { questionId: string; text: string; gain: number }[];
}

function entropy(probs: number[]): number {
  let e = 0;
  for (const p of probs) {
    if (p > 0) e -= p * Math.log2(p);
  }
  return e;
}

const DEMO_PROBS: DiagnosisProb[] = [
  { diagnosis: "URI", probability: 0.25 },
  { diagnosis: "Sinusitis", probability: 0.15 },
  { diagnosis: "Strep Pharyngitis", probability: 0.15 },
  { diagnosis: "Influenza", probability: 0.12 },
  { diagnosis: "Allergic Rhinitis", probability: 0.10 },
  { diagnosis: "Pneumonia", probability: 0.08 },
  { diagnosis: "COVID-19", probability: 0.07 },
  { diagnosis: "Otitis Media", probability: 0.05 },
  { diagnosis: "Migraine", probability: 0.03 },
];

const DEMO_QUESTIONS: CandidateQuestion[] = [
  {
    id: "q_fever", text: "Do you have a fever?",
    outcomes: [
      { answer: "yes", probabilities: [{ diagnosis: "URI", probability: 0.15 }, { diagnosis: "Influenza", probability: 0.30 }, { diagnosis: "Strep Pharyngitis", probability: 0.25 }, { diagnosis: "Pneumonia", probability: 0.15 }, { diagnosis: "COVID-19", probability: 0.15 }] },
      { answer: "no", probabilities: [{ diagnosis: "URI", probability: 0.30 }, { diagnosis: "Allergic Rhinitis", probability: 0.30 }, { diagnosis: "Sinusitis", probability: 0.20 }, { diagnosis: "Migraine", probability: 0.10 }, { diagnosis: "Otitis Media", probability: 0.10 }] },
    ],
  },
  {
    id: "q_cough", text: "Do you have a cough?",
    outcomes: [
      { answer: "yes", probabilities: [{ diagnosis: "URI", probability: 0.30 }, { diagnosis: "Pneumonia", probability: 0.20 }, { diagnosis: "Influenza", probability: 0.20 }, { diagnosis: "COVID-19", probability: 0.15 }, { diagnosis: "Sinusitis", probability: 0.15 }] },
      { answer: "no", probabilities: [{ diagnosis: "Strep Pharyngitis", probability: 0.25 }, { diagnosis: "Otitis Media", probability: 0.20 }, { diagnosis: "Allergic Rhinitis", probability: 0.20 }, { diagnosis: "Migraine", probability: 0.20 }, { diagnosis: "Sinusitis", probability: 0.15 }] },
    ],
  },
  {
    id: "q_throat", text: "Is your throat sore?",
    outcomes: [
      { answer: "yes", probabilities: [{ diagnosis: "Strep Pharyngitis", probability: 0.40 }, { diagnosis: "URI", probability: 0.25 }, { diagnosis: "Influenza", probability: 0.15 }, { diagnosis: "COVID-19", probability: 0.10 }, { diagnosis: "Sinusitis", probability: 0.10 }] },
      { answer: "no", probabilities: [{ diagnosis: "Allergic Rhinitis", probability: 0.25 }, { diagnosis: "Sinusitis", probability: 0.20 }, { diagnosis: "Pneumonia", probability: 0.20 }, { diagnosis: "Otitis Media", probability: 0.15 }, { diagnosis: "Migraine", probability: 0.10 }, { diagnosis: "URI", probability: 0.10 }] },
    ],
  },
  {
    id: "q_nasal", text: "Do you have nasal congestion?",
    outcomes: [
      { answer: "yes", probabilities: [{ diagnosis: "Allergic Rhinitis", probability: 0.30 }, { diagnosis: "Sinusitis", probability: 0.30 }, { diagnosis: "URI", probability: 0.25 }, { diagnosis: "COVID-19", probability: 0.10 }, { diagnosis: "Influenza", probability: 0.05 }] },
      { answer: "no", probabilities: [{ diagnosis: "Strep Pharyngitis", probability: 0.25 }, { diagnosis: "Pneumonia", probability: 0.20 }, { diagnosis: "Otitis Media", probability: 0.20 }, { diagnosis: "Migraine", probability: 0.20 }, { diagnosis: "Influenza", probability: 0.15 }] },
    ],
  },
  {
    id: "q_ear", text: "Do you have ear pain?",
    outcomes: [
      { answer: "yes", probabilities: [{ diagnosis: "Otitis Media", probability: 0.50 }, { diagnosis: "Sinusitis", probability: 0.20 }, { diagnosis: "Strep Pharyngitis", probability: 0.15 }, { diagnosis: "URI", probability: 0.10 }, { diagnosis: "Migraine", probability: 0.05 }] },
      { answer: "no", probabilities: [{ diagnosis: "URI", probability: 0.25 }, { diagnosis: "Influenza", probability: 0.15 }, { diagnosis: "Allergic Rhinitis", probability: 0.15 }, { diagnosis: "Sinusitis", probability: 0.15 }, { diagnosis: "COVID-19", probability: 0.10 }, { diagnosis: "Pneumonia", probability: 0.10 }, { diagnosis: "Strep Pharyngitis", probability: 0.10 }] },
    ],
  },
];

export class DiagnosticUncertaintyNavigator {
  chooseNextQuestion(currentProbs?: DiagnosisProb[], questions?: CandidateQuestion[]): NavigatorResult {
    const probs = currentProbs?.length ? currentProbs : DEMO_PROBS;
    const qs = questions?.length ? questions : DEMO_QUESTIONS;

    const currentEntropy = entropy(probs.map((p) => p.probability));
    const rankings: { questionId: string; text: string; gain: number }[] = [];

    let bestQuestion: CandidateQuestion | null = null;
    let bestGain = -Infinity;

    for (const q of qs) {
      let weightedAfterEntropy = 0;
      for (const outcome of q.outcomes) {
        const oe = entropy(outcome.probabilities.map((p) => p.probability));
        weightedAfterEntropy += oe / q.outcomes.length;
      }
      const gain = currentEntropy - weightedAfterEntropy;
      rankings.push({ questionId: q.id, text: q.text, gain: Number(gain.toFixed(4)) });

      if (gain > bestGain) {
        bestGain = gain;
        bestQuestion = q;
      }
    }

    rankings.sort((a, b) => b.gain - a.gain);

    return {
      bestQuestion,
      informationGain: Number(bestGain.toFixed(4)),
      currentEntropy: Number(currentEntropy.toFixed(4)),
      rankings,
    };
  }
}

export const diagnosticUncertaintyNavigator = new DiagnosticUncertaintyNavigator();
