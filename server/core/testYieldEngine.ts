export type RankedDiagnosis = {
  diagnosis: string;
  score: number;
};

export type ProposedTest = {
  name: string;
  urgency?: "urgent" | "routine";
};

export type TestYieldInput = {
  complaint: string;
  rankedDiagnoses: RankedDiagnosis[];
  proposedTests: ProposedTest[];
};

export type TestYieldResult = {
  name: string;
  urgency: "urgent" | "routine";
  yieldScore: number;
  rationale: string[];
  actionability: "high" | "moderate" | "low";
};

type DxTestMap = Record<string, {
  highYield:     string[];
  moderateYield: string[];
  lowYield:      string[];
}>;

const DX_TESTS: DxTestMap = {
  acute_coronary_syndrome: {
    highYield:     ["ecg", "troponin"],
    moderateYield: ["chest_xray", "bmp", "cbc"],
    lowYield:      ["rapid_strep", "rapid_flu"],
  },
  acs: {
    highYield:     ["ecg", "troponin"],
    moderateYield: ["chest_xray", "bmp"],
    lowYield:      ["urinalysis"],
  },
  pulmonary_embolism: {
    highYield:     ["ctpa", "ddimer"],
    moderateYield: ["ecg", "chest_xray"],
    lowYield:      ["rapid_flu", "rapid_strep"],
  },
  pneumonia: {
    highYield:     ["chest_xray"],
    moderateYield: ["cbc", "pulse_ox", "crp", "procalcitonin"],
    lowYield:      ["ct_head", "ecg"],
  },
  pyelonephritis: {
    highYield:     ["urinalysis", "urine_culture"],
    moderateYield: ["cbc", "bmp", "blood_culture"],
    lowYield:      ["ecg", "chest_xray"],
  },
  simple_cystitis: {
    highYield:     ["urinalysis"],
    moderateYield: ["urine_culture"],
    lowYield:      ["ct_abdomen_pelvis", "cbc"],
  },
  uti: {
    highYield:     ["urinalysis"],
    moderateYield: ["urine_culture"],
    lowYield:      ["ecg", "chest_xray"],
  },
  appendicitis: {
    highYield:     ["ct_abdomen_pelvis", "ultrasound_abdomen"],
    moderateYield: ["cbc", "crp", "beta_hcg_if_female"],
    lowYield:      ["rapid_strep", "ecg"],
  },
  pharyngitis: {
    highYield:     ["rapid_strep"],
    moderateYield: ["throat_culture", "monospot"],
    lowYield:      ["ecg", "chest_xray"],
  },
  meningitis: {
    highYield:     ["lp", "blood_cultures", "ct_head"],
    moderateYield: ["cbc", "cmp", "procalcitonin"],
    lowYield:      ["urinalysis", "rapid_strep"],
  },
  stroke: {
    highYield:     ["ct_head", "cta_head_neck"],
    moderateYield: ["ecg", "glucose", "cbc"],
    lowYield:      ["rapid_strep", "urinalysis"],
  },
  subarachnoid_hemorrhage: {
    highYield:     ["ct_head", "lp"],
    moderateYield: ["cta_head"],
    lowYield:      ["rapid_strep", "urinalysis"],
  },
  ectopic_pregnancy: {
    highYield:     ["beta_hcg", "pelvic_ultrasound"],
    moderateYield: ["cbc", "bmp"],
    lowYield:      ["chest_xray", "rapid_strep"],
  },
  deep_vein_thrombosis: {
    highYield:     ["doppler_ultrasound_leg", "ddimer"],
    moderateYield: ["cbc", "bmp"],
    lowYield:      ["ecg", "rapid_flu"],
  },
  sepsis: {
    highYield:     ["blood_cultures", "lactate", "cbc", "bmp"],
    moderateYield: ["procalcitonin", "urinalysis", "chest_xray"],
    lowYield:      ["rapid_strep"],
  },
  otitis_media: {
    highYield:     ["clinical_exam"],
    moderateYield: ["tympanometry"],
    lowYield:      ["cbc", "ecg", "chest_xray"],
  },
};

export function testYieldEngine(input: TestYieldInput): TestYieldResult[] {
  const results: TestYieldResult[] = [];

  for (const test of input.proposedTests) {
    let score = 0;
    const rationale: string[] = [];
    const testName = (test.name ?? "").toLowerCase();

    for (const dx of input.rankedDiagnoses.slice(0, 5)) {
      const map = DX_TESTS[dx.diagnosis];
      if (!map) continue;

      if (map.highYield.includes(testName)) {
        score += dx.score * 1.0;
        rationale.push(`${test.name} is high-yield for ${dx.diagnosis}`);
      } else if (map.moderateYield.includes(testName)) {
        score += dx.score * 0.5;
        rationale.push(`${test.name} is moderate-yield for ${dx.diagnosis}`);
      } else if (map.lowYield.includes(testName)) {
        score += dx.score * 0.1;
        rationale.push(`${test.name} is low-yield for ${dx.diagnosis}`);
      }
    }

    let actionability: "high" | "moderate" | "low" = "low";
    if (score >= 0.7)      actionability = "high";
    else if (score >= 0.3) actionability = "moderate";

    results.push({
      name:        test.name,
      urgency:     test.urgency ?? "routine",
      yieldScore:  Number(score.toFixed(3)),
      rationale:   rationale.length ? rationale : ["No strong test-yield mapping found"],
      actionability,
    });
  }

  return results.sort((a, b) => b.yieldScore - a.yieldScore);
}
