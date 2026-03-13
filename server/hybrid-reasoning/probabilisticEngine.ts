import { ClinicalCase } from "./clinicalDataset";

export interface DiagnosisProbability {
  diagnosis: string;
  probability: number;
  log_score: number;
}

export interface ProbabilisticResult {
  probabilities: DiagnosisProbability[];
  topDiagnosis: string;
  topProbability: number;
  uncertaintyScore: number;
  isUncertain: boolean;
  entropy: number;
  nextBestQuestion: string | null;
  dataPoints: number;
}

const QUESTION_BANKS: Record<string, string[]> = {
  chest_pain:    ["Does the pain radiate to your arm or jaw?","Do you have shortness of breath?","Are you sweating or feel clammy?","Is the pain reproducible by pressing on your chest?","Does it worsen with deep breathing?","Do you have palpitations?"],
  sore_throat:   ["Do you have a fever?","Do you have a cough?","Are there white patches on your tonsils?","Do you have difficulty swallowing?","Are your neck glands swollen?","Do you have drooling?"],
  cough:         ["Do you have a fever?","Is your cough productive (bringing up phlegm)?","Are you short of breath?","How long have you had the cough?","Do you have night symptoms?","Have you coughed up blood?"],
  abdominal_pain:["Is the pain in the lower right?","Do you have fever?","Are you pregnant or could you be?","Do you have nausea or vomiting?","Have you had diarrhea?","Is the pain worse when you release pressure?"],
  fever:         ["Do you have neck stiffness?","Do you have a rash?","Are you confused or disoriented?","Do you have a cough?","Have you traveled recently?","Do you have rigors (shaking chills)?"],
  uti:           ["Do you have pain with urination?","Do you have flank or back pain?","Do you have fever or chills?","Is there blood in your urine?","Are you pregnant?","Do you have vaginal discharge?"],
  ear_pain:      ["Do you have fever?","Is there discharge from the ear?","Do you have hearing loss?","Did you recently have a cold?","Do you have redness behind your ear?","Do you have jaw pain?"],
  rash:          ["Do you have fever?","Is the rash spreading?","Does it look like small red dots that don't turn white when pressed?","Is it blistering?","Do you have joint pain?","Is it itching?"],
  sinus_pressure:["How long have you had symptoms?","Do you have fever?","Is the discharge yellow or green?","Do you have facial pain or pressure?","Do you have tooth pain?","Do you have vision changes?"],
};

export class ProbabilisticDiagnosisEngine {
  private symptomGivenDx: Record<string, Record<string, number>> = {};
  private dxPrior: Record<string, number> = {};
  private trained = false;
  private totalCases = 0;

  train(cases: ClinicalCase[]): void {
    this.symptomGivenDx = {};
    this.dxPrior = {};
    this.totalCases = cases.length;

    for (const c of cases) {
      const dx = c.expected_differential[0];
      this.dxPrior[dx] = (this.dxPrior[dx] ?? 0) + 1;
      for (const s of c.key_features) {
        const sym = s.toLowerCase().replace(/\s+/g,"_");
        if (!this.symptomGivenDx[dx]) this.symptomGivenDx[dx] = {};
        this.symptomGivenDx[dx][sym] = (this.symptomGivenDx[dx][sym] ?? 0) + 1;
      }
    }
    this.trained = true;
  }

  updateFromOutcome(symptoms: string[], finalDx: string): void {
    this.dxPrior[finalDx] = (this.dxPrior[finalDx] ?? 0) + 1;
    for (const s of symptoms) {
      const sym = s.toLowerCase().replace(/\s+/g,"_");
      if (!this.symptomGivenDx[finalDx]) this.symptomGivenDx[finalDx] = {};
      this.symptomGivenDx[finalDx][sym] = (this.symptomGivenDx[finalDx][sym] ?? 0) + 1;
    }
    this.totalCases++;
  }

  getProbabilities(symptoms: string[], complaint?: string): DiagnosisProbability[] {
    if (!this.trained || Object.keys(this.dxPrior).length === 0) return [];

    const normalizedSymptoms = symptoms.map(s => s.toLowerCase().replace(/\s+/g,"_"));
    const scores: Record<string, number> = {};

    for (const dx of Object.keys(this.dxPrior)) {
      let logScore = Math.log(this.dxPrior[dx] + 1);
      for (const sym of normalizedSymptoms) {
        const symCount = this.symptomGivenDx[dx]?.[sym] ?? 0;
        logScore += Math.log(symCount + 1);
      }
      scores[dx] = logScore;
    }

    const maxScore = Math.max(...Object.values(scores));
    const expScores: Record<string, number> = {};
    for (const [dx, s] of Object.entries(scores)) {
      expScores[dx] = Math.exp(s - maxScore);
    }
    const total = Object.values(expScores).reduce((a, b) => a + b, 0);

    return Object.entries(expScores)
      .map(([diagnosis, raw]) => ({
        diagnosis,
        probability: Math.round((raw / total) * 1000) / 1000,
        log_score: Math.round(scores[diagnosis] * 100) / 100,
      }))
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 8);
  }

  calculateEntropy(probs: DiagnosisProbability[]): number {
    const vals = probs.map(p => p.probability).filter(p => p > 0);
    return -vals.reduce((sum, p) => sum + p * Math.log(p + 1e-9), 0);
  }

  isUncertain(entropy: number): boolean {
    return entropy > 1.5;
  }

  getNextBestQuestion(symptoms: string[], complaint: string): string | null {
    const bank = QUESTION_BANKS[complaint] ?? [];
    const asked = new Set(symptoms.map(s => s.toLowerCase()));
    for (const q of bank) {
      const key = q.toLowerCase().replace(/[^a-z]/g,"");
      if (!asked.has(key)) return q;
    }
    return null;
  }

  evaluate(symptoms: string[], complaint: string): ProbabilisticResult {
    const probs = this.getProbabilities(symptoms, complaint);
    const entropy = this.calculateEntropy(probs);
    const uncertain = this.isUncertain(entropy);
    const nextQ = uncertain ? this.getNextBestQuestion(symptoms, complaint) : null;
    const top = probs[0];

    return {
      probabilities: probs,
      topDiagnosis: top?.diagnosis ?? "unknown",
      topProbability: top?.probability ?? 0,
      uncertaintyScore: Math.round(entropy * 100) / 100,
      isUncertain: uncertain,
      entropy,
      nextBestQuestion: nextQ,
      dataPoints: this.totalCases,
    };
  }

  isTrained(): boolean { return this.trained; }
}

export const globalProbEngine = new ProbabilisticDiagnosisEngine();
