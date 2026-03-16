export type SimComplaint =
  | "cough"
  | "chest_pain"
  | "headache"
  | "dizziness"
  | "sore_throat"
  | "fever"
  | "ear_pain"
  | "breathlessness";

export interface SimulationCase {
  caseId: string;
  complaint: SimComplaint;
  age: number;
  sex: "male" | "female";
  features: Record<string, any>;
  expectedDisposition: "er_now" | "urgent_care" | "self_care";
  expectedTopDiagnosis?: string;
  goldFlags?: string[];
  difficulty: "easy" | "moderate" | "hard";
}

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function uid(prefix = "sim"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function buildSimulationCase(
  complaint: SimComplaint,
  difficulty: "easy" | "moderate" | "hard" = "moderate"
): SimulationCase {
  const age = randInt(1, 90);
  const sex = pick(["male", "female"] as const);

  const base: SimulationCase = {
    caseId: uid(),
    complaint,
    age,
    sex,
    features: {},
    expectedDisposition: "self_care",
    difficulty,
    goldFlags: [],
  };

  switch (complaint) {
    case "cough": {
      const fever = Math.random() > 0.5;
      const sob = Math.random() > 0.7;
      const durationDays = randInt(1, 21);
      const chestPain = Math.random() > 0.8;

      base.features = {
        fever,
        sob,
        durationDays,
        chestPain,
        asthmaHistory: Math.random() > 0.7,
        smoking: Math.random() > 0.6,
      };

      if (sob || chestPain) {
        base.expectedDisposition = "urgent_care";
        base.expectedTopDiagnosis = "pneumonia_vs_bronchitis";
        base.goldFlags = ["shortness_of_breath"];
      } else if (fever && durationDays > 7) {
        base.expectedDisposition = "urgent_care";
        base.expectedTopDiagnosis = "pneumonia";
      } else {
        base.expectedDisposition = "self_care";
        base.expectedTopDiagnosis = "viral_uri";
      }
      break;
    }

    case "chest_pain": {
      const exertional = Math.random() > 0.6;
      const sob = Math.random() > 0.5;
      const diaphoresis = Math.random() > 0.75;
      const tearing = Math.random() > 0.92;

      base.features = {
        exertional,
        sob,
        diaphoresis,
        tearing,
        radiationToArm: Math.random() > 0.65,
        pleuritic: Math.random() > 0.75,
      };

      if (tearing || diaphoresis || (exertional && sob)) {
        base.expectedDisposition = "er_now";
        base.expectedTopDiagnosis = tearing ? "aortic_dissection" : "acute_coronary_syndrome";
        base.goldFlags = tearing ? ["tearing_pain"] : ["possible_acs"];
      } else {
        base.expectedDisposition = "urgent_care";
        base.expectedTopDiagnosis = "musculoskeletal_or_gerd";
      }
      break;
    }

    case "headache": {
      const worst = Math.random() > 0.88;
      const neckStiff = Math.random() > 0.85;
      const neuroDeficit = Math.random() > 0.9;

      base.features = {
        worst,
        neckStiff,
        neuroDeficit,
        fever: Math.random() > 0.55,
        vomiting: Math.random() > 0.4,
      };

      if (worst || neckStiff || neuroDeficit) {
        base.expectedDisposition = "er_now";
        base.expectedTopDiagnosis = worst ? "subarachnoid_hemorrhage" : "meningitis_or_stroke";
        base.goldFlags = ["neurologic_or_meningeal_red_flag"];
      } else {
        base.expectedDisposition = "urgent_care";
        base.expectedTopDiagnosis = "migraine_or_tension";
      }
      break;
    }

    case "dizziness": {
      const unilateralWeakness = Math.random() > 0.92;
      const speechChange = Math.random() > 0.9;
      const positional = Math.random() > 0.55;

      base.features = {
        unilateralWeakness,
        speechChange,
        positional,
        vomiting: Math.random() > 0.5,
        medicationChange: Math.random() > 0.7,
      };

      if (unilateralWeakness || speechChange) {
        base.expectedDisposition = "er_now";
        base.expectedTopDiagnosis = "stroke";
        base.goldFlags = ["stroke_red_flag"];
      } else if (positional) {
        base.expectedDisposition = "urgent_care";
        base.expectedTopDiagnosis = "bppv";
      } else {
        base.expectedDisposition = "urgent_care";
        base.expectedTopDiagnosis = "nonspecific_dizziness";
      }
      break;
    }

    case "breathlessness": {
      const acute = Math.random() > 0.55;
      const stridor = Math.random() > 0.9;
      const sat = randInt(82, 100);

      base.features = { acute, stridor, saturation: sat, cyanosis: sat < 90 };

      if (stridor || sat < 90 || (acute && sat < 94)) {
        base.expectedDisposition = "er_now";
        base.expectedTopDiagnosis = stridor ? "upper_airway_obstruction" : "acute_respiratory_failure";
        base.goldFlags = ["hypoxia_flag"];
      } else {
        base.expectedDisposition = "urgent_care";
        base.expectedTopDiagnosis = "asthma_exacerbation";
      }
      break;
    }

    case "fever": {
      const temp = 37 + Math.random() * 4;
      const rash = Math.random() > 0.85;
      const petechiae = Math.random() > 0.95;
      const infant = age < 3;

      base.features = { temperature: Math.round(temp * 10) / 10, rash, petechiae, infant };

      if (petechiae || (infant && temp > 38.5)) {
        base.expectedDisposition = "er_now";
        base.expectedTopDiagnosis = petechiae ? "meningococcemia" : "febrile_infant";
        base.goldFlags = ["fever_red_flag"];
      } else if (temp > 39.5 || rash) {
        base.expectedDisposition = "urgent_care";
        base.expectedTopDiagnosis = "bacterial_infection";
      } else {
        base.expectedDisposition = "self_care";
        base.expectedTopDiagnosis = "viral_fever";
      }
      break;
    }

    case "ear_pain": {
      const discharge = Math.random() > 0.7;
      const mastoidTenderness = Math.random() > 0.92;
      const hearingLoss = Math.random() > 0.6;

      base.features = { discharge, mastoidTenderness, hearingLoss, durationDays: randInt(1, 14) };

      if (mastoidTenderness) {
        base.expectedDisposition = "er_now";
        base.expectedTopDiagnosis = "mastoiditis";
        base.goldFlags = ["mastoid_tenderness"];
      } else if (discharge || hearingLoss) {
        base.expectedDisposition = "urgent_care";
        base.expectedTopDiagnosis = "otitis_media";
      } else {
        base.expectedDisposition = "self_care";
        base.expectedTopDiagnosis = "external_ear_infection";
      }
      break;
    }

    case "sore_throat": {
      const exudate = Math.random() > 0.6;
      const trismus = Math.random() > 0.93;
      const uvulaDeviation = Math.random() > 0.95;

      base.features = { exudate, trismus, uvulaDeviation, fever: Math.random() > 0.5 };

      if (trismus || uvulaDeviation) {
        base.expectedDisposition = "er_now";
        base.expectedTopDiagnosis = "peritonsillar_abscess";
        base.goldFlags = ["peritonsillar_flag"];
      } else if (exudate) {
        base.expectedDisposition = "urgent_care";
        base.expectedTopDiagnosis = "strep_pharyngitis";
      } else {
        base.expectedDisposition = "self_care";
        base.expectedTopDiagnosis = "viral_pharyngitis";
      }
      break;
    }

    default: {
      base.features = { fever: Math.random() > 0.5, durationDays: randInt(1, 10) };
      base.expectedDisposition = "urgent_care";
      base.expectedTopDiagnosis = "generic_condition";
    }
  }

  if (difficulty === "hard") {
    base.features["comorbidityBurden"] = pick(["low", "moderate", "high"]);
    base.features["ambiguousHistory"] = true;
  }

  return base;
}

export function buildSimulationBatch(
  complaint: SimComplaint,
  count: number,
  difficulty: "easy" | "moderate" | "hard" = "moderate"
): SimulationCase[] {
  return Array.from({ length: count }, () => buildSimulationCase(complaint, difficulty));
}
