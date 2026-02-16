import { getTable } from "../data/registry";
import type { CaseState } from "../../shared/agentTypes";

interface TriggerRow {
  Trigger_Value: string;
  Trigger_Type: string;
  Likely_Conditions: string;
  Confidence: string;
  Confirm_Question: string;
  Followup_Bundle_ID: string;
}

export type MedTriggerAction =
  | {
      type: "ADD_INLINE_QUESTION";
      questionId: string;
      text: string;
      qType: "multi_choice" | "yes_no" | "free_text";
      bundleId: string;
      askOrder: number;
    }
  | { type: "ADD_BUNDLE"; bundleId: string };

function norm(s: any): string {
  return String(s ?? "").trim().toLowerCase();
}

function parseTriggerRow(row: Record<string, any>): TriggerRow {
  return {
    Trigger_Value: String(row.Trigger_Value ?? "").trim(),
    Trigger_Type: norm(row.Trigger_Type),
    Likely_Conditions: String(row.Likely_Conditions ?? "").trim(),
    Confidence: norm(row.Confidence) || "medium",
    Confirm_Question: String(row.Confirm_Question ?? "").trim(),
    Followup_Bundle_ID: String(row.Followup_Bundle_ID ?? "").trim(),
  };
}

function collectMedNames(state: CaseState): string[] {
  const names: string[] = [];
  if (state.fhirPrefill?.meds) {
    names.push(...state.fhirPrefill.meds);
  }
  if (state.modifiers?.meds) {
    names.push(...state.modifiers.meds);
  }
  const currentMedsList = state.modifierAnswers?.currentMedsList;
  if (Array.isArray(currentMedsList)) {
    names.push(...currentMedsList.map(String));
  }
  return names.filter(Boolean);
}

export async function runMedicationTriggeredQuestions(state: CaseState): Promise<{
  actions: MedTriggerAction[];
  matchedTriggers: Array<{ trigger: string; bundleId: string; confidence: string }>;
}> {
  let triggerRows: Record<string, any>[];
  try {
    triggerRows = await getTable("MED_TO_CONDITION_TRIGGERS");
  } catch {
    return { actions: [], matchedTriggers: [] };
  }

  if (!triggerRows || triggerRows.length === 0) {
    return { actions: [], matchedTriggers: [] };
  }

  const triggers = triggerRows.map(parseTriggerRow).filter(t => t.Trigger_Value && t.Followup_Bundle_ID);

  const medNames = collectMedNames(state);
  if (medNames.length === 0) {
    return { actions: [], matchedTriggers: [] };
  }

  const actions: MedTriggerAction[] = [];
  const matchedTriggers: Array<{ trigger: string; bundleId: string; confidence: string }> = [];
  const addedBundles = new Set<string>();
  const addedInline = new Set<string>();

  let confirmOrder = 5;

  for (const t of triggers) {
    const val = t.Trigger_Value;
    const bundleId = t.Followup_Bundle_ID;

    let hit = false;
    switch (t.Trigger_Type) {
      case "med_name":
        hit = medNames.some(m => norm(m) === norm(val));
        break;
      case "substring":
        hit = medNames.some(m => norm(m).includes(norm(val)));
        break;
      case "med_group":
        hit = medNames.some(m => norm(m).includes(norm(val)));
        break;
      case "tag":
        break;
      default:
        hit = medNames.some(m => norm(m).includes(norm(val)));
    }

    if (!hit) continue;

    matchedTriggers.push({ trigger: val, bundleId, confidence: t.Confidence });

    const qId = `MEDTRIG_CONFIRM_${norm(val).replace(/[^a-z0-9]+/g, "_").toUpperCase()}`;
    if (!addedInline.has(qId) && t.Confirm_Question) {
      actions.push({
        type: "ADD_INLINE_QUESTION",
        questionId: qId,
        text: t.Confirm_Question,
        qType: "multi_choice",
        bundleId: "BUNDLE_MED_CONFIRM",
        askOrder: confirmOrder,
      });
      addedInline.add(qId);
      confirmOrder += 5;
    }

    if (!addedBundles.has(bundleId)) {
      actions.push({ type: "ADD_BUNDLE", bundleId });
      addedBundles.add(bundleId);
    }
  }

  return { actions, matchedTriggers };
}
