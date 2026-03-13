import { getClinicalState } from "../state/clinicalStateStore";
import { emitClinicalEvent } from "../state/clinicalEventBus";

export interface CopilotSuggestion {
  category: "scoring" | "differential" | "red_flag" | "documentation" | "question" | "pathway" | "safety";
  priority: "high" | "medium" | "low";
  title: string;
  content: string;
  action?: string;
}

export interface CopilotOutput {
  suggestions: CopilotSuggestion[];
  riskIndicator: "green" | "yellow" | "orange" | "red";
  summary: string;
  documentationHelp?: {
    hpi: string;
    assessment: string;
    plan: string;
  };
}

const SCORING_HINTS: Record<string, CopilotSuggestion> = {
  sore_throat: {
    category: "scoring",
    priority: "high",
    title: "Apply Centor Score",
    content: "Centor criteria for strep pharyngitis: (1) Tonsillar exudate, (2) Tender anterior cervical LAD, (3) Fever >38°C, (4) Absence of cough. Score 0–1: No antibiotics. Score 2–3: Culture or treat. Score 4: Treat.",
    action: "Run Centor calculator",
  },
  cough: {
    category: "scoring",
    priority: "medium",
    title: "Consider CURB-65 if pneumonia suspected",
    content: "CURB-65: Confusion, Urea >7mmol/L, Resp rate ≥30, BP <90/60, Age ≥65. Score 0–1: Community, Score 2: Hospital, Score 3+: ICU.",
    action: "Run CURB-65",
  },
  chest_pain: {
    category: "scoring",
    priority: "high",
    title: "Apply HEART Score for ACS risk",
    content: "HEART score: History (0–2), ECG (0–2), Age (0–2), Risk factors (0–2), Troponin (0–2). Low (0–3): Discharge. Moderate (4–6): Observe. High (7–10): Admit.",
    action: "Run HEART Score",
  },
  uti: {
    category: "scoring",
    priority: "medium",
    title: "Check for complicated UTI criteria",
    content: "Complicated UTI indicators: Male sex, Pregnancy, Structural abnormality, Immunocompromised, DM, Indwelling catheter, Recent hospitalization. If any present → extend therapy and culture.",
    action: "Check complication criteria",
  },
  fever: {
    category: "scoring",
    priority: "medium",
    title: "Consider Quick SOFA (qSOFA) for sepsis screening",
    content: "qSOFA: Altered mentation (GCS <15), Resp rate ≥22/min, SBP ≤100. Score ≥2 → suspected sepsis, escalate immediately.",
    action: "Run qSOFA",
  },
};

const DIFFERENTIAL_HINTS: Record<string, string[]> = {
  sore_throat: ["Group A Streptococcus (30% of adult sore throats)", "Viral pharyngitis (adenovirus, EBV, influenza)", "Mononucleosis (EBV) — avoid amoxicillin", "Peritonsillar abscess if unilateral bulging", "Epiglottitis if drooling or stridor"],
  cough: ["Viral URTI (most common)", "Post-viral/post-infectious cough", "Asthma (consider if nocturnal, triggered)", "GERD (cough variant)", "ACE inhibitor cough", "Community-acquired pneumonia", "Pertussis if paroxysmal + whoop"],
  chest_pain: ["ACS / NSTEMI (must rule out)", "Pulmonary embolism (PERC score)", "GERD / esophageal spasm", "Musculoskeletal / costochondritis", "Pleuritis", "Aortic dissection (if tearing/ripping to back)", "Pericarditis"],
  uti: ["Uncomplicated UTI (most likely)", "Pyelonephritis (if fever/flank pain)", "Sexually transmitted infection (urethritis)", "Interstitial cystitis", "Vaginitis (if discharge present)"],
  ear_pain: ["Acute otitis media", "Otitis externa (swimmer's ear)", "Referred pain from TMJ/dental", "Eustachian tube dysfunction", "Cholesteatoma (if chronic discharge)"],
  fever: ["Viral syndrome (most common)", "Influenza A/B", "COVID-19", "Bacterial pneumonia", "Urinary tract infection", "Bacteremia / early sepsis (if systemic signs)"],
  abdominal_pain: ["Appendicitis (rule out first)", "Gastroenteritis", "GERD / peptic ulcer disease", "Cholecystitis", "Pancreatitis", "Ovarian pathology (females)", "Ectopic pregnancy (females, childbearing age)", "Bowel obstruction"],
  rash: ["Contact dermatitis (most common)", "Urticaria / allergic reaction", "Atopic dermatitis / eczema", "Tinea (ringworm, athlete's foot)", "Cellulitis (if warm, tender, spreading)", "Viral exanthem", "Pityriasis rosea"],
  sinus_pressure: ["Viral rhinosinusitis (most common, <10 days)", "Bacterial sinusitis (>10 days or double-worsening)", "Allergic rhinitis", "Dental abscess (upper molar pain)"],
};

const PENDING_QUESTIONS: Record<string, string[]> = {
  sore_throat: ["Has the patient had a rapid strep test?", "Any history of recurrent strep?", "Are there tonsillar exudates visible?", "Centor score calculated?"],
  chest_pain: ["ECG obtained?", "Troponin ordered?", "PERC score calculated?", "Any cardiac risk factors documented?"],
  uti: ["Urinalysis result available?", "Is patient pregnant?", "Any flank pain or fever (pyelonephritis)?", "Any structural abnormality or DM?"],
  fever: ["Temperature documented?", "Any focal source identified?", "Travel history obtained?", "Sepsis screening (qSOFA) done?"],
  cough: ["Duration of cough documented?", "Sputum production noted?", "CXR indicated?", "Smoking history obtained?"],
};

const DOCUMENTATION_TEMPLATES: Record<string, { hpi: string; assessment: string; plan: string }> = {
  sore_throat: {
    hpi: "Patient presents with sore throat × [duration]. Reports [fever Y/N], [difficulty swallowing Y/N], [cough Y/N], [nasal symptoms Y/N]. Centor score: [0-4]. Last episode [date/none].",
    assessment: "[Viral pharyngitis / Streptococcal pharyngitis] based on Centor score [X] and [RADT result / clinical presentation].",
    plan: "[1. No antibiotics — viral etiology / 1. Amoxicillin 500mg TID × 10d] 2. Supportive care: ibuprofen PRN, warm saline gargles, fluids. 3. Return if worsening, fever >72h, difficulty breathing.",
  },
  uti: {
    hpi: "Patient presents with [dysuria / frequency / urgency] × [duration]. [Fever Y/N], [flank pain Y/N], [hematuria Y/N]. [Pregnant Y/N]. UA: [results]. Last UTI: [date/none].",
    assessment: "[Uncomplicated UTI / Complicated UTI / Pyelonephritis] based on [clinical presentation and UA findings].",
    plan: "1. [Nitrofurantoin 100mg ER BID × 5d / Ciprofloxacin 500mg BID × 7d]. 2. Phenazopyridine 200mg TID × 2d PRN bladder discomfort. 3. Increase oral fluids. 4. Return if not improving in 48h or fever develops.",
  },
  chest_pain: {
    hpi: "Patient presents with chest [pain/pressure/tightness] × [duration]. Character: [sharp/pressure/burning]. Radiation: [arm/jaw/back/none]. Associated: [SOB / diaphoresis / nausea]. Risk factors: [HTN/DM/tobacco/FHx/prior CAD].",
    assessment: "Chest pain — ACS workup in progress. HEART score: [X]. ECG: [result]. Troponin at [0h/3h]: [result].",
    plan: "1. Serial troponin × 2 (0h, 3h). 2. 12-lead ECG. 3. Aspirin 325mg STAT if no contraindication. 4. Cardiology consult if [troponin elevation / ECG changes / high HEART score]. 5. CXR. 6. NPO pending workup.",
  },
  fever: {
    hpi: "Patient presents with fever × [duration]. Temperature: [X°F]. Associated symptoms: [cough/sore throat/body aches/rash]. Recent travel: [Y/N]. Sick contacts: [Y/N]. Immunocompromised: [Y/N].",
    assessment: "[Viral syndrome / Influenza / Bacterial source: specify] — [low/moderate/high] risk for bacterial etiology.",
    plan: "1. Acetaminophen 650mg q6h PRN temp >101°F. 2. Ibuprofen 400mg q6h with food PRN. 3. Increase oral fluids. 4. [Influenza test / additional workup as indicated]. 5. Return if temp >104°F, rash, stiff neck, or worsening.",
  },
};

export function generateCopilotSuggestions(caseId: string): CopilotOutput {
  const state = getClinicalState(caseId);
  const suggestions: CopilotSuggestion[] = [];

  const complaint = state.complaint;
  const disposition = state.disposition;
  const differential = state.differential ?? [];
  const redFlags = state.redFlags ?? [];
  const scores = state.scores ?? {};

  if (redFlags.length > 0) {
    suggestions.push({
      category: "red_flag",
      priority: "high",
      title: `${redFlags.length} Red Flag(s) Detected`,
      content: redFlags.join("; "),
      action: "Review red flags before proceeding",
    });
  }

  if (complaint && SCORING_HINTS[complaint]) {
    suggestions.push(SCORING_HINTS[complaint]);
  }

  if (complaint && DIFFERENTIAL_HINTS[complaint]) {
    const ddx = DIFFERENTIAL_HINTS[complaint];
    suggestions.push({
      category: "differential",
      priority: differential.length > 5 ? "medium" : "low",
      title: `Differential Diagnosis for ${complaint.replace(/_/g, " ")}`,
      content: ddx.slice(0, 5).join(" | "),
      action: differential.length > 4 ? "Large differential — consider narrowing" : undefined,
    });
  }

  if (complaint && PENDING_QUESTIONS[complaint]) {
    suggestions.push({
      category: "question",
      priority: "medium",
      title: "Pending Clinical Questions",
      content: PENDING_QUESTIONS[complaint].join("\n"),
    });
  }

  if (disposition === "Home Care") {
    suggestions.push({
      category: "documentation",
      priority: "low",
      title: "Document Return Precautions",
      content: "Ensure return precautions are documented: specific symptoms that warrant emergency re-evaluation.",
      action: "Add return precautions to note",
    });
  }

  if (disposition === "Prescription" && complaint === "sore_throat" && !scores["centor"]) {
    suggestions.push({
      category: "safety",
      priority: "high",
      title: "Centor Score Not Documented",
      content: "Prescribing antibiotics for sore throat without documented Centor score — ensure clinical justification is recorded.",
    });
  }

  if (complaint === "chest_pain" && !scores["heart"] && !scores["perc"]) {
    suggestions.push({
      category: "safety",
      priority: "high",
      title: "Risk Score Missing for Chest Pain",
      content: "Chest pain case without documented HEART or PERC score — clinical risk stratification is required before disposition.",
      action: "Calculate HEART score",
    });
  }

  const riskIndicator: CopilotOutput["riskIndicator"] =
    redFlags.some(f => f.includes("critical")) ? "red" :
    redFlags.length > 0 || disposition === "ED" ? "orange" :
    complaint === "chest_pain" ? "orange" :
    suggestions.filter(s => s.priority === "high").length > 1 ? "yellow" :
    "green";

  const summary =
    riskIndicator === "red" ? "Critical — immediate action required" :
    riskIndicator === "orange" ? `${redFlags.length} alert(s) — urgent review needed` :
    riskIndicator === "yellow" ? `${suggestions.length} suggestion(s) pending` :
    "All checks passed — proceed with documentation";

  const documentationHelp = complaint && DOCUMENTATION_TEMPLATES[complaint] ? DOCUMENTATION_TEMPLATES[complaint] : undefined;

  const output: CopilotOutput = { suggestions, riskIndicator, summary, documentationHelp };

  emitClinicalEvent(caseId, "COPILOT_SUGGESTION", { suggestions: suggestions.map(s => s.title) });

  return output;
}

export function getCopilotPresets() {
  return {
    complaints: Object.keys(SCORING_HINTS),
    scoringHints: SCORING_HINTS,
    documentationTemplates: DOCUMENTATION_TEMPLATES,
  };
}
