import type { CaseState } from "../../shared/agentTypes";

export interface ConfidenceResult {
  global: "HIGH" | "MODERATE" | "LOW";
  by_inference: Array<{
    itemType: string;
    item: string;
    confidence: "HIGH" | "MODERATE" | "LOW";
    evidence: string[];
  }>;
}

function norm(s: any): string {
  return String(s ?? "").trim().toLowerCase();
}

export function computeConfidence(state: CaseState): ConfidenceResult {
  const inferences: ConfidenceResult["by_inference"] = [];

  const allMeds = [
    ...(state.fhirPrefill?.meds ?? []),
    ...(state.modifiers?.meds ?? []),
    ...(state.dm?.meds ?? []),
    ...(state.htn?.meds ?? []),
  ].map(m => m.toLowerCase());

  const allProblems = [
    ...(state.fhirPrefill?.problems ?? []),
    ...(state.modifiers?.pmh ?? []),
  ].map(p => p.toLowerCase());

  const DM_MEDS = ["metformin", "insulin", "glipizide", "glyburide", "glimepiride", "empagliflozin", "dapagliflozin", "canagliflozin", "sitagliptin", "saxagliptin", "linagliptin"];
  const HTN_MEDS = ["lisinopril", "losartan", "amlodipine", "metoprolol", "hydrochlorothiazide", "enalapril", "valsartan", "irbesartan", "diltiazem", "nifedipine", "atenolol", "carvedilol"];
  const GLP1_MEDS = ["semaglutide", "tirzepatide", "liraglutide", "dulaglutide", "exenatide", "ozempic", "wegovy", "mounjaro", "trulicity", "victoza"];
  const ANTICOAG_MEDS = ["warfarin", "eliquis", "apixaban", "xarelto", "rivaroxaban", "pradaxa", "dabigatran", "enoxaparin", "heparin"];

  const hasDMMed = allMeds.some(m => DM_MEDS.some(d => m.includes(d)));
  const hasDMPmh = allProblems.some(p => p.includes("diabetes") || p.includes("dm") || p.includes("a1c"));
  const hasDMState = state.dm?.hasDM === true;
  const hasDMLastA1c = state.dm?.lastA1c !== undefined && state.dm.lastA1c > 0;

  if (hasDMMed || hasDMPmh || hasDMState) {
    const evidence: string[] = [];
    let conf: "HIGH" | "MODERATE" | "LOW" = "LOW";

    if (hasDMMed) evidence.push(`DM medication detected: ${allMeds.filter(m => DM_MEDS.some(d => m.includes(d))).join(", ")}`);
    if (hasDMPmh) evidence.push(`DM in PMH: ${allProblems.filter(p => p.includes("diabetes") || p.includes("dm")).join(", ")}`);
    if (hasDMState) evidence.push("dm.hasDM = true");
    if (hasDMLastA1c) evidence.push(`Last A1c: ${state.dm!.lastA1c}`);

    if ((hasDMMed && hasDMPmh) || (hasDMMed && hasDMState) || (hasDMPmh && hasDMLastA1c)) {
      conf = "HIGH";
    } else if (hasDMMed || hasDMPmh || hasDMState) {
      conf = "MODERATE";
    }

    inferences.push({ itemType: "condition", item: "DIABETES", confidence: conf, evidence });
  }

  const hasHTNMed = allMeds.some(m => HTN_MEDS.some(d => m.includes(d)));
  const hasHTNPmh = allProblems.some(p => p.includes("hypertension") || p.includes("htn") || p.includes("high blood pressure"));
  const hasHTNState = state.htn?.hasHTN === true;

  if (hasHTNMed || hasHTNPmh || hasHTNState) {
    const evidence: string[] = [];
    let conf: "HIGH" | "MODERATE" | "LOW" = "LOW";

    if (hasHTNMed) evidence.push(`HTN medication detected: ${allMeds.filter(m => HTN_MEDS.some(d => m.includes(d))).join(", ")}`);
    if (hasHTNPmh) evidence.push(`HTN in PMH`);
    if (hasHTNState) evidence.push("htn.hasHTN = true");

    if ((hasHTNMed && hasHTNPmh) || (hasHTNMed && hasHTNState) || hasHTNState) {
      conf = "HIGH";
    } else if (hasHTNMed || hasHTNPmh) {
      conf = "MODERATE";
    }

    inferences.push({ itemType: "condition", item: "HYPERTENSION", confidence: conf, evidence });
  }

  const hasGLP1Med = allMeds.some(m => GLP1_MEDS.some(d => m.includes(d)));
  const hasGLP1State = !!state.glp1?.agent;

  if (hasGLP1Med || hasGLP1State) {
    const evidence: string[] = [];
    let conf: "HIGH" | "MODERATE" | "LOW" = "MODERATE";

    if (hasGLP1Med) evidence.push(`GLP-1 medication detected: ${allMeds.filter(m => GLP1_MEDS.some(d => m.includes(d))).join(", ")}`);
    if (hasGLP1State) evidence.push(`glp1.agent = ${state.glp1!.agent}`);

    const hasObesityPmh = allProblems.some(p => p.includes("obesity") || p.includes("overweight") || p.includes("bmi"));
    if ((hasGLP1Med && (hasDMPmh || hasObesityPmh)) || hasGLP1State) {
      conf = "HIGH";
    }

    inferences.push({ itemType: "treatment", item: "GLP1_THERAPY", confidence: conf, evidence });
  }

  const hasBariatric = !!state.bariatric?.surgeryType || allProblems.some(p =>
    ["bariatric", "gastric bypass", "sleeve", "roux-en-y", "lap band"].some(t => p.includes(t))
  );

  if (hasBariatric) {
    const evidence: string[] = [];
    if (state.bariatric?.surgeryType) evidence.push(`bariatric.surgeryType = ${state.bariatric.surgeryType}`);
    if (allProblems.some(p => p.includes("bariatric"))) evidence.push("Bariatric in PMH");

    inferences.push({
      itemType: "history",
      item: "BARIATRIC_SURGERY",
      confidence: state.bariatric?.surgeryType ? "HIGH" : "MODERATE",
      evidence,
    });
  }

  const hasAnticoag = allMeds.some(m => ANTICOAG_MEDS.some(d => m.includes(d))) || state.fhirPrefill?.derivedFlags?.onAnticoagulant;
  if (hasAnticoag) {
    const evidence: string[] = [];
    if (state.fhirPrefill?.derivedFlags?.onAnticoagulant) evidence.push("derivedFlags.onAnticoagulant = true");
    const matched = allMeds.filter(m => ANTICOAG_MEDS.some(d => m.includes(d)));
    if (matched.length > 0) evidence.push(`Anticoagulant detected: ${matched.join(", ")}`);

    inferences.push({ itemType: "treatment", item: "ANTICOAGULATION", confidence: "HIGH", evidence });
  }

  if (state.clinicalStateTrace?.inferredConditions) {
    for (const ic of state.clinicalStateTrace.inferredConditions) {
      const condKey = ic.condition.toUpperCase().replace(/[^A-Z0-9]/g, "_");
      if (inferences.some(i => i.item === condKey)) continue;

      const medMatch = ic.evidence.some(e => e.includes("MED_TO_CONDITION_TRIGGERS") || e.includes("MED_CONDITION_INTELLIGENCE"));
      const pmhMatch = allProblems.some(p => p.includes(ic.condition.toLowerCase().split(";")[0].split(":")[0].trim()));

      let conf: "HIGH" | "MODERATE" | "LOW" = "LOW";
      if (medMatch && pmhMatch) conf = "HIGH";
      else if (medMatch || pmhMatch) conf = "MODERATE";

      inferences.push({
        itemType: "inferred_condition",
        item: condKey,
        confidence: conf,
        evidence: ic.evidence,
      });
    }
  }

  const cc = norm(state.chiefComplaint);
  const vagueTerms = ["tired", "fatigue", "not feeling well", "unwell", "sick", "general", "checkup"];
  const isVagueComplaint = vagueTerms.some(t => cc.includes(t)) && allMeds.length === 0 && allProblems.length === 0;

  if (isVagueComplaint && inferences.length === 0) {
    inferences.push({
      itemType: "symptom",
      item: "VAGUE_COMPLAINT",
      confidence: "LOW",
      evidence: [`Chief complaint "${state.chiefComplaint}" with no medication or PMH context`],
    });
  }

  let global: "HIGH" | "MODERATE" | "LOW" = "MODERATE";
  if (inferences.length === 0) {
    global = allMeds.length > 0 || allProblems.length > 0 ? "MODERATE" : "LOW";
  } else {
    const confidenceLevels = inferences.map(i => i.confidence);
    if (confidenceLevels.some(c => c === "HIGH")) {
      global = "HIGH";
    } else if (confidenceLevels.some(c => c === "MODERATE")) {
      global = "MODERATE";
    } else {
      global = "LOW";
    }
  }

  return { global, by_inference: inferences };
}
