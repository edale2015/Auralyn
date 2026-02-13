import { getTable } from "../data/registry";

export interface MedGroupCandidate {
  medicationGroup: string;
  primaryIndications: string;
  firstLine: boolean;
  contraindications: string;
  keyInteractions: string;
  renalAdjust: boolean;
  hepaticAdjust: boolean;
  blocked: boolean;
  blockReason?: string;
}

export interface MedCandidate {
  medicationName: string;
  medicationGroup: string;
  dose: string;
  route: string;
  reason: string;
  safetyNote?: string;
  blocked: boolean;
  blockReason?: string;
}

interface DerivedFlags {
  onAnticoagulant?: boolean;
  hasAsthmaCOPD?: boolean;
  immunosuppressed?: boolean;
  pregnant?: boolean;
  ckd?: boolean;
  hepatic?: boolean;
}

function norm(s: any): string {
  return String(s ?? "").trim();
}

function parseBoolean(s: any): boolean {
  const v = String(s ?? "").trim().toUpperCase();
  return v === "TRUE" || v === "YES" || v === "1";
}

function containsCluster(indicationStr: string, clusters: string[]): boolean {
  const lower = indicationStr.toLowerCase();
  return clusters.some(c => lower.includes(c.toLowerCase()));
}

export async function joinClustersToMedGroups(
  activeClusters: string[],
  derivedFlags: DerivedFlags,
  allergies: string[],
  medContraFlags: string[]
): Promise<MedGroupCandidate[]> {
  const rows = await getTable("GLOBAL_STANDARDIZED_MEDGROUPS");
  const candidates: MedGroupCandidate[] = [];

  for (const row of rows) {
    const indications = norm(row.Primary_Indications_Clusters);
    if (!containsCluster(indications, activeClusters)) continue;

    const group = norm(row.Medication_Group);
    const contras = norm(row.Key_Contraindications).toLowerCase();
    const interactions = norm(row.Key_Interactions).toLowerCase();

    let blocked = false;
    let blockReason: string | undefined;

    if (derivedFlags.pregnant) {
      if (contras.includes("pregnancy") || contras.includes("pregnant")) {
        blocked = true;
        blockReason = "Contraindicated in pregnancy";
      }
    }

    if (derivedFlags.onAnticoagulant) {
      if (interactions.includes("anticoag") || interactions.includes("warfarin") || interactions.includes("nsaid")) {
        blocked = true;
        blockReason = "Interaction with anticoagulant";
      }
    }

    if (derivedFlags.ckd) {
      if (parseBoolean(row.Renal_Adjust_Flag)) {
        // not blocked but flagged
      }
    }

    if (medContraFlags.includes(group.toLowerCase())) {
      blocked = true;
      blockReason = `Med group blocked by rule: ${group}`;
    }

    candidates.push({
      medicationGroup: group,
      primaryIndications: indications,
      firstLine: parseBoolean(row.First_Line),
      contraindications: norm(row.Key_Contraindications),
      keyInteractions: norm(row.Key_Interactions),
      renalAdjust: parseBoolean(row.Renal_Adjust_Flag),
      hepaticAdjust: parseBoolean(row.Hepatic_Adjust_Flag),
      blocked,
      blockReason,
    });
  }

  candidates.sort((a, b) => {
    if (a.blocked !== b.blocked) return a.blocked ? 1 : -1;
    if (a.firstLine !== b.firstLine) return a.firstLine ? -1 : 1;
    return 0;
  });

  return candidates;
}

export async function joinMedGroupsToMeds(
  medGroups: MedGroupCandidate[],
  derivedFlags: DerivedFlags,
  allergies: string[]
): Promise<MedCandidate[]> {
  const rows = await getTable("ID_MEDICATIONS_MASTER");
  const candidates: MedCandidate[] = [];

  const activeGroups = medGroups
    .filter(g => !g.blocked)
    .map(g => g.medicationGroup.toLowerCase());

  for (const row of rows) {
    const group = norm(row.Medication_Group).toLowerCase();
    if (!activeGroups.includes(group)) continue;

    const medName = norm(row.Medication_Name);
    const contras = norm(row.Contraindications).toLowerCase();

    let blocked = false;
    let blockReason: string | undefined;

    const lowerName = medName.toLowerCase();
    for (const allergy of allergies) {
      if (lowerName.includes(allergy.toLowerCase()) || allergy.toLowerCase().includes(lowerName)) {
        blocked = true;
        blockReason = `Allergy: ${allergy}`;
        break;
      }
    }

    if (derivedFlags.pregnant) {
      const pregConsider = norm(row.Pregnancy_Considerations).toLowerCase();
      if (pregConsider.includes("avoid") || pregConsider.includes("contraindicated")) {
        blocked = true;
        blockReason = "Avoid in pregnancy";
      }
    }

    if (derivedFlags.onAnticoagulant) {
      const interactions = norm(row.Key_Interactions).toLowerCase();
      if (interactions.includes("anticoag") || interactions.includes("warfarin")) {
        blocked = true;
        blockReason = "Interaction with anticoagulant";
      }
    }

    const parentGroup = medGroups.find(g => g.medicationGroup.toLowerCase() === group);
    const reason = parentGroup
      ? `Indicated for ${parentGroup.primaryIndications}`
      : `Group: ${group}`;

    let safetyNote: string | undefined;
    if (derivedFlags.ckd && parseBoolean(row.Renal_Adjust)) {
      safetyNote = "Renal dose adjustment needed";
    }
    if (derivedFlags.hepatic && parseBoolean(row.Hepatic_Adjust)) {
      safetyNote = (safetyNote ? safetyNote + "; " : "") + "Hepatic dose adjustment needed";
    }

    candidates.push({
      medicationName: medName,
      medicationGroup: norm(row.Medication_Group),
      dose: norm(row.Adult_Dose),
      route: norm(row.Route),
      reason,
      safetyNote,
      blocked,
      blockReason,
    });
  }

  candidates.sort((a, b) => {
    if (a.blocked !== b.blocked) return a.blocked ? 1 : -1;
    return 0;
  });

  return candidates.slice(0, 10);
}

export async function getMedSuggestions(
  activeClusters: string[],
  derivedFlags: DerivedFlags,
  allergies: string[],
  medContraFlags: string[]
): Promise<MedCandidate[]> {
  const medGroups = await joinClustersToMedGroups(activeClusters, derivedFlags, allergies, medContraFlags);
  return joinMedGroupsToMeds(medGroups, derivedFlags, allergies);
}
