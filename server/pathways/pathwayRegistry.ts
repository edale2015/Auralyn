export interface CareStep {
  type: "lab" | "medication" | "referral" | "followup" | "instruction" | "monitoring";
  action: string;
  rationale: string;
  timing: string;
  priority: "routine" | "urgent" | "stat";
  conditions?: string;
}

export interface CarePathway {
  complaint: string;
  disposition: string;
  title: string;
  description: string;
  expectedDuration: string;
  steps: CareStep[];
  contraindications: string[];
  escalationCriteria: string[];
  outcomeGoals: string[];
}

export const CARE_PATHWAYS: Record<string, CarePathway[]> = {
  sore_throat: [
    {
      complaint: "sore_throat",
      disposition: "Prescription",
      title: "Bacterial Pharyngitis (Strep) Pathway",
      description: "Centor score ≥3 — treat empirically or after rapid strep test.",
      expectedDuration: "7–10 days",
      steps: [
        { type: "lab", action: "Rapid Strep Antigen Test (RADT)", rationale: "Confirms Group A Streptococcus", timing: "Immediate, at point of care", priority: "urgent" },
        { type: "medication", action: "Amoxicillin 500mg PO TID × 10 days (adult)", rationale: "First-line treatment for GAS pharyngitis", timing: "Start same day if RADT positive or Centor ≥4", priority: "urgent", conditions: "Positive RADT or Centor ≥4" },
        { type: "medication", action: "Azithromycin 500mg PO Day 1, then 250mg × 4 days (penicillin allergy)", rationale: "Alternative for penicillin allergy", timing: "Same day", priority: "urgent", conditions: "Penicillin allergy" },
        { type: "medication", action: "Ibuprofen 400mg q6h PRN or Acetaminophen 650mg q6h PRN", rationale: "Symptom relief — pain and fever", timing: "Concurrent", priority: "routine" },
        { type: "instruction", action: "Rest, hydration, warm liquids, throat lozenges", rationale: "Supportive care", timing: "Ongoing", priority: "routine" },
        { type: "followup", action: "Return if symptoms not improving after 48–72h of antibiotics", rationale: "Rule out peritonsillar abscess or resistant organism", timing: "48–72h", priority: "routine" },
        { type: "monitoring", action: "Monitor for rash (scarlet fever) or difficulty breathing", rationale: "Complication detection", timing: "Daily", priority: "urgent" },
      ],
      contraindications: ["Concurrent mononucleosis (avoid amoxicillin → rash risk)"],
      escalationCriteria: ["Uvular deviation or trismus (peritonsillar abscess)", "Stridor or drooling (epiglottitis)", "Unable to swallow saliva"],
      outcomeGoals: ["Fever resolution in 24–48h", "Throat pain improvement by day 3", "Full course completion"],
    },
    {
      complaint: "sore_throat",
      disposition: "Home Care",
      title: "Viral Pharyngitis Pathway",
      description: "Centor ≤2 with cough/URI — likely viral, supportive care only.",
      expectedDuration: "5–7 days",
      steps: [
        { type: "instruction", action: "Warm salt water gargles (1/2 tsp salt in 8oz warm water) q2-4h", rationale: "Soothes throat, reduces inflammation", timing: "Ongoing", priority: "routine" },
        { type: "medication", action: "Ibuprofen 400mg q6h PRN or Acetaminophen 650mg q6h PRN", rationale: "Pain and fever management", timing: "As needed", priority: "routine" },
        { type: "medication", action: "Throat lozenges (benzocaine or menthol) PRN", rationale: "Topical analgesia", timing: "PRN", priority: "routine" },
        { type: "instruction", action: "Increase fluid intake, rest, humidifier", rationale: "Supportive care", timing: "Ongoing", priority: "routine" },
        { type: "followup", action: "Return if symptoms worsen or fever >103°F or difficulty swallowing", rationale: "Rule out secondary bacterial infection", timing: "If not improving by day 5", priority: "routine" },
      ],
      contraindications: [],
      escalationCriteria: ["Fever >103°F", "Inability to swallow fluids", "Worsening despite 5 days"],
      outcomeGoals: ["Symptom resolution within 7 days", "Able to tolerate oral fluids"],
    },
  ],

  uti: [
    {
      complaint: "uti",
      disposition: "Prescription",
      title: "Uncomplicated UTI Pathway",
      description: "Acute dysuria/frequency in non-pregnant female without systemic signs.",
      expectedDuration: "3–5 days",
      steps: [
        { type: "lab", action: "Urinalysis with microscopy (UA + micro)", rationale: "Confirm pyuria and bacteriuria", timing: "At visit", priority: "urgent" },
        { type: "lab", action: "Urine culture (MSSA/MRSA protocol) — optional for uncomplicated", rationale: "Not always needed for uncomplicated UTI but guides treatment failure", timing: "At visit", priority: "routine", conditions: "Recurrent UTI, treatment failure, or pregnancy" },
        { type: "medication", action: "Nitrofurantoin 100mg ER PO BID × 5 days (first-line)", rationale: "Low resistance, urinary concentration, minimal systemic side effects", timing: "Start same day", priority: "urgent" },
        { type: "medication", action: "TMP-SMX DS (160/800mg) PO BID × 3 days (alt if local resistance <20%)", rationale: "Alternative first-line if nitrofurantoin contraindicated", timing: "Start same day", priority: "urgent", conditions: "Nitrofurantoin contraindicated or unavailable" },
        { type: "medication", action: "Phenazopyridine 200mg PO TID × 2 days PRN", rationale: "Bladder analgesic for symptom relief", timing: "PRN concurrent", priority: "routine" },
        { type: "instruction", action: "Increased fluid intake (2–3L/day), void frequently, wipe front to back", rationale: "Supportive care and prevention", timing: "Ongoing", priority: "routine" },
        { type: "followup", action: "Return if not improving in 48–72h or if fever/flank pain develops", rationale: "Rule out pyelonephritis", timing: "48–72h", priority: "urgent" },
      ],
      contraindications: ["Nitrofurantoin: GFR <45, near term pregnancy (week 38+)", "TMP-SMX: known resistance pattern, allergy, G6PD deficiency"],
      escalationCriteria: ["Fever >100.4°F (pyelonephritis)", "Flank pain or CVA tenderness", "Male patient (complicated UTI)", "Pregnancy", "Catheter-associated UTI"],
      outcomeGoals: ["Symptom resolution by day 3", "UA negative at follow-up"],
    },
    {
      complaint: "uti",
      disposition: "Urgent Care",
      title: "Complicated UTI / Pyelonephritis Pathway",
      description: "UTI with systemic signs (fever, flank pain) or in special populations.",
      expectedDuration: "7–14 days",
      steps: [
        { type: "lab", action: "Urinalysis + microscopy", rationale: "Confirm infection", timing: "Stat", priority: "stat" },
        { type: "lab", action: "Urine culture and sensitivity", rationale: "Guide definitive therapy", timing: "Stat", priority: "stat" },
        { type: "lab", action: "CBC, BMP, blood cultures × 2 (if febrile)", rationale: "Assess systemic involvement and bacteremia", timing: "Stat", priority: "stat" },
        { type: "medication", action: "Ciprofloxacin 500mg PO BID × 7 days (outpatient pyelonephritis)", rationale: "Adequate systemic coverage for gram-negative coverage", timing: "Start same day", priority: "urgent" },
        { type: "medication", action: "IV ceftriaxone 1g (hospitalized patients)", rationale: "IV therapy for severe pyelonephritis", timing: "Immediately", priority: "stat", conditions: "Hospitalization required" },
        { type: "monitoring", action: "Monitor temperature, WBC, hydration status", rationale: "Track systemic response", timing: "Q4-6h if hospitalized", priority: "urgent" },
        { type: "followup", action: "Repeat urine culture 5–7 days after treatment completion", rationale: "Confirm eradication", timing: "Day 12–17", priority: "routine" },
      ],
      contraindications: ["Fluoroquinolones: myasthenia gravis, tendinopathy history, QT prolongation"],
      escalationCriteria: ["Septic shock", "Inability to tolerate oral medications", "Obstructive uropathy"],
      outcomeGoals: ["Afebrile within 48h", "WBC normalization", "Symptom resolution by day 7"],
    },
  ],

  cough: [
    {
      complaint: "cough",
      disposition: "Home Care",
      title: "Acute Viral URTI / Cough Pathway",
      description: "Cough <3 weeks without red flags — likely viral, supportive care.",
      expectedDuration: "2–3 weeks",
      steps: [
        { type: "instruction", action: "Honey 1–2 tsp PRN (adults), warm beverages, humidifier", rationale: "Evidence-based cough suppression", timing: "Ongoing", priority: "routine" },
        { type: "medication", action: "Guaifenesin 400mg q4h PRN (expectorant for productive cough)", rationale: "Thins secretions", timing: "PRN", priority: "routine" },
        { type: "medication", action: "Dextromethorphan 15–30mg q6-8h PRN (dry cough)", rationale: "Centrally acting cough suppressant", timing: "PRN, avoid if using MAOIs", priority: "routine" },
        { type: "medication", action: "Ibuprofen or Acetaminophen PRN for fever/myalgias", rationale: "Symptom relief", timing: "PRN", priority: "routine" },
        { type: "instruction", action: "Hand hygiene, mask use around vulnerable individuals, rest", rationale: "Infection control", timing: "Ongoing", priority: "routine" },
        { type: "followup", action: "Return if cough >3 weeks, hemoptysis, fever >5 days, or SOB", rationale: "Rule out pneumonia, pertussis, or sinusitis", timing: "PRN", priority: "routine" },
      ],
      contraindications: ["Dextromethorphan: MAOI use, certain SSRIs (serotonin syndrome risk)"],
      escalationCriteria: ["Cough >3 weeks", "Hemoptysis", "Night sweats + weight loss (TB/malignancy)", "Fever >5 days"],
      outcomeGoals: ["Symptom improvement by week 2", "Complete resolution by week 3"],
    },
  ],

  ear_pain: [
    {
      complaint: "ear_pain",
      disposition: "Prescription",
      title: "Acute Otitis Media (AOM) Pathway",
      description: "Bacterial middle ear infection — acute presentation with fever and ear pain.",
      expectedDuration: "7–10 days",
      steps: [
        { type: "lab", action: "Otoscopic examination — confirm TM erythema/bulging/perforation", rationale: "Diagnostic confirmation", timing: "At visit", priority: "urgent" },
        { type: "medication", action: "Amoxicillin 500mg PO TID × 7–10 days (first-line, no allergy)", rationale: "Standard first-line for AOM in adults", timing: "Start same day", priority: "urgent" },
        { type: "medication", action: "Amoxicillin-clavulanate 875/125mg BID × 10 days (second-line or high-risk)", rationale: "Covers beta-lactamase producing organisms", timing: "If amoxicillin failure or recent antibiotic use", priority: "urgent", conditions: "Failure of amoxicillin at 48–72h" },
        { type: "medication", action: "Ibuprofen 400–600mg q6h PRN or Acetaminophen 500–1000mg q6h PRN", rationale: "Pain management", timing: "Concurrent", priority: "routine" },
        { type: "medication", action: "Antipyrine/benzocaine otic drops PRN (topical ear pain — no perforation)", rationale: "Topical analgesia", timing: "PRN", priority: "routine", conditions: "No TM perforation" },
        { type: "followup", action: "Return in 48–72h if not improving or symptoms worsen", rationale: "Assess treatment response", timing: "48–72h", priority: "routine" },
        { type: "monitoring", action: "Watch for mastoiditis: postauricular swelling, protrusion of auricle", rationale: "Complication screening", timing: "Daily patient self-monitoring", priority: "urgent" },
      ],
      contraindications: ["Otic drops: TM perforation confirmed"],
      escalationCriteria: ["Mastoiditis signs", "Facial nerve palsy", "Persistent fever >72h on antibiotics", "Meningeal signs"],
      outcomeGoals: ["Pain relief within 48h", "Fever resolution within 72h", "Hearing return to baseline"],
    },
  ],

  fever: [
    {
      complaint: "fever",
      disposition: "Home Care",
      title: "Viral Fever / URTI Pathway",
      description: "Uncomplicated fever <5 days without red flags — likely viral etiology.",
      expectedDuration: "3–7 days",
      steps: [
        { type: "instruction", action: "Maintain oral hydration — 2L/day minimum", rationale: "Fever causes increased insensible fluid losses", timing: "Ongoing", priority: "urgent" },
        { type: "medication", action: "Acetaminophen 500–1000mg q6h PRN (temp >101°F / discomfort)", rationale: "First-line antipyretic and analgesic", timing: "PRN", priority: "routine" },
        { type: "medication", action: "Ibuprofen 400mg q6h with food PRN (alternating with acetaminophen)", rationale: "NSAID antipyretic — can alternate for better fever control", timing: "PRN, avoid in renal impairment, GI disease", priority: "routine" },
        { type: "instruction", action: "Light clothing, cool environment, tepid sponge bath if very high fever", rationale: "Non-pharmacological cooling", timing: "As needed", priority: "routine" },
        { type: "monitoring", action: "Monitor temperature q4h — return if >103.5°F or not improving in 5 days", rationale: "Detect worsening or secondary bacterial infection", timing: "Q4h", priority: "urgent" },
        { type: "followup", action: "Return if fever persists >5 days, rash develops, stiff neck, or confusion", rationale: "Rule out serious infection", timing: "Day 5 or sooner if red flags", priority: "urgent" },
      ],
      contraindications: ["Aspirin: children/adolescents (Reye syndrome)", "Ibuprofen: GI bleed history, CKD, pregnancy third trimester"],
      escalationCriteria: ["Fever >104°F", "Febrile seizure", "Stiff neck", "Petechial rash", "Altered mental status"],
      outcomeGoals: ["Afebrile within 48–72h", "Return to baseline activity"],
    },
  ],

  chest_pain: [
    {
      complaint: "chest_pain",
      disposition: "ED",
      title: "Chest Pain ED Evaluation Pathway",
      description: "Any chest pain requiring urgent emergency evaluation — rule out ACS, PE, aortic dissection.",
      expectedDuration: "Immediate → 4–24h ED stay",
      steps: [
        { type: "lab", action: "12-lead ECG within 10 minutes of arrival", rationale: "STEMI identification — time-critical", timing: "Stat — within 10 min", priority: "stat" },
        { type: "lab", action: "Troponin I or T × 2 (at 0h and 3h)", rationale: "Rule out myocardial injury", timing: "Stat, repeat at 3h", priority: "stat" },
        { type: "lab", action: "CBC, BMP, coagulation studies, BNP", rationale: "Assess for heart failure, metabolic causes, coagulation baseline", timing: "Stat", priority: "stat" },
        { type: "lab", action: "Chest X-ray (PA + lateral)", rationale: "Pneumothorax, aortic widening, pulmonary edema", timing: "Stat", priority: "stat" },
        { type: "medication", action: "Aspirin 325mg PO STAT (if ACS suspected, no contraindication)", rationale: "Antiplatelet — reduces platelet aggregation in ACS", timing: "Stat", priority: "stat" },
        { type: "lab", action: "CT-PA if PERC positive or Wells score ≥2 (PE evaluation)", rationale: "Rule out pulmonary embolism", timing: "Urgent", priority: "urgent", conditions: "PERC positive or clinical suspicion" },
        { type: "monitoring", action: "Continuous cardiac monitoring, O2 saturation monitoring, IV access", rationale: "Hemodynamic monitoring and immediate intervention readiness", timing: "Continuous", priority: "stat" },
        { type: "referral", action: "Cardiology consult if ECG changes, elevated troponin, or hemodynamic instability", rationale: "Specialist evaluation for possible ACS/STEMI", timing: "Urgent if positive findings", priority: "stat" },
      ],
      contraindications: ["Aspirin: active GI bleeding, allergy, anticoagulation with recent hemorrhagic stroke"],
      escalationCriteria: ["STEMI on ECG → cath lab activation", "Hemodynamic instability → ICU", "Aortic dissection → surgical emergency"],
      outcomeGoals: ["Door-to-ECG <10 min", "Troponin result within 1h", "ACS ruled in or out within 3h"],
    },
  ],

  rash: [
    {
      complaint: "rash",
      disposition: "Urgent Care",
      title: "Non-Emergency Rash Evaluation Pathway",
      description: "New rash without anaphylaxis or systemic signs — evaluate etiology.",
      expectedDuration: "3–14 days depending on etiology",
      steps: [
        { type: "lab", action: "Visual inspection — describe distribution, morphology (macular, papular, vesicular)", rationale: "Diagnostic classification", timing: "At visit", priority: "urgent" },
        { type: "medication", action: "Diphenhydramine 25–50mg q6h PRN (urticarial/allergic rash)", rationale: "H1 antagonist — reduces histamine-mediated symptoms", timing: "Start same day", priority: "routine", conditions: "Allergic or urticarial presentation" },
        { type: "medication", action: "Loratadine 10mg daily or Cetirizine 10mg daily (non-sedating alternative)", rationale: "Non-drowsy antihistamine for daytime use", timing: "Daily", priority: "routine" },
        { type: "medication", action: "Hydrocortisone 1% cream TID (contact dermatitis, without infection)", rationale: "Low-potency topical steroid for non-infectious inflammatory rash", timing: "TID to affected area", priority: "routine", conditions: "Contact dermatitis or eczema without secondary infection" },
        { type: "instruction", action: "Identify and remove trigger (new soap, lotion, detergent, food, medication)", rationale: "Eliminate ongoing exposure", timing: "Immediate", priority: "urgent" },
        { type: "referral", action: "Dermatology referral if rash persists >2 weeks or diagnosis unclear", rationale: "Expert evaluation for chronic or complex dermatologic conditions", timing: "Within 2 weeks", priority: "routine" },
        { type: "followup", action: "Return immediately if rash spreads rapidly, throat swelling, or difficulty breathing", rationale: "Anaphylaxis or Stevens-Johnson syndrome detection", timing: "Immediate if red flags", priority: "stat" },
      ],
      contraindications: ["Topical steroids: infected rash (use topical antibiotic first)"],
      escalationCriteria: ["Angioedema/throat swelling → anaphylaxis protocol", "Bullous or mucosal involvement → SJS/TEN", "Purpuric non-blanching rash → meningococcemia"],
      outcomeGoals: ["Itch control within 24–48h", "Rash clearing within 7–14 days", "Trigger identified"],
    },
  ],

  sinus_pressure: [
    {
      complaint: "sinus_pressure",
      disposition: "Home Care",
      title: "Viral Rhinosinusitis Pathway",
      description: "Sinus symptoms <10 days — likely viral, no antibiotics indicated.",
      expectedDuration: "7–10 days",
      steps: [
        { type: "instruction", action: "Saline nasal irrigation (neti pot or NeilMed) 2× daily", rationale: "Clears secretions, reduces inflammation", timing: "BID", priority: "routine" },
        { type: "medication", action: "Oxymetazoline nasal spray (Afrin) BID × max 3 days", rationale: "Topical decongestant for symptom relief", timing: "PRN, max 3 days (rebound congestion)", priority: "routine" },
        { type: "medication", action: "Pseudoephedrine 30–60mg q4-6h PRN (oral decongestant)", rationale: "Reduces mucosal edema", timing: "PRN, avoid in hypertension", priority: "routine" },
        { type: "medication", action: "Ibuprofen 400mg q6h PRN or Acetaminophen 650mg q6h PRN", rationale: "Pain and facial pressure relief", timing: "PRN", priority: "routine" },
        { type: "instruction", action: "Warm facial compresses, steam inhalation, rest, increased fluids", rationale: "Supportive care and mucus thinning", timing: "Ongoing", priority: "routine" },
        { type: "followup", action: "Return if symptoms >10 days, worsening after 5–7 days (double worsening), or fever", rationale: "Assess for bacterial superinfection", timing: "If not improving at day 7–10", priority: "routine" },
      ],
      contraindications: ["Pseudoephedrine: uncontrolled hypertension, narrow-angle glaucoma, MAOIs", "Oxymetazoline: >3 days use (rebound rhinitis)"],
      escalationCriteria: ["Periorbital edema or redness (orbital cellulitis)", "Severe headache (intracranial extension)", "Altered mental status"],
      outcomeGoals: ["Symptom improvement by day 7", "Avoid unnecessary antibiotics"],
    },
  ],

  abdominal_pain: [
    {
      complaint: "abdominal_pain",
      disposition: "ED",
      title: "Acute Abdominal Pain ED Pathway",
      description: "Acute abdomen requiring urgent evaluation to rule out surgical emergencies.",
      expectedDuration: "4–12h ED evaluation",
      steps: [
        { type: "lab", action: "CBC, BMP, LFTs, lipase, urinalysis, urine HCG (female of childbearing age)", rationale: "Rule out appendicitis, pancreatitis, ectopic pregnancy, hepatobiliary", timing: "Stat", priority: "stat" },
        { type: "lab", action: "CT abdomen/pelvis with contrast (oral ± IV)", rationale: "Standard evaluation for acute abdomen", timing: "Stat after labs", priority: "stat" },
        { type: "lab", action: "Upright abdominal X-ray if CT unavailable", rationale: "Free air under diaphragm (perforation), obstruction pattern", timing: "Stat", priority: "urgent" },
        { type: "medication", action: "IV morphine 0.1mg/kg or hydromorphone 0.5mg IV PRN for severe pain", rationale: "Adequate analgesia does not mask diagnosis", timing: "Stat for severe pain", priority: "stat" },
        { type: "monitoring", action: "NPO, IV access, continuous vitals monitoring", rationale: "Surgical readiness, fluid resuscitation", timing: "Immediate", priority: "stat" },
        { type: "referral", action: "Surgery consult if appendicitis, bowel obstruction, or perforation", rationale: "Surgical emergency evaluation", timing: "Immediate if positive imaging", priority: "stat" },
        { type: "referral", action: "GYN consult if ectopic pregnancy on imaging or positive HCG with pain", rationale: "Ectopic pregnancy is a surgical emergency", timing: "Stat", priority: "stat", conditions: "Female patient, positive HCG, adnexal mass" },
      ],
      contraindications: ["Morphine: respiratory depression, allergy"],
      escalationCriteria: ["Peritoneal signs → emergency surgery", "Hemodynamic instability → ICU", "Positive HCG + free fluid → ectopic"],
      outcomeGoals: ["CT result within 1h", "Diagnosis established within 4h", "Definitive treatment plan within 6h"],
    },
  ],
};

export function getAllPathways(): CarePathway[] {
  return Object.values(CARE_PATHWAYS).flat();
}

export function getPathwaysForComplaint(complaint: string): CarePathway[] {
  return CARE_PATHWAYS[complaint] ?? [];
}

export function getPathwayByComplaintAndDisposition(complaint: string, disposition: string): CarePathway | null {
  return CARE_PATHWAYS[complaint]?.find(p => p.disposition === disposition) ?? null;
}
