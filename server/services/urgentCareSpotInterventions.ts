import { getTable } from "../data/registry";
import type { CaseState } from "../../shared/agentTypes";

export interface UCSpotIntervention {
  interventionId: string;
  contextCondition: string;
  eligibilityCriteria: string;
  actions: string[];
  testsIfAvailable: string[];
  doNotDo: string[];
  referralWindow: string;
  erTriggers: string[];
  safetyClass: string;
  gatingReason?: string;
}

export interface UCSpotResult {
  selected: UCSpotIntervention[];
  skipped: Array<{ interventionId: string; reason: string }>;
  source: string;
}

function norm(s: any): string {
  return String(s ?? "").trim().toLowerCase();
}

function splitList(s: any): string[] {
  return String(s ?? "").split(/[;,]/).map(x => x.trim()).filter(Boolean);
}

function parseSpotRow(row: Record<string, any>): UCSpotIntervention | null {
  const id = String(row.Intervention_ID ?? row.interventionId ?? "").trim();
  if (!id) return null;
  return {
    interventionId: id,
    contextCondition: String(row.Context_Condition ?? row.contextCondition ?? "").trim(),
    eligibilityCriteria: String(row.Eligibility_Criteria ?? row.eligibilityCriteria ?? "").trim(),
    actions: splitList(row.Actions ?? row.actions),
    testsIfAvailable: splitList(row.Tests_If_Available ?? row.testsIfAvailable),
    doNotDo: splitList(row["Contraindications/Do_Not_Do"] ?? row.Do_Not_Do ?? row.doNotDo),
    referralWindow: String(row.Referral_Window ?? row.referralWindow ?? "").trim(),
    erTriggers: splitList(row.ER_Triggers ?? row.erTriggers),
    safetyClass: norm(row.Safety_Class ?? row.safetyClass) || "spot_intervention",
  };
}

const DEFAULT_UC_SPOTS: UCSpotIntervention[] = [
  {
    interventionId: "UC_SI_FEVER_WORKUP",
    contextCondition: "Fever in urgent care setting",
    eligibilityCriteria: "fever_present",
    actions: ["Obtain CBC with differential", "Blood cultures if temp >= 102F", "Urinalysis", "Chest X-ray if respiratory symptoms"],
    testsIfAvailable: ["CBC", "Blood cultures", "Urinalysis", "CXR"],
    doNotDo: ["Do not discharge without source identification if immunocompromised"],
    referralWindow: "24-48h PCP follow-up",
    erTriggers: ["Altered mental status", "Hemodynamic instability", "Immunocompromised with high fever"],
    safetyClass: "spot_intervention",
  },
  {
    interventionId: "UC_SI_DEHYDRATION",
    contextCondition: "Dehydration assessment needed",
    eligibilityCriteria: "dehydration_risk",
    actions: ["Assess hydration status (mucous membranes, skin turgor, orthostatics)", "Oral rehydration trial", "Consider IV fluids if unable to tolerate PO"],
    testsIfAvailable: ["BMP", "Urinalysis (specific gravity)"],
    doNotDo: ["Do not discharge if unable to tolerate oral fluids"],
    referralWindow: "24h if persistent",
    erTriggers: ["Severe dehydration", "Altered mental status", "Persistent vomiting >24h"],
    safetyClass: "spot_intervention",
  },
  {
    interventionId: "UC_SI_WOUND_CARE",
    contextCondition: "Wound requiring urgent care management",
    eligibilityCriteria: "wound_present",
    actions: ["Wound irrigation and debridement", "Tetanus status check", "Appropriate closure technique", "Antibiotic prophylaxis if contaminated"],
    testsIfAvailable: ["X-ray if foreign body suspected"],
    doNotDo: ["Do not close wounds older than 24h without specialist guidance", "Do not close bite wounds primarily"],
    referralWindow: "48-72h wound check",
    erTriggers: ["Arterial bleeding", "Tendon/nerve involvement", "Open fracture"],
    safetyClass: "spot_intervention",
  },
];

function checkEligibility(
  intervention: UCSpotIntervention,
  state: CaseState
): { eligible: boolean; reason: string } {
  const criteria = intervention.eligibilityCriteria.toLowerCase();

  if (state.routing.state === "EMERGENT_ESCALATION") {
    return { eligible: false, reason: "Already in EMERGENT_ESCALATION — skip counseling" };
  }

  if (!criteria || criteria === "always" || criteria === "any") {
    return { eligible: true, reason: "Universal eligibility" };
  }

  const problems = [...(state.fhirPrefill?.problems ?? []), ...(state.modifiers?.pmh ?? [])].map(p => p.toLowerCase());
  const allMeds = [
    ...(state.fhirPrefill?.meds ?? []),
    ...(state.modifiers?.meds ?? []),
    ...(state.dm?.meds ?? []),
    ...(state.htn?.meds ?? []),
  ].map(m => m.toLowerCase());

  if (criteria.includes("htn") && !state.htn?.hasHTN && !problems.some(p => p.includes("hypertension"))) {
    return { eligible: false, reason: "HTN not detected" };
  }
  if (criteria.includes("dm") && !state.dm?.hasDM && !problems.some(p => p.includes("diabetes"))) {
    return { eligible: false, reason: "DM not detected" };
  }
  if (criteria.includes("glp1") && !state.glp1?.agent) {
    return { eligible: false, reason: "GLP-1 not detected" };
  }
  if (criteria.includes("bariatric") && !state.bariatric?.surgeryType &&
      !problems.some(p => ["bariatric", "gastric bypass", "sleeve"].some(t => p.includes(t)))) {
    return { eligible: false, reason: "Bariatric history not detected" };
  }
  if (criteria.includes("fever") && !Object.values(state.answers).some(a => a === "yes" && String(a).includes("fever"))) {
    const cc = norm(state.chiefComplaint);
    if (!cc.includes("fever")) return { eligible: false, reason: "Fever not detected" };
  }
  if (criteria.includes("dehydration")) {
    const hasDehydrationRisk = state.glp1?.agent || (state.answers["Q_VOMITING"] === "yes") ||
      (state.answers["Q_DIARRHEA"] === "yes") || norm(state.chiefComplaint).includes("dehydrat");
    if (!hasDehydrationRisk) return { eligible: false, reason: "Dehydration risk not detected" };
  }
  if (criteria.includes("wound")) {
    const cc = norm(state.chiefComplaint);
    if (!cc.includes("wound") && !cc.includes("laceration") && !cc.includes("cut")) {
      return { eligible: false, reason: "Wound not detected in chief complaint" };
    }
  }

  return { eligible: true, reason: `Criteria matched: ${criteria}` };
}

export async function selectSpotInterventions(state: CaseState): Promise<UCSpotResult> {
  let interventions: UCSpotIntervention[] = [];
  let source = "built_in_defaults";

  try {
    const rows = await getTable("URGENT_CARE_SPOT_INTERVENTIONS");
    if (rows.length > 0) {
      interventions = rows.map(parseSpotRow).filter((r): r is UCSpotIntervention => r !== null);
      source = "URGENT_CARE_SPOT_INTERVENTIONS";
    }
  } catch {
  }

  if (interventions.length === 0) {
    interventions = DEFAULT_UC_SPOTS;
    source = "built_in_defaults";
  }

  const selected: UCSpotIntervention[] = [];
  const skipped: Array<{ interventionId: string; reason: string }> = [];

  for (const si of interventions) {
    const check = checkEligibility(si, state);
    if (check.eligible) {
      selected.push({ ...si, gatingReason: check.reason });
    } else {
      skipped.push({ interventionId: si.interventionId, reason: check.reason });
    }
  }

  return { selected, skipped, source };
}

export function formatUCSpotOutput(
  result: UCSpotResult,
  channel: "web" | "whatsapp" | "telegram" | "ecw"
): Record<string, any> {
  if (result.selected.length === 0) return { channel, sections: [] };

  if (channel === "web") {
    return {
      channel,
      sections: result.selected.map(si => ({
        type: "uc_spot_intervention",
        title: si.interventionId,
        contextCondition: si.contextCondition,
        actions: si.actions,
        testsIfAvailable: si.testsIfAvailable,
        doNotDo: si.doNotDo,
        referralWindow: si.referralWindow,
        erTriggers: si.erTriggers,
        safetyClass: si.safetyClass,
      })),
    };
  }

  if (channel === "whatsapp" || channel === "telegram") {
    const lines: string[] = [];
    for (const si of result.selected) {
      lines.push(`[${si.contextCondition.toUpperCase()}]`);
      for (let i = 0; i < Math.min(si.actions.length, 3); i++) {
        lines.push(`${i + 1}. ${si.actions[i]}`);
      }
      if (si.erTriggers.length > 0) {
        lines.push(`\nGo to ER if: ${si.erTriggers.join(", ")}`);
      }
      if (si.referralWindow) {
        lines.push(`Follow-up: ${si.referralWindow}`);
      }
      lines.push("");
    }
    return { channel, text: lines.join("\n").trim() };
  }

  if (channel === "ecw") {
    const lines: string[] = [
      "[Assessment/Plan — Urgent Care Interventions]",
      "--- UC Spot Interventions (AI-Assisted) ---",
    ];
    for (const si of result.selected) {
      lines.push(`\n[${si.interventionId}] ${si.contextCondition}`);
      for (const action of si.actions) {
        lines.push(`  - ${action}`);
      }
      if (si.testsIfAvailable.length > 0) {
        lines.push(`  Tests: ${si.testsIfAvailable.join(", ")}`);
      }
    }
    lines.push("\n[Suggested Orders]");
    lines.push("--- Suggested Orders ---");
    const allTests = [...new Set(result.selected.flatMap(si => si.testsIfAvailable))];
    if (allTests.length > 0) {
      lines.push("Labs:");
      for (const t of allTests) {
        lines.push(`  [ ] ${t}`);
      }
    }
    return { channel, text: lines.join("\n") };
  }

  return { channel, sections: [] };
}
