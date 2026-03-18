const SYSTEM_MAP: Record<string, string> = {
  ent: "ENT",
  cardiology: "CARD",
  gi: "GI",
  gastroenterology: "GI",
  endocrinology: "ENDO",
  pulmonology: "PULM",
  neurology: "NEURO",
  dermatology: "DERM",
  orthopedics: "ORTHO",
  urology: "URO",
  ophthalmology: "OPTH",
  psychiatry: "PSYCH",
  general: "GEN",
};

export function normalizeSystem(system: string): string {
  return SYSTEM_MAP[system.toLowerCase()] || system.toUpperCase();
}

export function normalizeComplaint(complaint: string): string {
  return complaint
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}
