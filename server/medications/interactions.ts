export interface MedicationInteraction {
  drugA: string;
  drugB: string;
  severity: "low" | "moderate" | "high" | "contraindicated";
  reason: string;
}

const interactionDb: MedicationInteraction[] = [
  { drugA: "warfarin",        drugB: "ibuprofen",      severity: "high",           reason: "Increased bleeding risk — NSAIDs potentiate anticoagulation" },
  { drugA: "warfarin",        drugB: "aspirin",         severity: "high",           reason: "Combined antiplatelet + anticoagulation raises GI bleed risk" },
  { drugA: "lisinopril",      drugB: "spironolactone",  severity: "moderate",       reason: "Risk of hyperkalemia from dual RAAS blockade" },
  { drugA: "clarithromycin",  drugB: "simvastatin",     severity: "contraindicated",reason: "Marked increase in statin exposure — rhabdomyolysis risk" },
  { drugA: "clarithromycin",  drugB: "atorvastatin",    severity: "high",           reason: "CYP3A4 inhibition raises statin AUC significantly" },
  { drugA: "ciprofloxacin",   drugB: "tizanidine",      severity: "contraindicated",reason: "Severe hypotension and CNS depression" },
  { drugA: "metronidazole",   drugB: "alcohol",         severity: "high",           reason: "Disulfiram-like reaction — nausea, flushing, hypotension" },
  { drugA: "ssri",            drugB: "tramadol",        severity: "high",           reason: "Serotonin syndrome risk" },
  { drugA: "lithium",         drugB: "ibuprofen",       severity: "high",           reason: "NSAIDs reduce renal lithium clearance → toxicity" },
  { drugA: "methotrexate",    drugB: "trimethoprim",    severity: "high",           reason: "Both folate antagonists — severe bone marrow suppression" },
  { drugA: "amiodarone",      drugB: "warfarin",        severity: "contraindicated",reason: "Amiodarone inhibits CYP2C9 → dramatic INR elevation" },
  { drugA: "digoxin",         drugB: "clarithromycin",  severity: "high",           reason: "P-gp inhibition raises digoxin levels → toxicity" },
  { drugA: "clopidogrel",     drugB: "omeprazole",      severity: "moderate",       reason: "Omeprazole inhibits CYP2C19 → reduced clopidogrel activation" },
  { drugA: "quinolone",       drugB: "theophylline",    severity: "moderate",       reason: "Quinolones inhibit theophylline metabolism → seizure risk" },
];

export function detectInteractions(medications: string[]): MedicationInteraction[] {
  const normalized = medications.map((m) => m.trim().toLowerCase());
  const hits: MedicationInteraction[] = [];

  for (const rule of interactionDb) {
    const hasA = normalized.some((m) => m.includes(rule.drugA));
    const hasB = normalized.some((m) => m.includes(rule.drugB));
    if (hasA && hasB) hits.push(rule);
  }

  return hits;
}

export function getInteractionDb(): MedicationInteraction[] {
  return [...interactionDb];
}
