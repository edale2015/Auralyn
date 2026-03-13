export interface SafetyAlert {
  severity: "critical" | "urgent" | "warning";
  category: "cardiac" | "respiratory" | "neurologic" | "obstetric" | "immunologic" | "medication" | "age" | "other";
  message: string;
  recommendation: string;
}

const SAFETY_RULES: Array<{
  keywords: string[];
  threshold: number;
  alert: SafetyAlert;
}> = [
  {
    keywords: ["chest pain", "chest pressure", "chest tightness"],
    threshold: 1,
    alert: { severity: "critical", category: "cardiac", message: "Chest pain reported", recommendation: "Rule out ACS — obtain ECG. Consider ER referral if cardiac features present." },
  },
  {
    keywords: ["chest pain", "arm pain", "jaw pain", "diaphoresis", "sweating"],
    threshold: 2,
    alert: { severity: "critical", category: "cardiac", message: "Chest pain with associated cardiac features", recommendation: "HIGH ACS SUSPICION — ER immediately. Aspirin 325mg if no contraindication." },
  },
  {
    keywords: ["shortness of breath", "can't breathe", "difficulty breathing", "sob", "respiratory distress"],
    threshold: 1,
    alert: { severity: "urgent", category: "respiratory", message: "Respiratory symptoms reported", recommendation: "Assess oxygen saturation. Consider PERC/Wells for PE. ER if O2 <94%." },
  },
  {
    keywords: ["confusion", "altered mental status", "disoriented", "not making sense", "unresponsive"],
    threshold: 1,
    alert: { severity: "critical", category: "neurologic", message: "Neurologic red flag — altered mental status", recommendation: "ER immediately. Rule out stroke, meningitis, metabolic encephalopathy." },
  },
  {
    keywords: ["facial droop", "arm weakness", "slurred speech", "sudden headache", "worst headache"],
    threshold: 1,
    alert: { severity: "critical", category: "neurologic", message: "Possible stroke (FAST criteria met)", recommendation: "ER immediately — time critical. Do NOT give aspirin until hemorrhagic stroke ruled out." },
  },
  {
    keywords: ["pregnant", "pregnancy", "second trimester", "third trimester"],
    threshold: 1,
    alert: { severity: "urgent", category: "obstetric", message: "Pregnant patient", recommendation: "Obstetric considerations apply. Avoid teratogenic medications. Consider OB consult for fever, UTI, or abdominal pain." },
  },
  {
    keywords: ["blood in urine", "hematuria", "flank pain", "fever", "chills"],
    threshold: 3,
    alert: { severity: "urgent", category: "other", message: "Possible pyelonephritis", recommendation: "Urine culture. Consider IV antibiotics if systemically ill. ER for sepsis signs." },
  },
  {
    keywords: ["immunocompromised", "hiv", "chemotherapy", "on steroids", "transplant", "lupus"],
    threshold: 1,
    alert: { severity: "urgent", category: "immunologic", message: "Immunocompromised patient", recommendation: "Lower threshold for workup and escalation. Broad-spectrum coverage if febrile." },
  },
  {
    keywords: ["blood thinner", "warfarin", "coumadin", "eliquis", "xarelto", "anticoagulated"],
    threshold: 1,
    alert: { severity: "warning", category: "medication", message: "Patient on anticoagulation", recommendation: "Avoid NSAIDs. Check INR if on warfarin. Bleeding risk elevated." },
  },
  {
    keywords: ["anaphylaxis", "severe allergic", "throat swelling", "can't swallow"],
    threshold: 1,
    alert: { severity: "critical", category: "other", message: "Possible anaphylaxis", recommendation: "Epinephrine 0.3mg IM immediately. ER — anaphylaxis requires observation min 4h." },
  },
  {
    keywords: ["age 80", "age 85", "age 90", "elderly", "nursing home", "dementia"],
    threshold: 1,
    alert: { severity: "warning", category: "age", message: "Elderly patient", recommendation: "Atypical presentations common. Lower threshold for admission. Medication dose adjustment may be needed." },
  },
  {
    keywords: ["infant", "newborn", "2 weeks", "4 weeks", "1 month", "neonate"],
    threshold: 1,
    alert: { severity: "urgent", category: "age", message: "Neonate / very young infant", recommendation: "Any fever in <28 days → ER. Low threshold for sepsis workup." },
  },
];

export function checkSafetyAlerts(allText: string, symptoms: string[]): SafetyAlert[] {
  const combined = `${allText} ${symptoms.join(" ")}`.toLowerCase();
  const found: SafetyAlert[] = [];
  const seen = new Set<string>();

  for (const rule of SAFETY_RULES) {
    const matchCount = rule.keywords.filter(k => combined.includes(k)).length;
    if (matchCount >= rule.threshold && !seen.has(rule.alert.message)) {
      found.push(rule.alert);
      seen.add(rule.alert.message);
    }
  }

  return found.sort((a, b) => {
    const order = { critical: 0, urgent: 1, warning: 2 };
    return order[a.severity] - order[b.severity];
  });
}
