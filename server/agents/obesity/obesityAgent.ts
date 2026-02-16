import type { CaseState } from "../../../shared/agentTypes";
import type { TraceEvent } from "../../../shared/testingTypes";
import { getTable } from "../../data/registry";
import { registerDynamicQuestion } from "../../agent/router";

export interface ObesityAgentResult {
  triggered: boolean;
  entryReasons: string[];
  state: CaseState;
  events: TraceEvent[];
  spotInterventionIds: string[];
  bundlesAdded: string[];
  rulesEvaluated: number;
  rulesFired: number;
}

interface IntelligenceRule {
  ruleId: string;
  domain: string;
  triggerCondition: string;
  conditionExpression: string;
  actionType: string;
  actionValue: string;
  priority: number;
  safetyClass: string;
  notes: string;
}

interface SpotIntervention {
  interventionId: string;
  contextCondition: string;
  eligibilityCriteria: string;
  actions: string[];
  testsIfAvailable: string[];
  doNotDo: string[];
  referralWindow: string;
  erTriggers: string[];
  safetyClass: string;
}

function norm(s: any): string {
  return String(s ?? "").trim().toLowerCase();
}

function splitList(s: any): string[] {
  return String(s ?? "").split(/[;,]/).map(x => x.trim()).filter(Boolean);
}

const GLP1_AGENTS = ["semaglutide", "liraglutide", "tirzepatide", "dulaglutide", "exenatide", "trulicity", "ozempic", "wegovy", "mounjaro", "victoza", "saxenda", "zepbound", "rybelsus"];
const METFORMIN_NAMES = ["metformin", "glucophage"];
const INSULIN_NAMES = ["insulin", "lantus", "humalog", "novolog", "levemir", "tresiba", "toujeo", "basaglar", "admelog", "fiasp"];
const HTN_MED_NAMES = ["lisinopril", "losartan", "valsartan", "olmesartan", "amlodipine", "hydrochlorothiazide", "hctz", "chlorthalidone", "metoprolol", "atenolol", "carvedilol", "spironolactone", "furosemide", "ramipril", "enalapril", "irbesartan", "diltiazem", "nifedipine", "prazosin", "clonidine", "hydralazine"];
const SULFONYLUREA_NAMES = ["glipizide", "glyburide", "glimepiride"];
const SGLT2_NAMES = ["empagliflozin", "dapagliflozin", "canagliflozin", "jardiance", "farxiga", "invokana"];
const BARIATRIC_TERMS = ["bariatric", "gastric bypass", "sleeve gastrectomy", "lap band", "roux-en-y", "duodenal switch"];

function collectAllMeds(state: CaseState): string[] {
  const meds: string[] = [];
  if (state.fhirPrefill?.meds) meds.push(...state.fhirPrefill.meds);
  if (state.modifiers?.meds) meds.push(...state.modifiers.meds);
  if (state.dm?.meds) meds.push(...state.dm.meds);
  if (state.htn?.meds) meds.push(...state.htn.meds);
  const currentMedsList = state.modifierAnswers?.currentMedsList;
  if (Array.isArray(currentMedsList)) meds.push(...currentMedsList.map(String));
  const normalized = meds.filter(Boolean).map(m => m.toLowerCase().trim());
  return [...new Set(normalized)];
}

function medMatch(medList: string[], targetNames: string[]): boolean {
  return medList.some(m => targetNames.some(t => m.includes(t)));
}

function detectMetabolicEntryReasons(state: CaseState, allMeds: string[]): string[] {
  const reasons: string[] = [];

  if (state.metabolic?.bmi && state.metabolic.bmi >= 30) reasons.push("BMI>=30");
  if (state.metabolic?.bmi && state.metabolic.bmi >= 25 && state.metabolic.bmi < 30) reasons.push("BMI_OVERWEIGHT");

  if (medMatch(allMeds, GLP1_AGENTS)) reasons.push("GLP1_MED_DETECTED");
  if (medMatch(allMeds, METFORMIN_NAMES)) reasons.push("METFORMIN_DETECTED");
  if (medMatch(allMeds, INSULIN_NAMES)) reasons.push("INSULIN_DETECTED");
  if (medMatch(allMeds, HTN_MED_NAMES)) reasons.push("HTN_MED_DETECTED");
  if (medMatch(allMeds, SULFONYLUREA_NAMES)) reasons.push("SULFONYLUREA_DETECTED");
  if (medMatch(allMeds, SGLT2_NAMES)) reasons.push("SGLT2_DETECTED");

  if (state.dm?.hasDM) reasons.push("DM_PRESENT");
  if (state.htn?.hasHTN) reasons.push("HTN_PRESENT");

  const problems = [
    ...(state.fhirPrefill?.problems ?? []),
    ...(state.modifiers?.pmh ?? []),
  ].map(p => p.toLowerCase());

  if (problems.some(p => p.includes("diabetes") || p.includes("dm") || p.includes("a1c"))) reasons.push("DM_IN_PMH");
  if (problems.some(p => p.includes("hypertension") || p.includes("htn") || p.includes("high blood pressure"))) reasons.push("HTN_IN_PMH");
  if (problems.some(p => p.includes("obesity") || p.includes("bmi") || p.includes("overweight"))) reasons.push("OBESITY_IN_PMH");
  if (problems.some(p => p.includes("sleep apnea") || p.includes("osa"))) reasons.push("OSA_IN_PMH");
  if (problems.some(p => BARIATRIC_TERMS.some(bt => p.includes(bt)))) reasons.push("BARIATRIC_HISTORY");

  const cc = norm(state.chiefComplaint);
  if (cc.includes("weight") || cc.includes("bmi") || cc.includes("obesity")) reasons.push("CC_WEIGHT_RELATED");
  if (cc.includes("blood sugar") || cc.includes("diabetes") || cc.includes("glucose")) reasons.push("CC_DM_RELATED");
  if (cc.includes("blood pressure") || cc.includes("hypertension")) reasons.push("CC_HTN_RELATED");
  if (GLP1_AGENTS.some(a => cc.includes(a))) reasons.push("CC_GLP1_RELATED");

  return [...new Set(reasons)];
}

function inferDmState(state: CaseState, allMeds: string[]): CaseState["dm"] {
  if (state.dm?.hasDM !== undefined) return state.dm;

  const hasDmMeds = medMatch(allMeds, [...METFORMIN_NAMES, ...INSULIN_NAMES, ...SULFONYLUREA_NAMES, ...SGLT2_NAMES]);
  const hasGlp1 = medMatch(allMeds, GLP1_AGENTS);
  const problems = [...(state.fhirPrefill?.problems ?? []), ...(state.modifiers?.pmh ?? [])].map(p => p.toLowerCase());
  const dmInPmh = problems.some(p => p.includes("diabetes") || p.includes("dm"));

  if (!hasDmMeds && !dmInPmh && !hasGlp1) return undefined;

  return {
    hasDM: hasDmMeds || dmInPmh,
    type: medMatch(allMeds, INSULIN_NAMES) && !medMatch(allMeds, METFORMIN_NAMES) ? "type1" : "type2",
    meds: allMeds.filter(m =>
      [...METFORMIN_NAMES, ...INSULIN_NAMES, ...SULFONYLUREA_NAMES, ...SGLT2_NAMES, ...GLP1_AGENTS].some(t => m.includes(t))
    ),
    hypoHistory: medMatch(allMeds, SULFONYLUREA_NAMES) || medMatch(allMeds, INSULIN_NAMES),
    ketoneRisk: medMatch(allMeds, INSULIN_NAMES),
  };
}

function inferHtnState(state: CaseState, allMeds: string[]): CaseState["htn"] {
  if (state.htn?.hasHTN !== undefined) return state.htn;

  const hasHtnMeds = medMatch(allMeds, HTN_MED_NAMES);
  const problems = [...(state.fhirPrefill?.problems ?? []), ...(state.modifiers?.pmh ?? [])].map(p => p.toLowerCase());
  const htnInPmh = problems.some(p => p.includes("hypertension") || p.includes("htn") || p.includes("high blood pressure"));

  if (!hasHtnMeds && !htnInPmh) return undefined;

  return {
    hasHTN: hasHtnMeds || htnInPmh,
    meds: allMeds.filter(m => HTN_MED_NAMES.some(t => m.includes(t))),
    endOrganSymptoms: [],
  };
}

function inferGlp1State(state: CaseState, allMeds: string[]): CaseState["glp1"] {
  if (state.glp1?.agent) return state.glp1;
  const glp1Med = allMeds.find(m => GLP1_AGENTS.some(a => m.includes(a)));
  if (!glp1Med) return undefined;
  return { agent: glp1Med, sideEffects: [] };
}

function parseIntelligenceRule(row: Record<string, any>): IntelligenceRule {
  return {
    ruleId: String(row.Rule_ID ?? "").trim(),
    domain: norm(row.Domain),
    triggerCondition: norm(row.Trigger_Condition),
    conditionExpression: String(row.Condition_Expression ?? "").trim(),
    actionType: norm(row.Action_Type),
    actionValue: String(row.Action_Value ?? "").trim(),
    priority: Number(row.Priority) || 100,
    safetyClass: norm(row.Safety_Class) || "education",
    notes: String(row.Notes ?? "").trim(),
  };
}

function parseSpotIntervention(row: Record<string, any>): SpotIntervention {
  return {
    interventionId: String(row.Intervention_ID ?? "").trim(),
    contextCondition: String(row.Context_Condition ?? "").trim(),
    eligibilityCriteria: String(row.Eligibility_Criteria ?? "").trim(),
    actions: splitList(row.Actions),
    testsIfAvailable: splitList(row.Tests_If_Available),
    doNotDo: splitList(row["Contraindications/Do_Not_Do"] ?? row.Do_Not_Do),
    referralWindow: String(row.Referral_Window ?? "").trim(),
    erTriggers: splitList(row.ER_Triggers),
    safetyClass: norm(row.Safety_Class) || "spot_intervention",
  };
}

function evaluateIntelligenceCondition(
  rule: IntelligenceRule,
  state: CaseState,
  allMeds: string[],
  entryReasons: string[]
): boolean {
  const trigger = rule.triggerCondition;

  if (trigger === "always") return true;
  if (trigger === "htn_present") return state.htn?.hasHTN === true;
  if (trigger === "dm_present") return state.dm?.hasDM === true;
  if (trigger === "glp1_present") return !!state.glp1?.agent;
  if (trigger === "obesity") return (state.metabolic?.bmi ?? 0) >= 30 || entryReasons.includes("OBESITY_IN_PMH");
  if (trigger === "bmi>=30") return (state.metabolic?.bmi ?? 0) >= 30;
  if (trigger === "bmi>=40") return (state.metabolic?.bmi ?? 0) >= 40;

  if (trigger === "htn_on_1_agent") {
    return state.htn?.hasHTN === true && (state.htn?.meds?.length ?? 0) === 1;
  }
  if (trigger === "htn_resistant") {
    const htnMedCount = state.htn?.meds?.length ?? 0;
    const hasDiuretic = medMatch(state.htn?.meds?.map(m => m.toLowerCase()) ?? [], ["hydrochlorothiazide", "hctz", "chlorthalidone", "furosemide", "spironolactone"]);
    return state.htn?.hasHTN === true && htnMedCount >= 3 && hasDiuretic;
  }
  if (trigger === "osa_contributor") {
    const problems = [...(state.fhirPrefill?.problems ?? []), ...(state.modifiers?.pmh ?? [])].map(p => p.toLowerCase());
    return problems.some(p => p.includes("sleep apnea") || p.includes("osa"));
  }

  if (trigger === "dm_on_sulfonylurea") return medMatch(allMeds, SULFONYLUREA_NAMES);
  if (trigger === "dm_chf_ckd") {
    const problems = [...(state.fhirPrefill?.problems ?? []), ...(state.modifiers?.pmh ?? [])].map(p => p.toLowerCase());
    return state.dm?.hasDM === true && (
      problems.some(p => p.includes("heart failure") || p.includes("chf")) ||
      state.fhirPrefill?.derivedFlags?.ckd === true ||
      problems.some(p => p.includes("ckd") || p.includes("chronic kidney"))
    );
  }
  if (trigger === "glp1_side_effects") {
    return (state.glp1?.sideEffects?.length ?? 0) > 0;
  }
  if (trigger === "no_pcp_access") {
    return state.social?.pcpAccessDelay === true || state.social?.insuranceGap === true;
  }

  if (trigger === "abd_pain_bari_or_glp1") {
    const cc = norm(state.chiefComplaint);
    const hasAbdPain = cc.includes("abdominal pain") || cc.includes("abd pain") || cc.includes("stomach pain") || cc.includes("belly pain");
    if (!hasAbdPain) return false;
    const isBariatric = entryReasons.includes("BARIATRIC_HISTORY");
    const isGlp1 = !!state.glp1?.agent || entryReasons.includes("GLP1_MED_DETECTED");
    return isBariatric || isGlp1;
  }

  if (rule.conditionExpression) {
    return entryReasons.some(r => norm(r) === norm(rule.conditionExpression));
  }

  return false;
}

function evaluateSpotEligibility(intervention: SpotIntervention, state: CaseState, allMeds: string[], entryReasons: string[]): boolean {
  const criteria = intervention.eligibilityCriteria.toLowerCase();
  if (!criteria) return true;

  if (criteria.includes("htn") && !state.htn?.hasHTN) return false;
  if (criteria.includes("dm") && !state.dm?.hasDM) return false;
  if (criteria.includes("glp1") && !state.glp1?.agent) return false;
  if (criteria.includes("obesity") && !entryReasons.some(r => r.includes("BMI") || r.includes("OBESITY"))) return false;
  if (criteria.includes("bariatric") && !entryReasons.includes("BARIATRIC_HISTORY")) return false;

  return true;
}

const HTN_ESC_RULES: IntelligenceRule[] = [
  {
    ruleId: "HTN_ESC_001", domain: "htn", triggerCondition: "htn_present",
    conditionExpression: "", actionType: "add_bundle", actionValue: "BUNDLE_UC_HTN_BRIDGE",
    priority: 10, safetyClass: "spot_intervention",
    notes: "BP confirmation + red flag screen for all HTN patients"
  },
  {
    ruleId: "HTN_ESC_002", domain: "htn", triggerCondition: "htn_on_1_agent",
    conditionExpression: "", actionType: "education_block", actionValue: "Med-gap detection: on 1 agent only, uncontrolled — consider adding second agent from complementary class",
    priority: 20, safetyClass: "education",
    notes: "Med-gap detection: on 1 agent only"
  },
  {
    ruleId: "HTN_ESC_003", domain: "htn", triggerCondition: "htn_resistant",
    conditionExpression: "", actionType: "test_suggestion", actionValue: "BMP/CMP,Urine albumin/Cr ratio,Aldosterone/Renin ratio",
    priority: 30, safetyClass: "test_suggestion",
    notes: "Resistant HTN screen: 3+ meds including diuretic and still high"
  },
  {
    ruleId: "HTN_ESC_004", domain: "htn", triggerCondition: "osa_contributor",
    conditionExpression: "", actionType: "add_bundle", actionValue: "BUNDLE_UC_OSA_SCREEN",
    priority: 40, safetyClass: "education",
    notes: "OSA contributor flag — screen and refer"
  },
  {
    ruleId: "HTN_ESC_005", domain: "htn", triggerCondition: "htn_present",
    conditionExpression: "", actionType: "spot_intervention", actionValue: "HTN_UC_BRIDGE",
    priority: 50, safetyClass: "spot_intervention",
    notes: "UC bridge plan: labs + short refill + follow-up"
  },
];

const DM_ESC_RULES: IntelligenceRule[] = [
  {
    ruleId: "DM_ESC_001", domain: "dm", triggerCondition: "dm_present",
    conditionExpression: "", actionType: "add_bundle", actionValue: "BUNDLE_UC_DM_BRIDGE",
    priority: 10, safetyClass: "spot_intervention",
    notes: "Danger screen: DKA/HHS/hypo questions"
  },
  {
    ruleId: "DM_ESC_002", domain: "dm", triggerCondition: "dm_present",
    conditionExpression: "", actionType: "education_block", actionValue: "Care gaps: last A1c, eye exam, microalbumin, statin eligibility, ACE/ARB if albuminuria/HTN",
    priority: 20, safetyClass: "education",
    notes: "Care gap prompts + essential labs"
  },
  {
    ruleId: "DM_ESC_003", domain: "dm", triggerCondition: "dm_chf_ckd",
    conditionExpression: "", actionType: "education_block", actionValue: "Weight/CHF/CKD present: consider SGLT2 class discussion (empagliflozin, dapagliflozin) for cardiorenal benefit",
    priority: 30, safetyClass: "education",
    notes: "Med class fit: weight/CHF/CKD favors GLP-1/SGLT2"
  },
  {
    ruleId: "DM_ESC_004", domain: "dm", triggerCondition: "glp1_side_effects",
    conditionExpression: "", actionType: "add_bundle", actionValue: "BUNDLE_UC_GLP1_SIDE_EFFECTS",
    priority: 40, safetyClass: "education",
    notes: "GLP-1 side effects routing"
  },
  {
    ruleId: "DM_ESC_005", domain: "dm", triggerCondition: "dm_present",
    conditionExpression: "", actionType: "spot_intervention", actionValue: "DM_UC_BRIDGE",
    priority: 50, safetyClass: "spot_intervention",
    notes: "UC bridge/refill plan + follow-up"
  },
];

const ABD_PAIN_RULES: IntelligenceRule[] = [
  {
    ruleId: "ABD_PAIN_BARI_GLP1_001", domain: "gi_metabolic", triggerCondition: "abd_pain_bari_or_glp1",
    conditionExpression: "", actionType: "er_send", actionValue: "ER evaluation for abdominal pain in bariatric/GLP-1 patient",
    priority: 1, safetyClass: "er_send",
    notes: "Routes both bariatric and GLP-1 abdominal pain red flags to ER — highest priority"
  },
];

const OBESITY_ENTRY_RULES: IntelligenceRule[] = [
  {
    ruleId: "OBESITY_ENTRY_001", domain: "metabolic", triggerCondition: "obesity",
    conditionExpression: "", actionType: "add_bundle", actionValue: "BUNDLE_UC_METABOLIC_GAPS",
    priority: 5, safetyClass: "education",
    notes: "Route into metabolic evaluation for BMI>=30 or obesity in PMH"
  },
  {
    ruleId: "OBESITY_ENTRY_002", domain: "metabolic", triggerCondition: "no_pcp_access",
    conditionExpression: "", actionType: "add_bundle", actionValue: "BUNDLE_UC_NO_PCP_PLAN",
    priority: 5, safetyClass: "education",
    notes: "Insurance/access constraints pathway"
  },
];

const DEFAULT_SPOT_INTERVENTIONS: SpotIntervention[] = [
  {
    interventionId: "SI_HTN_UNCONTROLLED_1_AGENT",
    contextCondition: "HTN uncontrolled on 1 agent, asymptomatic",
    eligibilityCriteria: "htn on 1 agent",
    actions: ["Confirm correct BP technique (repeat BP, cuff size, rest)", "Assess med adherence (missed doses, affordability, side effects)", "Check for secondary contributors (NSAIDs, decongestants, stimulants, steroids)", "Home BP plan: 2 readings AM/PM for 3-7 days"],
    testsIfAvailable: ["BMP/CMP (K/Cr)"],
    doNotDo: ["Do not start multiple new agents simultaneously"],
    referralWindow: "1-2 weeks PCP follow-up",
    erTriggers: ["Neuro deficits", "Chest pain", "Vision loss", "Confusion"],
    safetyClass: "spot_intervention",
  },
  {
    interventionId: "SI_OSA_AFFECTING_HTN",
    contextCondition: "Suspected OSA affecting HTN control",
    eligibilityCriteria: "htn and osa",
    actions: ["STOP-BANG screening", "Discuss CPAP adherence if previously diagnosed", "Refer to sleep medicine"],
    testsIfAvailable: [],
    doNotDo: ["Do not attribute all HTN to OSA without evaluation"],
    referralWindow: "2-4 weeks sleep medicine referral",
    erTriggers: ["Severe daytime somnolence with driving risk"],
    safetyClass: "education",
  },
  {
    interventionId: "SI_DM2_HYPERGLYCEMIA_MILD",
    contextCondition: "DM2 with mild hyperglycemia symptoms, no red flags",
    eligibilityCriteria: "dm",
    actions: ["Identify DM type and current meds", "Sick-day rules education", "Hypoglycemia plan review", "Bridge refill essential meds if safe"],
    testsIfAvailable: ["Fingerstick glucose", "Urine ketones (if symptomatic or type 1)"],
    doNotDo: ["Do not adjust insulin dosing without specialist guidance", "Do not prescribe new sulfonylureas without hypoglycemia counseling"],
    referralWindow: "24-72h PCP follow-up",
    erTriggers: ["Altered mental status", "Persistent vomiting", "Kussmaul breathing", "Severe abdominal pain"],
    safetyClass: "spot_intervention",
  },
  {
    interventionId: "SI_HYPOGLYCEMIA_EDUCATION",
    contextCondition: "Patient on hypoglycemia-risk medications",
    eligibilityCriteria: "dm on sulfonylurea or insulin",
    actions: ["Rule of 15 education", "Glucagon availability check", "Review carb counting if on insulin", "Adjust timing of meals and medication"],
    testsIfAvailable: ["Fingerstick glucose"],
    doNotDo: ["Do not withhold glucose from conscious hypoglycemic patient"],
    referralWindow: "1-2 weeks PCP follow-up",
    erTriggers: ["Loss of consciousness", "Seizure", "Unable to take oral glucose"],
    safetyClass: "education",
  },
  {
    interventionId: "SI_GLP1_DEHYDRATION",
    contextCondition: "GLP-1 agonist with dehydration risk",
    eligibilityCriteria: "glp1",
    actions: ["Assess hydration status", "Nausea management (small frequent meals, bland diet)", "Ensure adequate fluid intake", "Review dose escalation schedule"],
    testsIfAvailable: ["BMP if clinically dehydrated"],
    doNotDo: ["Do not increase GLP-1 dose during active nausea/vomiting"],
    referralWindow: "1 week prescriber follow-up",
    erTriggers: ["Severe dehydration", "Persistent vomiting >24h", "Acute pancreatitis symptoms"],
    safetyClass: "spot_intervention",
  },
  {
    interventionId: "SI_BARIATRIC_ABDO_PAIN",
    contextCondition: "Bariatric surgery patient with abdominal pain",
    eligibilityCriteria: "bariatric",
    actions: ["Rule out surgical emergency (internal hernia, anastomotic leak)", "Assess for dumping syndrome", "Nutritional deficiency screen"],
    testsIfAvailable: ["CBC", "CMP", "Lipase", "CT if concern for obstruction"],
    doNotDo: ["Do not dismiss abdominal pain in bariatric patients", "Do not give NSAIDs without gastroprotection"],
    referralWindow: "Same day if surgical concern, 24-72h otherwise",
    erTriggers: ["Acute abdomen signs", "Tachycardia", "Peritoneal signs", "High-grade fever"],
    safetyClass: "spot_intervention",
  },
];

export async function runObesityAgent(state: CaseState): Promise<ObesityAgentResult> {
  const events: TraceEvent[] = [];
  let updated = { ...state };
  const allMeds = collectAllMeds(state);

  const entryReasons = detectMetabolicEntryReasons(state, allMeds);

  if (entryReasons.length === 0) {
    return {
      triggered: false,
      entryReasons: [],
      state: updated,
      events: [],
      spotInterventionIds: [],
      bundlesAdded: [],
      rulesEvaluated: 0,
      rulesFired: 0,
    };
  }

  events.push({
    type: "OBESITY_AGENT_TRIGGERED",
    severity: "info",
    message: `Entry reasons: ${entryReasons.join(", ")}`,
  });

  const inferredDm = inferDmState(updated, allMeds);
  if (inferredDm && !updated.dm) {
    updated = { ...updated, dm: inferredDm };
    events.push({ type: "DM_STATE_INFERRED", severity: "info", message: `DM type=${inferredDm.type}, meds=${inferredDm.meds?.length ?? 0}` });
  }

  const inferredHtn = inferHtnState(updated, allMeds);
  if (inferredHtn && !updated.htn) {
    updated = { ...updated, htn: inferredHtn };
    events.push({ type: "HTN_STATE_INFERRED", severity: "info", message: `HTN meds=${inferredHtn.meds?.length ?? 0}` });
  }

  const inferredGlp1 = inferGlp1State(updated, allMeds);
  if (inferredGlp1 && !updated.glp1) {
    updated = { ...updated, glp1: inferredGlp1 };
    events.push({ type: "GLP1_STATE_INFERRED", severity: "info", message: `GLP1 agent=${inferredGlp1.agent}` });
  }

  let sheetRules: IntelligenceRule[] = [];
  try {
    const sheetRows = await getTable("MED_CONDITION_INTELLIGENCE_RULES");
    sheetRules = sheetRows.map(parseIntelligenceRule).filter(r => r.ruleId);
  } catch {
    events.push({ type: "INTELLIGENCE_RULES_LOAD", severity: "warn", message: "MED_CONDITION_INTELLIGENCE_RULES table not available, using built-in rules" });
  }

  const allRules = [
    ...ABD_PAIN_RULES,
    ...OBESITY_ENTRY_RULES,
    ...HTN_ESC_RULES,
    ...DM_ESC_RULES,
    ...sheetRules,
  ].sort((a, b) => a.priority - b.priority);

  const bundlesAdded: string[] = [];
  const spotInterventionIds: string[] = [];
  let rulesFired = 0;

  for (const rule of allRules) {
    const fires = evaluateIntelligenceCondition(rule, updated, allMeds, entryReasons);
    if (!fires) continue;

    rulesFired++;

    updated.ruleTrace = [
      ...updated.ruleTrace,
      {
        ruleId: rule.ruleId,
        triggerLevel: "OBESITY_AGENT",
        action: rule.actionType.toUpperCase(),
        detail: `${rule.actionType}(${rule.actionValue}) [${rule.notes}]`,
      },
    ];

    switch (rule.actionType) {
      case "add_bundle": {
        if (!bundlesAdded.includes(rule.actionValue)) {
          bundlesAdded.push(rule.actionValue);
        }
        break;
      }
      case "education_block": {
        events.push({
          type: "EDUCATION_BLOCK",
          severity: "info",
          ruleId: rule.ruleId,
          message: rule.actionValue,
        });
        break;
      }
      case "test_suggestion": {
        const tests = splitList(rule.actionValue);
        updated.recommendedActions = [
          ...(updated.recommendedActions || []),
          ...tests.map(t => ({ type: `TEST_${t.replace(/[\s/]+/g, "_").toUpperCase()}`, priority: "medium" as const })),
        ];
        events.push({
          type: "TESTS_SUGGESTED",
          severity: "info",
          ruleId: rule.ruleId,
          message: tests.join(", "),
        });
        break;
      }
      case "spot_intervention": {
        spotInterventionIds.push(rule.actionValue);
        break;
      }
      case "referral": {
        updated.recommendedActions = [
          ...(updated.recommendedActions || []),
          { type: `REFER_${rule.actionValue.toUpperCase()}`, priority: "medium" as const },
        ];
        break;
      }
      case "set_cluster": {
        if (!updated.activeClusters.includes(rule.actionValue)) {
          updated.activeClusters = [...updated.activeClusters, rule.actionValue];
        }
        break;
      }
      case "er_send": {
        updated.routing = { ...updated.routing, state: "EMERGENT_ESCALATION" };
        updated.redFlags = [...new Set([...updated.redFlags, `RF_${rule.ruleId}`])];
        updated.recommendedActions = [
          ...(updated.recommendedActions || []),
          { type: "ER_SEND", priority: "critical" as const },
        ];
        events.push({
          type: "ER_SEND_TRIGGERED",
          severity: "error",
          ruleId: rule.ruleId,
          message: rule.actionValue,
        });
        break;
      }
    }
  }

  let sheetSpotInterventions: SpotIntervention[] = [];
  try {
    const siRows = await getTable("URGENT_CARE_SPOT_INTERVENTIONS");
    sheetSpotInterventions = siRows.map(parseSpotIntervention).filter(si => si.interventionId);
  } catch {
    events.push({ type: "SPOT_INTERVENTIONS_LOAD", severity: "warn", message: "URGENT_CARE_SPOT_INTERVENTIONS table not available, using built-in interventions" });
  }

  const allSpotInterventions = [...DEFAULT_SPOT_INTERVENTIONS, ...sheetSpotInterventions];

  const matchedSpotIds = [...spotInterventionIds];

  for (const si of allSpotInterventions) {
    if (matchedSpotIds.includes(si.interventionId)) continue;
    if (evaluateSpotEligibility(si, updated, allMeds, entryReasons)) {
      matchedSpotIds.push(si.interventionId);
    }
  }

  for (const siId of matchedSpotIds) {
    const si = allSpotInterventions.find(s => s.interventionId === siId);
    if (!si) continue;

    updated.spotInterventions = [
      ...(updated.spotInterventions || []),
      {
        interventionId: si.interventionId,
        contextCondition: si.contextCondition,
        actions: si.actions,
        testsIfAvailable: si.testsIfAvailable,
        doNotDo: si.doNotDo,
        referralWindow: si.referralWindow,
        erTriggers: si.erTriggers,
        source: "OBESITY_AGENT",
        safetyClass: si.safetyClass as any,
      },
    ];

    events.push({
      type: "SPOT_INTERVENTION_MATCHED",
      severity: "info",
      message: `${si.interventionId}: ${si.contextCondition}`,
    });
  }

  if (entryReasons.some(r => r.includes("DM") || r.includes("METFORMIN") || r.includes("INSULIN") || r.includes("SULFONYLUREA"))) {
    const dmQs = [
      { id: "Q_DM_POLYURIA", text: "Have you been urinating more frequently than usual?" },
      { id: "Q_DM_POLYDIPSIA", text: "Have you been feeling unusually thirsty?" },
      { id: "Q_DM_FRUITY_BREATH", text: "Has anyone mentioned your breath smells fruity or unusual?" },
      { id: "Q_DM_ALTERED_MENTAL_STATUS", text: "Have you experienced any confusion, difficulty thinking clearly, or loss of consciousness?" },
      { id: "Q_DM_PERSISTENT_VOMITING", text: "Have you had persistent vomiting?" },
      { id: "Q_DM_SEVERE_HYPO", text: "Have you had a severe low blood sugar episode where you needed help from someone else?" },
    ];
    for (const q of dmQs) {
      if (!(q.id in updated.answers)) {
        registerDynamicQuestion(q.id, q.text);
        if (!updated.questionQueue.some(qq => qq.questionId === q.id)) {
          updated.questionQueue = [
            ...updated.questionQueue,
            { questionId: q.id, bundleId: "BUNDLE_UC_DM_BRIDGE", askOrder: 200, isRedFlag: true, questionText: q.text, answered: false },
          ];
        }
      }
    }
  }

  if (entryReasons.some(r => r.includes("HTN"))) {
    const htnQs = [
      { id: "Q_HTN_NEURO_DEFICIT", text: "Do you have any numbness, weakness, or difficulty speaking?" },
      { id: "Q_HTN_VISION_LOSS", text: "Have you experienced sudden vision changes or loss?" },
      { id: "Q_HTN_SEVERE_HEADACHE", text: "Do you have a sudden severe headache, the worst of your life?" },
      { id: "Q_HTN_PREGNANCY_SEVERE", text: "Are you pregnant and experiencing severe headache, vision changes, or upper abdominal pain?" },
    ];
    for (const q of htnQs) {
      if (!(q.id in updated.answers)) {
        registerDynamicQuestion(q.id, q.text);
        if (!updated.questionQueue.some(qq => qq.questionId === q.id)) {
          updated.questionQueue = [
            ...updated.questionQueue,
            { questionId: q.id, bundleId: "BUNDLE_UC_HTN_BRIDGE", askOrder: 200, isRedFlag: true, questionText: q.text, answered: false },
          ];
        }
      }
    }
  }

  events.push({
    type: "OBESITY_AGENT_COMPLETE",
    severity: "info",
    message: `${rulesFired}/${allRules.length} rules fired, ${matchedSpotIds.length} spot interventions, ${bundlesAdded.length} bundles added`,
  });

  return {
    triggered: true,
    entryReasons,
    state: updated,
    events,
    spotInterventionIds: matchedSpotIds,
    bundlesAdded,
    rulesEvaluated: allRules.length,
    rulesFired,
  };
}
