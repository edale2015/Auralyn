export interface CentorInput {
  fever: boolean;
  tonsillarExudate: boolean;
  tenderNodes: boolean;
  cough: boolean;
  age?: number;
}

export interface WellsInput {
  clinicalSignsDVT: boolean;
  heartRate: number;
  recentImmobilization: boolean;
  previousDVT: boolean;
  hemoptysis: boolean;
  malignancy: boolean;
}

export interface HEARTInput {
  history: number;
  ecg: number;
  age: number;
  riskFactors: number;
  troponin: number;
}

export interface RiskScoreResult {
  scoreName: string;
  score: number;
  maxScore: number;
  interpretation: string;
  recommendation: string;
}

export class ClinicalRiskScoringEngine {
  centor(data: CentorInput): RiskScoreResult {
    let score = 0;
    if (data.fever) score++;
    if (data.tonsillarExudate) score++;
    if (data.tenderNodes) score++;
    if (!data.cough) score++;
    if (data.age !== undefined) {
      if (data.age >= 3 && data.age < 15) score++;
      else if (data.age >= 45) score--;
    }

    let interpretation: string;
    let recommendation: string;
    if (score <= 1) {
      interpretation = "Low probability of streptococcal pharyngitis";
      recommendation = "No testing or antibiotics needed";
    } else if (score <= 3) {
      interpretation = "Moderate probability — consider rapid strep test";
      recommendation = "Perform rapid antigen detection test";
    } else {
      interpretation = "High probability of streptococcal pharyngitis";
      recommendation = "Consider empiric antibiotics or confirm with culture";
    }

    return { scoreName: "Modified Centor", score: Math.max(0, score), maxScore: 5, interpretation, recommendation };
  }

  wells(data: WellsInput): RiskScoreResult {
    let score = 0;
    if (data.clinicalSignsDVT) score += 3;
    if (data.heartRate > 100) score += 1.5;
    if (data.recentImmobilization) score += 1.5;
    if (data.previousDVT) score += 1.5;
    if (data.hemoptysis) score += 1;
    if (data.malignancy) score += 1;

    let interpretation: string;
    let recommendation: string;
    if (score < 2) {
      interpretation = "Low probability of PE";
      recommendation = "D-dimer testing if clinical suspicion";
    } else if (score <= 6) {
      interpretation = "Moderate probability of PE";
      recommendation = "CT pulmonary angiography recommended";
    } else {
      interpretation = "High probability of PE";
      recommendation = "Immediate CT angiography and anticoagulation";
    }

    return { scoreName: "Wells Score (PE)", score, maxScore: 12.5, interpretation, recommendation };
  }

  heart(data: HEARTInput): RiskScoreResult {
    const score = data.history + data.ecg + data.age + data.riskFactors + data.troponin;

    let interpretation: string;
    let recommendation: string;
    if (score <= 3) {
      interpretation = "Low risk for major adverse cardiac event";
      recommendation = "Safe for early discharge with outpatient follow-up";
    } else if (score <= 6) {
      interpretation = "Moderate risk — observation recommended";
      recommendation = "Admission for observation and serial troponins";
    } else {
      interpretation = "High risk for MACE";
      recommendation = "Early invasive strategy recommended";
    }

    return { scoreName: "HEART Score", score, maxScore: 10, interpretation, recommendation };
  }

  runDemoScores(): RiskScoreResult[] {
    return [
      this.centor({ fever: true, tonsillarExudate: true, tenderNodes: true, cough: false, age: 25 }),
      this.wells({ clinicalSignsDVT: false, heartRate: 88, recentImmobilization: false, previousDVT: false, hemoptysis: false, malignancy: false }),
      this.heart({ history: 1, ecg: 0, age: 1, riskFactors: 1, troponin: 0 }),
    ];
  }
}

export const clinicalRiskScoringEngine = new ClinicalRiskScoringEngine();
