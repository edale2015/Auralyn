export interface IntakeContext {
  age?: number;
  symptoms?: string[];
  duration?: string;
  vitals?: {
    normal?: boolean;
    systolicBp?: number;
    oxygenSaturation?: number;
  };
  [key: string]: unknown;
}

export function nextSecondaryQuestion(context: IntakeContext): string | null {
  if (context.age === undefined || context.age === null) return "How old are you?";
  if (!Array.isArray(context.symptoms) || !context.symptoms.includes("fever")) return "Do you have a fever?";
  if (!context.duration) return "How long has this been going on?";
  return null;
}

export interface ClinicalModifiers {
  age?: number;
  meds: string[];
  allergies: string[];
  pmh: string[];
}

export function collectModifiers(patient: {
  age?: number;
  meds?: string[];
  allergies?: string[];
  pmh?: string[];
  [key: string]: unknown;
}): ClinicalModifiers {
  return {
    age: patient.age,
    meds: patient.meds ?? [],
    allergies: patient.allergies ?? [],
    pmh: patient.pmh ?? [],
  };
}

export function fastTrack(patient: {
  complaint?: string;
  vitals?: { normal?: boolean };
  [key: string]: unknown;
}): "ROUTINE" | null {
  if (
    patient.complaint === "minor" &&
    patient.vitals?.normal === true
  ) {
    return "ROUTINE";
  }
  return null;
}
