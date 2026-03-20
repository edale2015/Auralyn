export interface DrugInteractionInput {
  medications: string[];
  complaint?: string;
  patientAge?: number;
}

export interface DrugInteraction {
  drug1: string;
  drug2: string;
  severity: "mild" | "moderate" | "severe" | "contraindicated";
  mechanism: string;
  clinicalEffect: string;
  recommendation: string;
}

export interface DrugInteractionResult {
  safe: boolean;
  interactions: DrugInteraction[];
  highAlertDrugs: string[];
  recommendation: string;
  requiresPhysicianReview: boolean;
}

const HIGH_ALERT_DRUGS = [
  "warfarin", "heparin", "enoxaparin", "insulin", "methotrexate",
  "lithium", "digoxin", "phenytoin", "carbamazepine", "amiodarone",
  "clonidine", "clozapine", "tacrolimus", "cyclosporine", "vancomycin"
];

const INTERACTION_DB: Array<{
  drugs: [string, string];
  severity: DrugInteraction["severity"];
  mechanism: string;
  clinicalEffect: string;
  recommendation: string;
}> = [
  {
    drugs: ["warfarin", "aspirin"],
    severity: "severe",
    mechanism: "Additive anticoagulant + antiplatelet effect; warfarin protein displacement",
    clinicalEffect: "Significantly increased bleeding risk (GI, intracranial)",
    recommendation: "Avoid combination; if necessary, monitor INR closely and use lowest aspirin dose"
  },
  {
    drugs: ["warfarin", "ibuprofen"],
    severity: "severe",
    mechanism: "NSAIDs inhibit platelet function; ibuprofen displaces warfarin from albumin",
    clinicalEffect: "Elevated INR, increased hemorrhage risk",
    recommendation: "Avoid NSAIDs with warfarin; use acetaminophen for analgesia with careful monitoring"
  },
  {
    drugs: ["ssri", "maoi"],
    severity: "contraindicated",
    mechanism: "Excessive serotonergic stimulation from dual serotonin pathway activation",
    clinicalEffect: "Serotonin syndrome: hyperthermia, rigidity, myoclonus, autonomic instability",
    recommendation: "Absolutely contraindicated; 14-day washout required between agents"
  },
  {
    drugs: ["metformin", "contrast dye"],
    severity: "moderate",
    mechanism: "Iodinated contrast reduces renal clearance of metformin",
    clinicalEffect: "Risk of lactic acidosis in renal impairment",
    recommendation: "Hold metformin 48h before contrast; resume after confirming normal renal function"
  },
  {
    drugs: ["lithium", "ibuprofen"],
    severity: "severe",
    mechanism: "NSAIDs reduce renal prostaglandin synthesis, decreasing lithium excretion",
    clinicalEffect: "Lithium toxicity: tremor, confusion, cardiac arrhythmia",
    recommendation: "Avoid NSAIDs; use acetaminophen; monitor lithium levels if unavoidable"
  },
  {
    drugs: ["statins", "amiodarone"],
    severity: "moderate",
    mechanism: "Amiodarone inhibits CYP3A4 and CYP2C9 increasing statin plasma levels",
    clinicalEffect: "Myopathy, rhabdomyolysis risk",
    recommendation: "Limit simvastatin to 20mg/day; consider pravastatin or rosuvastatin"
  },
  {
    drugs: ["ace inhibitor", "potassium"],
    severity: "moderate",
    mechanism: "ACE inhibitors reduce aldosterone, decreasing potassium excretion",
    clinicalEffect: "Hyperkalemia, cardiac arrhythmia",
    recommendation: "Monitor serum potassium; avoid high-potassium diet and potassium supplements"
  },
  {
    drugs: ["digoxin", "amiodarone"],
    severity: "severe",
    mechanism: "Amiodarone inhibits P-glycoprotein increasing digoxin levels",
    clinicalEffect: "Digoxin toxicity: nausea, visual disturbances, AV block",
    recommendation: "Reduce digoxin dose by 50% when starting amiodarone; monitor levels"
  },
  {
    drugs: ["ssri", "triptans"],
    severity: "moderate",
    mechanism: "Additive serotonergic effect on 5-HT1 receptors",
    clinicalEffect: "Mild serotonin syndrome; coronary vasospasm risk with some triptans",
    recommendation: "Use with caution; monitor for serotonin syndrome symptoms; prefer sumatriptan"
  },
  {
    drugs: ["methotrexate", "nsaids"],
    severity: "severe",
    mechanism: "NSAIDs reduce renal methotrexate clearance",
    clinicalEffect: "Methotrexate toxicity: bone marrow suppression, mucositis, nephrotoxicity",
    recommendation: "Avoid NSAIDs; if necessary, hold NSAIDs 24h before and after weekly MTX dose"
  },
  {
    drugs: ["fluoroquinolones", "antacids"],
    severity: "moderate",
    mechanism: "Polyvalent cations chelate fluoroquinolones reducing GI absorption",
    clinicalEffect: "Reduced antibiotic efficacy (up to 90% absorption decrease)",
    recommendation: "Separate administration by 2-4 hours; take antibiotic first"
  },
  {
    drugs: ["sildenafil", "nitrates"],
    severity: "contraindicated",
    mechanism: "Synergistic cGMP elevation causes profound vasodilation",
    clinicalEffect: "Severe, potentially fatal hypotension",
    recommendation: "Absolutely contraindicated; 24h washout for sildenafil, 48h for tadalafil"
  },
  {
    drugs: ["clopidogrel", "proton pump inhibitors"],
    severity: "moderate",
    mechanism: "PPIs (especially omeprazole) inhibit CYP2C19 reducing clopidogrel activation",
    clinicalEffect: "Reduced antiplatelet effect; increased cardiovascular event risk",
    recommendation: "Use pantoprazole if PPI required; avoid omeprazole/esomeprazole"
  },
  {
    drugs: ["beta blockers", "calcium channel blockers"],
    severity: "moderate",
    mechanism: "Additive negative chronotropic and dromotropic effects",
    clinicalEffect: "Bradycardia, heart block, severe hypotension",
    recommendation: "Monitor heart rate and BP; avoid verapamil/diltiazem combination; use dihydropyridines"
  },
  {
    drugs: ["alcohol", "metronidazole"],
    severity: "severe",
    mechanism: "Metronidazole inhibits aldehyde dehydrogenase causing disulfiram-like reaction",
    clinicalEffect: "Flushing, nausea, vomiting, tachycardia, hypotension",
    recommendation: "Absolutely avoid alcohol during treatment and 48h after completing metronidazole"
  }
];

function normalizeDrug(drug: string): string {
  return drug.toLowerCase().trim()
    .replace("selective serotonin reuptake inhibitor", "ssri")
    .replace("nonsteroidal anti-inflammatory", "nsaids")
    .replace("nonsteroidal anti-inflammatory drug", "nsaids");
}

export function checkDrugInteractions(input: DrugInteractionInput): DrugInteractionResult {
  const meds = input.medications.map(normalizeDrug);
  const found: DrugInteraction[] = [];

  for (const entry of INTERACTION_DB) {
    const [d1, d2] = entry.drugs;
    const hasD1 = meds.some(m => m.includes(d1) || d1.includes(m));
    const hasD2 = meds.some(m => m.includes(d2) || d2.includes(m));
    if (hasD1 && hasD2) {
      found.push({
        drug1: entry.drugs[0],
        drug2: entry.drugs[1],
        severity: entry.severity,
        mechanism: entry.mechanism,
        clinicalEffect: entry.clinicalEffect,
        recommendation: entry.recommendation
      });
    }
  }

  const highAlertDrugs = input.medications.filter(med =>
    HIGH_ALERT_DRUGS.some(ha => med.toLowerCase().includes(ha))
  );

  const hasSevere = found.some(i => i.severity === "severe" || i.severity === "contraindicated");
  const hasContraindicated = found.some(i => i.severity === "contraindicated");

  let recommendation = "No significant interactions detected.";
  if (hasContraindicated) {
    recommendation = "CONTRAINDICATED combination detected. Do not administer without immediate physician review.";
  } else if (hasSevere) {
    recommendation = "Severe drug interaction(s) detected. Physician review required before proceeding.";
  } else if (found.length > 0) {
    recommendation = "Moderate interaction(s) detected. Monitor patient closely and consider alternatives.";
  } else if (highAlertDrugs.length > 0) {
    recommendation = `High-alert medication(s) identified (${highAlertDrugs.join(", ")}). Verify dose and monitoring parameters.`;
  }

  return {
    safe: found.length === 0 && highAlertDrugs.length === 0,
    interactions: found,
    highAlertDrugs,
    recommendation,
    requiresPhysicianReview: hasSevere || highAlertDrugs.length > 0
  };
}

export function getHighAlertDrugList(): string[] {
  return [...HIGH_ALERT_DRUGS];
}
