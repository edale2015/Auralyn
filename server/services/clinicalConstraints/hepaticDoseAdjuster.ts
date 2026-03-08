export interface HepaticAdjustment {
  medication: string;
  originalDose: string;
  adjustedDose: string;
  childPughClass: string;
  reason: string;
}

export function adjustForHepaticFunction(medication: string, dose: string, childPughClass?: "A" | "B" | "C"): HepaticAdjustment | null {
  if (!childPughClass) return null;

  let adjustedDose: string;
  let reason: string;

  switch (childPughClass) {
    case "A":
      adjustedDose = dose;
      reason = "Mild hepatic impairment — no adjustment typically needed";
      break;
    case "B":
      adjustedDose = "50-75% of standard dose";
      reason = "Moderate hepatic impairment";
      break;
    case "C":
      adjustedDose = "Avoid or specialist consult";
      reason = "Severe hepatic impairment";
      break;
  }

  return { medication, originalDose: dose, adjustedDose, childPughClass, reason };
}
