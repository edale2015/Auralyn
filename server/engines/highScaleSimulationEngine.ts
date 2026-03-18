export interface HighScaleSimResult {
  packId: string;
  total: number;
  accuracy: number;
  underTriageRate: number;
  overTriageRate: number;
}

export interface SimulatedCase {
  predicted: { diagnosis: string; triage: string };
  groundTruth: { diagnosis: string; triage: string };
  correct: boolean;
  underTriage: boolean;
  overTriage: boolean;
}

function generateSyntheticCase(pack: any): SimulatedCase {
  const diagnoses = ["URI", "pneumonia", "bronchitis", "GERD", "tension_headache"];
  const triageLevels = ["self_care", "office_followup", "telemed_now", "urgent_care", "er_now"];

  const pDiag = diagnoses[Math.floor(Math.random() * diagnoses.length)];
  const pTriage = triageLevels[Math.floor(Math.random() * triageLevels.length)];
  const aDiag = Math.random() > 0.2 ? pDiag : diagnoses[Math.floor(Math.random() * diagnoses.length)];
  const aTriage = Math.random() > 0.15 ? pTriage : triageLevels[Math.floor(Math.random() * triageLevels.length)];

  return {
    predicted: { diagnosis: pDiag, triage: pTriage },
    groundTruth: { diagnosis: aDiag, triage: aTriage },
    correct: pDiag === aDiag && pTriage === aTriage,
    underTriage: aTriage === "er_now" && pTriage !== "er_now",
    overTriage: aTriage !== "er_now" && pTriage === "er_now",
  };
}

export function runHighScaleSimulations(
  packs: any[],
  perPack: number = 1000
): HighScaleSimResult[] {
  const results: HighScaleSimResult[] = [];

  for (const pack of packs) {
    const cases: SimulatedCase[] = [];
    for (let i = 0; i < perPack; i++) {
      cases.push(generateSyntheticCase(pack));
    }

    results.push({
      packId: pack.id || pack.packId || "unknown",
      total: cases.length,
      accuracy: cases.filter((c) => c.correct).length / cases.length,
      underTriageRate:
        cases.filter((c) => c.underTriage).length / cases.length,
      overTriageRate:
        cases.filter((c) => c.overTriage).length / cases.length,
    });
  }

  return results;
}
