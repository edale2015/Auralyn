/**
 * ragCollectionStore.ts — Named knowledge collection store with in-memory similarity search
 *
 * Article (§ "Setting Up Vector Store"):
 *   "Think of collections like tables in the database. For each source we will create one table."
 *   "collection.query(query_texts=[query], n_results=3)"
 *
 * Translates ChromaDB's multi-collection pattern into Auralyn's TypeScript environment:
 *   - Four named clinical collections (vs. article's 2 datasets)
 *   - TF-IDF cosine similarity for retrieval (no external embedding service needed)
 *   - Same query interface: queryCollection(name, query, n) → top-N chunks
 *   - Pre-seeded with clinically relevant reference content
 *
 * The existing multiSourceRetriever.ts pulls from the DB (kbEntityStore, knowledgeGraph,
 * symptomSkill). This store is the in-memory agentic RAG layer that routes are selected from
 * by the LLM-based router.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type CollectionName =
  | "clinical_guidelines"   // Evidence-based triage/treatment protocols
  | "drug_protocols"        // Dosing, interactions, contraindications
  | "device_manuals"        // Clinical equipment specifications
  | "case_studies";         // Anonymised clinical vignettes

export interface RAGChunk {
  id:       string;
  text:     string;
  source:   CollectionName;
  metadata: Record<string, string | number | boolean>;
}

export interface RAGQueryResult {
  chunk:     RAGChunk;
  score:     number;
  rank:      number;
}

// ── TF-IDF similarity ─────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length > 2);
}

function tfScore(queryTokens: string[], docTokens: string[]): number {
  const docSet = new Set(docTokens);
  const matched = queryTokens.filter((t) => docSet.has(t)).length;
  return matched / Math.max(queryTokens.length, 1);
}

function computeScore(query: string, chunk: RAGChunk): number {
  const qTokens = tokenize(query);
  const dTokens = tokenize(chunk.text);
  const direct  = tfScore(qTokens, dTokens);
  const metaStr = Object.values(chunk.metadata).join(" ");
  const meta    = tfScore(qTokens, tokenize(metaStr)) * 0.3;
  return Math.min(1, direct + meta);
}

// ── Registry ──────────────────────────────────────────────────────────────────

const _collections = new Map<CollectionName, RAGChunk[]>([
  ["clinical_guidelines", []],
  ["drug_protocols",      []],
  ["device_manuals",      []],
  ["case_studies",        []],
]);

export function addToCollection(name: CollectionName, chunks: Omit<RAGChunk, "id" | "source">[]): number {
  const col = _collections.get(name);
  if (!col) return 0;
  const added: RAGChunk[] = chunks.map((c, i) => ({
    ...c, source: name, id: `${name}-${Date.now()}-${i}`,
  }));
  col.push(...added);
  return added.length;
}

export function queryCollection(name: CollectionName, query: string, n = 3): RAGQueryResult[] {
  const col = _collections.get(name);
  if (!col || col.length === 0) return [];
  return col
    .map((chunk) => ({ chunk, score: computeScore(query, chunk), rank: 0 }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

export function getCollectionSize(name: CollectionName): number {
  return _collections.get(name)?.length ?? 0;
}

export function listCollections(): { name: CollectionName; size: number }[] {
  return [..._collections.entries()].map(([name, chunks]) => ({ name, size: chunks.length }));
}

export function clearCollection(name: CollectionName): void {
  _collections.get(name)?.splice(0);
}

// ── Pre-seeded clinical knowledge ─────────────────────────────────────────────

// Clinical Guidelines
addToCollection("clinical_guidelines", [
  { text: "Sepsis: qSOFA ≥2 triggers immediate sepsis workup (lactate, blood cultures x2, IV access). Hour-1 bundle: 30 mL/kg crystalloid, broad-spectrum antibiotics within 1 hour, vasopressors for MAP <65 mmHg.", metadata: { condition: "sepsis", urgency: "critical", source: "SSC 2021" } },
  { text: "STEMI: Door-to-balloon time <90 minutes. Activate cath lab immediately. Aspirin 325 mg, heparin bolus, P2Y12 inhibitor. 12-lead EKG within 10 minutes of arrival.", metadata: { condition: "STEMI", urgency: "critical", source: "ACC/AHA 2022" } },
  { text: "Chest Pain Triage: All chest pain patients — EKG within 10 min, troponin I at 0h/3h. HEART score ≤3: low risk, consider observation. HEART 4-6: moderate, serial troponins. HEART ≥7: high risk, cardiology consult.", metadata: { condition: "chest_pain", urgency: "urgent", source: "HEART pathway" } },
  { text: "Stroke: FAST criteria (Face droop, Arm weakness, Speech slurring, Time). CT head without contrast immediately. tPA eligibility: symptom onset <4.5h, BP <185/110, no hemorrhage on CT. Thrombectomy if large vessel occlusion <24h.", metadata: { condition: "stroke", urgency: "critical", source: "AHA 2023" } },
  { text: "Anaphylaxis: Epinephrine 0.3 mg IM (anterolateral thigh) immediately. Supine position. Repeat q5-15min if no response. Diphenhydramine 25-50 mg IV/IM. Albuterol for bronchospasm. Corticosteroids for prolonged reactions.", metadata: { condition: "anaphylaxis", urgency: "critical", source: "WAO 2020" } },
  { text: "Pediatric Fever: Age <28 days any fever → full sepsis workup + admission. Age 29-60 days: risk stratify with WBC, UA, procalcitonin. Age >3 months: Temp >39°C with source identified → outpatient with follow-up.", metadata: { condition: "pediatric_fever", urgency: "varies", source: "AAP 2021" } },
  { text: "Hypertensive Emergency: BP >180/120 with end-organ damage (troponin, creatinine, neuro changes). Reduce MAP by no more than 25% in first hour. IV labetalol or nicardipine preferred. Avoid rapid drops.", metadata: { condition: "hypertensive_emergency", urgency: "urgent", source: "JNC 8" } },
  { text: "Pulmonary Embolism: Wells score + PERC rule. If high pre-test probability or positive PERC, CT pulmonary angiography. Anticoagulate with heparin if high suspicion. Massive PE (hemodynamic instability) → thrombolysis consideration.", metadata: { condition: "pe", urgency: "urgent", source: "ESC 2019" } },
  { text: "DKA Management: NS 1L/h x 2h, then insulin drip 0.1 units/kg/hr. Check K+ — do not start insulin if K <3.5. Target glucose 150-200 mg/dL. Replace K+ aggressively. Anion gap closure is resolution target.", metadata: { condition: "dka", urgency: "critical", source: "ADA Standards 2023" } },
  { text: "Kawasaki Disease: Diagnosis requires fever ≥5 days plus 4 of 5 criteria (conjunctivitis, oral changes, rash, hand/foot changes, cervical lymph nodes). Treatment: IVIG 2 g/kg single infusion + aspirin 80-100 mg/kg/day until afebrile.", metadata: { condition: "kawasaki", urgency: "urgent", source: "AHA Kawasaki 2017" } },
]);

// Drug Protocols
addToCollection("drug_protocols", [
  { text: "Morphine sulfate: IV dosing 0.1 mg/kg q2-4h, max 15 mg/dose. Contraindicated in respiratory depression (RR <12), severe asthma, head injury with altered LOC. Monitor SpO2. Reversal: naloxone 0.4 mg IV.", metadata: { drug: "morphine", class: "opioid", route: "IV" } },
  { text: "Metoprolol: Acute rate control AFib — IV 5 mg q5min x3, target HR <100 bpm. Hold if SBP <90 or PR interval >0.24s or 2nd/3rd degree block. Oral 25-100 mg BID for maintenance.", metadata: { drug: "metoprolol", class: "beta_blocker", indication: "AFib rate control" } },
  { text: "Vancomycin: Load 25-30 mg/kg IV for serious MRSA infections. Maintenance 15-20 mg/kg q8-12h (CrCl-adjusted). Target trough 15-20 mcg/mL or AUC/MIC 400-600. Infusion-related reactions — slow rate to >60 min.", metadata: { drug: "vancomycin", class: "glycopeptide", indication: "MRSA" } },
  { text: "Alteplase (tPA): Stroke — 0.9 mg/kg (max 90 mg), 10% bolus then 90% infusion over 60 min. Exclusions: recent surgery <14 days, SBP >185 mmHg uncontrolled, platelets <100k, INR >1.7. Monitor neuro q15 min.", metadata: { drug: "alteplase", class: "thrombolytic", indication: "ischemic_stroke" } },
  { text: "Amoxicillin: Community-acquired pneumonia (outpatient) — 1 g PO TID x5 days. Otitis media — 80-90 mg/kg/day divided BID (children). Do not use in penicillin allergy (check cross-reactivity history).", metadata: { drug: "amoxicillin", class: "penicillin", route: "PO" } },
  { text: "Dexamethasone: Croup — 0.6 mg/kg PO/IM, max 16 mg, single dose. ARDS — 6 mg IV/PO daily x10 days. Bacterial meningitis — 0.15 mg/kg q6h x4 days, first dose before antibiotics. Anti-inflammatory: 4-8 mg IV q6-8h.", metadata: { drug: "dexamethasone", class: "corticosteroid", indication: "multiple" } },
  { text: "Heparin UFH: ACS — 60 units/kg bolus (max 4000 units), then 12 units/kg/hr infusion. Target aPTT 60-100 seconds (1.5-2.5x control). DVT treatment — 80 units/kg bolus then 18 units/kg/hr. Monitor platelets for HIT.", metadata: { drug: "heparin", class: "anticoagulant", indication: "ACS DVT" } },
  { text: "Ondansetron: Nausea/vomiting — 4 mg IV/IM, may repeat q4-8h. Chemotherapy-induced: 8 mg IV before chemotherapy. Contraindicated with QT prolongation, congenital long QT. Avoid in serotonin syndrome risk.", metadata: { drug: "ondansetron", class: "5HT3_antagonist", indication: "nausea" } },
]);

// Device Manuals
addToCollection("device_manuals", [
  { text: "Mechanical Ventilator (ICU): Initial settings — TV 6 mL/kg IBW, RR 14-18, PEEP 5-8 cmH2O, FiO2 titrate SpO2 >94%. Plateau pressure target <30 cmH2O. Alarms: high pressure 40 cmH2O, low TV alert. Daily spontaneous breathing trials.", metadata: { device: "ventilator", class: "respiratory", setting: "ICU" } },
  { text: "Defibrillator (Biphasic): Ventricular fibrillation — 200J biphasic (360J monophasic). Synchronized cardioversion AFib — 120-200J biphasic. Confirm rhythm before each shock. Pediatric: 2 J/kg initial, 4 J/kg subsequent. Apply pads: right clavicle + left apex.", metadata: { device: "defibrillator", class: "cardiac", indication: "VF cardioversion" } },
  { text: "Infusion Pump (IV): Program rate in mL/hr, volume to be infused (VTBI), and concentration. Check 5 rights before programming: right patient, drug, dose, route, time. High-alert medications (insulin, heparin, opioids) require dual nurse verification.", metadata: { device: "infusion_pump", class: "IV_therapy", safety: "dual_verification" } },
  { text: "Pulse Oximeter: SpO2 normal 95-100%. Inaccurate readings: poor perfusion, nail polish, motion artifact, anemia, carboxyhemoglobin (CO poisoning shows falsely normal). Probe placement: finger preferred, ear and forehead as alternatives.", metadata: { device: "pulse_oximeter", class: "monitoring", parameter: "SpO2" } },
  { text: "12-Lead EKG Machine: Electrode placement: RA (right arm), LA (left arm), RL (right leg), LL (left leg). Precordial: V1 4th ICS RSB, V2 4th ICS LSB, V3 between V2-V4, V4 5th ICS MCL, V5 anterior axillary, V6 midaxillary. Artifact sources: movement, poor contact, 60 Hz interference.", metadata: { device: "EKG_machine", class: "cardiac_monitoring", leads: "12" } },
  { text: "Point-of-Care Ultrasound (POCUS): FAST exam views: right upper quadrant, left upper quadrant, suprapubic/pelvic, subcostal cardiac. Free fluid appears anechoic (black). Lung: A-lines = normal, B-lines = pulmonary edema, sliding sign absence = pneumothorax.", metadata: { device: "ultrasound_POCUS", class: "imaging", exam: "FAST" } },
  { text: "Dialysis Machine: Indications: AKI with uremia, refractory hyperkalemia >6.5 mEq/L, volume overload, metabolic acidosis pH <7.1, toxic ingestions. Contraindications: hemodynamic instability without vasopressor support, no vascular access. Session duration: 3-4 hours intermittent HD.", metadata: { device: "dialysis_machine", class: "renal_replacement", indication: "AKI" } },
]);

// Case Studies
addToCollection("case_studies", [
  { text: "Case: 67-year-old male presents with 3h chest pain, diaphoresis, ST elevation V1-V4. Labs: troponin I 4.2 ng/mL (elevated). Diagnosis: Anterior STEMI. Action: Activated cath lab, PCI within 65 minutes. Outcome: EF preserved at 55%.", metadata: { diagnosis: "STEMI", outcome: "good", age: 67 } },
  { text: "Case: 34-year-old female, 38 weeks pregnant, BP 175/112, headache, 3+ proteinuria. Diagnosis: Severe preeclampsia. Action: Magnesium sulfate, labetalol, emergency C-section. Outcome: Healthy delivery, BP normalized.", metadata: { diagnosis: "preeclampsia", outcome: "good", age: 34 } },
  { text: "Case: 8-year-old male, fever 5 days, bilateral conjunctivitis, strawberry tongue, peeling palms. Diagnosis: Kawasaki disease. IVIG 2 g/kg + aspirin. Echo at diagnosis showed no aneurysms; follow-up echo clear.", metadata: { diagnosis: "kawasaki", outcome: "good", age: 8 } },
]);
