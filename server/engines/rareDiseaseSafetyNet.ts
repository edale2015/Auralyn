export interface RareDiseaseMatch {
  disease: string;
  matchedSymptoms: string[];
  allRequiredSymptoms: string[];
  confidence: number;
  urgency: string;
  recommendation: string;
}

const rareDiseasePatterns: Record<string, { symptoms: string[]; urgency: string; recommendation: string }> = {
  myocarditis: {
    symptoms: ["chest_pain", "recent_viral", "palpitations"],
    urgency: "high",
    recommendation: "Consider myocarditis workup: troponin, ECG, echocardiogram",
  },
  pheochromocytoma: {
    symptoms: ["headache", "palpitations", "hypertension"],
    urgency: "moderate",
    recommendation: "Consider 24hr urine catecholamines",
  },
  guillain_barre: {
    symptoms: ["weakness", "recent_infection", "ascending_numbness"],
    urgency: "high",
    recommendation: "Urgent neurology referral, consider LP and NCS/EMG",
  },
  pulmonary_embolism: {
    symptoms: ["chest_pain", "dyspnea", "recent_immobilization"],
    urgency: "critical",
    recommendation: "CT pulmonary angiogram, assess Wells score",
  },
  aortic_dissection: {
    symptoms: ["chest_pain", "tearing_quality", "blood_pressure_differential"],
    urgency: "critical",
    recommendation: "Stat CT aortogram, bilateral blood pressures",
  },
  meningococcemia: {
    symptoms: ["fever", "petechiae", "neck_stiffness"],
    urgency: "critical",
    recommendation: "Immediate IV antibiotics, blood cultures, LP if safe",
  },
  kawasaki_disease: {
    symptoms: ["fever", "rash", "conjunctivitis", "lymphadenopathy"],
    urgency: "high",
    recommendation: "Pediatric cardiology referral, echocardiogram, IVIG consideration",
  },
};

export function checkRareDiseases(symptoms: string[]): RareDiseaseMatch[] {
  const matches: RareDiseaseMatch[] = [];
  const normalizedSymptoms = symptoms.map(s => s.toLowerCase().replace(/\s/g, "_"));

  Object.entries(rareDiseasePatterns).forEach(([disease, pattern]) => {
    const matched = pattern.symptoms.filter(p => normalizedSymptoms.includes(p));
    const coverage = matched.length / pattern.symptoms.length;

    if (coverage >= 0.5) {
      matches.push({
        disease,
        matchedSymptoms: matched,
        allRequiredSymptoms: pattern.symptoms,
        confidence: Math.round(coverage * 100) / 100,
        urgency: pattern.urgency,
        recommendation: pattern.recommendation,
      });
    }
  });

  return matches.sort((a, b) => b.confidence - a.confidence);
}
