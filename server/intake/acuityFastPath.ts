import { randomUUID } from "crypto";

export interface AcuityFastPathResult {
  triggered: boolean;
  route: "fast_path" | "standard";
  disposition?: "er_now" | "call_911";
  reason?: string;
  matchedPatterns?: string[];
  confirmationQuestions?: string[];
  recommendedAction?: string;
  traceId?: string;
  dispatchRequired?: boolean;
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

  const overdoseOrPoisoning = hasAny(text, [
    "overdose", "took too many pills", "took too much medication", "accidental ingestion",
    "swallowed pills", "medication overdose", "drug overdose", "poisoning",
    "bleach ingestion", "chemical ingestion", "fume inhalation",
    "suicidal overdose", "intentional overdose",
  ]);

  const neonateSick = hasAny(text, [
    "newborn sick", "newborn fever", "2 week old", "3 week old", "4 week old",
    "neonate fever", "1 month old fever", "28 day old",
  ]);

  const febrileSzChildren = hasAny(text, [
    "febrile seizure", "seizure with fever", "convulsion with fever",
    "shaking with high fever", "child had seizure", "baby had seizure", "toddler seizure",
  ]);

  if (chestPain && diaphoresis) matched.push("possible_stemi");
  if (chestPain && sobRest) matched.push("possible_acs_with_dyspnea");
  if (strokeLike) matched.push("possible_stroke");
  if (altered) matched.push("altered_mental_status");
  if (anaphylaxis) matched.push("possible_anaphylaxis");
  if (worstHeadache) matched.push("possible_sah");
  if (overdoseOrPoisoning) matched.push("overdose_or_poisoning");
  if (neonateSick) matched.push("neonate_any_illness");
  if (febrileSzChildren) matched.push("pediatric_febrile_seizure");

  if (!matched.length) {
    return { triggered: false, route: "standard" };
  }

  const call911Patterns = new Set(["overdose_or_poisoning", "neonate_any_illness"]);
  const requiresDispatch = matched.some((m) => call911Patterns.has(m));

  const reasonMap: Record<string, string> = {
    possible_stemi: "Possible heart attack pattern detected",
    possible_acs_with_dyspnea: "Chest pain with breathing distress at rest",
    possible_stroke: "Possible stroke symptoms detected",
    altered_mental_status: "Altered mental status or syncope red flag detected",
    possible_anaphylaxis: "Possible severe allergic reaction detected",
    possible_sah: "Sudden severe headache red flag detected",
    overdose_or_poisoning: "Overdose or poisoning detected — dispatch 911 immediately",
    neonate_any_illness: "Sick newborn (≤28 days) detected — any illness requires immediate ER",
    pediatric_febrile_seizure: "Pediatric febrile seizure detected — ER evaluation required",
  };

  const reasons = matched.map((m) => reasonMap[m]).filter(Boolean);

  return {
    triggered: true,
    route: "fast_path",
    disposition: requiresDispatch ? "call_911" : "er_now",
    dispatchRequired: requiresDispatch,
    reason: reasons[0] ?? "Life-threatening symptom pattern detected",
    matchedPatterns: matched,
    confirmationQuestions: requiresDispatch
      ? [
          "Is 911 being called right now?",
          "Is the patient conscious and breathing?",
          "Can you tell 911 what substance was involved or the age of the newborn?",
        ]
      : [
          "Is the patient having symptoms right now?",
          "Can the patient safely call 911 or get emergency help immediately?",
          "Is there worsening trouble breathing, weakness, or new confusion?",
        ],
    recommendedAction: requiresDispatch
      ? "CALL 911 NOW. Do not wait for in-clinic evaluation. Provide dispatcher with substance involved, amount, and time of ingestion."
      : "Bypass routine triage. Present ER NOW disposition and direct emergency contact instructions immediately.",
    traceId: `fastpath_${randomUUID()}`,
  };
}
