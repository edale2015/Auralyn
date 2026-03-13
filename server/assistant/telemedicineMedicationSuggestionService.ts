export interface MedicationSuggestion {
  name: string;
  dose: string;
  route: string;
  frequency: string;
  duration: string;
  indication: string;
  category: "first-line" | "alternative" | "adjunct" | "avoid";
  caveat?: string;
}

const MEDICATION_LIBRARY: Record<string, MedicationSuggestion[]> = {
  sore_throat: [
    { name: "Amoxicillin", dose: "500mg", route: "PO", frequency: "TID", duration: "10 days", indication: "Group A Strep (Centor ≥ 3)", category: "first-line" },
    { name: "Azithromycin", dose: "500mg Day 1, 250mg Days 2–5", route: "PO", frequency: "Daily", duration: "5 days", indication: "Strep — penicillin allergy", category: "alternative", caveat: "Penicillin allergy only" },
    { name: "Ibuprofen", dose: "400–600mg", route: "PO", frequency: "q6h PRN", duration: "As needed", indication: "Pain and fever relief", category: "adjunct" },
    { name: "Acetaminophen", dose: "650–1000mg", route: "PO", frequency: "q6h PRN", duration: "As needed", indication: "Pain and fever (alternative to NSAID)", category: "adjunct" },
  ],
  cough: [
    { name: "Guaifenesin", dose: "400mg", route: "PO", frequency: "q4h PRN", duration: "As needed", indication: "Expectorant — productive cough", category: "first-line" },
    { name: "Dextromethorphan", dose: "15–30mg", route: "PO", frequency: "q6–8h PRN", duration: "As needed", indication: "Cough suppressant — dry cough", category: "first-line", caveat: "Avoid with MAOIs" },
    { name: "Amoxicillin-Clavulanate", dose: "875/125mg", route: "PO", frequency: "BID", duration: "5–7 days", indication: "Bacterial pneumonia or superinfection", category: "alternative", caveat: "Only if bacterial etiology confirmed" },
    { name: "Azithromycin (Z-pack)", dose: "500mg Day 1, 250mg Days 2–5", route: "PO", frequency: "Daily", duration: "5 days", indication: "Atypical pneumonia (Mycoplasma, Chlamydia)", category: "alternative" },
    { name: "Albuterol inhaler", dose: "2 puffs", route: "Inhaled", frequency: "q4–6h PRN", duration: "As needed", indication: "Bronchospasm / cough-variant asthma", category: "adjunct" },
  ],
  sinus_pressure: [
    { name: "Amoxicillin", dose: "500mg", route: "PO", frequency: "TID", duration: "5–7 days", indication: "Bacterial sinusitis (duration ≥ 10 days)", category: "first-line", caveat: "Only if criteria met for bacterial sinusitis" },
    { name: "Amoxicillin-Clavulanate", dose: "875/125mg", route: "PO", frequency: "BID", duration: "5–7 days", indication: "Bacterial sinusitis — second-line or recent antibiotic exposure", category: "alternative" },
    { name: "Pseudoephedrine", dose: "30–60mg", route: "PO", frequency: "q4–6h PRN", duration: "As needed (max 3 days)", indication: "Nasal decongestion", category: "adjunct", caveat: "Avoid in uncontrolled HTN" },
    { name: "Fluticasone nasal spray", dose: "2 sprays each nostril", route: "Intranasal", frequency: "Daily", duration: "2–4 weeks", indication: "Inflammation — allergic or chronic sinusitis", category: "adjunct" },
    { name: "Oxymetazoline (Afrin)", dose: "2–3 sprays", route: "Intranasal", frequency: "BID", duration: "MAX 3 days", indication: "Rapid nasal decongestion", category: "adjunct", caveat: "Strict 3-day limit — rebound rhinitis risk" },
  ],
  ear_pain: [
    { name: "Amoxicillin", dose: "500mg", route: "PO", frequency: "TID", duration: "7–10 days", indication: "Acute otitis media — first-line", category: "first-line" },
    { name: "Amoxicillin-Clavulanate", dose: "875/125mg", route: "PO", frequency: "BID", duration: "10 days", indication: "AOM — treatment failure or recurrent", category: "alternative" },
    { name: "Ibuprofen", dose: "400–600mg", route: "PO", frequency: "q6h PRN", duration: "As needed", indication: "Ear pain and fever", category: "adjunct" },
    { name: "Antipyrine/Benzocaine otic drops", dose: "Fill ear canal", route: "Otic", frequency: "q1–2h PRN × 3 doses", duration: "Max 2 days", indication: "Topical ear pain", category: "adjunct", caveat: "Contraindicated if TM perforated" },
  ],
  uti: [
    { name: "Nitrofurantoin (macrocrystal)", dose: "100mg ER", route: "PO", frequency: "BID with food", duration: "5 days", indication: "Uncomplicated UTI — first-line", category: "first-line", caveat: "Avoid if GFR < 45" },
    { name: "TMP-SMX DS", dose: "160/800mg (1 tablet)", route: "PO", frequency: "BID", duration: "3 days", indication: "Uncomplicated UTI — alternative", category: "alternative", caveat: "Check local resistance < 20%" },
    { name: "Ciprofloxacin", dose: "500mg", route: "PO", frequency: "BID", duration: "3 days (uncomplicated) / 7 days (pyelonephritis)", indication: "Complicated UTI or pyelonephritis", category: "alternative", caveat: "Reserve for complicated UTI; fluoroquinolone stewardship" },
    { name: "Phenazopyridine", dose: "200mg", route: "PO", frequency: "TID with food", duration: "2 days MAX", indication: "Bladder pain/urgency symptom relief", category: "adjunct", caveat: "Symptom relief only — not antibacterial. Urine turns orange." },
  ],
  fever: [
    { name: "Acetaminophen", dose: "500–1000mg", route: "PO", frequency: "q6h PRN", duration: "As needed", indication: "Fever > 101°F / body aches", category: "first-line" },
    { name: "Ibuprofen", dose: "400mg", route: "PO", frequency: "q6h PRN with food", duration: "As needed", indication: "Fever + inflammation (alternate with Tylenol)", category: "adjunct", caveat: "Avoid in GI bleed, CKD, third trimester pregnancy" },
    { name: "Oseltamivir (Tamiflu)", dose: "75mg", route: "PO", frequency: "BID", duration: "5 days", indication: "Influenza — within 48h of symptom onset", category: "first-line", caveat: "Most effective if started within 48h. Consider in high-risk patients." },
  ],
  rash: [
    { name: "Diphenhydramine (Benadryl)", dose: "25–50mg", route: "PO", frequency: "q6h PRN", duration: "As needed", indication: "Urticaria / allergic rash", category: "first-line", caveat: "Sedating — avoid driving" },
    { name: "Loratadine (Claritin)", dose: "10mg", route: "PO", frequency: "Daily", duration: "As needed", indication: "Non-sedating antihistamine for urticaria / allergic rash", category: "first-line" },
    { name: "Hydrocortisone 1% cream", dose: "Thin layer", route: "Topical", frequency: "TID", duration: "7–14 days", indication: "Mild contact dermatitis / eczema", category: "adjunct", caveat: "Do not use on infected skin" },
    { name: "Triamcinolone 0.1% cream", dose: "Thin layer", route: "Topical", frequency: "BID", duration: "7–10 days", indication: "Moderate inflammatory rash", category: "alternative", caveat: "Avoid face, intertriginous areas" },
    { name: "Cephalexin", dose: "500mg", route: "PO", frequency: "QID", duration: "7–10 days", indication: "Cellulitis (non-purulent, MSSA)", category: "first-line", caveat: "Only if secondary bacterial infection suspected" },
  ],
  chest_pain: [
    { name: "Aspirin", dose: "325mg (chew)", route: "PO", frequency: "Once STAT", duration: "One dose", indication: "ACS — if suspected MI and no contraindication", category: "first-line", caveat: "STAT only if ACS suspected. Contraindicated in allergy, active GI bleed." },
    { name: "Nitroglycerin SL", dose: "0.4mg SL", frequency: "q5min × 3 PRN", route: "Sublingual", duration: "3 doses max", indication: "Ischemic chest pain", category: "adjunct", caveat: "Contraindicated: recent PDE5 inhibitor use, hypotension" },
    { name: "Antacid / PPI", dose: "OTC antacid or omeprazole 20mg", route: "PO", frequency: "Daily / PRN", duration: "As needed", indication: "GERD-related chest pain", category: "adjunct", caveat: "Only after cardiac causes excluded" },
  ],
  abdominal_pain: [
    { name: "Ondansetron (Zofran)", dose: "4mg", route: "PO/ODT", frequency: "q8h PRN", duration: "As needed", indication: "Nausea / vomiting", category: "adjunct" },
    { name: "Promethazine", dose: "12.5–25mg", route: "PO", frequency: "q4–6h PRN", duration: "As needed", indication: "Nausea (alternative)", category: "adjunct", caveat: "Sedating. Avoid extrapyramidal sensitive patients." },
    { name: "Ciprofloxacin + Metronidazole", dose: "500mg + 500mg", route: "PO", frequency: "BID + TID", duration: "7 days", indication: "Intraabdominal / GI bacterial infection", category: "alternative", caveat: "Only if bacterial etiology confirmed" },
  ],
};

export function getMedicationSuggestions(complaint: string, symptoms: string[]): MedicationSuggestion[] {
  const base = MEDICATION_LIBRARY[complaint] ?? [];
  const combined = symptoms.join(" ").toLowerCase();

  return base.map(med => {
    if (med.category === "avoid") return null;
    if (med.caveat?.toLowerCase().includes("pregnancy") && combined.includes("pregnant")) return null;
    return med;
  }).filter((m): m is MedicationSuggestion => m !== null);
}
