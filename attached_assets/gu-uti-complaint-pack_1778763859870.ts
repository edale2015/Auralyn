/**
 * AURALYN — GU / UTI Complaint Pack
 * 
 * This is one of the most complex complaint packs in urgent care because:
 * 1. Biological sex, gender identity, and anatomy must be established separately
 * 2. The differential expands dramatically based on anatomy present
 * 3. Multiple concurrent diagnoses are the rule, not the exception (UTI + STD + BV + yeast)
 * 4. Colonization vs. infection is a critical antibiotic stewardship distinction
 * 5. Disposition can escalate from UTI → PID → ER within the same encounter
 * 
 * Core framework: Anatomy drives the differential. Symptoms drive the workup.
 * Risk drives STD evaluation. UA result gates the antibiotic decision.
 * 
 * File: server/kb/complaintPacks/gu-uti.ts
 */

import { ClinicalState } from "../ClinicalStateBuilder";

// ─── TYPES ────────────────────────────────────────────────────────────────

/**
 * GENDER / ANATOMY MODEL
 * 
 * This is the most important architectural decision in this pack.
 * We separate three distinct concepts:
 *   1. Reported gender identity (how the patient identifies)
 *   2. Anatomical inventory (what organs are present — drives differential)
 *   3. Hormonal status (affects risk, symptoms, and treatment)
 * 
 * A transgender woman (MTF) may have:
 *   - Female gender identity
 *   - Male genitalia (pre-op), or neovagina (post-op), or both
 *   - Female hormonal profile (if on HRT)
 * 
 * The clinical questions are driven by ANATOMY, not gender identity.
 * The patient communication is driven by GENDER IDENTITY.
 */
export interface AnatomicalProfile {
  // What the patient identifies as (drives pronoun/name in output)
  genderIdentity: "female" | "male" | "nonbinary" | "transgender_woman" |
                  "transgender_man" | "genderfluid" | "other" | "not_disclosed";

  // What anatomy is actually present (drives clinical differential)
  hasCervix: boolean;
  hasUterus: boolean;
  hasOvaries: boolean;
  hasVagina: boolean;            // includes neovagina
  hasProstate: boolean;
  hasTestes: boolean;
  hasPenis: boolean;

  // Hormonal status
  onHRT: boolean;
  hrtType: "estrogen" | "testosterone" | "both" | "none" | null;
  postmenopausal: boolean;       // natural or surgical
  pregnant: boolean | null;
  pregnancyTestResult: "positive" | "negative" | "not_done" | null;

  // Surgical history relevant to GU
  priorHysterectomy: boolean;
  priorOophorectomy: boolean;
  genderAffirmingSurgery: boolean;
  surgeryType: string | null;    // e.g. "orchiectomy", "vaginoplasty", "metoidioplasty"
}

export type GUDisposition =
  | "er_now"              // pregnant + bleeding, severe sepsis, severe PID
  | "gyn_today"           // PID, adnexal tenderness, complex presentation
  | "ent_urology_today"   // male with testicular pain, urinary retention
  | "treat_and_follow"    // standard UTI, BV, yeast — treat and call if not better
  | "watchful_waiting"    // asymptomatic bacteriuria — colonization, not infection
  | "std_workup";         // high-risk exposure with symptoms

export interface GUAssessment {
  disposition: GUDisposition;
  anatomicalProfile: AnatomicalProfile;
  primaryDiagnoses: GUDiagnosis[];
  antibioticPlan: GUAntibioticPlan;
  stdEvaluation: STDEvaluation;
  workup: string[];
  recurrencePlan: RecurrencePlan | null;
  patientCounseling: string[];
  erTriggers: string[];
  returnPrecautions: string[];
}

export interface GUDiagnosis {
  name: string;
  icd10: string;
  confidence: "definite" | "probable" | "possible" | "ruled_out";
  basis: string;
}

export interface GUAntibioticPlan {
  primaryAntibiotic: AntibioticChoice | null;
  additionalAntibiotics: AntibioticChoice[];
  treatmentForColonizationOnly: boolean;
  stewardshipNote: string | null;
  cultureGuidance: string;
}

export interface AntibioticChoice {
  name: string;
  dose: string;
  duration: string;
  indication: string;
  alternativeIf: string | null;
}

export interface STDEvaluation {
  riskPresent: boolean;
  indicationsForTreatment: STDIndication[];
  swabPanel: string[];
  bloodTests: string[];
  treatmentOffered: AntibioticChoice[];
  counselingPoints: string[];
}

export type STDIndication =
  | "high_risk_exposure"      // patient reports high-risk contact
  | "consistent_symptoms"     // discharge, dysuria, lesions
  | "positive_labs";          // positive swab or culture

export interface RecurrencePlan {
  isRecurrent: boolean;        // ≥2 UTIs in 6 months or ≥3 in 12 months
  recommendations: string[];
  suppressiveTherapy: boolean;
  referralRecommended: boolean;
  referralSpecialty: "urogynecology" | "urology" | "gynecology" | null;
}

// ─── STEP 1: ESTABLISH ANATOMICAL PROFILE ────────────────────────────────
/**
 * This MUST run before any clinical questions.
 * The extractor pulls this from the transcript.
 * 
 * IMPORTANT: Questions are framed clinically, not assuming gender.
 * "Do you have a uterus or ovaries?" rather than "Are you female?"
 * This is both medically accurate and respectful.
 */
export function buildAnatomicalProfile(state: ClinicalState): AnatomicalProfile {
  const h = state.history;

  // Default: derive from reported sex if anatomy not explicitly stated
  // This is a fallback — explicit anatomy always takes precedence
  const reportedSex = h.biologicalSex ?? h.genderIdentity ?? "not_disclosed";

  const isTypicalFemale = reportedSex === "female" && !h.genderAffirmingSurgery;
  const isTypicalMale = reportedSex === "male" && !h.genderAffirmingSurgery;

  return {
    genderIdentity: h.genderIdentity as AnatomicalProfile["genderIdentity"] ?? "not_disclosed",

    // Anatomy — explicit trumps inferred
    hasCervix: h.hasCervix ?? (isTypicalFemale && !h.priorHysterectomy),
    hasUterus: h.hasUterus ?? (isTypicalFemale && !h.priorHysterectomy),
    hasOvaries: h.hasOvaries ?? (isTypicalFemale && !h.priorOophorectomy),
    hasVagina: h.hasVagina ?? (isTypicalFemale || h.genderAffirmingSurgery === true),
    hasProstate: h.hasProstate ?? isTypicalMale,
    hasTestes: h.hasTestes ?? (isTypicalMale && !(h.surgeryType?.includes("orchiectomy"))),
    hasPenis: h.hasPenis ?? isTypicalMale,

    onHRT: h.onHRT ?? false,
    hrtType: h.hrtType ?? null,
    postmenopausal: h.postmenopausal ?? (h.age >= 55 && isTypicalFemale) ?? false,
    pregnant: h.pregnant ?? null,
    pregnancyTestResult: h.pregnancyTestResult ?? null,

    priorHysterectomy: h.priorHysterectomy ?? false,
    priorOophorectomy: h.priorOophorectomy ?? false,
    genderAffirmingSurgery: h.genderAffirmingSurgery ?? false,
    surgeryType: h.surgeryType ?? null,
  };
}

// ─── STEP 2: ER TRIGGERS (run first, always) ─────────────────────────────

export function checkERTriggers(state: ClinicalState, anatomy: AnatomicalProfile): string[] {
  const s = state.symptoms;
  const triggers: string[] = [];

  // Pregnancy + any of: bleeding, severe pain, fever
  if (anatomy.pregnant || anatomy.pregnancyTestResult === "positive") {
    if (s.vaginalBleeding) triggers.push("Pregnant with vaginal bleeding — ER immediately");
    if (s.severePain) triggers.push("Pregnant with severe abdominal pain — ER immediately");
    if (state.vitals?.fever && state.vitals?.temp >= 101) {
      triggers.push("Pregnant with fever — ER immediately");
    }
  }

  // Sepsis signals
  if (state.vitals?.fever && (state.vitals?.heartRate ?? 0) > 110) {
    triggers.push("Fever + tachycardia — possible urosepsis, consider ER");
  }
  if ((state.vitals?.bp?.systolic ?? 120) < 90) {
    triggers.push("Hypotension with urinary symptoms — urosepsis, ER now");
  }
  if (s.rigors) triggers.push("Rigors with urinary symptoms — sepsis risk, ER");

  // Severe pyelonephritis
  if (s.severeCVAtendemess && state.vitals?.fever) {
    triggers.push("CVA tenderness + fever — pyelonephritis, likely needs IV antibiotics");
  }

  // Looks unwell
  if (s.alteredMentalStatus) triggers.push("Altered mental status with urinary symptoms — ER");
  if (s.appearsUnwell) triggers.push("Patient appears unwell — clinical gestalt, ER");

  // Very elderly with UTI — higher sepsis risk
  if (state.history.age >= 80 && state.vitals?.fever) {
    triggers.push("Age ≥80 with fever and urinary symptoms — low threshold for ER");
  }

  return triggers;
}

// ─── STEP 3: BUILD DIAGNOSIS LIST ────────────────────────────────────────

export function buildGUDifferential(
  state: ClinicalState,
  anatomy: AnatomicalProfile,
  ua: UAResult
): GUDiagnosis[] {
  const s = state.symptoms;
  const h = state.history;
  const diagnoses: GUDiagnosis[] = [];

  // ── URINARY TRACT INFECTION ────────────────────────────────────────────
  const utiBasis = [];
  if (s.dysuria) utiBasis.push("dysuria");
  if (s.urinaryFrequency) utiBasis.push("frequency");
  if (s.urinaryUrgency) utiBasis.push("urgency");
  if (ua.leukocytes) utiBasis.push("UA leukocytes");
  if (ua.blood) utiBasis.push("UA blood");
  if (ua.nitrites) utiBasis.push("nitrites (gram-negative organism)");

  const utiSymptomCount = [s.dysuria, s.urinaryFrequency, s.urinaryUrgency].filter(Boolean).length;
  const utiConfidence: GUDiagnosis["confidence"] =
    (utiSymptomCount >= 2 && ua.leukocytes) ? "definite" :
    (utiSymptomCount >= 1 && ua.leukocytes) ? "probable" :
    (utiSymptomCount >= 2 && !ua.leukocytes) ? "possible" : "ruled_out";

  if (utiConfidence !== "ruled_out") {
    diagnoses.push({
      name: s.cvaTabderness ? "Pyelonephritis" : "Urinary tract infection",
      icd10: s.cvaTenderness ? "N10" : (anatomy.hasCervix ? "N30.00" : "N30.01"),
      confidence: utiConfidence,
      basis: utiBasis.join(", "),
    });
  }

  // ── ASYMPTOMATIC BACTERIURIA (colonization — do not treat) ────────────
  if (ua.leukocytes && !s.dysuria && !s.frequency && !s.urgency && !anatomy.pregnant) {
    diagnoses.push({
      name: "Asymptomatic bacteriuria (colonization)",
      icd10: "N39.0",
      confidence: "probable",
      basis: "UA positive without UTI symptoms — colonization, not infection",
    });
  }

  // ── ANATOMY-SPECIFIC DIAGNOSES ─────────────────────────────────────────

  if (anatomy.hasVagina || anatomy.hasCervix) {
    // BV
    if (s.vaginalDischarge && s.dischargeSmelll === "fishy") {
      diagnoses.push({
        name: "Bacterial vaginosis",
        icd10: "N76.0",
        confidence: s.vaginalItching ? "probable" : "possible",
        basis: "Vaginal discharge + fishy odor — Amsel criteria",
      });
    } else if (s.vaginalDischarge && !s.vaginalItching) {
      diagnoses.push({
        name: "Bacterial vaginosis",
        icd10: "N76.0",
        confidence: "possible",
        basis: "Vaginal discharge without prominent itching — BV pattern",
      });
    }

    // Yeast
    if (s.vaginalItching && (s.dischargeType === "thick_white" || s.vaginalItching)) {
      diagnoses.push({
        name: "Vulvovaginal candidiasis",
        icd10: "B37.3",
        confidence: s.dischargeType === "thick_white" ? "probable" : "possible",
        basis: "Vaginal itching ± thick white discharge — candida pattern",
      });
    }

    // Herpes (exam-triggered)
    if (s.vaginalLesions || h.examFindings?.includes("herpetic_lesions")) {
      diagnoses.push({
        name: "Herpes simplex genitalis",
        icd10: "A60.00",
        confidence: h.examFindings?.includes("herpetic_lesions") ? "probable" : "possible",
        basis: "Genital lesions consistent with HSV on exam",
      });
    }

    // PID (the escalation diagnosis)
    if (s.adnexalTenderness || h.examFindings?.includes("adnexal_tenderness")) {
      diagnoses.push({
        name: "Pelvic inflammatory disease",
        icd10: "N73.9",
        confidence: h.examFindings?.includes("adnexal_tenderness") ? "definite" : "probable",
        basis: "Adnexal tenderness on bimanual exam — CDC diagnostic criteria met",
      });
    }

    // STD
    if (s.stdRisk && (s.purulentDischarge || s.cervicalMotionTenderness)) {
      diagnoses.push({
        name: "Gonorrhea / Chlamydia",
        icd10: "A54.00",
        confidence: "possible",
        basis: "STD risk + purulent discharge or cervical motion tenderness",
      });
    }

    // Trichomonas
    if (s.stdRisk && s.vaginalDischarge && s.vaginalItching) {
      diagnoses.push({
        name: "Trichomoniasis",
        icd10: "A59.01",
        confidence: "possible",
        basis: "STD risk + vaginal discharge + itching — trich in differential",
      });
    }
  }

  if (anatomy.hasPenis || anatomy.hasProstate) {
    // Male UTI — uncommon in men under 60, always investigate cause
    if (utiConfidence !== "ruled_out" && h.age < 60) {
      diagnoses.push({
        name: "Male UTI — investigate anatomical/STD cause",
        icd10: "N30.00",
        confidence: "possible",
        basis: "UTI in younger male is uncommon — STD and anatomical cause must be excluded",
      });
    }

    // BPH
    if (h.age >= 50 && (s.poorStream || s.hesitancy || s.dribbling || s.nocturia)) {
      diagnoses.push({
        name: "Benign prostatic hyperplasia",
        icd10: "N40.0",
        confidence: "probable",
        basis: "Older male with obstructive urinary symptoms",
      });
    }

    // Prostatitis
    if (s.perinealpain && s.dysuria && state.vitals?.fever) {
      diagnoses.push({
        name: "Acute prostatitis",
        icd10: "N41.0",
        confidence: "probable",
        basis: "Dysuria + perineal pain + fever — acute prostatitis pattern",
      });
    }

    // Epididymo-orchitis / testicular concern
    if (s.testicularPain || s.scroatalSwelling) {
      diagnoses.push({
        name: "Epididymitis / orchitis — rule out torsion",
        icd10: "N45.1",
        confidence: "possible",
        basis: "Scrotal pain/swelling — torsion must be excluded urgently if acute onset",
      });
    }

    // Urethritis / STD
    if (s.urethralDischarge && s.stdRisk) {
      diagnoses.push({
        name: "Urethritis (gonococcal / non-gonococcal)",
        icd10: "N34.1",
        confidence: "probable",
        basis: "Urethral discharge + STD risk",
      });
    }
  }

  return diagnoses;
}

// ─── STEP 4: UA RESULT INTERPRETER ────────────────────────────────────────

export interface UAResult {
  obtained: boolean;
  leukocytes: boolean;
  blood: boolean;
  nitrites: boolean;
  protein: boolean;
  glucose: boolean;
  pregnancyNegative: boolean | null;
  wbc: number | null;          // cells/hpf
}

export function interpretUA(ua: UAResult, symptoms: any): {
  consistent: boolean;
  colonizationOnly: boolean;
  note: string;
} {
  if (!ua.obtained) {
    return { consistent: false, colonizationOnly: false, note: "UA not yet obtained" };
  }

  const symptomatic = symptoms.dysuria || symptoms.frequency || symptoms.urgency;

  if (ua.leukocytes && symptomatic) {
    return {
      consistent: true,
      colonizationOnly: false,
      note: "UA consistent with UTI — leukocytes with symptoms",
    };
  }

  if (ua.leukocytes && !symptomatic) {
    return {
      consistent: false,
      colonizationOnly: true,
      note: "UA positive but no symptoms — likely colonization. No antibiotic indicated unless pregnant.",
    };
  }

  if (!ua.leukocytes && symptomatic) {
    return {
      consistent: false,
      colonizationOnly: false,
      note: "Symptoms without UA leukocytes — consider STD, urethritis, or early UTI. Check culture.",
    };
  }

  return {
    consistent: false,
    colonizationOnly: false,
    note: "UA negative, symptoms absent — low probability of UTI",
  };
}

// ─── STEP 5: ANTIBIOTIC DECISION ──────────────────────────────────────────

export function buildAntibioticPlan(
  diagnoses: GUDiagnosis[],
  anatomy: AnatomicalProfile,
  state: ClinicalState,
  ua: UAResult,
  priorCultureSensitivity: string | null
): GUAntibioticPlan {
  const s = state.symptoms;
  const h = state.history;
  const allergies = h.medicationAllergies ?? [];
  const hasMacrobidAllergy = allergies.some(a =>
    a.toLowerCase().includes("nitrofurantoin") || a.toLowerCase().includes("macrobid")
  );
  const hasSulfa = allergies.some(a =>
    a.toLowerCase().includes("sulfa") || a.toLowerCase().includes("bactrim")
  );

  const hasPID = diagnoses.some(d => d.name.includes("Pelvic inflammatory disease"));
  const hasUTI = diagnoses.some(d =>
    d.name.includes("Urinary tract") && d.confidence !== "ruled_out"
  );
  const hasBV = diagnoses.some(d => d.name.includes("Bacterial vaginosis"));
  const hasYeast = diagnoses.some(d => d.name.includes("candidiasis"));
  const hasHerpes = diagnoses.some(d => d.name.includes("Herpes"));
  const hasColonizationOnly = diagnoses.some(d => d.name.includes("colonization"));

  // Colonization — stewardship note
  if (hasColonizationOnly && !anatomy.pregnant) {
    return {
      primaryAntibiotic: null,
      additionalAntibiotics: [],
      treatmentForColonizationOnly: true,
      stewardshipNote: "There is no medical indication for antibiotics here. This is colonization — bacteria present without infection. Treating colonization leads to resistance and does not help the patient. If the patient insists after counseling, document shared decision-making.",
      cultureGuidance: "Culture sent — no antibiotic pending. Call patient only if culture shows significant growth with symptoms.",
    };
  }

  const antibiotics: AntibioticChoice[] = [];
  let primary: AntibioticChoice | null = null;

  // ── UTI ANTIBIOTIC ────────────────────────────────────────────────────
  if (hasUTI) {
    // Use prior culture sensitivity if available
    if (priorCultureSensitivity?.includes("macrobid") || priorCultureSensitivity?.includes("nitrofurantoin")) {
      if (!hasMacrobidAllergy && !s.pyelonephritis) {
        primary = {
          name: "Nitrofurantoin (Macrobid)",
          dose: "100mg twice daily",
          duration: "5 days",
          indication: "UTI — culture-guided (prior sensitivity confirmed)",
          alternativeIf: "Pyelonephritis or renal insufficiency — use ciprofloxacin instead",
        };
      }
    }

    // Standard first-line selection
    if (!primary) {
      if (!hasMacrobidAllergy && !s.pyelonephritis && !s.severeCVAtenderness) {
        primary = {
          name: "Nitrofurantoin (Macrobid)",
          dose: "100mg twice daily",
          duration: "5 days",
          indication: "Uncomplicated UTI — first line",
          alternativeIf: "Renal insufficiency (CrCl <30), pyelonephritis",
        };
      } else if (!hasSulfa && !s.pyelonephritis) {
        primary = {
          name: "Trimethoprim-sulfamethoxazole (Bactrim DS)",
          dose: "1 tablet twice daily",
          duration: "3 days",
          indication: "UTI — second line (Macrobid contraindicated)",
          alternativeIf: "Sulfa allergy, pregnancy",
        };
      } else {
        // Ciprofloxacin — reserved for complicated/pyelonephritis
        primary = {
          name: "Ciprofloxacin",
          dose: "500mg twice daily",
          duration: s.pyelonephritis ? "7 days" : "3 days",
          indication: "UTI — prior antibiotics failed or pyelonephritis suspected",
          alternativeIf: null,
        };
      }
    }

    // Prior antibiotics that didn't work — escalate
    if (h.priorAntibioticsFailed?.includes("bactrim") || h.priorAntibioticsFailed?.includes("keflex")) {
      primary = {
        name: "Ciprofloxacin",
        dose: "500mg twice daily",
        duration: "5 days",
        indication: "UTI — Bactrim/Keflex previously failed, escalating",
        alternativeIf: null,
      };
    }

    // Pyridium for pain
    antibiotics.push({
      name: "Phenazopyridine (Pyridium)",
      dose: "200mg three times daily with food",
      duration: "2 days maximum",
      indication: "Urinary pain relief — symptomatic only",
      alternativeIf: null,
    });
  }

  // ── PID ANTIBIOTICS ───────────────────────────────────────────────────
  if (hasPID) {
    // CDC 2021 PID guidelines: outpatient = ceftriaxone IM + doxy + metro
    antibiotics.push({
      name: "Ceftriaxone 500mg IM",
      dose: "500mg intramuscular injection (single dose)",
      duration: "Once in office",
      indication: "PID — CDC-recommended coverage for gonorrhea",
      alternativeIf: "Beta-lactam allergy — discuss with gynecology",
    });
    antibiotics.push({
      name: "Doxycycline",
      dose: "100mg twice daily",
      duration: "14 days",
      indication: "PID — coverage for chlamydia and anaerobes",
      alternativeIf: "Pregnancy — use azithromycin instead",
    });
    antibiotics.push({
      name: "Metronidazole (Flagyl)",
      dose: "500mg twice daily",
      duration: "14 days",
      indication: "PID — anaerobic coverage (BV-associated organisms)",
      alternativeIf: null,
    });
  }

  // ── BV ────────────────────────────────────────────────────────────────
  if (hasBV && !hasPID) {
    // PID already includes metronidazole
    antibiotics.push({
      name: "Metronidazole (Flagyl)",
      dose: "500mg twice daily OR 0.75% vaginal gel once daily",
      duration: "7 days",
      indication: "Bacterial vaginosis",
      alternativeIf: "Clindamycin cream 2% if metronidazole allergy/intolerance",
    });
  }

  // ── YEAST ─────────────────────────────────────────────────────────────
  if (hasYeast) {
    antibiotics.push({
      name: "Fluconazole (Diflucan)",
      dose: "150mg single dose",
      duration: "Once",
      indication: "Vulvovaginal candidiasis",
      alternativeIf: "Topical clotrimazole or miconazole cream as alternative",
    });
  }

  // ── HERPES ───────────────────────────────────────────────────────────
  if (hasHerpes) {
    antibiotics.push({
      name: "Valacyclovir (Valtrex)",
      dose: "1g twice daily (primary outbreak) or 500mg twice daily (recurrence)",
      duration: "7–10 days (primary) or 3–5 days (recurrence)",
      indication: "Herpes simplex genitalis — suppresses outbreak",
      alternativeIf: null,
    });
  }

  return {
    primaryAntibiotic: primary,
    additionalAntibiotics: antibiotics,
    treatmentForColonizationOnly: false,
    stewardshipNote: null,
    cultureGuidance: "Culture sent. Call patient in 3–5 days if culture shows resistance or different organism. Patient should call if no improvement in 3 days.",
  };
}

// ─── STEP 6: STD EVALUATION ───────────────────────────────────────────────
/**
 * Three indications for STD treatment (Dr. Thomas's framework):
 *   1. High-risk or concerning exposure
 *   2. Positive labs
 *   3. Consistent symptoms
 */
export function evaluateSTDRisk(
  state: ClinicalState,
  anatomy: AnatomicalProfile
): STDEvaluation {
  const s = state.symptoms;
  const h = state.history;
  const indications: STDIndication[] = [];
  const counseling: string[] = [];

  if (h.stdRisk || h.newSexualPartner || h.multipleSexualPartners) {
    indications.push("high_risk_exposure");
    counseling.push("STD risk identified — comprehensive screening recommended");
  }
  if (s.purulentDischarge || s.urethralDischarge || s.genitalLesions || s.vaginalDischarge) {
    indications.push("consistent_symptoms");
    counseling.push("Symptoms consistent with possible STD — testing and empiric treatment offered");
  }
  if (h.positiveSTDLabs) {
    indications.push("positive_labs");
  }

  const swabPanel: string[] = [];
  const bloodTests: string[] = [];

  if (indications.length > 0) {
    // Universal STD swab panel
    swabPanel.push("Gonorrhea (NAAT)");
    swabPanel.push("Chlamydia (NAAT)");
    swabPanel.push("Trichomonas (NAAT)");
    if (anatomy.hasVagina) {
      swabPanel.push("Bacterial vaginosis (Amsel / Whiff)");
      swabPanel.push("Candida");
    }

    // Blood panel
    bloodTests.push("HIV (4th generation Ag/Ab)");
    bloodTests.push("Syphilis RPR");
    bloodTests.push("Hepatitis B surface Ag");
    bloodTests.push("Hepatitis C Ab");

    // Partner treatment counseling
    counseling.push("BV can be treated like an STD — all partners should be treated if recurrent");
    counseling.push("Gonorrhea and chlamydia — all partners within 60 days should be tested or treated");
    counseling.push("PrEP counseling if HIV risk present");
  }

  // STD treatment
  const stdTreatment: AntibioticChoice[] = [];
  if (indications.includes("high_risk_exposure") || indications.includes("consistent_symptoms")) {
    // Empiric treatment for GC/chlamydia if indicated
    if (s.purulentDischarge || s.stdRisk) {
      stdTreatment.push({
        name: "Ceftriaxone 500mg IM + Doxycycline 100mg BID x 7d",
        dose: "Ceftriaxone 500mg IM single dose + Doxycycline 100mg BID",
        duration: "7 days (doxycycline)",
        indication: "Empiric GC/chlamydia treatment — 3 indications met",
        alternativeIf: "Beta-lactam allergy: azithromycin 2g single dose (GC resistance concern — discuss)",
      });
    }
  }

  return {
    riskPresent: indications.length > 0,
    indicationsForTreatment: indications,
    swabPanel,
    bloodTests,
    treatmentOffered: stdTreatment,
    counselingPoints: counseling,
  };
}

// ─── STEP 7: RECURRENCE PLAN ──────────────────────────────────────────────

export function buildRecurrencePlan(state: ClinicalState, anatomy: AnatomicalProfile): RecurrencePlan | null {
  const h = state.history;

  const isRecurrent = (h.utiFrequency === "monthly" ||
    h.utiFrequency === "every_other_month" ||
    (h.utisInPast6Months ?? 0) >= 2 ||
    (h.utisInPast12Months ?? 0) >= 3);

  if (!isRecurrent) return null;

  const recommendations: string[] = [
    "Drink plenty of water — adequate hydration dilutes bacteria",
    "Wipe front to back after bowel movements",
    "Avoid spermicides — disrupts urogenital flora",
    "Urinate after sexual intercourse — flushes bacteria from urethra",
    "Cranberry products — modest evidence for prevention, safe to use",
  ];

  if (anatomy.hasVagina || anatomy.hasCervix) {
    recommendations.push("Consider D-mannose supplement — some evidence for E. coli UTI prevention");
  }

  if (anatomy.postmenopausal || (h.age >= 40 && anatomy.hasVagina)) {
    recommendations.push("Topical vaginal estrogen — restores urogenital mucosa in peri/postmenopausal women, reduces UTI recurrence significantly");
  }

  const suppressiveTherapy = (h.utisInPast6Months ?? 0) >= 3;
  if (suppressiveTherapy) {
    recommendations.push("Suppressive antibiotic therapy — low-dose nightly Macrobid or post-coital single dose for frequent recurrences");
    recommendations.push("Methenamine (Hiprex) — urinary antiseptic, not an antibiotic, good for frequent recurrences");
  }

  return {
    isRecurrent: true,
    recommendations,
    suppressiveTherapy,
    referralRecommended: (h.utisInPast6Months ?? 0) >= 3 || (h.utisInPast12Months ?? 0) >= 4,
    referralSpecialty: anatomy.hasUterus ? "urogynecology" : "urology",
  };
}

// ─── STEP 8: PATIENT COUNSELING TEXT ──────────────────────────────────────

export function buildGUCounseling(
  diagnoses: GUDiagnosis[],
  anatomy: AnatomicalProfile,
  stdEval: STDEvaluation,
  abxPlan: GUAntibioticPlan,
  recurrence: RecurrencePlan | null
): string[] {
  const points: string[] = [];

  const hasPID = diagnoses.some(d => d.name.includes("Pelvic inflammatory"));
  const hasBV = diagnoses.some(d => d.name.includes("vaginosis"));

  if (abxPlan.treatmentForColonizationOnly) {
    points.push("Your urine test shows bacteria, but you don't have the symptoms of an infection. This is called colonization — it's very common and does not need treatment. Treating it with antibiotics when there's no infection can actually make things worse by creating resistant bacteria.");
  }

  if (hasPID) {
    points.push("The tenderness I felt on your internal exam is a sign of pelvic inflammatory disease. This is a serious infection that, if untreated, can affect your fertility. You need antibiotics now and follow-up with gynecology. The treatment is an injection today plus two antibiotic pills for two weeks.");
    points.push("If you develop fever, severe pain, or feel much worse — go to the ER.");
  }

  if (hasBV) {
    points.push("Bacterial vaginosis is an imbalance in your vaginal flora, not a traditional STD — but it can be passed back and forth between partners. If you keep getting it, treating all partners can help break the cycle.");
  }

  if (recurrence?.isRecurrent) {
    points.push(`You've been getting these frequently. The four things that help most: drink plenty of water, wipe front to back, avoid spermicides, and urinate after sex. This is not about cleanliness — it's about anatomy.`);
    if (recurrence.referralRecommended) {
      points.push(`Given how frequently you're getting these, I'd like to refer you to ${recurrence.referralSpecialty} to look at the bigger picture and discuss suppressive therapy.`);
    }
  }

  return points;
}

// ─── RETURN PRECAUTIONS ───────────────────────────────────────────────────

export function buildGUReturnPrecautions(
  diagnoses: GUDiagnosis[],
  anatomy: AnatomicalProfile
): string[] {
  const precautions: string[] = [
    "Return or call if: no improvement in urinary symptoms within 3 days",
    "ER immediately if: fever develops, severe back or flank pain, chills/shaking, vomiting",
  ];

  if (anatomy.hasUterus || anatomy.hasOvaries) {
    precautions.push("ER if: severe abdominal pain, heavy vaginal bleeding");
  }

  if (anatomy.pregnant) {
    precautions.push("ER immediately if: any vaginal bleeding, severe pain, fever, decreased fetal movement");
  }

  const hasPID = diagnoses.some(d => d.name.includes("Pelvic inflammatory"));
  if (hasPID) {
    precautions.push("Follow up with gynecology within 72 hours — PID requires close monitoring");
    precautions.push("ER if: fever, severe pain worsening, unable to keep medications down");
  }

  return precautions;
}

// ─── MASTER SYNTHESIZER ──────────────────────────────────────────────────

export function assessGU(
  state: ClinicalState,
  ua: UAResult,
  priorCultureSensitivity: string | null = null
): GUAssessment {
  const anatomy = buildAnatomicalProfile(state);
  const erTriggers = checkERTriggers(state, anatomy);

  if (erTriggers.length > 0) {
    return {
      disposition: "er_now",
      anatomicalProfile: anatomy,
      primaryDiagnoses: [],
      antibioticPlan: { primaryAntibiotic: null, additionalAntibiotics: [], treatmentForColonizationOnly: false, stewardshipNote: null, cultureGuidance: "" },
      stdEvaluation: { riskPresent: false, indicationsForTreatment: [], swabPanel: [], bloodTests: [], treatmentOffered: [], counselingPoints: [] },
      workup: ["Urgent transfer — see ER triggers"],
      recurrencePlan: null,
      patientCounseling: [],
      erTriggers,
      returnPrecautions: [],
    };
  }

  const diagnoses = buildGUDifferential(state, anatomy, ua);
  const abxPlan = buildAntibioticPlan(diagnoses, anatomy, state, ua, priorCultureSensitivity);
  const stdEval = evaluateSTDRisk(state, anatomy);
  const recurrence = buildRecurrencePlan(state, anatomy);
  const counseling = buildGUCounseling(diagnoses, anatomy, stdEval, abxPlan, recurrence);
  const returnPrec = buildGUReturnPrecautions(diagnoses, anatomy);

  const hasPID = diagnoses.some(d => d.name.includes("Pelvic inflammatory"));
  const hasTesticularConcern = diagnoses.some(d => d.name.includes("orchitis"));

  const disposition: GUDisposition =
    hasPID ? "gyn_today" :
    hasTesticularConcern ? "ent_urology_today" :
    abxPlan.treatmentForColonizationOnly ? "watchful_waiting" :
    stdEval.riskPresent ? "std_workup" : "treat_and_follow";

  const workup: string[] = ["Urinalysis + culture", "Urine pregnancy test"];
  if (anatomy.hasVagina && state.symptoms?.vaginalDischarge) workup.push("Vaginal swab — GC/chlamydia/trich/yeast/BV");
  if (stdEval.riskPresent) workup.push(...stdEval.swabPanel, ...stdEval.bloodTests.map(t => `Blood: ${t}`));
  if (hasPID) workup.push("Pelvic ultrasound (gynecology to order)", "CBC + CRP");

  return {
    disposition,
    anatomicalProfile: anatomy,
    primaryDiagnoses: diagnoses,
    antibioticPlan: abxPlan,
    stdEvaluation: stdEval,
    workup,
    recurrencePlan: recurrence,
    patientCounseling: counseling,
    erTriggers: [],
    returnPrecautions: returnPrec,
  };
}
