import { ClinicalCase } from "./clinicalDataset";

export interface ExtractedFeatures {
  raw: Set<string>;
  asArray: string[];
}

export function extractFeatures(
  complaint: string,
  keyFeatures: string[],
  age?: number,
  sex?: string
): ExtractedFeatures {
  const raw = new Set<string>();

  raw.add(`complaint:${complaint.toLowerCase().replace(/\s+/g,"_")}`);

  for (const f of keyFeatures) {
    raw.add(`symptom:${f.toLowerCase().replace(/\s+/g,"_")}`);
  }

  if (age !== undefined) {
    if (age < 2) raw.add("age_group:infant");
    else if (age < 18) raw.add("age_group:pediatric");
    else if (age < 65) raw.add("age_group:adult");
    else raw.add("age_group:elderly");
  }

  if (sex) raw.add(`sex:${sex.toLowerCase()}`);

  return { raw, asArray: Array.from(raw) };
}

export function extractFromCase(c: ClinicalCase): ExtractedFeatures {
  return extractFeatures(c.complaint, c.key_features, c.age, c.sex);
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection++;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}
