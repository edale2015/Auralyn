import { randomUUID } from "crypto";

export interface AcuityFastPathResult {
  triggered: boolean;
  route: "fast_path" | "standard";
  disposition?: "er_now";
  reason?: string;
  matchedPatterns?: string[];
  confirmationQuestions?: string[];
  recommendedAction?: string;
  traceId?: string;
}

function hasAny(text: string, needles: string[]): boolean {
  return needles.some((n) => text.includes(n));
}

function collectFreeText(input: { complaint?: string; answers?: Record<string, any>; symptoms?: string[] }): string {
  const parts: string[] = [];
  if (input.complaint) parts.push(String(input.complaint));
  if (Array.isArray(input.symptoms)) parts.push(input.symptoms.join(" "));
  for (const [k, v] of Object.entries(input.answers ?? {})) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      parts.push(`${k} ${String(v)}`);
    }
  }
  return parts.join(" ").toLowerCase();
}

export function evaluateAcuityFastPath(input: { complaint?: string; answers?: Record<string, any>; symptoms?: string[] }): AcuityFastPathResult {
  const text = collectFreeText(input);
  const answers = input.answers ?? {};
  const matched: string[] = [];

  const chestPain = hasAny(text, ["chest pain", "chest pressure", "crushing chest", "tightness in chest"]) || !!answers.RF_CP;
  const diaphoresis = hasAny(text, ["diaphoresis", "sweating", "cold sweat"]) || answers.diaphoresis === true;
  const sobRest = hasAny(text, ["shortness of breath at rest", "difficulty breathing at rest", "can't breathe"]) || !!answers.RF_SOB;
  const strokeLike = hasAny(text, ["facial droop", "face droop", "slurred speech", "arm weakness", "one sided weakness", "unilateral weakness"]) || answers.facialDroop === true || answers.oneSidedWeakness === true;
  const altered = hasAny(text, ["altered mental status", "confusion", "unresponsive", "passed out", "fainting"]) || !!answers.RF_NEURO;
  const anaphylaxis = hasAny(text, ["lip swelling", "tongue swelling", "throat closing", "anaphylaxis", "severe allergic reaction"]);
  const worstHeadache = hasAny(text, ["worst headache", "thunderclap headache", "sudden severe headache"]);

  if (chestPain && diaphoresis) matched.push("possible_stemi");
  if (chestPain && sobRest) matched.push("possible_acs_with_dyspnea");
  if (strokeLike) matched.push("possible_stroke");
  if (altered) matched.push("altered_mental_status");
  if (anaphylaxis) matched.push("possible_anaphylaxis");
  if (worstHeadache) matched.push("possible_sah");

  if (!matched.length) {
    return { triggered: false, route: "standard" };
  }

  const reasonMap: Record<string, string> = {
    possible_stemi: "Possible heart attack pattern detected",
    possible_acs_with_dyspnea: "Chest pain with breathing distress at rest",
    possible_stroke: "Possible stroke symptoms detected",
    altered_mental_status: "Altered mental status or syncope red flag detected",
    possible_anaphylaxis: "Possible severe allergic reaction detected",
    possible_sah: "Sudden severe headache red flag detected",
  };

  const reasons = matched.map((m) => reasonMap[m]).filter(Boolean);

  return {
    triggered: true,
    route: "fast_path",
    disposition: "er_now",
    reason: reasons[0] ?? "Life-threatening symptom pattern detected",
    matchedPatterns: matched,
    confirmationQuestions: [
      "Is the patient having symptoms right now?",
      "Can the patient safely call 911 or get emergency help immediately?",
      "Is there worsening trouble breathing, weakness, or new confusion?",
    ],
    recommendedAction: "Bypass routine triage. Present ER NOW disposition and direct emergency contact instructions immediately.",
    traceId: `fastpath_${randomUUID()}`,
  };
}
