import type { CaseState } from "../../shared/agentTypes";
import { detectRedFlags } from "../agent/safety/redFlags";

export interface SupervisorDecision {
  allow: boolean;
  reason: string;
  forceState?: CaseState["routing"]["state"];
  immediateActions?: string[];
  warningTemplateId?: string;
}

export interface RedFlagEntry {
  flagId: string;
  label: string;
  severity: "critical" | "high" | "moderate";
  recommendedDisposition: string;
  immediateActions: string[];
}

const RED_FLAG_REGISTRY: RedFlagEntry[] = [
  {
    flagId: "RF_SOB",
    label: "Shortness of Breath",
    severity: "critical",
    recommendedDisposition: "ED",
    immediateActions: ["Call 911 if worsening", "Sit upright", "Do not lie flat"],
  },
  {
    flagId: "RF_CHEST_PAIN",
    label: "Chest Pain",
    severity: "critical",
    recommendedDisposition: "ED",
    immediateActions: ["Call 911 immediately", "Chew aspirin 325mg if available", "Do not drive yourself"],
  },
  {
    flagId: "RF_STRIDOR",
    label: "Stridor",
    severity: "critical",
    recommendedDisposition: "ED",
    immediateActions: ["Call 911 immediately", "Keep calm and upright"],
  },
  {
    flagId: "RF_DROOLING",
    label: "Unable to Swallow Saliva",
    severity: "critical",
    recommendedDisposition: "ED",
    immediateActions: ["Call 911 immediately", "Do not attempt to eat or drink"],
  },
  {
    flagId: "RF_THUNDERCLAP_HEADACHE",
    label: "Thunderclap Headache",
    severity: "critical",
    recommendedDisposition: "ED",
    immediateActions: ["Call 911 immediately", "Worst headache of life requires immediate evaluation"],
  },
  {
    flagId: "RF_FACIAL_PALSY",
    label: "Facial Palsy / Stroke Signs",
    severity: "critical",
    recommendedDisposition: "ED",
    immediateActions: ["Call 911 immediately", "Note time of onset"],
  },
  {
    flagId: "RF_SEPTIC_JOINT",
    label: "Suspected Septic Joint",
    severity: "high",
    recommendedDisposition: "ED",
    immediateActions: ["Urgent evaluation needed", "Do not bear weight"],
  },
  {
    flagId: "RF_PERITONITIS",
    label: "Peritoneal Signs",
    severity: "critical",
    recommendedDisposition: "ED",
    immediateActions: ["Call 911 immediately", "Nothing by mouth"],
  },
  {
    flagId: "RF_HYPOXIA",
    label: "Low Oxygen / Hypoxia",
    severity: "critical",
    recommendedDisposition: "ED",
    immediateActions: ["Call 911 if SpO2 < 92%", "Supplemental oxygen if available"],
  },
  {
    flagId: "RF_HTN_EMERGENCY",
    label: "Hypertensive Emergency",
    severity: "critical",
    recommendedDisposition: "ED",
    immediateActions: ["Call 911 immediately", "Do not take extra BP medication without medical supervision", "Sit upright and remain calm"],
  },
  {
    flagId: "RF_HTN_EMERGENCY_NEURO",
    label: "Hypertensive Emergency with Neurological Deficit",
    severity: "critical",
    recommendedDisposition: "ED",
    immediateActions: ["Call 911 immediately", "Note time of onset of symptoms", "Do not eat or drink"],
  },
  {
    flagId: "RF_HTN_EMERGENCY_VISION",
    label: "Hypertensive Emergency with Vision Loss",
    severity: "critical",
    recommendedDisposition: "ED",
    immediateActions: ["Call 911 immediately", "Urgent ophthalmology and BP evaluation needed"],
  },
  {
    flagId: "RF_HTN_EMERGENCY_MULTI",
    label: "Hypertensive Emergency with Multiple Symptoms",
    severity: "critical",
    recommendedDisposition: "ED",
    immediateActions: ["Call 911 immediately", "Chew aspirin 325mg if chest pain present", "Do not drive yourself"],
  },
  {
    flagId: "RF_HTN_PREGNANCY_EMERGENCY",
    label: "Severe HTN in Pregnancy",
    severity: "critical",
    recommendedDisposition: "ED",
    immediateActions: ["Call 911 immediately", "Eclampsia/preeclampsia risk", "Urgent OB evaluation needed"],
  },
  {
    flagId: "RF_DKA_HHS",
    label: "Diabetic Ketoacidosis / Hyperosmolar Hyperglycemic State",
    severity: "critical",
    recommendedDisposition: "ED",
    immediateActions: ["Call 911 immediately", "Do not take insulin without medical supervision", "Nothing by mouth", "Maintain hydration if alert"],
  },
  {
    flagId: "RF_SEVERE_HYPOGLYCEMIA",
    label: "Severe Hypoglycemia",
    severity: "critical",
    recommendedDisposition: "ED",
    immediateActions: ["Give fast-acting glucose if conscious (juice, glucose tabs)", "Call 911 if unresponsive or seizure", "Do not give food/drink if unconscious", "Administer glucagon if available"],
  },
  {
    flagId: "RF_ER_SEND_METABOLIC",
    label: "Metabolic Emergency",
    severity: "critical",
    recommendedDisposition: "ED",
    immediateActions: ["Call 911 immediately", "Urgent metabolic evaluation needed"],
  },
];

export function getRedFlagEntry(flagId: string): RedFlagEntry | undefined {
  return RED_FLAG_REGISTRY.find(r => r.flagId === flagId);
}

export function enhancedSupervisorGate(state: CaseState): SupervisorDecision {
  const liveFlags = detectRedFlags(state);
  const allFlags = [...new Set([...liveFlags, ...state.redFlags])];

  if (allFlags.length > 0) {
    const entries = allFlags.map(getRedFlagEntry).filter((e): e is RedFlagEntry => !!e);
    const criticalEntry = entries.find(e => e.severity === "critical") ?? entries[0];

    const immediateActions = entries.flatMap(e => e.immediateActions);
    const uniqueActions = [...new Set(immediateActions)];

    return {
      allow: false,
      reason: `Red flags present: ${allFlags.join(", ")}`,
      forceState: "EMERGENT_ESCALATION",
      immediateActions: uniqueActions,
      warningTemplateId: criticalEntry
        ? `EMERG_WARN_${criticalEntry.severity.toUpperCase()}`
        : undefined,
    };
  }

  if (state.ruleTrace?.some(r => r.action === "TRIAGE_UPGRADE")) {
    const upgradeRule = state.ruleTrace.find(r => r.action === "TRIAGE_UPGRADE");
    return {
      allow: false,
      reason: `Triage upgrade triggered by rule: ${upgradeRule?.ruleId}`,
      forceState: "REVIEW_REQUIRED",
    };
  }

  if (!state.disposition) {
    return {
      allow: false,
      reason: "No disposition set",
      forceState: "REVIEW_REQUIRED",
    };
  }

  return { allow: true, reason: "Passed supervisor gate" };
}
