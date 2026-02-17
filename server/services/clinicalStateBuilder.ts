import { getTable } from "../data/registry";
import type { CaseState } from "../../shared/agentTypes";
import { normalizeChiefComplaint } from "../data/canonicalKeys";
import { getRouterEntryByComplaint } from "./complaintRouter";

type EvidenceItem = { field: string; value: any; source: string; tableRowId?: string };

interface ClinicalStateOutput {
  normalizedMeds: Array<{ name: string; source: string }>;
  medGroups: Array<{ group: string; meds: string[]; tableRowId?: string }>;
  inferredConditions: Array<{ condition: string; confidence: string; evidence: string[]; triggerId?: string }>;
  confirmedProblems: Array<{ problem: string; source: string }>;
  riskFlags: Array<{ flagId: string; reason: string; source: string; severity?: string }>;
  suggestedBundles: Array<{ bundleId: string; reason: string; source: string }>;
  triageHints: Array<{ hint: string; source: string; clusterId?: string }>;
  missingModifiers: Array<{ modifierId: string; label: string; modifierSetId: string }>;
  suggestedQuestions: Array<{ questionId: string; questionText: string; bundleId?: string; source: string }>;
  tablesQueried: string[];
  buildDurationMs: number;
}

function norm(s: any): string {
  return String(s ?? "").trim().toLowerCase();
}

function normId(s: any): string {
  return String(s ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
}

function splitList(s: any): string[] {
  return String(s ?? "").split(/[;,]/).map(x => x.trim()).filter(Boolean);
}

async function safeLoadTable(name: string, tablesQueried: string[]): Promise<Record<string, any>[]> {
  try {
    const rows = await getTable(name);
    tablesQueried.push(name);
    return rows;
  } catch {
    tablesQueried.push(`${name}(FAILED)`);
    return [];
  }
}

function collectAllMedSources(state: CaseState): Array<{ name: string; source: string }> {
  const result: Array<{ name: string; source: string }> = [];
  const seen = new Set<string>();
  const add = (name: string, source: string) => {
    const n = name.toLowerCase().trim();
    if (!n || seen.has(n)) return;
    seen.add(n);
    result.push({ name: n, source });
  };
  if (state.fhirPrefill?.meds) state.fhirPrefill.meds.forEach(m => add(m, "fhirPrefill.meds"));
  if (state.modifiers?.meds) state.modifiers.meds.forEach(m => add(m, "modifiers.meds"));
  if (state.dm?.meds) state.dm.meds.forEach(m => add(m, "dm.meds"));
  if (state.htn?.meds) state.htn.meds.forEach(m => add(m, "htn.meds"));
  const currentMedsList = state.modifierAnswers?.currentMedsList;
  if (Array.isArray(currentMedsList)) currentMedsList.forEach(m => add(String(m), "modifierAnswers.currentMedsList"));
  return result;
}

function buildMedGroups(
  normalizedMeds: Array<{ name: string; source: string }>,
  medGroupRows: Record<string, any>[],
  globalMedsRows: Record<string, any>[]
): Array<{ group: string; meds: string[]; tableRowId?: string }> {
  const groupMap = new Map<string, { meds: Set<string>; rowId?: string }>();
  const medNames = normalizedMeds.map(m => m.name);

  for (const row of medGroupRows) {
    const groupName = norm(row.Med_Group ?? row.Medication_Group ?? row.Group_Name);
    const members = splitList(row.Members ?? row.Medications ?? row.Med_Names);
    if (!groupName || members.length === 0) continue;
    const rowId = String(row.Row_ID ?? row.ID ?? "").trim();

    for (const member of members) {
      if (medNames.some(m => m.includes(norm(member)) || norm(member).includes(m))) {
        if (!groupMap.has(groupName)) {
          groupMap.set(groupName, { meds: new Set(), rowId: rowId || undefined });
        }
        const matched = medNames.filter(m => m.includes(norm(member)) || norm(member).includes(m));
        matched.forEach(m => groupMap.get(groupName)!.meds.add(m));
      }
    }
  }

  for (const row of globalMedsRows) {
    const medName = norm(row.Medication_Name);
    const groupName = norm(row.Medication_Group);
    if (!medName || !groupName) continue;
    if (medNames.some(m => m.includes(medName) || medName.includes(m))) {
      if (!groupMap.has(groupName)) {
        groupMap.set(groupName, { meds: new Set() });
      }
      const matched = medNames.filter(m => m.includes(medName) || medName.includes(m));
      matched.forEach(m => groupMap.get(groupName)!.meds.add(m));
    }
  }

  return Array.from(groupMap.entries()).map(([group, data]) => ({
    group,
    meds: [...data.meds],
    tableRowId: data.rowId,
  }));
}

function inferConditionsFromTriggers(
  normalizedMeds: Array<{ name: string; source: string }>,
  triggerRows: Record<string, any>[]
): Array<{ condition: string; confidence: string; evidence: string[]; triggerId?: string }> {
  const conditions: Array<{ condition: string; confidence: string; evidence: string[]; triggerId?: string }> = [];
  const seen = new Set<string>();
  const medNames = normalizedMeds.map(m => m.name);

  for (const row of triggerRows) {
    const triggerVal = norm(row.Trigger_Value);
    const triggerType = norm(row.Trigger_Type);
    const likelyConditions = String(row.Likely_Conditions ?? "").trim();
    const confidence = norm(row.Confidence) || "medium";
    const triggerId = String(row.Trigger_ID ?? row.Row_ID ?? "").trim();

    if (!triggerVal || !likelyConditions) continue;

    let hit = false;
    if (triggerType === "med_name") {
      hit = medNames.some(m => m === triggerVal);
    } else if (triggerType === "substring") {
      hit = medNames.some(m => m.includes(triggerVal));
    } else if (triggerType === "med_group") {
      hit = medNames.some(m => m.includes(triggerVal));
    } else {
      hit = medNames.some(m => m.includes(triggerVal));
    }

    if (hit && !seen.has(likelyConditions)) {
      seen.add(likelyConditions);
      conditions.push({
        condition: likelyConditions,
        confidence,
        evidence: [`MED_TO_CONDITION_TRIGGERS: trigger_value=${triggerVal}, type=${triggerType}`],
        triggerId: triggerId || undefined,
      });
    }
  }

  return conditions;
}

function inferConditionsFromRules(
  state: CaseState,
  normalizedMeds: Array<{ name: string; source: string }>,
  ruleRows: Record<string, any>[]
): Array<{ condition: string; confidence: string; evidence: string[]; triggerId?: string }> {
  const conditions: Array<{ condition: string; confidence: string; evidence: string[]; triggerId?: string }> = [];
  const medNames = normalizedMeds.map(m => m.name);
  const problems = [...(state.fhirPrefill?.problems ?? []), ...(state.modifiers?.pmh ?? [])].map(p => p.toLowerCase());

  for (const row of ruleRows) {
    const ruleId = String(row.Rule_ID ?? "").trim();
    const domain = norm(row.Domain);
    const triggerCond = norm(row.Trigger_Condition);
    const actionValue = String(row.Action_Value ?? "").trim();
    if (!ruleId) continue;

    let hit = false;
    if (triggerCond === "htn_present" && (medNames.some(m => ["lisinopril", "losartan", "amlodipine", "metoprolol", "hydrochlorothiazide"].some(t => m.includes(t))) || problems.some(p => p.includes("hypertension")))) hit = true;
    if (triggerCond === "dm_present" && (medNames.some(m => ["metformin", "insulin", "glipizide", "glyburide"].some(t => m.includes(t))) || problems.some(p => p.includes("diabetes")))) hit = true;
    if (triggerCond === "glp1_present" && medNames.some(m => ["semaglutide", "tirzepatide", "liraglutide", "dulaglutide"].some(t => m.includes(t)))) hit = true;

    if (hit && actionValue) {
      conditions.push({
        condition: `${domain}: ${actionValue}`,
        confidence: "medium",
        evidence: [`MED_CONDITION_INTELLIGENCE_RULES: ${ruleId}, trigger=${triggerCond}`],
        triggerId: ruleId,
      });
    }
  }

  return conditions;
}

function collectConfirmedProblems(state: CaseState): Array<{ problem: string; source: string }> {
  const problems: Array<{ problem: string; source: string }> = [];
  const seen = new Set<string>();
  const add = (p: string, source: string) => {
    const key = p.toLowerCase().trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    problems.push({ problem: p.trim(), source });
  };
  if (state.fhirPrefill?.problems) state.fhirPrefill.problems.forEach(p => add(p, "fhirPrefill.problems"));
  if (state.modifiers?.pmh) state.modifiers.pmh.forEach(p => add(p, "modifiers.pmh"));
  if (state.dm?.hasDM) add("Diabetes mellitus", "dm.hasDM");
  if (state.htn?.hasHTN) add("Hypertension", "htn.hasHTN");
  if (state.glp1?.agent) add(`GLP-1 therapy (${state.glp1.agent})`, "glp1.agent");
  if (state.bariatric?.surgeryType) add(`Bariatric surgery (${state.bariatric.surgeryType})`, "bariatric.surgeryType");
  return problems;
}

function buildRiskFlags(
  state: CaseState,
  normalizedMeds: Array<{ name: string; source: string }>,
  clusterRows: Record<string, any>[],
  triageExtRows: Record<string, any>[]
): Array<{ flagId: string; reason: string; source: string; severity?: string }> {
  const flags: Array<{ flagId: string; reason: string; source: string; severity?: string }> = [];

  for (const cluster of state.activeClusters) {
    const clusterRow = clusterRows.find(r => normId(r.Cluster_ID) === normId(cluster));
    if (clusterRow) {
      const redFlagCriteria = String(clusterRow.Red_Flag_Criteria ?? "").trim();
      if (redFlagCriteria && redFlagCriteria !== "None" && redFlagCriteria !== "N/A") {
        flags.push({
          flagId: `CLUSTER_RF_${normId(cluster)}`,
          reason: redFlagCriteria,
          source: `GLOBAL_CLUSTER_MASTER.${normId(cluster)}.Red_Flag_Criteria`,
          severity: norm(clusterRow.Base_Risk_Level) || "moderate",
        });
      }
    }
  }

  for (const row of triageExtRows) {
    const system = normId(row.System);
    const riskFlag = String(row.Risk_Flag ?? row.Triage_Flag ?? "").trim();
    if (!riskFlag || riskFlag === "None") continue;
    if (state.system && normId(state.system) === system) {
      flags.push({
        flagId: `TRIAGE_EXT_${normId(riskFlag)}`,
        reason: riskFlag,
        source: `GLOBAL_CLUSTER_TRIAGE_EXTENDED.${system}`,
        severity: norm(row.Severity) || "moderate",
      });
    }
  }

  return flags;
}

function buildTriageHints(
  state: CaseState,
  clusterRows: Record<string, any>[]
): Array<{ hint: string; source: string; clusterId?: string }> {
  const hints: Array<{ hint: string; source: string; clusterId?: string }> = [];

  for (const cluster of state.activeClusters) {
    const row = clusterRows.find(r => normId(r.Cluster_ID) === normId(cluster));
    if (!row) continue;
    const disp = String(row.Default_Disposition ?? "").trim();
    const escTarget = String(row.Escalation_Target ?? "").trim();
    const followup = String(row.Followup_Plan ?? "").trim();

    if (disp) {
      hints.push({ hint: `Default disposition: ${disp}`, source: `GLOBAL_CLUSTER_MASTER.${normId(cluster)}`, clusterId: normId(cluster) });
    }
    if (escTarget) {
      hints.push({ hint: `Escalation target: ${escTarget}`, source: `GLOBAL_CLUSTER_MASTER.${normId(cluster)}`, clusterId: normId(cluster) });
    }
    if (followup) {
      hints.push({ hint: `Follow-up: ${followup}`, source: `GLOBAL_CLUSTER_MASTER.${normId(cluster)}`, clusterId: normId(cluster) });
    }
  }

  return hints;
}

async function findMissingModifiers(
  state: CaseState,
  modifierSetId: string | undefined,
  modCleanRows: Record<string, any>[],
  tablesQueried: string[]
): Promise<Array<{ modifierId: string; label: string; modifierSetId: string }>> {
  if (!modifierSetId) return [];

  const missing: Array<{ modifierId: string; label: string; modifierSetId: string }> = [];
  const answeredKeys = new Set(Object.keys(state.modifierAnswers));

  if (modCleanRows.length > 0) {
    for (const row of modCleanRows) {
      const setId = String(row.Modifier_Set_ID ?? "").trim();
      const modId = String(row.Modifier_ID ?? "").trim();
      const label = String(row.Label ?? row.Question_Text ?? "").trim();
      const required = norm(row.Required) !== "false";
      if (setId === modifierSetId && modId && required && !answeredKeys.has(modId)) {
        missing.push({ modifierId: modId, label, modifierSetId: setId });
      }
    }
  }

  if (missing.length === 0) {
    try {
      const cardModRows = await getTable("CARDS_MODIFIER_MASTER");
      tablesQueried.push("CARDS_MODIFIER_MASTER");
      for (const row of cardModRows) {
        const setId = String(row.Modifier_Set_ID ?? "").trim();
        const modId = String(row.Modifier_ID ?? "").trim();
        const label = String(row.Label ?? row.Question_Text ?? "").trim();
        const required = norm(row.Required) !== "false" && norm(row.Required) !== "FALSE";
        if (setId === modifierSetId && modId && required && !answeredKeys.has(modId)) {
          missing.push({ modifierId: modId, label, modifierSetId: setId });
        }
      }
    } catch {
      tablesQueried.push("CARDS_MODIFIER_MASTER(FAILED)");
    }
  }

  return missing;
}

async function buildSuggestedQuestions(
  state: CaseState,
  bundleIds: string[],
  tablesQueried: string[]
): Promise<Array<{ questionId: string; questionText: string; bundleId?: string; source: string }>> {
  const questions: Array<{ questionId: string; questionText: string; bundleId?: string; source: string }> = [];
  const answeredIds = new Set(Object.keys(state.answers));
  const seen = new Set<string>();

  let secondaryRows = await safeLoadTable("SECONDARY_QUESTIONS_GLOBAL", tablesQueried);
  let source = "SECONDARY_QUESTIONS_GLOBAL";
  if (secondaryRows.length === 0) {
    secondaryRows = await safeLoadTable("GLOBAL_SECONDARY", tablesQueried);
    source = "GLOBAL_SECONDARY";
  }

  for (const row of secondaryRows) {
    const qId = String(row.Question_ID ?? row.questionId ?? "").trim();
    const qText = String(row.Question_Text ?? row.questionText ?? "").trim();
    const bundle = String(row.Bundle_ID ?? row.bundleId ?? "").trim();
    if (!qId || !qText || answeredIds.has(qId) || seen.has(qId)) continue;
    if (bundleIds.length > 0 && bundle && !bundleIds.includes(bundle)) continue;
    seen.add(qId);
    questions.push({ questionId: qId, questionText: qText, bundleId: bundle || undefined, source });
  }

  return questions.slice(0, 20);
}

export async function buildClinicalState(state: CaseState): Promise<ClinicalStateOutput> {
  const startTime = Date.now();
  const tablesQueried: string[] = [];

  const normalizedMeds = collectAllMedSources(state);

  const [
    medGroupRows,
    globalMedsRows,
    triggerRows,
    ruleRows,
    clusterRows,
    cpDxRows,
    triageExtRows,
    modCleanRows,
  ] = await Promise.all([
    safeLoadTable("GLOBAL_STANDARDIZED_MEDGROUPS", tablesQueried),
    safeLoadTable("GLOBAL_MEDICATIONS_MASTER", tablesQueried),
    safeLoadTable("MED_TO_CONDITION_TRIGGERS", tablesQueried),
    safeLoadTable("MED_CONDITION_INTELLIGENCE_RULES", tablesQueried),
    safeLoadTable("GLOBAL_CLUSTER_MASTER", tablesQueried),
    safeLoadTable("CLUSTER_PRIMARY_DIAGNOSIS", tablesQueried),
    safeLoadTable("GLOBAL_CLUSTER_TRIAGE_EXTENDED", tablesQueried),
    safeLoadTable("GLOBAL_MODIFIERS_CLEAN", tablesQueried),
  ]);

  const medGroups = buildMedGroups(normalizedMeds, medGroupRows, globalMedsRows);

  const conditionsFromTriggers = inferConditionsFromTriggers(normalizedMeds, triggerRows);
  const conditionsFromRules = inferConditionsFromRules(state, normalizedMeds, ruleRows);
  const inferredConditions = [...conditionsFromTriggers, ...conditionsFromRules];

  const confirmedProblems = collectConfirmedProblems(state);

  const riskFlags = buildRiskFlags(state, normalizedMeds, clusterRows, triageExtRows);

  const suggestedBundles: ClinicalStateOutput["suggestedBundles"] = [];
  const routerEntry = await getRouterEntryByComplaint(state.chiefComplaint);
  if (routerEntry?.primarySecondaryBundleId) {
    suggestedBundles.push({
      bundleId: routerEntry.primarySecondaryBundleId,
      reason: `Router entry for ${routerEntry.chiefComplaint}`,
      source: "CHIEF_COMPLAINT_ROUTER",
    });
  }

  for (const cluster of state.activeClusters) {
    const clusterRow = clusterRows.find(r => normId(r.Cluster_ID) === normId(cluster));
    if (clusterRow) {
      const followupPlan = String(clusterRow.Followup_Plan ?? "").trim();
      if (followupPlan && followupPlan.includes("BUNDLE_")) {
        suggestedBundles.push({
          bundleId: followupPlan,
          reason: `Cluster ${normId(cluster)} followup plan`,
          source: `GLOBAL_CLUSTER_MASTER.${normId(cluster)}`,
        });
      }
    }
  }

  const triageHints = buildTriageHints(state, clusterRows);

  const modifierSetId = routerEntry?.modifierSetId || state.routing?.modifierSetId;
  const missingModifiers = await findMissingModifiers(state, modifierSetId, modCleanRows, tablesQueried);

  const bundleIds = suggestedBundles.map(b => b.bundleId);
  if (routerEntry?.primarySecondaryBundleId && !bundleIds.includes(routerEntry.primarySecondaryBundleId)) {
    bundleIds.push(routerEntry.primarySecondaryBundleId);
  }
  const suggestedQuestions = await buildSuggestedQuestions(state, bundleIds, tablesQueried);

  return {
    normalizedMeds,
    medGroups,
    inferredConditions,
    confirmedProblems,
    riskFlags,
    suggestedBundles,
    triageHints,
    missingModifiers,
    suggestedQuestions,
    tablesQueried,
    buildDurationMs: Date.now() - startTime,
  };
}
