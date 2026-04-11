export interface PatientContext {
  age?: number | null;
  meds?: string[] | string | null;
  allergies?: string[] | string | null;
  chiefComplaint?: string | null;
  sex?: string | null;
  [key: string]: unknown;
}

export interface CompletenessResult {
  ok: boolean;
  missing: string[];
  score: number;
}

const REQUIRED_FIELDS: Array<keyof PatientContext> = ["age", "meds", "allergies"];
const RECOMMENDED_FIELDS: Array<keyof PatientContext> = ["chiefComplaint", "sex"];

export function ensureCompleteness(ctx: PatientContext): CompletenessResult {
  const missing: string[] = [];

  for (const field of REQUIRED_FIELDS) {
    const val = ctx[field];
    if (val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0)) {
      missing.push(field as string);
    }
  }

  const recommendedMissing: string[] = [];
  for (const field of RECOMMENDED_FIELDS) {
    const val = ctx[field];
    if (val === undefined || val === null || val === "") {
      recommendedMissing.push(field as string);
    }
  }

  const totalFields = REQUIRED_FIELDS.length + RECOMMENDED_FIELDS.length;
  const presentCount = totalFields - missing.length - recommendedMissing.length;
  const score = Math.round((presentCount / totalFields) * 100);

  return { ok: missing.length === 0, missing, score };
}

export function ensureCompletenessStrict(ctx: PatientContext): CompletenessResult {
  const allFields: Array<keyof PatientContext> = [...REQUIRED_FIELDS, ...RECOMMENDED_FIELDS];
  const missing: string[] = [];

  for (const field of allFields) {
    const val = ctx[field];
    if (val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0)) {
      missing.push(field as string);
    }
  }

  const score = Math.round(((allFields.length - missing.length) / allFields.length) * 100);
  return { ok: missing.length === 0, missing, score };
}
