import { db } from "../db";
import {
  kbComplaints, kbQuestions, kbModifiers, kbRedFlagRules,
  kbWorkupRules, kbDiagnosisRules, kbTreatmentRules,
  kbDispositionRules, kbPlanTemplates, kbGoldenCases,
} from "../../shared/schema";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

function parseCsv(filePath: string): Record<string, string>[] {
  try {
    const text = fs.readFileSync(filePath, "utf8");
    const lines = text.split("\n").filter(l => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
    return lines.slice(1).map(line => {
      const vals: string[] = [];
      let cur = "", inQ = false;
      for (const ch of line) {
        if (ch === '"') { inQ = !inQ; }
        else if (ch === "," && !inQ) { vals.push(cur.trim()); cur = ""; }
        else cur += ch;
      }
      vals.push(cur.trim());
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = (vals[i] ?? "").replace(/^"|"$/g, ""); });
      return obj;
    }).filter(r => Object.values(r).some(v => v));
  } catch { return []; }
}

const CSV = path.join(process.cwd(), "server/data/csv");

export async function upsertBayesianPriors(): Promise<void> {
  const BAYESIAN_PRIORS = [
    { ruleId: "DX_BAY_INFLUENZA_A",        complaintId: "bayesian_global", diagnosisId: "influenza_a",              diagnosisLabel: "Influenza A",            baseProbability: 0.18, featureLikelihoods: { fever: 0.92, "body aches": 0.85, headache: 0.75, cough: 0.80, fatigue: 0.88, "sore throat": 0.50, "runny nose": 0.55, chills: 0.78 } },
    { ruleId: "DX_BAY_COVID19",            complaintId: "bayesian_global", diagnosisId: "covid19",                  diagnosisLabel: "COVID-19",               baseProbability: 0.14, featureLikelihoods: { fever: 0.88, cough: 0.75, "loss of smell": 0.65, "loss of taste": 0.60, fatigue: 0.82, "shortness of breath": 0.45, headache: 0.60, "sore throat": 0.52 } },
    { ruleId: "DX_BAY_STREP_PHARYNGITIS",  complaintId: "bayesian_global", diagnosisId: "strep_pharyngitis",        diagnosisLabel: "Strep Pharyngitis",      baseProbability: 0.12, featureLikelihoods: { "sore throat": 0.96, fever: 0.78, "tonsillar exudate": 0.70, lymphadenopathy: 0.75, headache: 0.45, "absence of cough": 0.80 } },
    { ruleId: "DX_BAY_VIRAL_URI",          complaintId: "bayesian_global", diagnosisId: "viral_uri",                diagnosisLabel: "Viral URI",              baseProbability: 0.25, featureLikelihoods: { "runny nose": 0.90, congestion: 0.88, "sore throat": 0.70, cough: 0.65, "mild fever": 0.35, sneezing: 0.80 } },
    { ruleId: "DX_BAY_SINUSITIS",          complaintId: "bayesian_global", diagnosisId: "sinusitis",                diagnosisLabel: "Sinusitis",              baseProbability: 0.10, featureLikelihoods: { "sinus pressure": 0.88, "facial pain": 0.75, congestion: 0.82, headache: 0.65, "purulent discharge": 0.70, fever: 0.30, "post-nasal drip": 0.72 } },
    { ruleId: "DX_BAY_OTITIS_MEDIA",       complaintId: "bayesian_global", diagnosisId: "otitis_media",             diagnosisLabel: "Otitis Media",           baseProbability: 0.08, featureLikelihoods: { "ear pain": 0.95, fever: 0.65, "hearing loss": 0.55, "ear fullness": 0.72, discharge: 0.35 } },
    { ruleId: "DX_BAY_PNEUMONIA",          complaintId: "bayesian_global", diagnosisId: "pneumonia",                diagnosisLabel: "Pneumonia",              baseProbability: 0.06, featureLikelihoods: { fever: 0.88, "productive cough": 0.82, "shortness of breath": 0.72, "chest pain": 0.55, fatigue: 0.78, rigors: 0.60 } },
    { ruleId: "DX_BAY_ALLERGIC_RHINITIS",  complaintId: "bayesian_global", diagnosisId: "allergic_rhinitis",        diagnosisLabel: "Allergic Rhinitis",      baseProbability: 0.07, featureLikelihoods: { sneezing: 0.88, "runny nose": 0.85, "itchy eyes": 0.80, congestion: 0.78, "no fever": 0.90, "seasonal pattern": 0.70 } },
    { ruleId: "DX_BAY_ROTATOR_CUFF",       complaintId: "bayesian_global", diagnosisId: "rotator_cuff_injury",      diagnosisLabel: "Rotator Cuff Injury",    baseProbability: 0.30, featureLikelihoods: { "shoulder pain": 0.95, "painful arc": 0.82, weakness: 0.75, "lateral pain": 0.78, "no trauma": 0.60, "gradual onset": 0.70, "night pain": 0.68, "overhead activity pain": 0.80, "age over 40": 0.72, "loss of external rotation": 0.55 } },
    { ruleId: "DX_BAY_SHOULDER_DISLOC",   complaintId: "bayesian_global", diagnosisId: "shoulder_dislocation",     diagnosisLabel: "Shoulder Dislocation",   baseProbability: 0.08, featureLikelihoods: { trauma: 0.92, deformity: 0.85, "arm held at side": 0.80, "severe pain": 0.90, "loss of external rotation": 0.75, "young male": 0.55, "shoulder pain": 0.95, "inability to move arm": 0.88 } },
    { ruleId: "DX_BAY_AC_JOINT",           complaintId: "bayesian_global", diagnosisId: "ac_joint_injury",          diagnosisLabel: "AC Joint Injury",        baseProbability: 0.12, featureLikelihoods: { trauma: 0.88, "top of shoulder tender": 0.92, "step deformity": 0.70, "direct fall onto shoulder": 0.80, "shoulder pain": 0.95, "arm adduction pain": 0.72, "cross-body pain": 0.68 } },
    { ruleId: "DX_BAY_CERVICAL_RADICULOP", complaintId: "bayesian_global", diagnosisId: "cervical_radiculopathy",   diagnosisLabel: "Cervical Radiculopathy", baseProbability: 0.15, featureLikelihoods: { "neck pain": 0.85, "arm pain": 0.82, tingling: 0.78, "numbness fingers": 0.75, "shoulder pain": 0.70, "weakness arm": 0.65, "radiation to hand": 0.72, "no trauma": 0.60 } },
  ];
  for (const bp of BAYESIAN_PRIORS) {
    await db.insert(kbDiagnosisRules).values({
      ruleId: bp.ruleId, complaintId: bp.complaintId, diagnosisId: bp.diagnosisId,
      diagnosisLabel: bp.diagnosisLabel, icdCode: null, baseProbability: bp.baseProbability,
      featureLikelihoods: bp.featureLikelihoods as any, cannotMiss: false,
      basePoints: 50, clusterPriority: 10, active: true,
    }).onConflictDoUpdate({
      target: kbDiagnosisRules.ruleId,
      set: { baseProbability: bp.baseProbability, featureLikelihoods: bp.featureLikelihoods as any, active: true },
    });
  }
  console.log(`[KB Seeder] Upserted ${BAYESIAN_PRIORS.length} Bayesian core priors into kb_diagnosis_rules`);
}

export async function seedKnowledgeBase(): Promise<void> {
  // Always upsert Bayesian priors (even on re-seed, to apply any code-level updates)
  await upsertBayesianPriors();

  const existing = await db.execute(sql`SELECT COUNT(*) as n FROM kb_complaints`);
  const count = Number((existing.rows[0] as any)?.n ?? 0);
  if (count > 0) {
    console.log(`[KB Seeder] Already seeded (${count} complaints). Skipping CSV import.`);
    return;
  }

  console.log("[KB Seeder] Seeding knowledge base from existing data...");

  // ── Complaints from COMPLAINT_REGISTRY.csv ──────────────────────────────
  const compRows = parseCsv(path.join(CSV, "COMPLAINT_REGISTRY.csv"));
  const complaints = compRows.filter(r => r.CC_ID).map(r => ({
    complaintId: r.CC_ID,
    system: r.SYSTEM || "GENERAL",
    label: r.LABEL || r.CC_ID,
    aliases: r.ALIASES ? r.ALIASES.split(";").map((a: string) => a.trim()).filter(Boolean) : [],
    defaultCluster: r.DEFAULT_CLUSTER || null,
    scoringModule: r.SCORING_MODULE || null,
    graphId: r.GRAPH_ID || null,
    engineType: r.ENGINE_TYPE || "LEGACY",
    enabled: r.ENABLED?.toUpperCase() !== "FALSE",
    metadata: {},
  }));

  if (complaints.length > 0) {
    await db.insert(kbComplaints).values(complaints).onConflictDoNothing();
    console.log(`[KB Seeder] Inserted ${complaints.length} complaints`);
  }

  // ── Core Questions from CORE_QUESTIONS.csv ──────────────────────────────
  const qRows = parseCsv(path.join(CSV, "CORE_QUESTIONS.csv"));
  const questions = qRows.filter(r => r.Q_ID && r.CC_ID).map((r, i) => ({
    complaintId: r.CC_ID,
    questionId: r.Q_ID,
    prompt: r.QUESTION_TEXT || r.Q_ID,
    type: mapAnswerType(r.ANSWER_TYPE),
    required: r.REQUIRED?.toUpperCase() === "TRUE",
    priority: parseInt(r.ASK_ORDER || String((i + 1) * 10)) || (i + 1) * 10,
    category: r.CATEGORY || null,
    askIf: r.ASK_IF || null,
    conditionalOn: {},
    linkedDiagnoses: [],
    active: true,
  }));

  if (questions.length > 0) {
    for (let i = 0; i < questions.length; i += 100) {
      await db.insert(kbQuestions).values(questions.slice(i, i + 100)).onConflictDoNothing();
    }
    console.log(`[KB Seeder] Inserted ${questions.length} questions`);
  }

  // ── Modifiers (canonical clinical modifiers) ─────────────────────────────
  const MODIFIERS = [
    { modifierId: "pregnancy", label: "Pregnancy", description: "Patient is pregnant or may be pregnant", appliesTo: [], addDiagnoses: ["ectopic_pregnancy", "preeclampsia"], removeDiagnoses: [], workupChanges: { imaging: "prefer_ultrasound_over_ct", avoid_xray: true }, medChanges: { avoid: ["NSAIDs", "tetracyclines", "fluoroquinolones"], prefer: "category_B_antibiotics" }, dispositionThresholdShift: -0.1 },
    { modifierId: "infant_pediatric", label: "Infant / Pediatric", description: "Patient age < 2 years or pediatric thresholds apply", appliesTo: [], addDiagnoses: [], removeDiagnoses: [], workupChanges: { lower_fever_threshold: 38.0, use_pews_score: true }, medChanges: { use_weight_based_dosing: true }, dispositionThresholdShift: -0.15 },
    { modifierId: "elderly", label: "Elderly (≥65)", description: "Patient is 65 or older — atypical presentations, polypharmacy risk", appliesTo: [], addDiagnoses: [], removeDiagnoses: [], workupChanges: { lower_threshold_for_labs: true }, medChanges: { avoid: ["high_dose_NSAIDs", "benzodiazepines"], renal_adjust: true }, dispositionThresholdShift: -0.1 },
    { modifierId: "chf", label: "CHF / Heart Failure", description: "History of congestive heart failure", appliesTo: [], addDiagnoses: ["acute_decompensated_heart_failure", "pulmonary_edema"], removeDiagnoses: [], workupChanges: { add: ["BNP", "chest_xray", "echo"] }, medChanges: { avoid: ["NSAIDs", "high_sodium_IV"], prefer: ["furosemide", "ACE_inhibitors"] }, dispositionThresholdShift: -0.2 },
    { modifierId: "ckd", label: "CKD / Renal Disease", description: "Chronic kidney disease — dosing and contrast adjustments required", appliesTo: [], addDiagnoses: [], removeDiagnoses: [], workupChanges: { avoid: ["IV_contrast_CT"] }, medChanges: { renal_dose_adjust: true, avoid: ["NSAIDs", "nephrotoxic_antibiotics"] }, dispositionThresholdShift: -0.1 },
    { modifierId: "copd", label: "COPD", description: "Chronic obstructive pulmonary disease", appliesTo: [], addDiagnoses: ["COPD_exacerbation"], removeDiagnoses: [], workupChanges: { add: ["spirometry", "ABG", "chest_xray"] }, medChanges: { avoid: ["high_flow_O2_without_monitoring"], prefer: ["bronchodilators", "steroids"] }, dispositionThresholdShift: -0.15 },
    { modifierId: "penicillin_allergy", label: "Penicillin Allergy", description: "Known or suspected penicillin or beta-lactam allergy", appliesTo: [], addDiagnoses: [], removeDiagnoses: [], workupChanges: {}, medChanges: { avoid: ["amoxicillin", "penicillin", "ampicillin", "cephalosporins_if_cross_react"], substitute: { "amoxicillin": "azithromycin", "penicillin": "clindamycin", "augmentin": "clindamycin" } }, dispositionThresholdShift: 0 },
    { modifierId: "immunocompromised", label: "Immunocompromised", description: "HIV, chemotherapy, transplant, or other immunosuppression", appliesTo: [], addDiagnoses: ["opportunistic_infection", "sepsis"], removeDiagnoses: [], workupChanges: { add: ["CBC", "cultures", "CXR"], lower_threshold: true }, medChanges: { prefer_broad_spectrum: true }, dispositionThresholdShift: -0.25 },
    { modifierId: "anticoagulated", label: "Anticoagulated", description: "On warfarin, heparin, DOAC, or antiplatelet therapy", appliesTo: [], addDiagnoses: [], removeDiagnoses: [], workupChanges: { add: ["INR", "PT_PTT"] }, medChanges: { avoid: ["NSAIDs", "aspirin_high_dose"], caution: "bleeding_risk" }, dispositionThresholdShift: -0.1 },
    { modifierId: "diabetes", label: "Diabetes", description: "Type 1 or Type 2 diabetes mellitus", appliesTo: [], addDiagnoses: ["DKA", "HHS", "diabetic_foot_infection"], removeDiagnoses: [], workupChanges: { add: ["glucose", "HbA1c", "ketones"] }, medChanges: { monitor: "glucose", avoid: ["high_dose_steroids_without_monitoring"] }, dispositionThresholdShift: -0.1 },
  ];

  await db.insert(kbModifiers).values(MODIFIERS.map(m => ({
    ...m,
    workupChanges: m.workupChanges as any,
    medChanges: m.medChanges as any,
    metadata: {},
  }))).onConflictDoNothing();
  console.log(`[KB Seeder] Inserted ${MODIFIERS.length} modifiers`);

  // ── Red Flag Rules from RED_FLAG_RULES.csv ───────────────────────────────
  const rfRows = parseCsv(path.join(CSV, "RED_FLAG_RULES.csv"));
  const redFlags = rfRows.filter(r => r.RF_ID && r.CC_ID).map(r => ({
    ruleId: r.RF_ID,
    complaintId: r.CC_ID,
    label: r.LABEL || r.RF_ID,
    triggerExpr: r.TRIGGER_EXPR || "true",
    severity: r.SEVERITY || "HARD",
    action: r.ACTION || "ER_SEND",
    immediateActions: r.IMMEDIATE_ACTIONS || null,
    rationale: r.RATIONALE || null,
    active: true,
  }));

  if (redFlags.length > 0) {
    for (let i = 0; i < redFlags.length; i += 100) {
      await db.insert(kbRedFlagRules).values(redFlags.slice(i, i + 100)).onConflictDoNothing();
    }
    console.log(`[KB Seeder] Inserted ${redFlags.length} red flag rules`);
  }

  // ── Workup Rules (synthesized from complaint + clinical patterns) ─────────
  const WORKUP_SEEDS = [
    { ruleId: "WU_ST_STREP_RAPID", complaintId: "sore_throat", testName: "Rapid Strep Test", testType: "bedside", triggerExpr: "scores.centor >= 2", priority: 10, rationale: "Centor score ≥2 warrants strep testing", modifierOverrides: {} },
    { ruleId: "WU_ST_MONO_SPOT", complaintId: "sore_throat", testName: "Monospot / EBV Heterophile", testType: "labs", triggerExpr: "age < 30 && answers.exudates === 'yes'", priority: 20, rationale: "Atypical lymphocytes or young age with exudate — rule out mono", modifierOverrides: {} },
    { ruleId: "WU_CP_EKG", complaintId: "chest_pain", testName: "12-lead EKG", testType: "EKG", triggerExpr: "true", priority: 1, rationale: "All chest pain requires immediate EKG", modifierOverrides: {} },
    { ruleId: "WU_CP_TROPONIN", complaintId: "chest_pain", testName: "Troponin I/T", testType: "labs", triggerExpr: "true", priority: 2, rationale: "Rule out ACS in all chest pain presentations", modifierOverrides: {} },
    { ruleId: "WU_CP_CXR", complaintId: "chest_pain", testName: "Chest X-Ray", testType: "imaging", triggerExpr: "true", priority: 5, rationale: "Rule out pneumothorax, effusion, pulmonary edema", modifierOverrides: { chf: "mandatory" } },
    { ruleId: "WU_ABD_BASIC_LABS", complaintId: "abdominal_pain", testName: "BMP + CBC + LFTs + Lipase", testType: "labs", triggerExpr: "answers.severity >= 5 || flags.any_red_flag", priority: 5, rationale: "Metabolic workup for moderate-severe abdominal pain", modifierOverrides: {} },
    { ruleId: "WU_ABD_PELVIC_US", complaintId: "abdominal_pain", testName: "Pelvic Ultrasound", testType: "imaging", triggerExpr: "modifiers.includes('pregnancy') || answers.location === 'pelvic'", priority: 10, rationale: "Rule out ectopic pregnancy in reproductive-age women", modifierOverrides: { pregnancy: "mandatory" } },
    { ruleId: "WU_FEVER_CBC", complaintId: "fever", testName: "CBC with differential", testType: "labs", triggerExpr: "answers.temp >= 103 || modifiers.includes('immunocompromised')", priority: 10, rationale: "Evaluate for bacterial infection or neutropenia", modifierOverrides: {} },
    { ruleId: "WU_UTI_UA", complaintId: "urinary_burning", testName: "Urinalysis + Culture", testType: "labs", triggerExpr: "true", priority: 1, rationale: "Confirm UTI and identify pathogen for targeted therapy", modifierOverrides: {} },
  ];

  await db.insert(kbWorkupRules).values(WORKUP_SEEDS.map(r => ({ ...r, modifierOverrides: r.modifierOverrides as any }))).onConflictDoNothing();
  console.log(`[KB Seeder] Inserted ${WORKUP_SEEDS.length} workup rules`);

  // ── Diagnosis Rules from DX_CANDIDATES.csv ──────────────────────────────
  const dxRows = parseCsv(path.join(CSV, "DX_CANDIDATES.csv"));
  const dxRules = dxRows.filter(r => r.DX_ID && r.CC_ID).map((r, i) => ({
    ruleId: `DX_${r.CC_ID.toUpperCase()}_${i + 1}`.replace(/[^A-Z0-9_]/g, "_"),
    complaintId: r.CC_ID,
    diagnosisId: r.DX_ID,
    diagnosisLabel: r.DX_LABEL || r.DX_ID,
    icdCode: null,
    baseProbability: parseFloat(r.BASE_SCORE || "0.1") || 0.1,
    featureLikelihoods: {},
    cannotMiss: false,
    basePoints: parseInt(r.BASE_POINTS || "1") || 1,
    clusterPriority: parseInt(r.CLUSTER_PRIORITY || "50") || 50,
    active: true,
  }));

  if (dxRules.length > 0) {
    const dedupedDx: typeof dxRules = [];
    const seen = new Set<string>();
    for (const d of dxRules) {
      if (!seen.has(d.ruleId)) { seen.add(d.ruleId); dedupedDx.push(d); }
    }
    for (let i = 0; i < dedupedDx.length; i += 100) {
      await db.insert(kbDiagnosisRules).values(dedupedDx.slice(i, i + 100).map(r => ({ ...r, featureLikelihoods: r.featureLikelihoods as any }))).onConflictDoNothing();
    }
    console.log(`[KB Seeder] Inserted ${dedupedDx.length} diagnosis rules`);
  }

  // ── Treatment Rules (canonical starters) ─────────────────────────────────
  const TREATMENTS = [
    { ruleId: "TX_STREP_AMOX", complaintId: "sore_throat", diagnosisId: "streptococcal_pharyngitis", medicationName: "Amoxicillin", medicationGroup: "Penicillin", isFirstLine: true, adultDose: "500mg PO BID x 10 days", pediatricDose: "50mg/kg/day divided BID x 10 days", pregnancyCategory: "B", contraindications: "Penicillin allergy", allergyCrossReacts: ["penicillin", "ampicillin"], route: "Oral", renalAdjust: null, keyInteractions: "Oral contraceptives (may reduce efficacy)", active: true },
    { ruleId: "TX_STREP_AZITHRO", complaintId: "sore_throat", diagnosisId: "streptococcal_pharyngitis", medicationName: "Azithromycin", medicationGroup: "Macrolide", isFirstLine: false, adultDose: "500mg PO day 1, then 250mg days 2-5", pediatricDose: "12mg/kg/day x 5 days", pregnancyCategory: "B", contraindications: "QT prolongation risk, macrolide allergy", allergyCrossReacts: ["erythromycin"], route: "Oral", renalAdjust: null, keyInteractions: "QT-prolonging drugs, antacids", notes: "Use if penicillin allergy", active: true },
    { ruleId: "TX_UTI_NITRO", complaintId: "urinary_burning", diagnosisId: "uncomplicated_uti", medicationName: "Nitrofurantoin", medicationGroup: "Urinary antiseptic", isFirstLine: true, adultDose: "100mg ER PO BID x 5 days", pediatricDose: "5-7mg/kg/day divided QID x 7 days", pregnancyCategory: "B (avoid at term)", contraindications: "CrCl < 30, term pregnancy", allergyCrossReacts: [], route: "Oral", renalAdjust: "Avoid if CrCl <30", active: true },
    { ruleId: "TX_UTI_TMP_SMX", complaintId: "urinary_burning", diagnosisId: "uncomplicated_uti", medicationName: "TMP-SMX (Bactrim)", medicationGroup: "Sulfonamide", isFirstLine: false, adultDose: "160/800mg PO BID x 3 days", pediatricDose: "8mg/kg TMP per day divided BID", pregnancyCategory: "C (avoid at term)", contraindications: "Sulfa allergy, G6PD deficiency", allergyCrossReacts: ["sulfonamides"], route: "Oral", renalAdjust: "Dose adjust if CrCl <30", active: true },
    { ruleId: "TX_OTITIS_AMOX", complaintId: "earache", diagnosisId: "acute_otitis_media", medicationName: "Amoxicillin", medicationGroup: "Penicillin", isFirstLine: true, adultDose: "500mg PO TID x 7-10 days", pediatricDose: "90mg/kg/day divided BID x 10 days (high dose)", pregnancyCategory: "B", contraindications: "Penicillin allergy", allergyCrossReacts: ["penicillin"], route: "Oral", active: true },
    { ruleId: "TX_COPD_AZITHRO", complaintId: "persistent_cough", diagnosisId: "COPD_exacerbation", medicationName: "Azithromycin", medicationGroup: "Macrolide", isFirstLine: true, adultDose: "500mg PO x 3 days or 250mg x 5 days", pediatricDose: null, pregnancyCategory: "B", contraindications: "Hepatic impairment, QT prolongation", allergyCrossReacts: ["erythromycin"], route: "Oral", active: true },
  ];

  await db.insert(kbTreatmentRules).values(TREATMENTS.map(t => ({
    ...t,
    medicationGroup: t.medicationGroup ?? null,
    adultDose: t.adultDose ?? null,
    adultMaxDose: null,
    pediatricDose: t.pediatricDose ?? null,
    route: t.route ?? null,
    renalAdjust: t.renalAdjust ?? null,
    hepaticAdjust: null,
    pregnancyCategory: t.pregnancyCategory ?? null,
    contraindications: t.contraindications ?? null,
    allergyCrossReacts: t.allergyCrossReacts ?? [],
    keyInteractions: t.keyInteractions ?? null,
    commonSideEffects: null,
    notes: (t as any).notes ?? null,
    diagnosisId: t.diagnosisId ?? null,
    complaintId: t.complaintId ?? null,
  }))).onConflictDoNothing();
  console.log(`[KB Seeder] Inserted ${TREATMENTS.length} treatment rules`);

  // ── Disposition Rules from DISPOSITION_RULES.csv ─────────────────────────
  const dispRows = parseCsv(path.join(CSV, "DISPOSITION_RULES.csv"));
  const dispRules = dispRows.filter(r => r.DISP_RULE_ID && r.CC_ID).map(r => ({
    ruleId: r.DISP_RULE_ID,
    complaintId: r.CC_ID,
    priority: parseInt(r.PRIORITY || "50") || 50,
    whenExpr: r.WHEN_EXPR || "true",
    dispositionLevel: r.DISPOSITION_LEVEL || "self_care",
    rationaleTemplateId: r.RATIONALE_TEMPLATE_ID || null,
    confidenceHint: r.CONFIDENCE_HINT || "MODERATE",
    active: true,
  }));

  if (dispRules.length > 0) {
    for (let i = 0; i < dispRules.length; i += 100) {
      await db.insert(kbDispositionRules).values(dispRules.slice(i, i + 100)).onConflictDoNothing();
    }
    console.log(`[KB Seeder] Inserted ${dispRules.length} disposition rules`);
  }

  // ── Plan Templates from OUTPUT_TEMPLATES.csv ─────────────────────────────
  const tplRows = parseCsv(path.join(CSV, "OUTPUT_TEMPLATES.csv"));
  const templates = tplRows.filter(r => r.TEMPLATE_KEY && r.DIAGNOSIS_LABEL).map(r => ({
    templateKey: r.TEMPLATE_KEY,
    complaintId: r.CC_ID || null,
    diagnosisLabel: r.DIAGNOSIS_LABEL,
    defaultDisposition: r.DEFAULT_DISPOSITION || "self_care",
    summary: r.SUMMARY || null,
    homeCare: r.HOME_CARE ? r.HOME_CARE.split(";").map((s: string) => s.trim()).filter(Boolean) : [],
    followUp: r.FOLLOW_UP ? r.FOLLOW_UP.split(";").map((s: string) => s.trim()).filter(Boolean) : [],
    returnPrecautions: r.RETURN_PRECAUTIONS ? r.RETURN_PRECAUTIONS.split(";").map((s: string) => s.trim()).filter(Boolean) : [],
    patientMessage: r.PATIENT_MESSAGE || null,
    dischargeText: null,
    erPrecautions: null,
    medicationInstructions: null,
    active: true,
  }));

  if (templates.length > 0) {
    for (let i = 0; i < templates.length; i += 100) {
      await db.insert(kbPlanTemplates).values(templates.slice(i, i + 100)).onConflictDoNothing();
    }
    console.log(`[KB Seeder] Inserted ${templates.length} plan templates`);
  }

  // ── Golden Cases from JSONL files ────────────────────────────────────────
  const goldenFiles = ["CROSS_COMPLAINT_GOLDENS.jsonl", "CONSISTENCY_GOLDENS.jsonl"];
  let goldenCount = 0;
  for (const fname of goldenFiles) {
    try {
      const fpath = path.join(CSV, fname);
      const lines = fs.readFileSync(fpath, "utf8").split("\n").filter(l => l.trim());
      for (const line of lines) {
        const g: any = JSON.parse(line);
        const caseId = g.id || `GC_${Date.now()}_${goldenCount}`;
        await db.insert(kbGoldenCases).values({
          caseId,
          complaint: g.complaintSlug || g.complaint || "unknown",
          title: g.title || `Golden Case ${caseId}`,
          structuredInputs: g.anyAnswers || g.inputs || {},
          modifiers: g.modifiers || [],
          clinicalFindings: g.findings || {},
          workupResults: g.workupResults || {},
          expectedDiagnosis: g.expect?.targetDx || g.expectedDiagnosis || "unknown",
          expectedDifferential: g.expect?.differential || [],
          expectedDisposition: g.expect?.disposition || g.expectedDisposition || "self_care",
          expectedWorkup: g.expect?.workup || [],
          expectedTreatment: g.expect?.treatment || {},
          expectedRedFlags: g.expect?.redFlags || [],
          explanation: g.rationale || g.explanation || null,
          version: 1,
          author: "system",
          status: "approved",
          tags: [g.complaintSlug || "general"],
          active: true,
        }).onConflictDoNothing();
        goldenCount++;
      }
    } catch { /* file not found */ }
  }

  // Add canonical golden cases
  const CANONICAL_GOLDENS = [
    { caseId: "GC_STREP_CLASSIC", complaint: "sore_throat", title: "Classic Strep Throat — High Centor", structuredInputs: { fever: "yes", cough: "no", exudate: "yes", lymphadenopathy: "yes" }, modifiers: [], clinicalFindings: { tonsillarExudate: true, anteriorCervicalLAD: true }, workupResults: { rapidStrep: "positive" }, expectedDiagnosis: "streptococcal_pharyngitis", expectedDifferential: ["streptococcal_pharyngitis", "mono_EBV"], expectedDisposition: "urgent_care", expectedWorkup: ["Rapid Strep Test"], expectedTreatment: { medication: "Amoxicillin", dose: "500mg BID x 10 days" }, expectedRedFlags: [], explanation: "Centor score 4: fever + exudate + LAD + no cough — high probability strep, treat empirically", tags: ["strep", "sore_throat", "centor4"] },
    { caseId: "GC_STREP_PENICILLIN_ALLERGY", complaint: "sore_throat", title: "Strep Throat — Penicillin Allergy", structuredInputs: { fever: "yes", cough: "no", exudate: "yes", lymphadenopathy: "yes" }, modifiers: ["penicillin_allergy"], clinicalFindings: { tonsillarExudate: true }, workupResults: { rapidStrep: "positive" }, expectedDiagnosis: "streptococcal_pharyngitis", expectedDifferential: ["streptococcal_pharyngitis"], expectedDisposition: "urgent_care", expectedWorkup: ["Rapid Strep Test"], expectedTreatment: { medication: "Azithromycin", dose: "500mg day 1, 250mg days 2-5" }, expectedRedFlags: [], explanation: "Penicillin allergy modifier must substitute amoxicillin with azithromycin", tags: ["strep", "penicillin_allergy", "modifier_test"] },
    { caseId: "GC_UTI_UNCOMPLICATED", complaint: "urinary_burning", title: "Uncomplicated UTI — Young Adult Female", structuredInputs: { burning: "yes", frequency: "yes", urgency: "yes", fever: "no", flank_pain: "no" }, modifiers: [], clinicalFindings: {}, workupResults: { ua: "positive_nitrites_leukocytes" }, expectedDiagnosis: "uncomplicated_uti", expectedDifferential: ["uncomplicated_uti", "STI_urethritis"], expectedDisposition: "office_followup", expectedWorkup: ["Urinalysis", "Urine Culture"], expectedTreatment: { medication: "Nitrofurantoin", dose: "100mg ER BID x 5 days" }, expectedRedFlags: [], explanation: "Classic uncomplicated cystitis — no fever, no flank pain, no systemic signs", tags: ["uti", "uncomplicated", "female"] },
    { caseId: "GC_UTI_PREGNANCY", complaint: "urinary_burning", title: "UTI in Pregnancy — Medication Safety", structuredInputs: { burning: "yes", frequency: "yes", fever: "no" }, modifiers: ["pregnancy"], clinicalFindings: {}, workupResults: { ua: "positive" }, expectedDiagnosis: "uncomplicated_uti", expectedDifferential: ["uncomplicated_uti"], expectedDisposition: "office_followup", expectedWorkup: ["Urinalysis", "Urine Culture"], expectedTreatment: { medication: "Nitrofurantoin", dose: "100mg ER BID x 5-7 days (avoid at term)", note: "Avoid TMP-SMX and fluoroquinolones in pregnancy" }, expectedRedFlags: [], explanation: "Pregnancy modifier must avoid category X and high-risk antibiotics; nitrofurantoin safe in 1st/2nd trimester", tags: ["uti", "pregnancy", "modifier_test"] },
    { caseId: "GC_CHEST_PAIN_ACS", complaint: "chest_pain", title: "ACS / STEMI Pattern — Emergency", structuredInputs: { pressure: "yes", radiation_arm: "yes", diaphoresis: "yes", nausea: "yes" }, modifiers: [], clinicalFindings: { diaphoresis: true, pallor: true }, workupResults: { ekg: "ST_elevation" }, expectedDiagnosis: "STEMI", expectedDifferential: ["STEMI", "NSTEMI", "unstable_angina"], expectedDisposition: "er_now", expectedWorkup: ["EKG", "Troponin I", "CXR"], expectedTreatment: { immediate: "Call 911", aspirin: "325mg chew", nitroglycerin: "per protocol" }, expectedRedFlags: ["ST_elevation", "diaphoresis_with_chest_pain"], explanation: "Pressure + radiation + diaphoresis + ST elevation = STEMI until proven otherwise — ER now", tags: ["chest_pain", "ACS", "emergency", "ER_now"] },
  ];

  for (const gc of CANONICAL_GOLDENS) {
    await db.insert(kbGoldenCases).values({ ...gc, version: 1, author: "system", status: "approved", active: true }).onConflictDoNothing();
  }
  goldenCount += CANONICAL_GOLDENS.length;
  console.log(`[KB Seeder] Inserted ${goldenCount} golden cases`);

  console.log("[KB Seeder] Knowledge base seeding complete.");
}

function mapAnswerType(t: string): string {
  const m: Record<string, string> = { tri: "yes_no_sometimes", bool: "yes_no", num: "number", text: "text", duration: "duration" };
  return m[t?.toLowerCase?.()] || "yes_no";
}
