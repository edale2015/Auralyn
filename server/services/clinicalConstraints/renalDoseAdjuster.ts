export interface RenalAdjustment {
  medication: string;
  originalDose: string;
  adjustedDose: string;
  gfrRange: string;
  reason: string;
}

export function adjustForRenalFunction(medication: string, dose: string, gfr: number | undefined): RenalAdjustment | null {
  if (gfr === undefined || gfr >= 60) return null;

  let adjustedDose = dose;
  let gfrRange: string;
  let reason: string;

  if (gfr < 15) {
    adjustedDose = "Avoid or specialist consult";
    gfrRange = "<15 mL/min";
    reason = "End-stage renal disease";
  } else if (gfr < 30) {
    adjustedDose = "50% dose reduction";
    gfrRange = "15-29 mL/min";
    reason = "Severe renal impairment";
  } else {
    adjustedDose = "75% of standard dose";
    gfrRange = "30-59 mL/min";
    reason = "Moderate renal impairment";
  }

  return { medication, originalDose: dose, adjustedDose, gfrRange, reason };
}
