import { getTable } from "../data/registry";

export type MedicationLinkType = "PRIMARY_DIAGNOSIS" | "CLUSTER_BASED" | "SYMPTOMATIC" | "COMBINATION";

export interface MedCandidate {
  medicationName: string;
  medicationGroup: string;
  dose: string;
  route: string;
  reason: string;
  linkType: MedicationLinkType;
  indicationsCluster: string;
  diagnosisId: string;
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

export type CareSetting = "urgent_care" | "symptomatic" | "chronic_management";

export const CARE_SETTING_PRESETS: Record<string, CareSetting[]> = {
  urgent_care: ["urgent_care", "symptomatic"],
  family_medicine: ["urgent_care", "symptomatic", "chronic_management"],
  family_med: ["urgent_care", "symptomatic", "chronic_management"],
  chronic_management: ["chronic_management", "symptomatic"],
  specialty_program: ["chronic_management", "symptomatic"],
  obesity_dm_htn: ["chronic_management", "symptomatic"],
};

interface MedContext {
  activeClusters: string[];
  derivedFlags: DerivedFlags;
  allergies: string[];
  medContraFlags: string[];
  resolvedDiagnosisIds?: string[];
  symptomSeverityFlags?: string[];
  allowedCareSettings?: CareSetting[];
}

function norm(s: any): string {
  return String(s ?? "").trim();
}

function parseBoolean(s: any): boolean {
  const v = String(s ?? "").trim().toUpperCase();
  return v === "TRUE" || v === "YES" || v === "1";
}

function normalizeClusterId(s: string): string {
  return s.toUpperCase().replace(/[\s-]+/g, "_");
}

function parseClusterList(indicationsCluster: string): string[] {
  return indicationsCluster
    .split(/[;,]/)
    .map(s => normalizeClusterId(s.replace(/^_/, "")))
    .filter(Boolean);
}

function stripSystemPrefix(id: string): string {
  return id.replace(/^(ENT|CARDIO|PULM|GI|NEURO|DERM|MSK|GU|HEME|ENDO|PSYCH|OB|PEDS|ID)_/, "");
}

function stripClusterSuffix(id: string): string {
  return id.replace(/_CLUSTER$/, "");
}

function normalizeForComparison(id: string): string {
  return stripClusterSuffix(stripSystemPrefix(normalizeClusterId(id)));
}

function clusterMatch(indicationsCluster: string, activeClusters: string[]): boolean {
  const indClusters = parseClusterList(indicationsCluster);
  const normActive = activeClusters.map(normalizeClusterId);
  const normActiveStripped = activeClusters.map(normalizeForComparison);

  return indClusters.some(ic => {
    if (normActive.includes(ic)) return true;
    const icStripped = normalizeForComparison(ic);
    if (normActiveStripped.some(na => na === icStripped)) return true;
    if (normActiveStripped.some(na => na.includes(icStripped) || icStripped.includes(na))) return true;
    return false;
  });
}

function findMatchingActiveCluster(indicationsCluster: string, activeClusters: string[]): string | null {
  const indClusters = parseClusterList(indicationsCluster);
  const normActive = activeClusters.map(normalizeClusterId);
  const normActiveStripped = activeClusters.map(normalizeForComparison);

  for (const ic of indClusters) {
    const idx = normActive.indexOf(ic);
    if (idx >= 0) return normActive[idx];
    const icStripped = normalizeForComparison(ic);
    for (let i = 0; i < normActiveStripped.length; i++) {
      if (normActiveStripped[i] === icStripped) return normActive[i];
      if (normActiveStripped[i].includes(icStripped) || icStripped.includes(normActiveStripped[i])) return normActive[i];
    }
  }
  return null;
}

async function getPrimaryDiagnosisForCluster(clusterId: string): Promise<string | null> {
  const rows = await getTable("CLUSTER_PRIMARY_DIAGNOSIS");
  const normId = normalizeClusterId(clusterId);
  const match = rows.find(r => normalizeClusterId(norm(r.Cluster_ID)) === normId);
  return match ? norm(match.Primary_Diagnosis_ID) : null;
}

function shouldIncludeMed(
  row: Record<string, any>,
  ctx: MedContext,
  clusterPrimaryDxMap: Map<string, string>
): { include: boolean; reason: string } {
  const rawLinkType = norm(row.Medication_Link_Type).toUpperCase();
  const linkType = (rawLinkType || "CLUSTER_BASED") as MedicationLinkType;
  const indicationsCluster = norm(row.Indications_Cluster);
  const diagnosisId = norm(row.DIAGNOSIS_ID);
  const diagnosisIdSafeFill = norm(row.DIAGNOSIS_ID_SafeFill);

  switch (linkType) {
    case "CLUSTER_BASED": {
      if (!clusterMatch(indicationsCluster, ctx.activeClusters)) {
        return { include: false, reason: "" };
      }
      return {
        include: true,
        reason: `Cluster-based: active cluster ${indicationsCluster}`,
      };
    }

    case "PRIMARY_DIAGNOSIS": {
      const effectiveDxId = diagnosisId || diagnosisIdSafeFill;

      if (ctx.resolvedDiagnosisIds && ctx.resolvedDiagnosisIds.length > 0 && effectiveDxId) {
        const matchesDx = ctx.resolvedDiagnosisIds.some(
          dx => dx.toUpperCase() === effectiveDxId.toUpperCase()
        );
        if (matchesDx) {
          return {
            include: true,
            reason: `Primary diagnosis match: ${effectiveDxId}`,
          };
        }
      }

      if (effectiveDxId) {
        const matchedActiveCluster = findMatchingActiveCluster(indicationsCluster, ctx.activeClusters);
        if (matchedActiveCluster) {
          const clusterPrimaryDx = clusterPrimaryDxMap.get(matchedActiveCluster)
            || clusterPrimaryDxMap.get(normalizeClusterId(indicationsCluster));
          if (clusterPrimaryDx && clusterPrimaryDx.toUpperCase() === effectiveDxId.toUpperCase()) {
            return {
              include: true,
              reason: `Primary dx via CLUSTER_PRIMARY_DIAGNOSIS: ${matchedActiveCluster} → ${clusterPrimaryDx}`,
            };
          }
        }
      }

      if (clusterMatch(indicationsCluster, ctx.activeClusters)) {
        return {
          include: true,
          reason: `Primary dx via cluster fallback: ${indicationsCluster}`,
        };
      }

      return { include: false, reason: "" };
    }

    case "SYMPTOMATIC": {
      if (ctx.symptomSeverityFlags && ctx.symptomSeverityFlags.length > 0) {
        return {
          include: true,
          reason: `Symptomatic: severity flags active`,
        };
      }
      if (clusterMatch(indicationsCluster, ctx.activeClusters)) {
        return {
          include: true,
          reason: `Symptomatic: cluster ${indicationsCluster} active`,
        };
      }
      return { include: false, reason: "" };
    }

    case "COMBINATION": {
      if (clusterMatch(indicationsCluster, ctx.activeClusters)) {
        return {
          include: true,
          reason: `Combination bundle: cluster ${indicationsCluster} active`,
        };
      }
      return { include: false, reason: "" };
    }

    default: {
      if (clusterMatch(indicationsCluster, ctx.activeClusters)) {
        return {
          include: true,
          reason: `Cluster match (untyped): ${indicationsCluster}`,
        };
      }
      return { include: false, reason: "" };
    }
  }
}

function applySafetyChecks(
  row: Record<string, any>,
  ctx: MedContext
): { blocked: boolean; blockReason?: string; safetyNote?: string } {
  const medName = norm(row.Medication_Name);
  const contras = (norm(row.Contraindications) || norm(row.Key_Contraindications)).toLowerCase();
  const interactions = norm(row.Key_Interactions).toLowerCase();
  const group = norm(row.Medication_Group).toLowerCase();

  let blocked = false;
  let blockReason: string | undefined;
  let safetyNote: string | undefined;

  const lowerName = medName.toLowerCase();
  for (const allergy of ctx.allergies) {
    const la = allergy.toLowerCase();
    if (lowerName.includes(la) || la.includes(lowerName) || contras.includes(la)) {
      blocked = true;
      blockReason = `Allergy: ${allergy}`;
      break;
    }
  }

  if (ctx.derivedFlags.pregnant) {
    const pregField = norm(row.Pregnancy_Considerations).toLowerCase();
    if (
      pregField.includes("avoid") ||
      pregField.includes("contraindicated") ||
      contras.includes("pregnancy") ||
      contras.includes("pregnant")
    ) {
      blocked = true;
      blockReason = "Contraindicated in pregnancy";
    }
  }

  if (ctx.derivedFlags.onAnticoagulant) {
    if (
      interactions.includes("anticoag") ||
      interactions.includes("warfarin") ||
      interactions.includes("nsaid")
    ) {
      blocked = true;
      blockReason = "Interaction with anticoagulant";
    }
  }

  if (ctx.medContraFlags.includes(group)) {
    blocked = true;
    blockReason = `Med group blocked by rule: ${group}`;
  }

  if (ctx.derivedFlags.ckd && (parseBoolean(row["Renal_Adjust?"]) || parseBoolean(row.Renal_Adjust))) {
    safetyNote = "Renal dose adjustment needed";
  }
  if (ctx.derivedFlags.hepatic && (parseBoolean(row["Hepatic_Adjust?"]) || parseBoolean(row.Hepatic_Adjust))) {
    safetyNote = (safetyNote ? safetyNote + "; " : "") + "Hepatic dose adjustment needed";
  }

  return { blocked, blockReason, safetyNote };
}

function matchesCareSetting(
  rowCareSetting: string,
  allowed: CareSetting[] | undefined
): boolean {
  if (!allowed || allowed.length === 0) return true;

  const raw = rowCareSetting.toLowerCase().replace(/[\s-]+/g, "_");
  if (!raw) return true;

  const settings = raw.split(/[;,|]/).map(s => s.trim()).filter(Boolean);
  return settings.some(s => allowed.includes(s as CareSetting));
}

export async function getMedSuggestions(
  activeClusters: string[],
  derivedFlags: DerivedFlags,
  allergies: string[],
  medContraFlags: string[],
  resolvedDiagnosisIds?: string[],
  symptomSeverityFlags?: string[],
  allowedCareSettings?: CareSetting[]
): Promise<MedCandidate[]> {
  const ctx: MedContext = {
    activeClusters,
    derivedFlags,
    allergies,
    medContraFlags,
    resolvedDiagnosisIds,
    symptomSeverityFlags,
    allowedCareSettings,
  };

  const medRows = await getTable("GLOBAL_MEDICATIONS_MASTER");

  const clusterPrimaryDxRows = await getTable("CLUSTER_PRIMARY_DIAGNOSIS");
  const clusterPrimaryDxMap = new Map<string, string>();
  for (const r of clusterPrimaryDxRows) {
    const cid = normalizeClusterId(norm(r.Cluster_ID));
    const dxId = norm(r.Primary_Diagnosis_ID);
    if (cid && dxId) clusterPrimaryDxMap.set(cid, dxId);
  }
  const candidates: MedCandidate[] = [];

  for (const row of medRows) {
    if (!matchesCareSetting(norm(row.Care_Setting), ctx.allowedCareSettings)) continue;

    const { include, reason } = shouldIncludeMed(row, ctx, clusterPrimaryDxMap);
    if (!include) continue;

    const safety = applySafetyChecks(row, ctx);

    candidates.push({
      medicationName: norm(row.Medication_Name),
      medicationGroup: norm(row.Medication_Group),
      dose: norm(row.Adult_Dose),
      route: norm(row.Route),
      reason,
      linkType: (norm(row.Medication_Link_Type).toUpperCase() || "CLUSTER_BASED") as MedicationLinkType,
      indicationsCluster: norm(row.Indications_Cluster),
      diagnosisId: norm(row.DIAGNOSIS_ID) || norm(row.DIAGNOSIS_ID_SafeFill),
      safetyNote: safety.safetyNote,
      blocked: safety.blocked,
      blockReason: safety.blockReason,
    });
  }

  candidates.sort((a, b) => {
    if (a.blocked !== b.blocked) return a.blocked ? 1 : -1;
    const linkOrder: Record<string, number> = {
      PRIMARY_DIAGNOSIS: 0,
      CLUSTER_BASED: 1,
      SYMPTOMATIC: 2,
      COMBINATION: 3,
    };
    return (linkOrder[a.linkType] ?? 4) - (linkOrder[b.linkType] ?? 4);
  });

  return candidates.slice(0, 20);
}
