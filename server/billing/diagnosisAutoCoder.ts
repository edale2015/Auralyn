import { mapToICD10, mapToCPT, getICD10Catalog } from "./codingEngine";

export interface DiagnosisCluster {
  primary: string;
  differentials?: string[];
  triage?: string;
  confidence?: number;
}

export interface AutoCodeResult {
  primary: {
    diagnosis: string;
    icd10: string;
    mapped: boolean;
  };
  differentials: Array<{
    diagnosis: string;
    icd10: string;
    mapped: boolean;
  }>;
  cpt: {
    code: string;
    description: string;
    basis: string;
  };
  allCodes: string[];
  codingConfidence: "high" | "medium" | "low";
  warnings: string[];
}

export function autoCodeDiagnosisCluster(cluster: DiagnosisCluster): AutoCodeResult {
  const catalog = getICD10Catalog();
  const warnings: string[] = [];

  const primaryICD = mapToICD10(cluster.primary);
  const primaryMapped = primaryICD !== "R69";

  if (!primaryMapped) {
    warnings.push(`Primary diagnosis "${cluster.primary}" not found in ICD-10 map — using R69 (Illness, unspecified)`);
  }

  const differentials = (cluster.differentials || []).map((dx) => {
    const code = mapToICD10(dx);
    const mapped = code !== "R69";
    if (!mapped) {
      warnings.push(`Differential "${dx}" not found in ICD-10 map`);
    }
    return { diagnosis: dx, icd10: code, mapped };
  });

  const cptResult = mapToCPT(cluster.triage || "routine");

  let cptBasis = "Visit type";
  if (cluster.triage === "ER" || cluster.triage === "emergency") {
    cptBasis = "Emergency department visit";
  } else if (cluster.triage === "urgent") {
    cptBasis = "Urgent care / ED visit";
  } else if (cluster.triage?.includes("telemed")) {
    cptBasis = "Telehealth encounter";
  }

  const allCodes = [primaryICD, ...differentials.map((d) => d.icd10)].filter(
    (c, i, arr) => arr.indexOf(c) === i
  );

  const mappedCount = [primaryMapped, ...differentials.map((d) => d.mapped)].filter(Boolean).length;
  const totalCount = 1 + differentials.length;
  let codingConfidence: "high" | "medium" | "low";
  if (mappedCount === totalCount) codingConfidence = "high";
  else if (mappedCount >= totalCount * 0.5) codingConfidence = "medium";
  else codingConfidence = "low";

  return {
    primary: { diagnosis: cluster.primary, icd10: primaryICD, mapped: primaryMapped },
    differentials,
    cpt: { code: cptResult.code, description: cptResult.description, basis: cptBasis },
    allCodes,
    codingConfidence,
    warnings,
  };
}

export function batchAutoCode(clusters: DiagnosisCluster[]): AutoCodeResult[] {
  return clusters.map(autoCodeDiagnosisCluster);
}

export function searchICD10(query: string): Array<{ diagnosis: string; icd10: string }> {
  const catalog = getICD10Catalog();
  const lower = query.toLowerCase();
  return Object.entries(catalog)
    .filter(([dx]) => dx.toLowerCase().includes(lower))
    .map(([diagnosis, icd10]) => ({ diagnosis, icd10 }));
}
