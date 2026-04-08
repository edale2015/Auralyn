export interface Counterfactual {
  variable: string;
  current: string;
  alternative: string;
  effect: string;
  impactScore: number;
}

export interface CounterfactualResult {
  keyFactors: Counterfactual[];
  summary: string;
}

export function computeCounterfactuals(result: any): CounterfactualResult {
  const factors: Counterfactual[] = [];
  const complaint = (result.complaint ?? "").toLowerCase();
  const triageLevel = result.triage?.level ?? "routine";

  if (complaint.includes("chest") || complaint.includes("cardiac")) {
    factors.push({ variable: "diaphoresis", current: "absent", alternative: "present", effect: "Would significantly increase ACS likelihood and elevate triage to emergency", impactScore: 0.92 });
    factors.push({ variable: "exertional_pain", current: "unknown", alternative: "present", effect: "Would increase urgency to high/emergency and trigger cardiac workup", impactScore: 0.88 });
    factors.push({ variable: "radiation_to_jaw_arm", current: "absent", alternative: "present", effect: "Would heighten STEMI concern and warrant immediate ECG", impactScore: 0.85 });
  }

  if (complaint.includes("breath") || complaint.includes("sob") || complaint.includes("cough")) {
    factors.push({ variable: "oxygen_saturation", current: ">94%", alternative: "<90%", effect: "Would trigger immediate escalation and supplemental O2 workup", impactScore: 0.95 });
    factors.push({ variable: "respiratory_rate", current: "normal", alternative: ">30 bpm", effect: "Would elevate triage to emergency and flag ARDS risk", impactScore: 0.90 });
  }

  if (triageLevel !== "critical" && triageLevel !== "emergency") {
    factors.push({ variable: "shortness_of_breath", current: "absent", alternative: "present", effect: "Would escalate triage to emergency level", impactScore: 0.93 });
  }

  if ((result.safetyAlerts?.length ?? 0) === 0) {
    factors.push({ variable: "fever_above_39", current: "unknown", alternative: "present", effect: "Would increase infectious differential weight and trigger sepsis screening", impactScore: 0.65 });
  }

  if ((result.differential?.[0]?.confidence ?? 1) < 0.5) {
    factors.push({ variable: "additional_symptom_detail", current: "vague", alternative: "specific", effect: "More precise symptoms would significantly narrow the differential and reduce uncertainty", impactScore: 0.70 });
  }

  const sorted = factors.sort((a, b) => b.impactScore - a.impactScore).slice(0, 5);

  return {
    keyFactors: sorted,
    summary: sorted.length
      ? `Top counterfactual: "${sorted[0].variable}" — ${sorted[0].effect}`
      : "No high-impact counterfactual factors identified for this case.",
  };
}
