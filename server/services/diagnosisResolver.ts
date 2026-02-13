import { getTable } from "../data/registry";
import type { SystemKey } from "../data/canonicalKeys";

export interface DiagnosisCandidate {
  diagnosisId: string;
  diagnosisName: string;
  cluster: string;
  system: string;
  confidence: "high" | "medium" | "low";
  dispositionSuggestion: string;
  reasoning: string;
  recommendedTesting?: string;
  examFindings?: string;
}

function norm(s: any): string {
  return String(s ?? "").trim();
}

const DIAGNOSIS_TABS: Record<string, string> = {
  ENT: "ENT_DIAGNOSIS_MASTER",
  PULM: "PULM_DIAGNOSIS_MASTER",
  CARD: "CARD_DIAGNOSIS_MASTER",
  GI: "GI_DIAGNOSIS_MASTER",
  GU: "GU_DIAGNOSIS_MASTER",
  DERM: "DERM_DIAGNOSIS_MASTER",
  MSK: "MSK_DIAGNOSIS_MASTER",
  NEURO: "NEURO_DIAGNOSIS_MASTER",
  OPHTH: "OPHTH_DIAGNOSIS_MASTER",
  GEN: "GEN_DIAGNOSIS_MASTER",
};

export async function resolveDiagnoses(
  system: string,
  chiefComplaint: string,
  activeClusters: string[],
  modifiers: Record<string, any>,
  answers: Record<string, any>
): Promise<DiagnosisCandidate[]> {
  const tabName = DIAGNOSIS_TABS[system.toUpperCase()];
  if (!tabName) {
    console.warn(`[DiagnosisResolver] No diagnosis tab for system: ${system}`);
    return [];
  }

  let rows: Record<string, any>[];
  try {
    rows = await getTable(tabName);
  } catch (err: any) {
    console.warn(`[DiagnosisResolver] Failed to load ${tabName}: ${err.message}`);
    return [];
  }

  if (!rows.length) return [];

  const candidates: DiagnosisCandidate[] = [];
  const ccNorm = chiefComplaint.toLowerCase().replace(/[\s-]+/g, "_");
  const clusterSet = new Set(activeClusters.map(c => c.toUpperCase().replace(/[\s-]+/g, "_")));

  for (const row of rows) {
    const rowSystem = norm(row.System).toUpperCase();
    const rowCC = norm(row["Chief Complaint"] ?? row.Chief_Complaint).toLowerCase().replace(/[\s-]+/g, "_");
    const rowCluster = norm(row.Cluster).toUpperCase().replace(/[\s-]+/g, "_");
    const dxId = norm(row.Diagnosis_ID ?? row["Diagnosis ID"]);
    const dxName = norm(row.Diagnosis_Name ?? row["Diagnosis Name"] ?? row.Presentation_Label);

    if (!dxId) continue;

    if (rowSystem && rowSystem !== system.toUpperCase()) continue;
    if (rowCC && rowCC !== ccNorm) continue;

    let confidence: DiagnosisCandidate["confidence"] = "low";
    const reasons: string[] = [];

    if (clusterSet.has(rowCluster)) {
      confidence = "high";
      reasons.push(`Cluster match: ${rowCluster}`);
    } else if (rowCC === ccNorm) {
      confidence = "medium";
      reasons.push(`Chief complaint match: ${ccNorm}`);
    }

    const modifierRule = norm(row.Modifier_Rule ?? row["Modifier Rule"]);
    if (modifierRule) {
      const modMatch = checkModifierRule(modifierRule, modifiers, answers);
      if (modMatch === false) continue;
      if (modMatch === true) {
        confidence = confidence === "low" ? "medium" : "high";
        reasons.push(`Modifier rule satisfied: ${modifierRule}`);
      }
    }

    const urgency = norm(row.Urgency_Default ?? row["ER/UC/PC Threshold"] ?? row.Urgency).toLowerCase();
    let dispositionSuggestion = "routine";
    if (urgency.includes("ed") || urgency.includes("er")) {
      dispositionSuggestion = "ED";
    } else if (urgency.includes("uc") || urgency.includes("urgent")) {
      dispositionSuggestion = "urgent_care";
    } else if (urgency.includes("pc") || urgency.includes("primary")) {
      dispositionSuggestion = "primary_care";
    }

    candidates.push({
      diagnosisId: dxId,
      diagnosisName: dxName,
      cluster: rowCluster,
      system: rowSystem || system.toUpperCase(),
      confidence,
      dispositionSuggestion,
      reasoning: reasons.join("; ") || "System/complaint match",
      recommendedTesting: norm(row.Recommended_Testing ?? row["Imaging/Labs"]) || undefined,
      examFindings: norm(row.Exam_Findings ?? row["Exam Findings"]) || undefined,
    });
  }

  candidates.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.confidence] - order[b.confidence];
  });

  return candidates.slice(0, 5);
}

function checkModifierRule(
  rule: string,
  modifiers: Record<string, any>,
  answers: Record<string, any>
): boolean | null {
  if (!rule) return null;

  const parts = rule.split("&&").map(p => p.trim());
  for (const part of parts) {
    const match = part.match(/^(\w+)\s*==\s*(.+)$/);
    if (match) {
      const [, field, expected] = match;
      const val = modifiers[field] ?? answers[field];
      const exp = expected.replace(/^["']|["']$/g, "");
      if (String(val).toLowerCase() !== exp.toLowerCase()) return false;
    }

    const boolMatch = part.match(/^(\w+)$/);
    if (boolMatch) {
      const val = modifiers[boolMatch[1]] ?? answers[boolMatch[1]];
      if (!val || val === "no" || val === "false" || val === false) return false;
    }
  }

  return true;
}
