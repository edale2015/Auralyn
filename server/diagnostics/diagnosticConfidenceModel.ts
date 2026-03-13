export interface DiagnosisModel {
  prior: number
  likelihoods: Record<string, number>
  redFlagPenalties?: Record<string, number>
}

export const DIAGNOSTIC_MODELS: Record<string, DiagnosisModel> = {
  pneumonia: {
    prior: 0.20,
    likelihoods: {
      fever: 0.75,
      cough: 0.85,
      shortnessBreath: 0.65,
      productive: 0.60,
      pleuriticPain: 0.45,
    },
    redFlagPenalties: { chestPain: -0.05 },
  },
  viral_uri: {
    prior: 0.35,
    likelihoods: {
      fever: 0.40,
      cough: 0.75,
      soreThroat: 0.60,
      shortnessBreath: 0.15,
    },
  },
  bronchitis: {
    prior: 0.25,
    likelihoods: {
      cough: 0.90,
      productive: 0.70,
      fever: 0.35,
      wheezing: 0.40,
    },
  },
  acs: {
    prior: 0.18,
    likelihoods: {
      chestPain: 0.92,
      radiation: 0.70,
      diaphoresis: 0.75,
      shortnessBreath: 0.55,
      nausea: 0.45,
    },
  },
  pericarditis: {
    prior: 0.08,
    likelihoods: {
      chestPain: 0.85,
      pleuriticPain: 0.70,
      fever: 0.60,
      radiation: 0.10,
      diaphoresis: 0.10,
    },
  },
  pulmonary_embolism: {
    prior: 0.06,
    likelihoods: {
      chestPain: 0.60,
      shortnessBreath: 0.80,
      pleuriticPain: 0.60,
      diaphoresis: 0.20,
      radiation: 0.05,
    },
  },
  gerd: {
    prior: 0.20,
    likelihoods: {
      chestPain: 0.65,
      nausea: 0.55,
      radiation: 0.15,
      diaphoresis: 0.05,
      fever: 0.05,
    },
  },
  musculoskeletal: {
    prior: 0.22,
    likelihoods: {
      chestPain: 0.70,
      pleuriticPain: 0.50,
      radiation: 0.10,
      diaphoresis: 0.03,
      fever: 0.08,
    },
  },
  meningitis: {
    prior: 0.02,
    likelihoods: {
      fever: 0.80,
      neckStiffness: 0.90,
      headache: 0.85,
      thunderclap: 0.50,
    },
  },
  subarachnoid_hemorrhage: {
    prior: 0.01,
    likelihoods: {
      thunderclap: 0.95,
      headache: 0.90,
      neckStiffness: 0.65,
    },
  },
  strep_pharyngitis: {
    prior: 0.20,
    likelihoods: {
      soreThroat: 0.85,
      fever: 0.75,
      cough: 0.05,
      trismus: 0.08,
    },
  },
  peritonsillar_abscess: {
    prior: 0.25,
    likelihoods: {
      soreThroat: 0.90,
      trismus: 0.92,
      fever: 0.88,
    },
  },
  uti: {
    prior: 0.30,
    likelihoods: {
      dysuria: 0.90,
      fever: 0.40,
      abdPain: 0.50,
    },
  },
  appendicitis: {
    prior: 0.10,
    likelihoods: {
      abdPain: 0.90,
      fever: 0.60,
      nausea: 0.70,
    },
  },
  migraine: {
    prior: 0.30,
    likelihoods: {
      headache: 0.90,
      nausea: 0.70,
      fever: 0.05,
    },
  },
  tension_headache: {
    prior: 0.40,
    likelihoods: {
      headache: 0.90,
      nausea: 0.30,
      fever: 0.05,
    },
  },
}
