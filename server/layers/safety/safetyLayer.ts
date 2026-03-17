export interface SafetyResult {
  flag: boolean;
  level: "none" | "caution" | "urgent" | "emergency";
  action?: string;
  reasons: string[];
}

const RED_FLAGS: { symptoms: string[]; level: SafetyResult["level"]; action: string; reason: string }[] = [
  { symptoms: ["chest_pain", "shortness_of_breath"], level: "emergency", action: "ER_NOW", reason: "Cardiopulmonary emergency signs" },
  { symptoms: ["neck_stiffness", "fever", "headache"], level: "emergency", action: "ER_NOW", reason: "Meningeal signs — possible meningitis" },
  { symptoms: ["difficulty_swallowing", "shortness_of_breath"], level: "emergency", action: "ER_NOW", reason: "Airway compromise risk" },
  { symptoms: ["difficulty_swallowing", "fever"], level: "urgent", action: "URGENT_REFERRAL", reason: "Possible peritonsillar abscess" },
  { symptoms: ["chest_pain"], level: "urgent", action: "URGENT_REFERRAL", reason: "Chest pain requires evaluation" },
  { symptoms: ["shortness_of_breath"], level: "urgent", action: "URGENT_REFERRAL", reason: "Respiratory distress" },
  { symptoms: ["neck_stiffness"], level: "caution", action: "ESCALATE", reason: "Neck stiffness warrants further assessment" },
];

export class SafetyLayer {
  check(symptoms: string[]): SafetyResult {
    const symSet = new Set(symptoms);
    const reasons: string[] = [];
    let highestLevel: SafetyResult["level"] = "none";
    let action: string | undefined;

    const levels: SafetyResult["level"][] = ["none", "caution", "urgent", "emergency"];

    for (const flag of RED_FLAGS) {
      if (flag.symptoms.every((s) => symSet.has(s))) {
        reasons.push(flag.reason);
        if (levels.indexOf(flag.level) > levels.indexOf(highestLevel)) {
          highestLevel = flag.level;
          action = flag.action;
        }
      }
    }

    return {
      flag: highestLevel !== "none",
      level: highestLevel,
      action,
      reasons,
    };
  }
}

export const safetyLayer = new SafetyLayer();
