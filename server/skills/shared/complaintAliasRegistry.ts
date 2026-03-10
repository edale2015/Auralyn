export type ComplaintAliasGroup = {
  canonical: string;
  aliases: string[];
};

const GROUPS: ComplaintAliasGroup[] = [
  {
    canonical: "sore_throat",
    aliases: ["sore_throat", "ent_sore_throat", "throat_pain"],
  },
  {
    canonical: "cough",
    aliases: ["cough", "pulm_cough", "resp_cough"],
  },
  {
    canonical: "uti",
    aliases: ["uti", "gu_uti_symptoms", "gu_dysuria_uti", "dysuria"],
  },
  {
    canonical: "chest_pain",
    aliases: ["chest_pain", "cardiac_chest_pain"],
  },
  {
    canonical: "abdominal_pain",
    aliases: ["abdominal_pain", "gi_abdominal_pain", "abd_pain"],
  },
  {
    canonical: "fever",
    aliases: ["fever", "general_fever"],
  },
  {
    canonical: "rash",
    aliases: ["rash", "derm_rash"],
  },
  {
    canonical: "ear_pain",
    aliases: ["ear_pain", "ent_ear_pain", "otalgia"],
  },
  {
    canonical: "sinus_pressure",
    aliases: ["sinus_pressure", "ent_sinus_pressure", "sinusitis"],
  },
];

const aliasToCanonical = new Map<string, string>();
for (const group of GROUPS) {
  for (const alias of group.aliases) {
    aliasToCanonical.set(alias.toLowerCase(), group.canonical);
  }
}

export function canonicalizeComplaintId(input?: string): string {
  if (!input) return "";
  const normalized = input.trim().toLowerCase();
  return aliasToCanonical.get(normalized) ?? normalized;
}

export function getComplaintAliases(input?: string): string[] {
  const canonical = canonicalizeComplaintId(input);
  const group = GROUPS.find((g) => g.canonical === canonical);
  return group ? group.aliases : canonical ? [canonical] : [];
}

export function complaintIdsMatch(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  return canonicalizeComplaintId(a) === canonicalizeComplaintId(b);
}
