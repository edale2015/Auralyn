export interface DifferentialEntry {
  rank: number;
  diagnosis: string;
  confidence: number;
  keyFeatures: string[];
  rulingIn: string[];
  rulingOut: string[];
  urgency: "emergent" | "urgent" | "routine";
}

const DIFFERENTIALS: Record<string, DifferentialEntry[]> = {
  cough: [
    { rank: 1, diagnosis: "Viral URTI / Bronchitis", confidence: 0.72, keyFeatures: ["cough", "rhinorrhea", "low-grade fever"], rulingIn: ["cough < 3 weeks", "URI symptoms", "no focal findings"], rulingOut: ["consolidation on CXR", "high fever > 5 days", "hemoptysis"], urgency: "routine" },
    { rank: 2, diagnosis: "COVID-19", confidence: 0.60, keyFeatures: ["cough", "fever", "fatigue", "anosmia"], rulingIn: ["recent exposure", "loss of taste/smell", "positive test"], rulingOut: ["negative test", "prior confirmed illness"], urgency: "routine" },
    { rank: 3, diagnosis: "Community-Acquired Pneumonia", confidence: 0.35, keyFeatures: ["productive cough", "fever > 38.5°C", "dyspnea"], rulingIn: ["focal crackles", "CURB-65 ≥ 1", "chest X-ray consolidation"], rulingOut: ["clear lung exam", "CURB-65 = 0", "no fever"], urgency: "urgent" },
    { rank: 4, diagnosis: "Asthma Exacerbation", confidence: 0.25, keyFeatures: ["wheezing", "nocturnal cough", "triggers"], rulingIn: ["known asthma", "seasonal pattern", "responds to bronchodilator"], rulingOut: ["no wheezing", "no asthma history"], urgency: "urgent" },
    { rank: 5, diagnosis: "GERD / Cough Variant", confidence: 0.20, keyFeatures: ["chronic dry cough", "heartburn", "worse lying down"], rulingIn: ["> 8 weeks", "heartburn", "better with PPI"], rulingOut: ["acute onset", "fever", "productive"], urgency: "routine" },
    { rank: 6, diagnosis: "Pertussis", confidence: 0.15, keyFeatures: ["paroxysmal cough", "inspiratory whoop", "post-tussive vomiting"], rulingIn: ["cough > 2 weeks", "unvaccinated", "household exposure"], rulingOut: ["vaccinated", "no paroxysms"], urgency: "urgent" },
  ],
  sore_throat: [
    { rank: 1, diagnosis: "Viral Pharyngitis", confidence: 0.70, keyFeatures: ["cough", "rhinorrhea", "gradual onset"], rulingIn: ["Centor score 0–1", "cough present", "rhinorrhea"], rulingOut: ["Centor ≥ 4", "positive strep test", "no cough"], urgency: "routine" },
    { rank: 2, diagnosis: "Group A Streptococcus (Strep)", confidence: 0.30, keyFeatures: ["tonsillar exudate", "fever", "LAD", "no cough"], rulingIn: ["Centor ≥ 3", "fever", "anterior cervical LAD", "exudate"], rulingOut: ["cough present", "rhinorrhea", "Centor ≤ 1"], urgency: "routine" },
    { rank: 3, diagnosis: "Infectious Mononucleosis (EBV)", confidence: 0.15, keyFeatures: ["severe pharyngitis", "posterior LAD", "splenomegaly", "fatigue"], rulingIn: ["adolescent/young adult", "posterior cervical LAD", "hepatosplenomegaly"], rulingOut: ["elderly", "amoxicillin given without rash"], urgency: "routine" },
    { rank: 4, diagnosis: "Peritonsillar Abscess", confidence: 0.08, keyFeatures: ["severe unilateral pain", "uvular deviation", "trismus", "hot potato voice"], rulingIn: ["unilateral swelling", "trismus", "uvular deviation", "muffled voice"], rulingOut: ["bilateral symptoms", "no trismus"], urgency: "urgent" },
  ],
  uti: [
    { rank: 1, diagnosis: "Uncomplicated UTI (Cystitis)", confidence: 0.75, keyFeatures: ["dysuria", "frequency", "urgency", "suprapubic pain"], rulingIn: ["positive UA", "female", "no fever"], rulingOut: ["fever", "flank pain", "male patient"], urgency: "routine" },
    { rank: 2, diagnosis: "Pyelonephritis", confidence: 0.20, keyFeatures: ["fever", "flank pain", "CVA tenderness", "UA positive"], rulingIn: ["fever ≥ 38°C", "CVA tenderness", "systemic symptoms"], rulingOut: ["afebrile", "no flank pain"], urgency: "urgent" },
    { rank: 3, diagnosis: "STI (Urethritis)", confidence: 0.15, keyFeatures: ["discharge", "sexually active", "new partner"], rulingIn: ["urethral discharge", "STI exposure", "young sexually active"], rulingOut: ["negative STI screen", "no discharge"], urgency: "routine" },
    { rank: 4, diagnosis: "Vaginitis", confidence: 0.15, keyFeatures: ["vaginal discharge", "odor", "itching"], rulingIn: ["vaginal symptoms", "no dysuria", "discharge present"], rulingOut: ["classic UTI symptoms only", "no discharge"], urgency: "routine" },
  ],
  chest_pain: [
    { rank: 1, diagnosis: "ACS / NSTEMI", confidence: 0.35, keyFeatures: ["pressure", "radiation", "diaphoresis", "risk factors"], rulingIn: ["HEART score ≥ 4", "troponin elevation", "ECG changes", "radiation"], rulingOut: ["HEART score ≤ 3", "negative serial troponin", "pleuritic"], urgency: "emergent" },
    { rank: 2, diagnosis: "Pulmonary Embolism", confidence: 0.20, keyFeatures: ["pleuritic pain", "dyspnea", "DVT risk", "tachycardia"], rulingIn: ["Wells ≥ 2", "PERC positive", "recent travel/surgery", "leg swelling"], rulingOut: ["PERC negative", "low Wells score", "no risk factors"], urgency: "emergent" },
    { rank: 3, diagnosis: "GERD / Esophageal Spasm", confidence: 0.25, keyFeatures: ["burning", "worse after meals", "relieved by antacids"], rulingIn: ["no cardiac risk factors", "heartburn", "improves with GI treatment"], rulingOut: ["radiation to arm/jaw", "diaphoresis", "troponin elevation"], urgency: "routine" },
    { rank: 4, diagnosis: "Musculoskeletal / Costochondritis", confidence: 0.20, keyFeatures: ["sharp", "reproducible with palpation", "worse with movement"], rulingIn: ["localized tenderness", "reproducible with palpation", "no cardiac risk"], rulingOut: ["radiation", "diaphoresis", "troponin elevation"], urgency: "routine" },
    { rank: 5, diagnosis: "Aortic Dissection", confidence: 0.05, keyFeatures: ["tearing/ripping", "radiation to back", "pulse differential"], rulingIn: ["hypertension history", "tearing pain", "radiation to back", "pulse asymmetry"], rulingOut: ["no hypertension", "no radiation to back"], urgency: "emergent" },
  ],
  fever: [
    { rank: 1, diagnosis: "Viral Syndrome", confidence: 0.65, keyFeatures: ["cough", "myalgias", "rhinorrhea", "headache"], rulingIn: ["< 5 days", "URI symptoms", "sick contact", "seasonal"], rulingOut: ["localizing source", "systemic infection signs", "immunocompromised"], urgency: "routine" },
    { rank: 2, diagnosis: "Influenza A/B", confidence: 0.40, keyFeatures: ["abrupt onset", "high fever", "severe myalgias"], rulingIn: ["abrupt onset", "myalgias", "flu season", "positive rapid test"], rulingOut: ["gradual onset", "negative test", "non-flu season"], urgency: "routine" },
    { rank: 3, diagnosis: "COVID-19", confidence: 0.35, keyFeatures: ["fever", "cough", "anosmia", "fatigue"], rulingIn: ["exposure", "positive test", "loss of taste"], rulingOut: ["negative test", "clear alternative diagnosis"], urgency: "routine" },
    { rank: 4, diagnosis: "Early Bacterial Sepsis", confidence: 0.15, keyFeatures: ["high fever", "rigors", "tachycardia", "no obvious source"], rulingIn: ["qSOFA ≥ 2", "lactate elevated", "rigors", "immunocompromised"], rulingOut: ["qSOFA 0", "clear viral source", "immunocompetent, young"], urgency: "urgent" },
  ],
  ear_pain: [
    { rank: 1, diagnosis: "Acute Otitis Media", confidence: 0.60, keyFeatures: ["ear pain", "fever", "recent URI", "bulging TM"], rulingIn: ["fever", "recent URI", "TM bulging/erythematous", "hearing loss"], rulingOut: ["clear TM", "no fever", "canal only affected"], urgency: "routine" },
    { rank: 2, diagnosis: "Otitis Externa (Swimmer's Ear)", confidence: 0.30, keyFeatures: ["canal pain", "recent water exposure", "tragus tenderness"], rulingIn: ["tragus tenderness", "water exposure", "canal erythema"], rulingOut: ["TM involvement", "fever", "no water exposure"], urgency: "routine" },
    { rank: 3, diagnosis: "Referred Pain (TMJ / Dental)", confidence: 0.15, keyFeatures: ["jaw clicking", "dental pain", "no ear exam findings"], rulingIn: ["jaw symptoms", "dental problems", "normal ear exam"], rulingOut: ["abnormal TM", "fever", "ear discharge"], urgency: "routine" },
  ],
  rash: [
    { rank: 1, diagnosis: "Contact Dermatitis", confidence: 0.50, keyFeatures: ["localized", "new exposure", "itchy", "well-demarcated"], rulingIn: ["new soap/product", "distribution matches exposure", "itching"], rulingOut: ["widespread", "fever", "systemic symptoms"], urgency: "routine" },
    { rank: 2, diagnosis: "Urticaria (Hives)", confidence: 0.30, keyFeatures: ["wheals", "hives", "migratory", "pruritic"], rulingIn: ["wheals", "migratory pattern", "recent allergen exposure"], rulingOut: ["fixed lesions", "blistering", "fever"], urgency: "routine" },
    { rank: 3, diagnosis: "Cellulitis", confidence: 0.20, keyFeatures: ["warm", "erythema", "spreading", "fever"], rulingIn: ["fever", "spreading erythema", "warmth", "tenderness"], rulingOut: ["no warmth/tenderness", "bilateral"], urgency: "urgent" },
    { rank: 4, diagnosis: "Meningococcemia", confidence: 0.03, keyFeatures: ["petechiae", "purpura", "fever", "stiff neck"], rulingIn: ["non-blanching purpura", "high fever", "meningism", "toxic appearance"], rulingOut: ["blanching rash", "afebrile", "well-appearing"], urgency: "emergent" },
  ],
  sinus_pressure: [
    { rank: 1, diagnosis: "Viral Rhinosinusitis", confidence: 0.75, keyFeatures: ["congestion", "facial pressure", "duration < 10 days"], rulingIn: ["< 10 days", "URI symptoms", "watery discharge"], rulingOut: ["≥ 10 days", "double worsening", "unilateral facial pain"], urgency: "routine" },
    { rank: 2, diagnosis: "Acute Bacterial Sinusitis", confidence: 0.20, keyFeatures: ["≥ 10 days", "purulent discharge", "facial pain", "fever"], rulingIn: ["duration ≥ 10 days", "double worsening pattern", "fever > 3 days"], rulingOut: ["< 10 days", "watery clear discharge"], urgency: "routine" },
    { rank: 3, diagnosis: "Allergic Rhinitis", confidence: 0.30, keyFeatures: ["seasonal", "sneezing", "watery eyes", "known allergies"], rulingIn: ["seasonal pattern", "known allergens", "clear watery discharge", "no fever"], rulingOut: ["fever", "purulent discharge", "acute onset"], urgency: "routine" },
  ],
  abdominal_pain: [
    { rank: 1, diagnosis: "Appendicitis", confidence: 0.25, keyFeatures: ["RLQ pain", "periumbilical migration", "fever", "rebound"], rulingIn: ["Alvarado ≥ 5", "rebound tenderness", "RLQ migration", "anorexia"], rulingOut: ["bilateral", "diarrhea-predominant", "normal WBC/CRP"], urgency: "emergent" },
    { rank: 2, diagnosis: "Gastroenteritis", confidence: 0.40, keyFeatures: ["diarrhea", "nausea", "vomiting", "cramping"], rulingIn: ["sick contact", "diarrhea", "diffuse cramping", "nausea/vomiting"], rulingOut: ["focal RLQ", "peritoneal signs", "high fever"], urgency: "routine" },
    { rank: 3, diagnosis: "Cholecystitis / Biliary Colic", confidence: 0.20, keyFeatures: ["RUQ pain", "fatty food", "Murphy's sign", "nausea"], rulingIn: ["RUQ pain", "fatty food trigger", "positive Murphy's sign", "nausea"], rulingOut: ["no RUQ tenderness", "no fatty food correlation"], urgency: "urgent" },
    { rank: 4, diagnosis: "Ectopic Pregnancy", confidence: 0.10, keyFeatures: ["female", "positive hCG", "adnexal tenderness", "amenorrhea"], rulingIn: ["positive pregnancy test", "adnexal mass", "amenorrhea", "vaginal bleeding"], rulingOut: ["male", "negative hCG", "post-menopausal"], urgency: "emergent" },
    { rank: 5, diagnosis: "Pancreatitis", confidence: 0.15, keyFeatures: ["epigastric pain", "radiation to back", "elevated lipase", "nausea"], rulingIn: ["elevated lipase", "epigastric with back radiation", "alcohol use", "gallstones"], rulingOut: ["normal lipase", "no epigastric tenderness"], urgency: "urgent" },
  ],
};

export function getUpdatedDifferential(complaint: string, symptoms: string[], additionalText: string): DifferentialEntry[] {
  const base = DIFFERENTIALS[complaint] ?? [];
  if (base.length === 0) return [];

  const combined = `${symptoms.join(" ")} ${additionalText}`.toLowerCase();

  return base.map(entry => {
    let conf = entry.confidence;
    for (const feat of entry.rulingIn) {
      if (combined.includes(feat.toLowerCase())) conf = Math.min(0.98, conf + 0.08);
    }
    for (const feat of entry.rulingOut) {
      if (combined.includes(feat.toLowerCase())) conf = Math.max(0.01, conf - 0.12);
    }
    return { ...entry, confidence: Math.round(conf * 100) / 100 };
  }).sort((a, b) => b.confidence - a.confidence).map((e, i) => ({ ...e, rank: i + 1 }));
}
