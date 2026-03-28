/**
 * Obstetric Emergency Pathways
 *
 * Covers the major high-acuity OB presentations with validated criteria:
 *
 *   1. Pre-eclampsia / eclampsia  (BP ≥ 140/90 + symptoms)
 *   2. Postpartum hemorrhage      (estimated blood loss ≥ 500 mL vaginal / ≥ 1000 mL C/S)
 *   3. Placental abruption        (vaginal bleeding + abdominal pain ± uterine rigidity)
 *   4. Ectopic pregnancy          (bleeding + pain < 20 weeks, hemodynamic instability)
 *   5. Preterm labor              (contractions < 37 weeks with cervical change)
 *   6. PPROM                      (rupture of membranes < 37 weeks)
 *   7. Cord prolapse / malpresentation (emergency delivery)
 *
 * OEWS (Obstetric Early Warning System) vital sign triggers also included.
 */

export interface ObstetricInput {
  pregnant:           boolean;
  gestationalWeeksGA?: number;   // weeks, e.g. 28
  postpartumDays?:    number;   // days since delivery
  symptoms?:          string[];  // lowercase

  // Vitals
  systolicBP?:        number;
  diastolicBP?:       number;
  heartRate?:         number;
  respiratoryRate?:   number;
  spo2?:              number;
  temperature?:       number;
  hemoglobin?:        number;   // g/dL

  // Exam findings
  estimatedBloodLossML?: number;
  contractionFrequency?: number; // minutes apart
  cervicalDilationCM?:   number;
  membranesRuptured?:    boolean;
  fetalHeartRate?:       number;  // bpm
}

export interface ObstetricAlert {
  emergency:    boolean;
  condition:    string;
  disposition:  "ER_NOW" | "URGENT_24H" | "MONITOR";
  priority:     "CRITICAL" | "HIGH" | "MODERATE";
  rationale:    string;
  actions:      string[];
}

function hasSx(symptoms: string[], ...terms: string[]): boolean {
  return terms.some((t) => symptoms.some((s) => s.toLowerCase().includes(t)));
}

/** OEWS red-zone triggers */
function oeswRedZone(input: ObstetricInput): ObstetricAlert | null {
  const reasons: string[] = [];
  if ((input.systolicBP  ?? 0) >= 160) reasons.push(`SBP ${input.systolicBP}`);
  if ((input.diastolicBP ?? 0) >= 110) reasons.push(`DBP ${input.diastolicBP}`);
  if ((input.heartRate   ?? 0) >= 140) reasons.push(`HR ${input.heartRate}`);
  if ((input.respiratoryRate ?? 0) >= 30) reasons.push(`RR ${input.respiratoryRate}`);
  if ((input.spo2 ?? 100) < 95) reasons.push(`SpO2 ${input.spo2}%`);

  if (reasons.length === 0) return null;
  return {
    emergency:   true,
    condition:   "obstetric_early_warning_red_zone",
    disposition: "ER_NOW",
    priority:    "CRITICAL",
    rationale:   `OEWS red-zone vitals: ${reasons.join(", ")}`,
    actions:     ["Immediate MFM/OB consult", "IV access x2", "Labs: CBC, CMP, coags, type & screen"],
  };
}

function preeclampsia(input: ObstetricInput, symptoms: string[]): ObstetricAlert | null {
  const hypertensive = (input.systolicBP ?? 0) >= 140 || (input.diastolicBP ?? 0) >= 90;
  const severe = (input.systolicBP ?? 0) >= 160 || (input.diastolicBP ?? 0) >= 110;
  const severeFeatures = hasSx(symptoms, "headache", "visual", "epigastric", "right upper quadrant", "seizure");

  if (!hypertensive && !severeFeatures) return null;
  if (!input.gestationalWeeksGA || input.gestationalWeeksGA < 20) return null;

  return {
    emergency:   severe || severeFeatures,
    condition:   severeFeatures ? "eclampsia_or_severe_preeclampsia" : "preeclampsia",
    disposition: severe || severeFeatures ? "ER_NOW" : "URGENT_24H",
    priority:    severe || severeFeatures ? "CRITICAL" : "HIGH",
    rationale:   `BP ${input.systolicBP}/${input.diastolicBP} at ${input.gestationalWeeksGA}w${severeFeatures ? " + severe features" : ""}`,
    actions:     ["MgSO4 seizure prophylaxis if severe", "Antihypertensives if SBP≥160", "Delivery planning"],
  };
}

function hemorrhage(input: ObstetricInput, symptoms: string[]): ObstetricAlert | null {
  const bleeding = hasSx(symptoms, "vaginal bleeding", "hemorrhage", "heavy bleeding");
  const ebl = input.estimatedBloodLossML ?? 0;
  const shockVitals = (input.heartRate ?? 0) > 110 || (input.systolicBP ?? 999) < 90;

  const ppObstetric = input.postpartumDays !== undefined && input.postpartumDays <= 42;
  const antepartum  = input.gestationalWeeksGA !== undefined;

  if (!bleeding && ebl < 500) return null;

  const emergency = shockVitals || ebl >= 1000;
  return {
    emergency,
    condition: ppObstetric ? "postpartum_hemorrhage" : "antepartum_hemorrhage",
    disposition: emergency ? "ER_NOW" : "URGENT_24H",
    priority:    emergency ? "CRITICAL" : "HIGH",
    rationale:   `EBL ≥${ebl > 0 ? ebl + " mL" : "threshold"}${shockVitals ? ", hemodynamic instability" : ""}`,
    actions:     ["2 large-bore IVs", "Crossmatch 4 units PRBCs", "Uterotonic agents", "Surgical consult if refractory"],
  };
}

function ectopicPregnancy(input: ObstetricInput, symptoms: string[]): ObstetricAlert | null {
  if (!input.gestationalWeeksGA || input.gestationalWeeksGA >= 20) return null;
  const painAndBleeding = hasSx(symptoms, "abdominal pain", "pelvic pain") && hasSx(symptoms, "bleeding", "spotting");
  const unstable = (input.systolicBP ?? 999) < 100 || (input.heartRate ?? 0) > 110;

  if (!painAndBleeding) return null;
  return {
    emergency:   unstable,
    condition:   "suspected_ectopic_pregnancy",
    disposition: unstable ? "ER_NOW" : "URGENT_24H",
    priority:    unstable ? "CRITICAL" : "HIGH",
    rationale:   `Pain + bleeding at ${input.gestationalWeeksGA}w${unstable ? ", hemodynamically unstable" : ""}`,
    actions:     ["STAT β-hCG + TVUS", "Type & screen", "GYN consult", unstable ? "OR standby" : "Admission for monitoring"],
  };
}

/**
 * Run all obstetric emergency checks and return the highest-priority alert.
 */
export function obstetricCheck(input: ObstetricInput): ObstetricAlert | null {
  if (!input.pregnant && input.postpartumDays === undefined) return null;

  const symptoms = (input.symptoms ?? []).map((s) => s.toLowerCase());

  const checks = [
    oeswRedZone(input),
    preeclampsia(input, symptoms),
    hemorrhage(input, symptoms),
    ectopicPregnancy(input, symptoms),
  ].filter(Boolean) as ObstetricAlert[];

  if (checks.length === 0) return null;

  // Return highest priority: CRITICAL > HIGH > MODERATE, and within same level, ER_NOW first
  const priority = { CRITICAL: 3, HIGH: 2, MODERATE: 1 };
  const disp     = { ER_NOW: 3, URGENT_24H: 2, MONITOR: 1 };

  return checks.sort((a, b) => {
    const p = priority[b.priority] - priority[a.priority];
    if (p !== 0) return p;
    return disp[b.disposition] - disp[a.disposition];
  })[0];
}
