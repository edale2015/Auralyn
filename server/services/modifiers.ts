import { getTable } from "../data/registry";
import type { PrefillResult } from "./fhirPrefill";

export interface ModifierDef {
  modifierId: string;
  modifierSetId: string;
  label: string;
  questionText: string;
  dataType: "boolean" | "text" | "number" | "select";
  options?: string[];
  severityWeight: number;
  triageUpgradeTarget?: string;
  prefillField?: string;
  required: boolean;
}

export interface ModifierResult {
  modifierId: string;
  value: string | boolean | number | null;
  prefilled: boolean;
  confirmed: boolean;
}

export interface ModifierSummary {
  answers: Record<string, string | boolean | number | null>;
  riskScore: number;
  triageUpgradeTarget?: string;
  pendingModifiers: ModifierDef[];
}

function norm(s: any): string {
  return String(s ?? "").trim();
}

function parseNum(s: any, fallback: number): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

function rowToModifier(row: Record<string, any>): ModifierDef {
  return {
    modifierId: norm(row.Modifier_ID),
    modifierSetId: norm(row.Modifier_Set_ID),
    label: norm(row.Label),
    questionText: norm(row.Question_Text),
    dataType: (norm(row.Data_Type).toLowerCase() || "boolean") as ModifierDef["dataType"],
    options: norm(row.Options) ? norm(row.Options).split(",").map((s: string) => s.trim()) : undefined,
    severityWeight: parseNum(row.Severity_Weight, 1),
    triageUpgradeTarget: norm(row.Triage_Upgrade_Target) || undefined,
    prefillField: norm(row.Prefill_Field) || undefined,
    required: norm(row.Required).toUpperCase() !== "FALSE",
  };
}

export async function getModifiersForSet(modifierSetId: string): Promise<ModifierDef[]> {
  const rows = await getTable("CARDS_MODIFIER_MASTER");
  return rows
    .map(rowToModifier)
    .filter(m => m.modifierSetId === modifierSetId && m.modifierId);
}

export function applyFhirPrefill(
  modifiers: ModifierDef[],
  prefill: PrefillResult | undefined
): ModifierResult[] {
  const results: ModifierResult[] = [];

  for (const mod of modifiers) {
    let prefilled = false;
    let value: string | boolean | number | null = null;

    if (prefill && mod.prefillField) {
      const flags = prefill.derivedFlags as Record<string, any>;
      if (mod.prefillField in flags) {
        value = flags[mod.prefillField];
        prefilled = true;
      } else if (mod.prefillField === "allergies" && prefill.allergies.length > 0) {
        value = prefill.allergies.join(", ");
        prefilled = true;
      } else if (mod.prefillField === "meds" && prefill.meds.length > 0) {
        value = prefill.meds.join(", ");
        prefilled = true;
      } else if (mod.prefillField === "problems" && prefill.problems.length > 0) {
        value = prefill.problems.join(", ");
        prefilled = true;
      }
    }

    results.push({
      modifierId: mod.modifierId,
      value,
      prefilled,
      confirmed: false,
    });
  }

  return results;
}

export function computeModifierSummary(
  modifiers: ModifierDef[],
  results: ModifierResult[],
  manualAnswers: Record<string, any>
): ModifierSummary {
  const answers: Record<string, string | boolean | number | null> = {};
  let riskScore = 0;
  let triageUpgradeTarget: string | undefined;
  const pending: ModifierDef[] = [];

  for (const mod of modifiers) {
    const result = results.find(r => r.modifierId === mod.modifierId);
    const manualVal = manualAnswers[mod.modifierId];

    let finalVal: string | boolean | number | null = null;

    if (manualVal !== undefined && manualVal !== null) {
      finalVal = manualVal;
    } else if (result?.prefilled && result.value !== null) {
      finalVal = result.value;
    } else if (mod.required) {
      pending.push(mod);
      continue;
    }

    answers[mod.modifierId] = finalVal;

    if (finalVal === true || finalVal === "yes") {
      riskScore += mod.severityWeight;
      if (mod.triageUpgradeTarget && !triageUpgradeTarget) {
        triageUpgradeTarget = mod.triageUpgradeTarget;
      }
    }
  }

  return { answers, riskScore, triageUpgradeTarget, pendingModifiers: pending };
}
