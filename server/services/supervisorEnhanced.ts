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
