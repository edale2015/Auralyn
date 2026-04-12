import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage, type FlowQuestion } from "./storage";
import { correlationMiddleware } from "./middleware/correlation";
import { buildDomainRouters } from "./routes/domainIndex";
import { getEntFluRules } from "./rules/entFluRuleLoader";
import { generateToken, generateCode, expiresAtMinutes, INTAKE_EXPIRY_MINUTES, BASE_URL } from "./intake/intakeAuth";
import { syncClinicalSheets, importEntMedications, importEntDiagnoses } from "./admin/sheetsAgent";
import { runTests, applyPatch } from "./admin/devAgent";
import { getMedicationCatalog, pickBestMed, medMatchesAllergy, shouldAvoidMedByModifiers, getMedsForDiagnoses, isFirstLine } from "./meds/medCatalog";
import { getDiagnosisCatalog } from "./meds/diagnosisCatalog";
import {
  routeFlowFromText,
  flowFromMenuChoice,
  menuText,
  getAnswersObj,
  setMenuState,
  isAwaitingChoice,
  isAwaitingOtherText,
  isMenuResetCommand,
  isStatusCommand,
  buildRouterAudit,
  setRouterAudit,
  type RouterAudit,
} from "./flows/whatsappFlowRouter";
import { sendWhatsAppMessage } from "./whatsapp/send";
import { computeProposalGeneric } from "./rules/computeProposalGeneric";
import { requireProviderAuth } from "./auth";
import { validateTwilioSignature } from "./whatsapp/twilioValidation";
import { isStaffCommand, handleStaffCommand } from "./whatsapp/staffCommands";
import { getConversationLog, detectFrictionSignals } from "./traces/conversationLog";
import { randomUUID } from "crypto";

// Get flow questions - tries Google Sheets first, falls back to hardcoded
async function getFlowQuestions(flowId: string): Promise<FlowQuestion[]> {
  // Only try Sheets if SHEETS_SPREADSHEET_ID is configured
  if (process.env.SHEETS_SPREADSHEET_ID) {
    try {
      const questions = await storage.getFlowQuestions(flowId);
      if (questions.length > 0) {
        return questions;
      }
      // If Sheets returns empty, fall through to hardcoded with warning
      console.warn(`[FlowLoader] Sheets returned 0 questions for ${flowId}, using hardcoded fallback (${HARDCODED_ENT_FLU_FLOW.length} questions)`);
    } catch (error) {
      console.warn(`[FlowLoader] Failed to load questions from Sheets for ${flowId}, using hardcoded fallback:`, error);
    }
  } else {
    console.log(`[FlowLoader] SHEETS_SPREADSHEET_ID not configured, using hardcoded flow`);
  }
  
  // Fallback to hardcoded flow
  return HARDCODED_ENT_FLU_FLOW;
}

// Hardcoded ENT Flu Triage Questionnaire Flow (fallback when Sheets not configured)
const HARDCODED_ENT_FLU_FLOW: FlowQuestion[] = [
  { id: "RF_SOB", text: "Trouble breathing at rest? (yes/no)", type: "yesno", required: true },
  { id: "RF_CP", text: "Chest pain or pressure? (yes/no)", type: "yesno", required: true },
  { id: "RF_NEURO", text: "Confusion, fainting, or severe weakness? (yes/no)", type: "yesno", required: true },
  { id: "RF_DEHY", text: "Unable to keep fluids down or signs of dehydration? (yes/no)", type: "yesno", required: true },
  { id: "ONSET_DAYS", text: "How many days since symptoms started? (number)", type: "number", required: true },
  { id: "FEVER", text: "Fever ≥100.4°F / 38°C? (yes/no)", type: "yesno", required: true },
  { id: "ACHES", text: "Body aches or marked fatigue? (yes/no)", type: "yesno", required: true },
  { id: "COUGH", text: "Cough? (yes/no)", type: "yesno", required: true },
  { id: "SORE_THROAT", text: "Sore throat? (yes/no)", type: "yesno", required: true },
  { id: "CONGESTION", text: "Nasal congestion or sinus pressure? (yes/no)", type: "yesno", required: true },
  { id: "EAR_PAIN", text: "Ear pain or fullness? (yes/no)", type: "yesno", required: true },
  { id: "GI", text: "Nausea or diarrhea? (yes/no)", type: "yesno", required: true },
  { id: "PREGNANT", text: "Are you pregnant? (yes/no)", type: "yesno", required: true },
  { id: "HTN", text: "Do you have high blood pressure? (yes/no)", type: "yesno", required: true },
  { id: "ANXIETY", text: "Anxiety/panic or very sensitive to stimulants? (yes/no)", type: "yesno", required: true },
  { id: "SSRI", text: "Do you take an SSRI/SNRI antidepressant? (yes/no)", type: "yesno", required: true },
  { id: "ALLERGIES", text: "Any medication allergies? (short answer)", type: "text", required: true },
  { id: "COVID_POS", text: "COVID test positive? (yes/no/not tested)", type: "choice", required: true },
  { id: "FLU_POS", text: "Flu test positive? (yes/no/not tested)", type: "choice", required: true }
];

// Helper function to parse patient answers
// Returns null if the answer is invalid for the type (caller should re-prompt)
function parseAnswer(type: string, raw: string): boolean | number | string | null {
  const v = raw.toLowerCase().trim();
  if (type === "yesno") return ["yes", "y", "yeah", "yep", "true", "1"].includes(v);
  if (type === "number") {
    const num = Number(v);
    if (isNaN(num) || v === "") return null; // Invalid input, need to re-prompt
    return num;
  }
  if (type === "choice") {
    if (v.startsWith("y")) return "yes";
    if (v.startsWith("n")) return "no";
    return "not tested";
  }
  return raw.trim();
}

// Normalize allergies from free-text input
function normalizeAllergies(raw: any): string[] {
  if (!raw) return [];
  const s = String(raw).trim();
  if (!s) return [];
  return s.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
}

// Build modifiers object from answers for medication pruning and audit
function buildModifiersFromAnswers(a: Record<string, any>) {
  const onsetDays = typeof a.ONSET_DAYS === "number" ? a.ONSET_DAYS : Number(a.ONSET_DAYS);

  return {
    age: a.AGE ?? null,
    sex_assigned_at_birth: a.SEX_ASSIGNED_AT_BIRTH ?? null,
    gender_identity: a.GENDER_IDENTITY ?? null,
    pregnant: !!a.PREGNANT,
    htn: !!a.HTN,
    anxiety: !!a.ANXIETY,
    ssri_snri: !!a.SSRI,
    allergies: normalizeAllergies(a.ALLERGIES),
    smoking_status: a.SMOKING_STATUS ?? null,
    alcohol_use: a.ALCOHOL_USE ?? null,
    drug_use: a.DRUG_USE ?? null,
    family_history: a.FAMILY_HISTORY ?? null,
    pmh: a.PMH ?? null,
    current_meds: a.CURRENT_MEDS ?? null,
    onset_days: Number.isFinite(onsetDays) ? onsetDays : null,
  };
}

// Compute medical proposal based on answers (now uses sheet-driven rules with fallback)
async function computeProposal(a: Record<string, any>) {
  const defaults = {
    TAMIFLU_MAX_DAYS: 2,
    TAMIFLU_REQUIRE_FEVER: true,
    TAMIFLU_REQUIRE_ACHES: true,
    RED_FLAG_DISPOSITION: "urgent_or_ed",
    NON_RED_FLAG_DISPOSITION: "self_care_with_precautions",
    PROPOSE_COVID_TEST: true,
    PROPOSE_FLU_TEST_IF_TAMIFLU: true,
    RULES_VERSION: "default",
  };

  let rules: Record<string, any> = {};
  try {
    rules = await getEntFluRules();
  } catch (e) {
    console.warn("[ENT_FLU_RULES] load failed, using defaults:", (e as any)?.message || e);
  }

  const tamifluMaxDays = rules.TAMIFLU_MAX_DAYS ?? defaults.TAMIFLU_MAX_DAYS;
  const requireFever = rules.TAMIFLU_REQUIRE_FEVER ?? defaults.TAMIFLU_REQUIRE_FEVER;
  const requireAches = rules.TAMIFLU_REQUIRE_ACHES ?? defaults.TAMIFLU_REQUIRE_ACHES;
  const redFlagDisposition = rules.RED_FLAG_DISPOSITION ?? defaults.RED_FLAG_DISPOSITION;
  const nonRedFlagDisposition = rules.NON_RED_FLAG_DISPOSITION ?? defaults.NON_RED_FLAG_DISPOSITION;
  const proposeCovidTest = rules.PROPOSE_COVID_TEST ?? defaults.PROPOSE_COVID_TEST;
  const proposeFluTestIfTamiflu = rules.PROPOSE_FLU_TEST_IF_TAMIFLU ?? defaults.PROPOSE_FLU_TEST_IF_TAMIFLU;
  const rulesVersion = rules.RULES_VERSION ?? defaults.RULES_VERSION;

  const redFlag =
    !!a.RF_SOB || !!a.RF_CP || !!a.RF_NEURO || !!a.RF_DEHY;

  const onsetDays = typeof a.ONSET_DAYS === "number" ? a.ONSET_DAYS : null;

  const feverOk = requireFever ? !!a.FEVER : true;
  const achesOk = requireAches ? !!a.ACHES : true;

  const tamifluEligible =
    !redFlag &&
    onsetDays !== null &&
    onsetDays <= tamifluMaxDays &&
    feverOk &&
    achesOk;

  const paxlovidFlag = a.COVID_POS === "yes";

  // Base med candidates (deterministic)
  const meds: string[] = ["acetaminophen", "saline nasal spray", "guaifenesin"];
  const avoid: string[] = [];

  // Legacy avoid list (backwards compatibility)
  if (a.SSRI === true) avoid.push("dextromethorphan");
  if (a.HTN === true || a.ANXIETY === true) avoid.push("pseudoephedrine/phenylephrine");
  if (a.PREGNANT === true) avoid.push("ibuprofen/NSAIDs");

  // Proposal-level arrays for diagnosis labels and indication clusters
  const diagnosis_labels: string[] = Array.isArray((a as any).diagnosis_labels) ? (a as any).diagnosis_labels : [];
  const pushUnique = (arr: string[], v: string) => {
    if (!v) return;
    if (!arr.includes(v)) arr.push(v);
  };

  // New: structured meds using catalog + modifiers
  const modifiers = buildModifiersFromAnswers(a);
  const allergies = modifiers.allergies || [];

  let medsDetailed: any[] = [];
  let avoidDetailed: any[] = [];

  try {
    const catalog = await getMedicationCatalog();
    const byName = catalog.byName;

    for (const m of meds) {
      const rows = byName.get(String(m).trim().toLowerCase()) || [];
      if (!rows.length) {
        medsDetailed.push({ name: m, source: "fallback", note: "Not found in CLINICAL_MEDICATIONS yet." });
        continue;
      }
      const picked = pickBestMed(rows);

      // allergy check
      if (medMatchesAllergy(picked.Medication_Name, allergies)) {
        avoidDetailed.push({
          name: picked.Medication_Name,
          reason: "Allergy match",
          details: picked.Contraindications || "",
        });
        continue;
      }

      const avoidReason = shouldAvoidMedByModifiers(picked.Medication_Name, modifiers);
      if (avoidReason) {
        avoidDetailed.push({
          name: picked.Medication_Name,
          reason: avoidReason,
          details: picked.Pregnancy_Considerations || picked.Contraindications || "",
        });
        continue;
      }

      medsDetailed.push({
        name: picked.Medication_Name,
        group: picked.Medication_Group || "",
        route: picked.Route || "",
        pregnancy: picked.Pregnancy_Considerations || "",
        contraindications: picked.Contraindications || "",
        interactions: picked.Key_Interactions || "",
        notes: picked.Notes || "",
      });
    }

    // Add structured avoids from legacy avoid list
    for (const av of avoid) {
      avoidDetailed.push({ name: av, reason: "Rule-based avoid", details: "" });
    }
  } catch (e: any) {
    console.warn("[CLINICAL_MEDICATIONS] lookup failed, continuing with legacy meds/avoid:", e?.message || e);
  }

  const disposition = redFlag ? redFlagDisposition : nonRedFlagDisposition;

  const tests: string[] = [];
  if (proposeCovidTest) tests.push("COVID antigen/NAAT (if available)");
  if (tamifluEligible && proposeFluTestIfTamiflu) tests.push("Influenza test (if available)");

  // Assign diagnosis_ids based on clinical presentation
  const diagnosis_ids: string[] = [];
  let presentation_label = "Flu-like illness";

  if (redFlag) {
    diagnosis_ids.push("ENT_RED_FLAG");
    presentation_label = "Red flag symptoms requiring urgent evaluation";
  } else if (paxlovidFlag) {
    diagnosis_ids.push("ENT_COVID_POSITIVE");
    presentation_label = "COVID-19 positive, flu-like symptoms";
  } else if (tamifluEligible) {
    diagnosis_ids.push("ENT_FLU_LIKE_TAMIFLU_ELIGIBLE");
    presentation_label = "Flu-like illness, Tamiflu eligible";
  } else {
    diagnosis_ids.push("ENT_VIRAL_URI");
    presentation_label = "Viral upper respiratory infection";
  }

  // Add secondary diagnoses based on symptoms
  if (a.SORE_THROAT) diagnosis_ids.push("ENT_PHARYNGITIS");
  if (a.COUGH) diagnosis_ids.push("ENT_ACUTE_BRONCHITIS");
  if (a.CONGESTION) diagnosis_ids.push("ENT_RHINOSINUSITIS");

  // ----------------------------
  // THRUSH BRANCH (ENT_THROAT)
  // Uses Indications_Cluster fallback: "Oral thrush cluster"
  // ----------------------------
  const whiteWisps = !!(a as any).TH_WHITE_WISPS;
  const thrushConcern = !!(a as any).TH_THRUSH_CONCERN;
  const steroidsRecent = !!(a as any).TH_STEROIDS_RECENT;
  const immunocomp = !!(a as any).TH_IMMUNOCOMPROMISED || !!modifiers.immunocompromised;

  if (whiteWisps || thrushConcern) {
    if (steroidsRecent || immunocomp || thrushConcern) {
      pushUnique(diagnosis_labels, "Possible oral thrush");
      diagnosis_ids.push("ENT_ORAL_THRUSH");
    }
  }

  // --- Diagnosis_ID-first med selection + Indications_Cluster fallback ---
  const DIAGNOSIS_TO_CLUSTER: Record<string, string[]> = {
    "ent_flu_like_tamiflu_eligible": ["flu", "influenza", "viral uri", "flu-like"],
    "ent_pharyngitis": ["pharyngitis", "sore throat", "strep pharyngitis cluster"],
    "ent_acute_bronchitis": ["bronchitis", "cough", "acute bronchitis"],
    "ent_viral_uri": ["viral uri", "uri", "common cold", "upper respiratory"],
    "ent_rhinosinusitis": ["sinusitis", "rhinosinusitis", "congestion", "sinus", "aom/sinusitis cluster"],
    "ent_red_flag": ["urgent", "red flag"],
    "ent_covid_positive": ["covid", "covid-19", "sars-cov-2"],
    "ent_oral_thrush": ["oral thrush cluster", "thrush", "candidiasis"],
  };

  const indicationClusters: string[] = [];
  for (const dx of diagnosis_ids) {
    const clusters = DIAGNOSIS_TO_CLUSTER[dx.toLowerCase()] || [];
    indicationClusters.push(...clusters);
  }

  let finalMedsDetailed: any[] = [];
  let finalAvoidDetailed: any[] = [];

  try {
    const catalog = await getMedicationCatalog();
    const candidateRows = getMedsForDiagnoses(catalog, diagnosis_ids, indicationClusters);
    console.log(`[MedPrioritization] Diagnosis_ID-first: ${candidateRows.length} candidates for ${diagnosis_ids.join(", ")}`);

    for (const picked of candidateRows) {
      if (medMatchesAllergy(picked.Medication_Name, allergies)) {
        finalAvoidDetailed.push({
          name: picked.Medication_Name,
          reason: "Allergy match",
          details: picked.Contraindications || "",
        });
        continue;
      }

      const avoidReason = shouldAvoidMedByModifiers(picked.Medication_Name, modifiers);
      if (avoidReason) {
        finalAvoidDetailed.push({
          name: picked.Medication_Name,
          reason: avoidReason,
          details: picked.Pregnancy_Considerations || picked.Contraindications || "",
        });
        continue;
      }

      finalMedsDetailed.push({
        name: picked.Medication_Name,
        source: "catalog",
        firstLine: isFirstLine(picked),
        indication: picked.Indications_Cluster || "",
        group: picked.Medication_Group || "",
        route: picked.Route || "",
        adultDose: picked.Adult_Dose || "",
        adultMaxDose: picked.Adult_Max_Dose || "",
        pediatricDose: picked.Pediatric_Dose || "",
        pregnancy: picked.Pregnancy_Considerations || "",
        contraindications: picked.Contraindications || "",
        interactions: picked.Key_Interactions || "",
        notes: picked.Notes || "",
      });
    }

    // Fallback: add symptomatic meds not already in list
    const seenNames = new Set(finalMedsDetailed.map((m: any) => m.name.toLowerCase()));
    const byName = catalog.byName;
    for (const m of meds) {
      const key = String(m).trim().toLowerCase();
      if (seenNames.has(key)) continue;
      const rows = byName.get(key) || [];
      if (!rows.length) {
        finalMedsDetailed.push({ name: m, source: "fallback", note: "Not found in CLINICAL_MEDICATIONS yet." });
        continue;
      }
      const picked2 = pickBestMed(rows);
      if (medMatchesAllergy(picked2.Medication_Name, allergies)) {
        finalAvoidDetailed.push({ name: picked2.Medication_Name, reason: "Allergy match", details: picked2.Contraindications || "" });
        continue;
      }
      const avoidReason2 = shouldAvoidMedByModifiers(picked2.Medication_Name, modifiers);
      if (avoidReason2) {
        finalAvoidDetailed.push({ name: picked2.Medication_Name, reason: avoidReason2, details: picked2.Pregnancy_Considerations || "" });
        continue;
      }
      finalMedsDetailed.push({
        name: picked2.Medication_Name,
        source: "catalog",
        firstLine: isFirstLine(picked2),
        indication: picked2.Indications_Cluster || "",
        group: picked2.Medication_Group || "",
        route: picked2.Route || "",
        adultDose: picked2.Adult_Dose || "",
        pregnancy: picked2.Pregnancy_Considerations || "",
        contraindications: picked2.Contraindications || "",
        notes: picked2.Notes || "",
      });
    }
  } catch (e: any) {
    console.warn("[MedPrioritization] Failed:", e?.message || e);
    finalMedsDetailed = medsDetailed;
    finalAvoidDetailed = avoidDetailed;
  }

  return { 
    redFlag, tamifluEligible, paxlovidFlag, 
    meds, avoid, 
    medsDetailed: finalMedsDetailed, 
    avoidDetailed: finalAvoidDetailed, 
    tests, disposition, rulesVersion,
    diagnosis_ids, presentation_label,
    diagnosis_labels, indicationClusters
  };
}

// Build physician summary for review
function buildPhysicianSummary(a: Record<string, any>, p: Awaited<ReturnType<typeof computeProposal>>) {
  const onset = a.ONSET_DAYS ?? "unknown";
  const positives = [
    a.FEVER ? "fever" : null,
    a.ACHES ? "aches/fatigue" : null,
    a.COUGH ? "cough" : null,
    a.SORE_THROAT ? "sore throat" : null,
    a.CONGESTION ? "congestion/sinus pressure" : null,
    a.EAR_PAIN ? "ear pain" : null,
    a.GI ? "GI symptoms" : null,
  ].filter(Boolean);

  return {
    hpi: `Onset: ${onset} days. Positives: ${positives.join(", ") || "none specified"}.`,
    redFlags: p.redFlag ? "Present" : "None reported",
    proposedDisposition: p.disposition,
    proposedTests: p.tests,
    meds: p.meds,
    avoid: p.avoid,
    flags: {
      tamifluEligible: p.tamifluEligible,
      paxlovidFlag: p.paxlovidFlag
    }
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Correlation ID — must be first so all routes have req.correlationId and x-correlation-id header
  app.use(correlationMiddleware);

  // Increase body limit for potential audio payloads
  app.use((req, res, next) => {
    if (req.headers['content-type']?.includes('application/json')) {
      // Already handled by express.json()
    }
    next();
  });

  // Auth routes
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;
      
      const physician = await storage.getPhysicianByUsername(username);
      if (!physician) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      // Simple password check (in production, use proper hashing)
      if (physician.password !== password) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      // Don't send password back
      const { password: _, ...safePhysician } = physician;
      res.json(safePhysician);
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Encounters API - List by filter (provider-only)
  app.get("/api/encounters/pending", requireProviderAuth, async (req: Request, res: Response) => {
    try {
      const encounters = await storage.getEncountersByStatus("pending_review");
      
      // Enhance with patient phone and computed redFlag for triage-ready view
      const enhanced = await Promise.all(
        encounters.map(async (enc) => {
          const patient = enc.patientId ? await storage.getPatient(enc.patientId) : null;
          const proposal = enc.proposal ? (typeof enc.proposal === "string" ? JSON.parse(enc.proposal) : enc.proposal) : null;
          const answers = enc.answers ? (typeof enc.answers === "string" ? JSON.parse(enc.answers) : enc.answers) : {};
          const ra = answers?.__routerAudit || {};
          
          return {
            ...enc,
            patientPhone: patient?.phoneNumber || null,
            redFlag: proposal?.redFlag ?? false,
            urgencyLevel: enc.urgencyLevel || (proposal?.redFlag ? "urgent" : "routine"),
            routerAudit: answers?.__routerAudit || null,
            routerReason: ra.routerReason || "",
            routerPickedFlowId: ra.routerPickedFlowId || "",
            routerTextSnippet: ra.routerTextSnippet || "",
            confidence: ra.confidence || "medium",
            timestamp: enc.createdAt,
          };
        })
      );
      
      // Confidence rank helper: low=0, medium=1, high=2 (low first for staff review)
      const confRank = (c: string) => (c === "low" ? 0 : c === "medium" ? 1 : 2);
      
      // Sort by redFlag desc, urgencyLevel urgent first, low confidence first, then newest
      enhanced.sort((a, b) => {
        if (a.redFlag !== b.redFlag) return a.redFlag ? -1 : 1;
        if (a.urgencyLevel !== b.urgencyLevel) {
          if (a.urgencyLevel === "urgent") return -1;
          if (b.urgencyLevel === "urgent") return 1;
        }
        const confDiff = confRank(a.confidence) - confRank(b.confidence);
        if (confDiff !== 0) return confDiff;
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });
      
      res.json(enhanced);
    } catch (error) {
      console.error("Error fetching pending encounters:", error);
      res.status(500).json({ error: "Failed to fetch encounters" });
    }
  });

  app.get("/api/encounters/approved", requireProviderAuth, async (req: Request, res: Response) => {
    try {
      const encounters = await storage.getEncountersByStatus("approved");
      res.json(encounters);
    } catch (error) {
      console.error("Error fetching approved encounters:", error);
      res.status(500).json({ error: "Failed to fetch encounters" });
    }
  });

  app.get("/api/encounters/rejected", requireProviderAuth, async (req: Request, res: Response) => {
    try {
      const encounters = await storage.getEncountersByStatus("rejected");
      res.json(encounters);
    } catch (error) {
      console.error("Error fetching rejected encounters:", error);
      res.status(500).json({ error: "Failed to fetch encounters" });
    }
  });

  app.get("/api/encounters/all", requireProviderAuth, async (req: Request, res: Response) => {
    try {
      const encounters = await storage.getEncountersByStatus(undefined);
      
      // Enhance with patient phone and computed redFlag for triage-ready view
      const enhanced = await Promise.all(
        encounters.map(async (enc) => {
          const patient = enc.patientId ? await storage.getPatient(enc.patientId) : null;
          const proposal = enc.proposal ? (typeof enc.proposal === "string" ? JSON.parse(enc.proposal) : enc.proposal) : null;
          const answers = enc.answers ? (typeof enc.answers === "string" ? JSON.parse(enc.answers) : enc.answers) : {};
          const ra = answers?.__routerAudit || {};
          
          return {
            ...enc,
            patientPhone: patient?.phoneNumber || null,
            redFlag: proposal?.redFlag ?? false,
            urgencyLevel: enc.urgencyLevel || (proposal?.redFlag ? "urgent" : "routine"),
            routerAudit: answers?.__routerAudit || null,
            routerReason: ra.routerReason || "",
            routerPickedFlowId: ra.routerPickedFlowId || "",
            routerTextSnippet: ra.routerTextSnippet || "",
            confidence: ra.confidence || "medium",
            timestamp: enc.createdAt,
          };
        })
      );
      
      // Confidence rank helper: low=0, medium=1, high=2 (low first for staff review)
      const confRank = (c: string) => (c === "low" ? 0 : c === "medium" ? 1 : 2);
      
      // Sort by redFlag desc, urgencyLevel urgent first, low confidence first, then newest
      enhanced.sort((a, b) => {
        if (a.redFlag !== b.redFlag) return a.redFlag ? -1 : 1;
        if (a.urgencyLevel !== b.urgencyLevel) {
          if (a.urgencyLevel === "urgent") return -1;
          if (b.urgencyLevel === "urgent") return 1;
        }
        const confDiff = confRank(a.confidence) - confRank(b.confidence);
        if (confDiff !== 0) return confDiff;
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });
      
      res.json(enhanced);
    } catch (error) {
      console.error("Error fetching all encounters:", error);
      res.status(500).json({ error: "Failed to fetch encounters" });
    }
  });

  app.get("/api/encounters/:id", requireProviderAuth, async (req: Request, res: Response) => {
    try {
      const idParam = req.params.id;
      const id = parseInt(typeof idParam === "string" ? idParam : "0");
      const encounter = await storage.getEncounterWithDetails(id);
      
      if (!encounter) {
        return res.status(404).json({ error: "Encounter not found" });
      }

      // --- Add diagnosisDetails for physician view + note generation ---
      try {
        // Parse proposal if it's a string
        const proposal = typeof (encounter as any).proposal === 'string' 
          ? JSON.parse((encounter as any).proposal) 
          : (encounter as any).proposal;
        
        const diagnosisIds: string[] =
          proposal?.diagnosis_ids ||
          (encounter as any)?.diagnosis_ids ||
          [];

        if (Array.isArray(diagnosisIds) && diagnosisIds.length > 0) {
          const catalog = await getDiagnosisCatalog();

          const details = diagnosisIds.map((dxId: string) => {
            const row = catalog.get(dxId.toLowerCase());

            return (
              row || {
                Diagnosis_ID: dxId,
                Diagnosis_Name: "(Not found in CLINICAL_DIAGNOSES)",
                System: "ENT",
              }
            );
          });

          (encounter as any).diagnosisDetails = details;
        } else {
          (encounter as any).diagnosisDetails = [];
        }
      } catch (dxErr) {
        console.warn("Diagnosis catalog lookup failed:", dxErr);
        (encounter as any).diagnosisDetails = [];
      }
      
      res.json(encounter);
    } catch (error) {
      console.error("Error fetching encounter:", error);
      res.status(500).json({ error: "Failed to fetch encounter" });
    }
  });

  app.post("/api/encounters/:id/approve", requireProviderAuth, async (req: Request, res: Response) => {
    try {
      const idParam = req.params.id;
      const id = parseInt(typeof idParam === "string" ? idParam : "0");
      const { physicianId, physicianDiagnosis, physicianDisposition, physicianNotes } = req.body;
      
      const encounter = await storage.updateEncounter(id, {
        status: "approved",
        physicianId,
        physicianDiagnosis,
        physicianDisposition,
        physicianNotes,
        approvedAt: new Date(),
      });
      
      if (!encounter) {
        return res.status(404).json({ error: "Encounter not found" });
      }
      
      // Approve all pending orders for this encounter
      const orders = await storage.getOrdersByEncounter(id);
      for (const order of orders) {
        if (!order.physicianApproved) {
          await storage.updateOrder(order.id, {
            physicianApproved: true,
            physicianId,
            status: "approved",
            approvedAt: new Date(),
          });
        }
      }
      
      // Send confirmation message to patient via WhatsApp
      const patient = await storage.getPatient(encounter.patientId);
      if (patient) {
        const message = `Your case has been reviewed by a physician. Disposition: ${physicianDisposition}. ${physicianNotes ? `Notes: ${physicianNotes}` : ""} Please follow up as directed.`;
        
        try {
          await sendWhatsAppMessage(patient.phoneNumber, message);
          await storage.createMessage({
            patientId: patient.id,
            encounterId: id,
            direction: "outbound",
            messageBody: message,
          });
        } catch (twilioError) {
          console.error("Failed to send WhatsApp message:", twilioError);
          // Don't fail the approval if WhatsApp fails
        }
      }
      
      res.json(encounter);
    } catch (error) {
      console.error("Error approving encounter:", error);
      res.status(500).json({ error: "Failed to approve encounter" });
    }
  });

  app.post("/api/encounters/:id/reject", requireProviderAuth, async (req: Request, res: Response) => {
    try {
      const idParam = req.params.id;
      const id = parseInt(typeof idParam === "string" ? idParam : "0");
      const { physicianId, reasonCode, note } = req.body;

      if (!reasonCode) {
        return res.status(400).json({ error: "Missing reasonCode" });
      }

      const encounter = await storage.updateEncounter(id, {
        status: "rejected",
        physicianId,
        physicianNotes: `[Rejected: ${reasonCode}] ${note || ""}`.trim(),
        approvedAt: new Date(),
      });

      if (!encounter) {
        return res.status(404).json({ error: "Encounter not found" });
      }

      const patient = await storage.getPatient(encounter.patientId);
      if (patient) {
        const message = `Your case has been reviewed by a physician. Unfortunately, this case could not be approved at this time. Reason: ${reasonCode}.${note ? ` ${note}` : ""} Please follow up with your primary care provider.`;

        try {
          await sendWhatsAppMessage(patient.phoneNumber, message);
          await storage.createMessage({
            patientId: patient.id,
            encounterId: id,
            direction: "outbound",
            messageBody: message,
          });
        } catch (twilioError) {
          console.error("Failed to send WhatsApp rejection message:", twilioError);
        }
      }

      res.json(encounter);
    } catch (error) {
      console.error("Error rejecting encounter:", error);
      res.status(500).json({ error: "Failed to reject encounter" });
    }
  });

  app.post("/api/encounters/:id/request-info", requireProviderAuth, async (req: Request, res: Response) => {
    try {
      const idParam = req.params.id;
      const id = parseInt(typeof idParam === "string" ? idParam : "0");
      const encounter = await storage.getEncounter(id);
      
      if (!encounter) {
        return res.status(404).json({ error: "Encounter not found" });
      }
      
      const patient = await storage.getPatient(encounter.patientId);
      if (!patient) {
        return res.status(404).json({ error: "Patient not found" });
      }
      
      const message = "The physician reviewing your case needs additional information. Can you provide more details about your symptoms?";
      
      try {
        await sendWhatsAppMessage(patient.phoneNumber, message);
        await storage.createMessage({
          patientId: patient.id,
          encounterId: id,
          direction: "outbound",
          messageBody: message,
        });
      } catch (twilioError) {
        console.error("Failed to send WhatsApp message:", twilioError);
        return res.status(500).json({ error: "Failed to send message to patient" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error requesting info:", error);
      res.status(500).json({ error: "Failed to request info" });
    }
  });

  // === Physician Quick Actions ===
  
  // Resend intake link to patient
  app.post("/api/review/:encounterId/resend-link", requireProviderAuth, async (req: Request, res: Response) => {
    try {
      const encounterId = parseInt(req.params.encounterId);
      const enc = await storage.getEncounter(encounterId);
      if (!enc) return res.status(404).json({ ok: false, error: "Encounter not found" });

      const patient = await storage.getPatient(enc.patientId);
      const phone = patient?.phoneNumber;
      if (!phone) return res.status(400).json({ ok: false, error: "Missing patient phone" });

      const token = enc.intakeToken;
      const code = enc.intakeCode;
      const exp = enc.intakeExpiresAt ? Number(enc.intakeExpiresAt) : 0;

      if (!token || !code || Date.now() > exp) {
        return res.status(400).json({ ok: false, error: "No valid intake link/code to resend" });
      }

      const link = `${BASE_URL}/intake/${token}`;
      await sendWhatsAppMessage(phone, `Resending your secure intake link:\n${link}\nCode: ${code}`);
      res.json({ ok: true });
    } catch (e: any) {
      console.error("Error resending link:", e);
      res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // Change encounter flow (staff override via dashboard)
  app.post("/api/review/:encounterId/set-flow", requireProviderAuth, async (req: Request, res: Response) => {
    try {
      const encounterId = parseInt(req.params.encounterId);
      const { flowId } = req.body || {};
      if (!flowId) return res.status(400).json({ ok: false, error: "Missing flowId" });

      const qs = await getFlowQuestions(flowId);
      if (!qs || qs.length === 0) return res.status(400).json({ ok: false, error: "Unknown flowId (no questions)" });

      const enc = await storage.getEncounter(encounterId);
      if (!enc) return res.status(404).json({ ok: false, error: "Encounter not found" });

      let answersObj: any = {};
      try { answersObj = enc.answers ? JSON.parse(enc.answers as string) : {}; } catch { answersObj = {}; }
      setRouterAudit(answersObj, {
        routerReason: "keyword",
        routerPickedFlowId: flowId,
        routerPickedSystem: "STAFF_OVERRIDE",
        routerTextSnippet: `/api/review set-flow ${flowId}`.slice(0, 60),
      });

      await storage.updateEncounter(encounterId, { flowId, flowIndex: 0, answers: JSON.stringify(answersObj) } as any);
      res.json({ ok: true });
    } catch (e: any) {
      console.error("Error setting flow:", e);
      res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // Send clarification request to patient
  app.post("/api/review/:encounterId/request-clarification", requireProviderAuth, async (req: Request, res: Response) => {
    try {
      const encounterId = parseInt(req.params.encounterId);
      const { message } = req.body || {};
      if (!message) return res.status(400).json({ ok: false, error: "Missing message" });

      const enc = await storage.getEncounter(encounterId);
      if (!enc) return res.status(404).json({ ok: false, error: "Encounter not found" });

      const patient = await storage.getPatient(enc.patientId);
      const phone = patient?.phoneNumber;
      if (!phone) return res.status(400).json({ ok: false, error: "Missing patient phone" });

      await sendWhatsAppMessage(phone, message);
      await storage.createMessage({
        patientId: patient.id,
        encounterId: encounterId,
        direction: "outbound",
        messageBody: message,
      });
      res.json({ ok: true });
    } catch (e: any) {
      console.error("Error requesting clarification:", e);
      res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // Twilio WhatsApp Webhook - Deterministic ENT Flu Triage Flow
  app.post("/api/webhooks/whatsapp", validateTwilioSignature, async (req: Request, res: Response) => {
    try {
      // If USE_ORCHESTRATOR_WHATSAPP=1, delegate to unified orchestrator
      if (process.env.USE_ORCHESTRATOR_WHATSAPP === "1") {
        const { From, Body, MessageSid } = req.body;
        res.set("Content-Type", "text/xml");
        res.send("<Response></Response>");

        try {
          const { processMessage, sendReply, buildConversationId } = await import("./channels");
          const event = {
            channel: "whatsapp" as const,
            externalUserId: From,
            chatId: From,
            text: Body.trim(),
            timestamp: new Date().toISOString(),
            messageId: MessageSid || `wa_${Date.now()}`,
            rawSignatureVerified: true,
            media: [] as Array<{ url: string; mimeType?: string; filename?: string }>,
          };
          const result = await processMessage(event);
          if (!result.dedupSkipped) {
            const convId = buildConversationId("whatsapp", From);
            for (const reply of result.replies) {
              await sendReply(convId, reply);
            }
          }
        } catch (orchErr: any) {
          console.error("[WhatsApp] Orchestrator processing error:", orchErr?.message || orchErr);
        }
        return;
      }

      const { From, Body, MessageSid } = req.body;
      const phoneNumber = From; // Format: whatsapp:+1234567890
      const msg = Body.trim();
      
      console.log(`Received WhatsApp message from ${phoneNumber}: ${msg}`);
      
      // Staff-only test commands (!scenario, !trace, !case, !explain)
      const normalizePhone = (p: string) => p.replace(/^whatsapp:/, "").replace(/\s+/g, "").trim();
      const STAFF_NUMS = (process.env.STAFF_WHATSAPP_NUMBERS || "")
        .split(",").map(s => normalizePhone(s)).filter(Boolean);
      const isStaff = STAFF_NUMS.includes(normalizePhone(phoneNumber));
      if (isStaff && isStaffCommand(msg)) {
        const { checkStaffCommandAccess } = await import("./whatsapp/staffGate");
        const access = checkStaffCommandAccess(normalizePhone(phoneNumber));
        let reply: string;
        if (!access.allowed) {
          reply = access.reason || "Command not available.";
        } else {
          reply = await handleStaffCommand(msg);
        }
        await sendWhatsAppMessage(phoneNumber, reply);
        res.set("Content-Type", "text/xml");
        return res.send("<Response></Response>");
      }
      
      // Get or create patient
      let patient = await storage.getPatientByPhone(phoneNumber);
      if (!patient) {
        patient = await storage.createPatient({
          phoneNumber,
          name: null,
        });
      }
      
      // Get or create active encounter
      let encounter = await storage.getActiveEncounterByPatient(patient.id);
      if (!encounter) {
        // Create encounter with minimal defaults; flow will be chosen below
        encounter = await storage.createEncounter({
          patientId: patient.id,
          status: "in_progress",
          system: "ENT",
          complaint: "FLU_LIKE_URI",
          specialty: "ENT",
          flowId: "ENT_FLU_LIKE_V1",
          flowIndex: 0,
          answers: JSON.stringify({}),
        });
      }

      // Parse answers JSON so we can store menu state without schema changes
      let answersObj = getAnswersObj(encounter.answers);

      // Handle menu reset command (menu/change/restart/switch/topic)
      if (isMenuResetCommand(msg)) {
        const updated = setMenuState(answersObj, { awaitingChoice: true });
        await storage.updateEncounter(encounter.id, { answers: JSON.stringify(updated) } as any);
        await sendWhatsAppMessage(phoneNumber, menuText());
        return res.status(200).send("ok");
      }

      // Handle status command (link/code) - resend existing link or start fresh
      if (isStatusCommand(msg)) {
        const now = new Date();
        const tokenValid = encounter.intakeToken && encounter.intakeExpiresAt && new Date(encounter.intakeExpiresAt) > now;
        
        if (tokenValid) {
          const intakeLink = `${BASE_URL}/intake/${encounter.intakeToken}`;
          await sendWhatsAppMessage(
            phoneNumber,
            `Here's your intake link again:\n${intakeLink}\n\nCode: ${encounter.intakeCode}\n\nExpires in ${Math.round((new Date(encounter.intakeExpiresAt!).getTime() - now.getTime()) / 60000)} minutes.`
          );
        } else {
          const intakeToken = generateToken();
          const intakeCode = generateCode();
          const intakeExpiresAt = expiresAtMinutes(INTAKE_EXPIRY_MINUTES);
          
          await storage.updateEncounter(encounter.id, {
            intakeToken,
            intakeCode,
            intakeExpiresAt,
            flowIndex: 1,
          } as any);
          
          const intakeLink = `${BASE_URL}/intake/${intakeToken}`;
          await sendWhatsAppMessage(
            phoneNumber,
            `Here's a fresh intake link:\n${intakeLink}\n\nCode: ${intakeCode}\n\nValid for 30 minutes.`
          );
        }
        return res.status(200).send("ok");
      }

      // Staff-only /flow override command (reuses isStaff from above)
      const isFlowCmd = msg.trim().toLowerCase().startsWith("/flow ");
      const requestedFlowId = isFlowCmd ? msg.trim().split(/\s+/)[1]?.toUpperCase() : null;

      if (isStaff && requestedFlowId) {
        try {
          const flowQuestions = await getFlowQuestions(requestedFlowId);
          if (!flowQuestions || (Array.isArray(flowQuestions) && flowQuestions.length === 0)) {
            await sendWhatsAppMessage(phoneNumber, `Unknown flowId or no questions found: ${requestedFlowId}`);
            return res.status(200).send("ok");
          }

          // Update flow on encounter with staff override audit
          setRouterAudit(answersObj, {
            routerReason: "keyword",
            routerPickedFlowId: requestedFlowId,
            routerPickedSystem: "STAFF_OVERRIDE",
            routerTextSnippet: msg.slice(0, 60),
          });

          await storage.updateEncounter(encounter.id, {
            flowId: requestedFlowId,
            flowIndex: 0,
            answers: JSON.stringify(answersObj),
            status: "in_progress",
          } as any);

          // Resend link if still valid
          const refreshed = await storage.getEncounter(encounter.id) as typeof encounter;
          const hasToken = Boolean(refreshed.intakeToken);
          const hasCode = Boolean(refreshed.intakeCode);
          const exp = refreshed.intakeExpiresAt ? new Date(refreshed.intakeExpiresAt).getTime() : 0;

          if (hasToken && hasCode && exp && Date.now() < exp) {
            const link = `${BASE_URL}/intake/${refreshed.intakeToken}`;
            await sendWhatsAppMessage(phoneNumber, `Flow overridden to ${requestedFlowId}. Resending link:\n${link}\nCode: ${refreshed.intakeCode}`);
            return res.status(200).send("ok");
          }

          await sendWhatsAppMessage(phoneNumber, `Flow overridden to ${requestedFlowId}. Patient should text LINK to resend intake link/code if needed.`);
          return res.status(200).send("ok");

        } catch (e: any) {
          await sendWhatsAppMessage(phoneNumber, `Could not set flow to ${requestedFlowId}: ${e?.message || String(e)}`);
          return res.status(200).send("ok");
        }
      }

      // Handle "hi/start/help" with menu (if not already selected)
      const lower = msg.toLowerCase();
      const isGreeting =
        lower === "hi" || lower === "hello" || lower === "start" || lower === "help";

      // If awaiting "Other" description (option 6), route using keyword
      if (isAwaitingOtherText(answersObj)) {
        const pick = routeFlowFromText(msg);
        const cleared = setMenuState(answersObj, { awaitingChoice: false, awaitingOtherText: false });
        setRouterAudit(cleared, {
          routerReason: "other_text",
          routerPickedFlowId: pick.flowId,
          routerPickedSystem: pick.system,
          routerTextSnippet: msg.slice(0, 60),
        });

        await storage.updateEncounter(encounter.id, {
          system: pick.system,
          complaint: pick.complaint,
          specialty: pick.specialty,
          flowId: pick.flowId,
          flowIndex: 0,
          answers: JSON.stringify(cleared),
          status: "in_progress",
        } as any);

        encounter = await storage.getEncounter(encounter.id) as typeof encounter;
        answersObj = getAnswersObj(encounter.answers);
      }

      // If we are waiting for a menu choice, interpret it
      if (isAwaitingChoice(answersObj)) {
        const pick = flowFromMenuChoice(msg);
        if (!pick) {
          // If they typed 6 or something else, set awaitingOtherText and prompt them to describe symptoms
          const cleared = setMenuState(answersObj, { awaitingChoice: false, awaitingOtherText: true });
          await storage.updateEncounter(encounter.id, { answers: JSON.stringify(cleared) } as any);

          await sendWhatsAppMessage(phoneNumber, "Okay. Please describe your main symptom in one sentence.");
          return res.status(200).send("ok");
        }

        // Set chosen flow on encounter with router audit
        const cleared = setMenuState(answersObj, { awaitingChoice: false });
        setRouterAudit(cleared, {
          routerReason: "menu",
          routerPickedFlowId: pick.flowId,
          routerPickedSystem: pick.system,
          routerTextSnippet: msg.slice(0, 60),
        });
        await storage.updateEncounter(encounter.id, {
          system: pick.system,
          complaint: pick.complaint,
          specialty: pick.specialty,
          flowId: pick.flowId,
          flowIndex: 0,
          answers: JSON.stringify(cleared),
          status: "in_progress",
        } as any);

        encounter = await storage.getEncounter(encounter.id) as typeof encounter;
        answersObj = getAnswersObj(encounter.answers);
      }

      // If greeting and we don't have a meaningful flow chosen yet, show menu
      if (isGreeting && (encounter.flowIndex === 0 || !encounter.flowId || encounter.flowId === "ENT_FLU_LIKE_V1")) {
        // Mark awaiting choice and send menu
        const updated = setMenuState(answersObj, { awaitingChoice: true });
        await storage.updateEncounter(encounter.id, { answers: JSON.stringify(updated) } as any);

        await sendWhatsAppMessage(phoneNumber, menuText());
        return res.status(200).send("ok");
      }

      // If we still have default ENT flow OR no system, try keyword routing from free text
      if (!encounter.system || !encounter.flowId || (encounter.flowId === "ENT_FLU_LIKE_V1" && encounter.flowIndex === 0)) {
        const pick = routeFlowFromText(msg);
        setRouterAudit(answersObj, {
          routerReason: "keyword",
          routerPickedFlowId: pick.flowId,
          routerPickedSystem: pick.system,
          routerTextSnippet: msg.slice(0, 60),
        });

        // If router picks EMERG or TRAUMA, we still use the web intake link, but send immediate warning
        await storage.updateEncounter(encounter.id, {
          system: pick.system,
          complaint: pick.complaint,
          specialty: pick.specialty,
          flowId: pick.flowId,
          flowIndex: 0,
          status: "in_progress",
          answers: JSON.stringify(answersObj),
        } as any);

        encounter = await storage.getEncounter(encounter.id) as typeof encounter;
      }

      // Immediate ED warning for EMERG/TRAUMA picks
      if (encounter.flowId === "EMERG_CRITICAL_V1") {
        await sendWhatsAppMessage(phoneNumber, "This may be an emergency. If someone is unresponsive, not breathing, or bleeding heavily, call 911 now.");
      }
      if (encounter.flowId === "TRAUMA_MAJOR_V1") {
        await sendWhatsAppMessage(phoneNumber, "This may require urgent emergency evaluation. If severe pain, head injury, bleeding, or confusion, go to the ER now.");
      }

      // High-risk flow ED warnings
      if (encounter.flowId === "UROGYN_VAGINAL_BLEEDING_V1") {
        await sendWhatsAppMessage(phoneNumber, "If you may be pregnant and have bleeding with pain, dizziness, or heavy bleeding, go to the ER now.");
      }
      if (encounter.flowId === "UROGYN_TESTICULAR_PAIN_V1") {
        await sendWhatsAppMessage(phoneNumber, "Sudden severe testicular pain can be an emergency (torsion). If severe/sudden, go to the ER now.");
      }
      if (encounter.flowId === "OPHTH_VISION_LOSS_V1") {
        await sendWhatsAppMessage(phoneNumber, "Sudden vision loss can be an emergency. If sudden or worsening, go to the ER now.");
      }
      if (encounter.flowId === "NEURO_WEAKNESS_V1") {
        await sendWhatsAppMessage(phoneNumber, "New weakness, facial droop, or trouble speaking can be a stroke. Call 911 or go to the ER now.");
      }
      
      // Save incoming message
      await storage.createMessage({
        patientId: patient.id,
        encounterId: encounter.id,
        direction: "inbound",
        messageBody: msg,
        messageSid: MessageSid,
      });
      
      // Log inbound conversation turn
      const turnTimestamp = new Date().toISOString();
      getConversationLog().log({
        id: randomUUID(),
        caseId: encounter.id?.toString(),
        encounterId: encounter.id?.toString(),
        channel: "whatsapp",
        sender: "patient",
        messageText: msg,
        timestamp: turnTimestamp,
        frictionSignals: detectFrictionSignals(msg),
      }).catch(err => console.warn("[ConvLog] Failed to log inbound:", err?.message));
      
      // Get current flow state
      const flowIndex = encounter.flowIndex ?? 0;
      const answers: Record<string, any> = encounter.answers ? JSON.parse(encounter.answers) : {};
      
      // Load flow questions dynamically (tries Sheets first, falls back to hardcoded)
      const flowId = encounter.flowId || "ENT_FLU_LIKE_V1";
      const flow = await getFlowQuestions(flowId);
      
      console.log(`Flow state: index=${flowIndex}, answers=${JSON.stringify(answers)}, using ${flow.length} questions`);
      
      let responseMessage: string;
      
      // If this is the first message (flowIndex = 0), send the intake link+code
      if (flowIndex === 0) {
        // Generate secure intake token and code
        const intakeToken = generateToken();
        const intakeCode = generateCode();
        const intakeExpiresAt = expiresAtMinutes(INTAKE_EXPIRY_MINUTES);
        
        // Store token+code on encounter
        await storage.updateEncounter(encounter.id, {
          intakeToken,
          intakeCode,
          intakeExpiresAt,
          flowIndex: 1, // Mark as started
        } as any);
        
        const intakeLink = `${BASE_URL}/intake/${intakeToken}`;
        
        responseMessage = `Welcome to Med Scribe Triage.\n\nTap the secure link to answer a few quick questions:\n${intakeLink}\n\nAccess code: ${intakeCode}\n\nIf you can't open the link, reply QUESTIONS to answer here.\nTo resend the link, reply LINK.\n\n⚠️ If you develop trouble breathing, chest pain, confusion, severe bleeding, or can't keep fluids down, seek urgent care or go to the ER now.`;
      } else if (msg.toLowerCase() === "questions" || msg.toLowerCase() === "question") {
        // Patient requested fallback to WhatsApp Q&A
        const firstQuestion = flow[0];
        responseMessage = `OK, I'll ask you the questions here.\n\n${firstQuestion.text}`;
        
        // Reset to start Q&A flow
        await storage.updateEncounter(encounter.id, {
          flowIndex: 1,
          intakeToken: null,
          intakeCode: null,
          intakeExpiresAt: null,
        } as any);
      } else {
        // Parse the answer for the previous question
        const prevQuestion = flow[flowIndex - 1];
        const parsed = parseAnswer(prevQuestion.type, msg);
        
        // If parsing failed (invalid input), re-prompt the same question
        if (parsed === null) {
          console.log(`Invalid answer for ${prevQuestion.id}: "${msg}", re-prompting`);
          responseMessage = `I didn't understand that response. Please enter a valid number.\n\n${prevQuestion.text}`;
          
          // Don't advance the flow, just re-send the same question
          await storage.createMessage({
            patientId: patient.id,
            encounterId: encounter.id,
            direction: "outbound",
            messageBody: responseMessage,
          });
          
          try {
            await sendWhatsAppMessage(phoneNumber, responseMessage);
          } catch (twilioError) {
            console.error("Failed to send WhatsApp response:", twilioError);
          }
          
          res.set("Content-Type", "text/xml");
          res.send("<Response></Response>");
          return;
        }
        
        answers[prevQuestion.id] = parsed;
        console.log(`Saved answer for ${prevQuestion.id}: ${parsed}`);
        
        // Check if we've completed all questions
        if (flowIndex >= flow.length) {
          // Compute proposal and finalize
          const proposal = await computeProposal(answers);
          const physicianSummary = buildPhysicianSummary(answers, proposal);
          const modifiers = buildModifiersFromAnswers(answers);
          
          // Determine urgency based on red flags
          const urgencyLevel = proposal.redFlag ? "urgent" : "routine";
          
          await storage.updateEncounter(encounter.id, {
            answers: JSON.stringify(answers),
            proposal: JSON.stringify(proposal),
            physicianSummary: JSON.stringify(physicianSummary),
            modifiers: JSON.stringify(modifiers),
            status: "pending_review",
            urgencyLevel,
            chiefComplaint: "Flu-like symptoms / URI",
            aiDiagnosis: physicianSummary.hpi,
            aiDisposition: proposal.disposition,
          });
          
          // Create suggested orders
          for (const test of proposal.tests) {
            await storage.createOrder({
              encounterId: encounter.id,
              orderType: "lab",
              description: test,
              aiGenerated: true,
            });
          }
          
          // Create medication recommendations
          if (proposal.meds.length > 0) {
            await storage.createOrder({
              encounterId: encounter.id,
              orderType: "prescription",
              description: `Suggested OTC: ${proposal.meds.join(", ")}`,
              aiGenerated: true,
            });
          }
          
          if (proposal.avoid.length > 0) {
            await storage.createOrder({
              encounterId: encounter.id,
              orderType: "prescription",
              description: `AVOID: ${proposal.avoid.join(", ")}`,
              aiGenerated: true,
            });
          }
          
          responseMessage = proposal.redFlag
            ? "Thank you. Your symptoms include red flags that need urgent attention. Please seek care at an urgent care or emergency room. A physician will also review your case."
            : "Thank you for completing the assessment. Your case has been sent to a physician for review. If you develop trouble breathing, chest pain, confusion, or can't keep fluids down, seek urgent care/ER immediately.";
        } else {
          // Ask the next question
          const nextQuestion = flow[flowIndex];
          responseMessage = nextQuestion.text;
          
          await storage.updateEncounter(encounter.id, {
            flowIndex: flowIndex + 1,
            answers: JSON.stringify(answers),
          });
        }
      }
      
      // Save and send response
      await storage.createMessage({
        patientId: patient.id,
        encounterId: encounter.id,
        direction: "outbound",
        messageBody: responseMessage,
      });
      
      // Log outbound conversation turn
      getConversationLog().log({
        id: randomUUID(),
        caseId: encounter.id?.toString(),
        encounterId: encounter.id?.toString(),
        channel: "whatsapp",
        sender: "agent",
        messageText: responseMessage,
        timestamp: new Date().toISOString(),
        llmUsed: false,
        frictionSignals: [],
      }).catch(err => console.warn("[ConvLog] Failed to log outbound:", err?.message));
      
      try {
        await sendWhatsAppMessage(phoneNumber, responseMessage);
      } catch (twilioError) {
        console.error("Failed to send WhatsApp response:", twilioError);
      }
      
      // Respond to Twilio webhook
      res.set("Content-Type", "text/xml");
      res.send("<Response></Response>");
    } catch (error) {
      console.error("WhatsApp webhook error:", error);
      res.set("Content-Type", "text/xml");
      res.send("<Response></Response>");
    }
  });

  // Test endpoint to simulate WhatsApp message using deterministic flow (provider-only)
  app.post("/api/test/simulate-message", requireProviderAuth, async (req: Request, res: Response) => {
    try {
      // Accept both "from"/"body" (WhatsApp style) or "phoneNumber"/"message" (legacy)
      const phoneNumber = req.body.from || req.body.phoneNumber;
      const message = req.body.body || req.body.message;
      
      if (!phoneNumber || !message) {
        return res.status(400).json({ error: "Missing from/phoneNumber or body/message" });
      }
      
      const msg = message.trim();
      
      // Simulate the webhook request
      const fakeFrom = phoneNumber.startsWith("whatsapp:") ? phoneNumber : `whatsapp:${phoneNumber}`;
      
      // Get or create patient
      let patient = await storage.getPatientByPhone(fakeFrom);
      if (!patient) {
        patient = await storage.createPatient({
          phoneNumber: fakeFrom,
          name: null,
        });
      }
      
      // Get or create active encounter
      let encounter = await storage.getActiveEncounterByPatient(patient.id);
      if (!encounter) {
        encounter = await storage.createEncounter({
          patientId: patient.id,
          status: "in_progress",
          system: "ENT",
          complaint: "FLU_LIKE_URI",
          specialty: "ENT",
          flowId: "ENT_FLU_LIKE_V1",
          flowIndex: 0,
          answers: JSON.stringify({}),
        });
      }

      // Parse answers JSON for menu state
      let answersObj = getAnswersObj(encounter.answers);

      // Handle menu reset command (menu/change/restart/switch/topic)
      if (isMenuResetCommand(msg)) {
        const updated = setMenuState(answersObj, { awaitingChoice: true });
        await storage.updateEncounter(encounter.id, { answers: JSON.stringify(updated) } as any);
        return res.json({
          message: menuText(),
          encounterId: encounter.id,
          flowId: encounter.flowId,
          awaitingChoice: true,
          command: "menu_reset",
        });
      }

      // Handle status command (link/code) - resend existing link or start fresh
      if (isStatusCommand(msg)) {
        const now = new Date();
        const tokenValid = encounter.intakeToken && encounter.intakeExpiresAt && new Date(encounter.intakeExpiresAt) > now;
        
        if (tokenValid) {
          const intakeLink = `${BASE_URL}/intake/${encounter.intakeToken}`;
          const expiresIn = Math.round((new Date(encounter.intakeExpiresAt!).getTime() - now.getTime()) / 60000);
          return res.json({
            message: `Here's your intake link again:\n${intakeLink}\n\nCode: ${encounter.intakeCode}\n\nExpires in ${expiresIn} minutes.`,
            encounterId: encounter.id,
            flowId: encounter.flowId,
            command: "status_resend",
            intakeToken: encounter.intakeToken,
            intakeCode: encounter.intakeCode,
          });
        } else {
          const intakeToken = generateToken();
          const intakeCode = generateCode();
          const intakeExpiresAt = expiresAtMinutes(INTAKE_EXPIRY_MINUTES);
          
          await storage.updateEncounter(encounter.id, {
            intakeToken,
            intakeCode,
            intakeExpiresAt,
            flowIndex: 1,
          } as any);
          
          const intakeLink = `${BASE_URL}/intake/${intakeToken}`;
          return res.json({
            message: `Here's a fresh intake link:\n${intakeLink}\n\nCode: ${intakeCode}\n\nValid for 30 minutes.`,
            encounterId: encounter.id,
            flowId: encounter.flowId,
            command: "status_fresh",
            intakeToken,
            intakeCode,
          });
        }
      }

      // Handle greeting/menu flow
      const lower = msg.toLowerCase();
      const isGreeting =
        lower === "hi" || lower === "hello" || lower === "start" || lower === "help";

      // If awaiting "Other" description (option 6), route using keyword
      if (isAwaitingOtherText(answersObj)) {
        const pick = routeFlowFromText(msg);
        const cleared = setMenuState(answersObj, { awaitingChoice: false, awaitingOtherText: false });
        setRouterAudit(cleared, {
          routerReason: "other_text",
          routerPickedFlowId: pick.flowId,
          routerPickedSystem: pick.system,
          routerTextSnippet: msg.slice(0, 60),
        });

        await storage.updateEncounter(encounter.id, {
          system: pick.system,
          complaint: pick.complaint,
          specialty: pick.specialty,
          flowId: pick.flowId,
          flowIndex: 0,
          answers: JSON.stringify(cleared),
          status: "in_progress",
        } as any);

        encounter = await storage.getEncounter(encounter.id) as typeof encounter;
        answersObj = getAnswersObj(encounter.answers);
      }

      // If we are waiting for a menu choice, interpret it
      if (isAwaitingChoice(answersObj)) {
        const pick = flowFromMenuChoice(msg);
        if (!pick) {
          // Set awaitingOtherText for option 6
          const cleared = setMenuState(answersObj, { awaitingChoice: false, awaitingOtherText: true });
          await storage.updateEncounter(encounter.id, { answers: JSON.stringify(cleared) } as any);
          return res.json({
            message: "Okay. Please describe your main symptom in one sentence.",
            encounterId: encounter.id,
            flowId: encounter.flowId,
            awaitingOtherText: true,
          });
        }

        // Set chosen flow on encounter with router audit
        const cleared = setMenuState(answersObj, { awaitingChoice: false });
        setRouterAudit(cleared, {
          routerReason: "menu",
          routerPickedFlowId: pick.flowId,
          routerPickedSystem: pick.system,
          routerTextSnippet: msg.slice(0, 60),
        });
        await storage.updateEncounter(encounter.id, {
          system: pick.system,
          complaint: pick.complaint,
          specialty: pick.specialty,
          flowId: pick.flowId,
          flowIndex: 0,
          answers: JSON.stringify(cleared),
          status: "in_progress",
        } as any);

        encounter = await storage.getEncounter(encounter.id) as typeof encounter;
        answersObj = getAnswersObj(encounter.answers);
      }

      // If greeting, show menu
      if (isGreeting && (encounter.flowIndex === 0 || !encounter.flowId || encounter.flowId === "ENT_FLU_LIKE_V1")) {
        const updated = setMenuState(answersObj, { awaitingChoice: true });
        await storage.updateEncounter(encounter.id, { answers: JSON.stringify(updated) } as any);
        return res.json({
          message: menuText(),
          encounterId: encounter.id,
          flowId: encounter.flowId,
          awaitingChoice: true,
        });
      }

      // Keyword routing from free text
      if (!encounter.system || !encounter.flowId || (encounter.flowId === "ENT_FLU_LIKE_V1" && encounter.flowIndex === 0)) {
        const pick = routeFlowFromText(msg);
        setRouterAudit(answersObj, {
          routerReason: "keyword",
          routerPickedFlowId: pick.flowId,
          routerPickedSystem: pick.system,
          routerTextSnippet: msg.slice(0, 60),
        });

        await storage.updateEncounter(encounter.id, {
          system: pick.system,
          complaint: pick.complaint,
          specialty: pick.specialty,
          flowId: pick.flowId,
          flowIndex: 0,
          status: "in_progress",
          answers: JSON.stringify(answersObj),
        } as any);

        encounter = await storage.getEncounter(encounter.id) as typeof encounter;
      }
      
      // Save incoming message
      await storage.createMessage({
        patientId: patient.id,
        encounterId: encounter.id,
        direction: "inbound",
        messageBody: msg,
      });
      
      // Get current flow state
      const flowIndex = encounter.flowIndex ?? 0;
      const answers: Record<string, any> = encounter.answers ? JSON.parse(encounter.answers) : {};
      
      // Load flow questions dynamically
      const flowId = encounter.flowId || "ENT_FLU_LIKE_V1";
      const flow = await getFlowQuestions(flowId);
      
      let responseMessage: string;
      let newStatus = encounter.status;
      
      // Process flow
      let intakeToken: string | undefined;
      let intakeCode: string | undefined;
      
      if (flowIndex === 0) {
        // Generate secure intake token and code (matching the real WhatsApp webhook)
        intakeToken = generateToken();
        intakeCode = generateCode();
        const intakeExpiresAt = expiresAtMinutes(INTAKE_EXPIRY_MINUTES);
        
        // Store token+code on encounter
        await storage.updateEncounter(encounter.id, {
          intakeToken,
          intakeCode,
          intakeExpiresAt,
          flowIndex: 1, // Mark as started
        } as any);
        
        const intakeLink = `${BASE_URL}/intake/${intakeToken}`;
        
        responseMessage = `Welcome to Med Scribe Triage.\n\nTap the secure link to answer a few quick questions:\n${intakeLink}\n\nAccess code: ${intakeCode}\n\nIf you can't open the link, reply QUESTIONS to answer here.\nTo resend the link, reply LINK.\n\n⚠️ If you develop trouble breathing, chest pain, confusion, severe bleeding, or can't keep fluids down, seek urgent care or go to the ER now.`;
      } else if (msg.toLowerCase() === "questions" || msg.toLowerCase() === "question") {
        // Patient requested fallback to WhatsApp Q&A
        const firstQuestion = flow[0];
        responseMessage = `OK, I'll ask you the questions here.\n\n${firstQuestion.text}`;
        
        // Reset to start Q&A flow
        await storage.updateEncounter(encounter.id, {
          flowIndex: 1,
          intakeToken: null,
          intakeCode: null,
          intakeExpiresAt: null,
        } as any);
      } else {
        // Parse the answer for the previous question
        const prevQuestion = flow[flowIndex - 1];
        const parsed = parseAnswer(prevQuestion.type, msg);
        
        // If parsing failed, re-prompt
        if (parsed === null) {
          responseMessage = `I didn't understand that response. Please enter a valid number.\n\n${prevQuestion.text}`;
          await storage.createMessage({
            patientId: patient.id,
            encounterId: encounter.id,
            direction: "outbound",
            messageBody: responseMessage,
          });
          return res.json({
            response: responseMessage,
            encounterId: encounter.id,
            status: newStatus,
            flowIndex: encounter.flowIndex ?? 0,
            questionsRemaining: flow.length - (encounter.flowIndex ?? 0) + 1,
            error: "Invalid input, please try again",
          });
        }
        
        answers[prevQuestion.id] = parsed;
        
        if (flowIndex >= flow.length) {
          // Finalize
          const proposal = await computeProposal(answers);
          const physicianSummary = buildPhysicianSummary(answers, proposal);
          const modifiers = buildModifiersFromAnswers(answers);
          const urgencyLevel = proposal.redFlag ? "urgent" : "routine";
          
          await storage.updateEncounter(encounter.id, {
            answers: JSON.stringify(answers),
            proposal: JSON.stringify(proposal),
            physicianSummary: JSON.stringify(physicianSummary),
            modifiers: JSON.stringify(modifiers),
            status: "pending_review",
            urgencyLevel,
            chiefComplaint: "Flu-like symptoms / URI",
            aiDiagnosis: physicianSummary.hpi,
            aiDisposition: proposal.disposition,
          });
          
          newStatus = "pending_review";
          responseMessage = proposal.redFlag
            ? "Thank you. Your symptoms include red flags that need urgent attention. Please seek care at an urgent care or emergency room."
            : "Thank you for completing the assessment. Your case has been sent to a physician for review.";
        } else {
          const nextQuestion = flow[flowIndex];
          responseMessage = nextQuestion.text;
          
          await storage.updateEncounter(encounter.id, {
            flowIndex: flowIndex + 1,
            answers: JSON.stringify(answers),
          });
        }
      }
      
      await storage.createMessage({
        patientId: patient.id,
        encounterId: encounter.id,
        direction: "outbound",
        messageBody: responseMessage,
      });
      
      const responseData: any = {
        response: responseMessage,
        encounterId: encounter.id,
        status: newStatus,
        flowIndex: (encounter.flowIndex ?? 0) + 1,
        questionsRemaining: flow.length - (encounter.flowIndex ?? 0),
      };
      
      // Include intake credentials if available (for testing)
      if (intakeToken) responseData.intakeToken = intakeToken;
      if (intakeCode) responseData.intakeCode = intakeCode;
      
      res.json(responseData);
    } catch (error) {
      console.error("Simulate message error:", error);
      res.status(500).json({ error: "Failed to process message" });
    }
  });

  // ============================================
  // INTAKE ENDPOINTS (Grid-based patient intake)
  // ============================================

  // Get flow questions for a given flowId
  app.get("/api/flows/:flowId/questions", async (req: Request, res: Response) => {
    try {
      const { flowId } = req.params;
      const questions = await getFlowQuestions(flowId);
      res.json({ ok: true, flowId, questions });
    } catch (error: any) {
      console.error("Error fetching flow questions:", error);
      res.status(500).json({ ok: false, error: error?.message || "Failed to load questions" });
    }
  });

  // Verify intake code
  app.post("/api/intake/:token/verify", async (req: Request, res: Response) => {
    try {
      const token = req.params.token;
      const { code } = req.body || {};
      if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

      const encounter = await storage.getEncounterByIntakeToken(token);
      if (!encounter) return res.status(404).json({ ok: false, error: "Invalid or expired link" });

      if (!encounter.intakeCode || String(code).trim() !== String(encounter.intakeCode).trim()) {
        return res.status(401).json({ ok: false, error: "Invalid code" });
      }
      if (encounter.intakeExpiresAt && Date.now() > encounter.intakeExpiresAt) {
        return res.status(401).json({ ok: false, error: "Code expired. Please text 'hi' to start again." });
      }

      // Retrieve saved draft if exists
      let savedDraft: Record<string, any> | null = null;
      if (encounter.answers) {
        try {
          const parsed = JSON.parse(encounter.answers);
          if (parsed.__draft) {
            savedDraft = parsed.__draft;
          }
        } catch {}
      }

      return res.json({
        ok: true,
        encounterId: encounter.id,
        flowId: encounter.flowId || "ENT_FLU_LIKE_V1",
        savedDraft,
        status: encounter.status || "pending_intake"
      });
    } catch (e: any) {
      console.error("Intake verify error:", e);
      res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // Submit intake answers
  app.post("/api/intake/:token/submit", async (req: Request, res: Response) => {
    try {
      const token = req.params.token;
      const { code, answers } = req.body || {};
      if (!code || !answers) return res.status(400).json({ ok: false, error: "Missing code or answers" });

      const encounter = await storage.getEncounterByIntakeToken(token);
      if (!encounter) return res.status(404).json({ ok: false, error: "Invalid or expired link" });

      if (!encounter.intakeCode || String(code).trim() !== String(encounter.intakeCode).trim()) {
        return res.status(401).json({ ok: false, error: "Invalid code" });
      }
      if (encounter.intakeExpiresAt && Date.now() > encounter.intakeExpiresAt) {
        return res.status(401).json({ ok: false, error: "Code expired. Please text 'hi' to start again." });
      }

      // Parse answers if string
      const parsedAnswers = typeof answers === "string" ? JSON.parse(answers) : answers;

      // Compute proposal
      const proposal = await computeProposal(parsedAnswers);
      const modifiers = buildModifiersFromAnswers(parsedAnswers);
      const physicianSummary = buildPhysicianSummary(parsedAnswers, proposal);
      const urgencyLevel = proposal.redFlag ? "urgent" : "routine";

      // Update encounter
      await storage.updateEncounter(encounter.id, {
        answers: JSON.stringify(parsedAnswers),
        proposal: JSON.stringify(proposal),
        physicianSummary: JSON.stringify(physicianSummary),
        modifiers: JSON.stringify(modifiers),
        status: "pending_review",
        urgencyLevel,
        chiefComplaint: "Flu-like symptoms / URI",
        aiDiagnosis: physicianSummary.hpi,
        aiDisposition: proposal.disposition,
        // Invalidate token after use
        intakeCode: null,
        intakeExpiresAt: null,
      } as any);

      // Notify patient via WhatsApp
      if (encounter.phoneNumber) {
        const confirmMsg = proposal.redFlag
          ? "Thank you. Your symptoms include red flags that need urgent attention. Please seek care at an urgent care or emergency room immediately."
          : "Thanks! Your answers have been sent to a physician for review. You'll receive a message once they've reviewed your case.";
        try {
          await sendWhatsAppMessage(encounter.phoneNumber, confirmMsg);
        } catch (whatsappErr) {
          console.error("Failed to send WhatsApp confirmation:", whatsappErr);
        }
      }

      res.json({ ok: true, encounterId: encounter.id, redFlag: proposal.redFlag });
    } catch (e: any) {
      console.error("Intake submit error:", e);
      res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // Save draft (autosave)
  app.post("/api/intake/:token/save_draft", async (req: Request, res: Response) => {
    try {
      const token = req.params.token;
      const { draft, currentStep } = req.body || {};
      if (!draft || currentStep === undefined) {
        return res.status(400).json({ ok: false, error: "Missing draft or currentStep" });
      }

      const encounter = await storage.getEncounterByIntakeToken(token);
      if (!encounter) return res.status(404).json({ ok: false, error: "Invalid or expired link" });

      // Store draft in encounter answers (prefixed to avoid collision)
      const existingAnswers = encounter.answers ? JSON.parse(encounter.answers) : {};
      existingAnswers.__draft = draft;
      existingAnswers.__draftStep = currentStep;
      existingAnswers.__draftSavedAt = Date.now();

      await storage.updateEncounter(encounter.id, {
        answers: JSON.stringify(existingAnswers),
      } as any);

      return res.json({ ok: true });
    } catch (e: any) {
      console.error("Intake save_draft error:", e);
      res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // Get intake status
  app.get("/api/intake/:token/status", async (req: Request, res: Response) => {
    try {
      const token = req.params.token;
      const encounter = await storage.getEncounterByIntakeToken(token);
      if (!encounter) return res.status(404).json({ ok: false, error: "Invalid link" });

      const statusMap: Record<string, string> = {
        "pending_intake": "Continue your intake form",
        "pending_review": "Waiting for provider review",
        "in_review": "Provider is reviewing your case",
        "approved": "Visit complete - view your summary",
        "closed": "This visit has been closed"
      };

      return res.json({
        ok: true,
        status: encounter.status || "pending_intake",
        encounterId: encounter.id,
        lastUpdatedAt: encounter.updatedAt ? new Date(encounter.updatedAt).getTime() : Date.now(),
        nextActionText: statusMap[encounter.status || "pending_intake"] || "Status unknown"
      });
    } catch (e: any) {
      console.error("Intake status error:", e);
      res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // Get signed visit summary
  app.get("/api/intake/:token/summary", async (req: Request, res: Response) => {
    try {
      const token = req.params.token;
      const encounter = await storage.getEncounterByIntakeToken(token);
      if (!encounter) return res.status(404).json({ ok: false, error: "Invalid link" });

      if (encounter.status !== "approved") {
        return res.status(400).json({ ok: false, error: "Visit summary not yet available" });
      }

      const proposal = encounter.proposal ? JSON.parse(encounter.proposal) : {};
      const summary = encounter.physicianSummary ? JSON.parse(encounter.physicianSummary) : {};

      // Sanitize text to prevent XSS
      const esc = (s: string) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

      const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Visit Summary</title></head>
<body style="font-family: sans-serif; max-width: 800px; margin: 2rem auto; padding: 1rem;">
  <h1>Visit Summary</h1>
  <p><strong>Date:</strong> ${encounter.updatedAt ? new Date(encounter.updatedAt).toLocaleDateString() : "N/A"}</p>
  
  <h2>Chief Complaint</h2>
  <p>${esc(encounter.chiefComplaint || "Flu-like symptoms")}</p>
  
  <h2>Assessment</h2>
  <p>${esc(summary.hpi || encounter.aiDiagnosis || "See provider notes")}</p>
  
  <h2>Disposition</h2>
  <p>${esc(encounter.aiDisposition || proposal.disposition || "Pending")}</p>
  
  <h2>Instructions</h2>
  <p>${esc(summary.plan || "Follow up with your provider as directed.")}</p>
  
  <hr>
  <p style="color: #666; font-size: 0.9rem;">This is an automated summary. Follow up with your provider for any questions.</p>
</body>
</html>
      `.trim();

      res.setHeader("Content-Type", "text/html");
      return res.send(html);
    } catch (e: any) {
      console.error("Intake summary error:", e);
      res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // Upload attachment
  app.post("/api/intake/:token/upload", async (req: Request, res: Response) => {
    try {
      const token = req.params.token;
      const encounter = await storage.getEncounterByIntakeToken(token);
      if (!encounter) return res.status(404).json({ ok: false, error: "Invalid link" });

      const fileId = `FILE_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // Store file reference in encounter answers
      const existingAnswers = encounter.answers ? JSON.parse(encounter.answers) : {};
      const attachments = existingAnswers.__attachments || [];
      attachments.push(fileId);
      existingAnswers.__attachments = attachments;

      await storage.updateEncounter(encounter.id, {
        answers: JSON.stringify(existingAnswers),
      } as any);

      return res.json({ ok: true, fileId });
    } catch (e: any) {
      console.error("Intake upload error:", e);
      res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // Test execution endpoint for automated testing
  app.post("/api/test/execute", async (req: Request, res: Response) => {
    try {
      const token = req.header("x-test-token") || "";
      if (!process.env.TEST_EXEC_TOKEN || token !== process.env.TEST_EXEC_TOKEN) {
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }

      const { flowId, answers, modifiers, routerText } = req.body || {};
      if (!flowId || !answers) {
        return res.status(400).json({ ok: false, error: "Missing flowId or answers" });
      }

      const parsedAnswers = typeof answers === "string" ? JSON.parse(answers) : answers;

      // Staging selector via x-sheet-env header
      const sheetEnv = (req.header("x-sheet-env") || "").toLowerCase().trim();
      const spreadsheetIdOverride =
        sheetEnv === "staging" ? process.env.SHEETS_SPREADSHEET_ID_STAGING : undefined;

      const proposal = await computeProposalGeneric(parsedAnswers, { flowId, spreadsheetIdOverride });

      return res.json({
        ok: true,
        flowId,
        routerText: routerText || "",
        proposal,
        modifiers: modifiers || null,
      });
    } catch (e: any) {
      console.error("test execute error:", e);
      res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // Admin routes - require provider session + admin token
  const requireAdmin = (req: Request, res: Response, next: any) => {
    const token = req.headers["x-admin-token"];
    const adminToken = process.env.ADMIN_TOKEN;
    if (!adminToken) {
      return res.status(503).json({ error: "Admin access not configured" });
    }
    if (token !== adminToken) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  };

  app.post("/api/admin/sheets/sync", requireProviderAuth, requireAdmin, syncClinicalSheets);
  app.post("/api/admin/sheets/import-medications", requireProviderAuth, requireAdmin, importEntMedications);
  app.post("/api/admin/sheets/import-diagnoses", requireProviderAuth, requireAdmin, importEntDiagnoses);
  app.post("/api/admin/dev/run-tests", requireProviderAuth, requireAdmin, runTests);
  app.post("/api/admin/dev/apply-patch", requireProviderAuth, requireAdmin, applyPatch);

  // Engine maintenance, diagnostics, and observability
  const { default: engineMaintenanceRouter } = await import("./routes/engineMaintenanceRoutes");
  app.use("/api/engine-maintenance", engineMaintenanceRouter);

  // Agent & Skill Lab — live inspection, testing, toggling, and troubleshooting
  const { default: agentLabRouter } = await import("./routes/agentLabRoutes");
  app.use("/api/agent-lab", agentLabRouter);
  console.log("[AgentLab] Agent & Skill Lab endpoints registered at /api/agent-lab/*");

  // Distributed circuit breaker control panel
  const { circuitBreakerRouter } = await import("./routes/circuitBreakerRoutes");
  app.use("/api/circuit-breakers", circuitBreakerRouter);

  // Agent health, self-healing metrics, and routing weights
  const { agentHealthRouter } = await import("./routes/agentHealthRoutes");
  app.use("/api/agents", agentHealthRouter);

  // Case replay — re-execute any historical case from its traceId
  const { replayRouter } = await import("./routes/replayRoutes");
  app.use("/api/replay", replayRouter);

  // Clinical Brain Intelligence — engine telemetry, bandit, meta-learning, oversight
  const { default: controlTowerIntelRouter } = await import("./routes/clinicalBrainIntelRoutes");
  app.use("/api/brain-intel", controlTowerIntelRouter);

  // Multi-agent council — base council + hierarchical specialist councils
  const { default: councilRouter } = await import("./routes/councilRoutes");
  app.use("/api/council", councilRouter);

  console.log("[Orchestration] Circuit breakers: /api/circuit-breakers | Agent health: /api/agents/health | Replay: /api/replay | Brain intel: /api/brain-intel | Council: /api/council");

  // Mission Control — cognitive bus, command grid, QA, outcome learning
  const { default: missionControlRouter } = await import("./routes/missionControlRoutes");
  app.use(missionControlRouter);
  console.log("[MissionControl] Registered: /api/mission/snapshot | /api/mission/command-grid | /api/mission/cognitive-stream");

  // Outcome ingest — record triage/disposition outcomes for RLHF-lite
  app.post("/api/telemed/outcome", async (req, res) => {
    try {
      const { ingestOutcome } = await import("./integration/outcomeIngest");
      const perf = await ingestOutcome(req.body);
      res.json({ ok: true, agentPerformance: perf });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // Domain-split routers (clinical fast-path, agent registry, evolution proposals, tenant config)
  app.use("/api/domain", buildDomainRouters());
  console.log("[DomainRouters] Mounted at /api/domain/* (fast-path, registry, evolution, tenant config)");

  // Autonomous oversight agent (system-level drift + failure clustering + health alerts)
  const { default: hospitalBrainRouter } = await import("./routes/hospitalBrainRoutes");
  app.use("/api", hospitalBrainRouter);
  console.log("[HospitalBrain] Orchestrator at /api/hospital-brain/run");

  const { default: regionalRouter } = await import("./routes/regionalRoutes");
  app.use("/api", regionalRouter);
  console.log("[Regional] Orchestrator at /api/regional/orchestrate");

  const { default: nationalRouter } = await import("./routes/nationalRoutes");
  app.use("/api", nationalRouter);
  console.log("[National] Orchestrator at /api/national/orchestrate");

  const { default: globalRouter } = await import("./routes/globalRoutes");
  app.use("/api", globalRouter);
  console.log("[Global] Orchestrator at /api/global/orchestrate");

  const { default: oversightRoutes } = await import("./routes/oversightRoutes");
  app.use("/api", oversightRoutes);
  console.log("[Oversight] Autonomous oversight agent at /api/oversight/run");

  const { default: mlRoutes } = await import("./ml/mlRoutes");
  app.use("/api/ml", mlRoutes);
  console.log("[ML] Admission model at /api/ml/predict | /api/ml/drift");

  const { default: mlAdminRoutes } = await import("./ml/mlAdminRoutes");
  app.use("/api/ml", mlAdminRoutes);
  console.log("[ML] Admin routes at /api/ml/registry | /api/ml/synthetic | /api/ml/features/log");

  const { default: reportingRoutes } = await import("./reporting/reportingRoutes");
  app.use("/api/reporting", reportingRoutes);
  console.log("[Reporting] Exec brief + FDA pack at /api/reporting/exec-brief");

  const { default: policyRoutes } = await import("./clinical/policyRoutes");
  app.use("/api/policies", policyRoutes);
  console.log("[Policies] Triage policy engine at /api/policies");

  const { default: analyticsRoutes } = await import("./analytics/analyticsRoutes");
  app.use("/api/analytics", analyticsRoutes);
  console.log("[Analytics] Risk heatmap + priority sort + patterns at /api/analytics");

  const { default: simulatorRoutes } = await import("./simulation/simulatorRoutes");
  app.use("/api/simulate", simulatorRoutes);
  console.log("[Simulator] Hospital capacity simulator at /api/simulate/hospital");

  const { default: alertRoutes } = await import("./monitoring/alertRoutes");
  app.use("/api/alerts", alertRoutes);
  console.log("[Alerts] Live alert bus at /api/alerts");

  const { default: smartRoutes } = await import("./routes/smartRoutes");
  app.use("/smart", smartRoutes);
  console.log("[SMART] Epic SMART launch + callback at /smart/launch | /smart/callback");

  const { default: liveSimRoutes } = await import("./simulation/liveSimulatorRoutes");
  app.use("/api/live-sim", liveSimRoutes);
  console.log("[LiveSim] Live simulation API at /api/live-sim/status | /api/live-sim/forecast");

  const { default: controlRoutes } = await import("./control/controlRoutes");
  app.use("/api/control", controlRoutes);
  console.log("[ControlTower] Unified control API at /api/control/state | /simulate | /stress | /epic | /scale | /export | /reset | /model | /alert | /report");

  const { default: autopilotRoutes } = await import("./autopilot/autopilotRoutes");
  app.use("/api/autopilot", autopilotRoutes);
  console.log("[Autopilot] AI autopilot API at /api/autopilot/run | /pilot/workflow | /override | /mode | /safety/check | /interrupt | /kpis | /fda/export");

  const { default: batch8Routes } = await import("./batch8Routes");
  app.use("/api", batch8Routes);
  console.log("[Batch8] Live pilot | production loop | CPT revenue | national rollout | clinic intelligence — all wired at /api/*");

  const { default: batch9Routes } = await import("./batch9Routes");
  app.use("/api", batch9Routes);
  console.log("[Batch9] Denial prediction | AI patient chat | production flow | IPO report | system ops — all wired at /api/*");

  const { default: batch10Routes } = await import("./batch10Routes");
  app.use("/api", batch10Routes);
  console.log("[Batch10] Pilot orchestrator | eligibility+scrub | chat-triage bridge | deck builder | system monitor — all wired at /api/*");

  const { default: batch11Routes } = await import("./batch11Routes");
  app.use("/api", batch11Routes);
  console.log("[Batch11] Epic sandbox | payer contract | slide builder | dynamic intake | case speed panel — all wired at /api/*");

  const { default: batch12Routes } = await import("./batch12Routes");
  app.use("/api", batch12Routes);
  console.log("[Batch12] Fast triage | live clinic | payer contracts | workflow builder | gateway | autonomy | alerts | connector hub | triage utils — all wired at /api/*");

  const { default: batch13Routes } = await import("./batch13Routes");
  app.use("/api", batch13Routes);
  console.log("[Batch13] Branch workflows | clinic queue | high autonomy | followup utils | SMART callback — all wired at /api/*");

  const { default: batch14Routes } = await import("./batch14Routes");
  app.use("/api", batch14Routes);
  console.log("[Batch14] Graph utils | alert rules engine | QA utils | golden runner | Telegram + multi-channel broadcast — all wired at /api/*");

  const { default: batch15Routes } = await import("./batch15Routes");
  app.use("/api", batch15Routes);
  console.log("[Batch15] Multi-tenant | ECW adapter | SLO+oncall | Epic test UI | Condition node | Physician copilot — all wired at /api/*");

  const { default: batch16Routes } = await import("./batch16Routes");
  app.use("/api", batch16Routes);
  console.log("[Batch16] AI workflow gen | EHR unified | full revenue | SLO burn | question graph | retry queue | RBAC | patient memory | repair loop | integration hub — all wired at /api/*");

  const { default: batch17Routes } = await import("./batch17Routes");
  app.use("/api", batch17Routes);
  console.log("[Batch17] Real clinic loop | payer API | national rollout | marketplace | UI automation | EHR sync — all wired at /api/*");

  const { default: batch18Routes } = await import("./batch18Routes");
  app.use("/api", batch18Routes);
  console.log("[Batch18] Vision agent | ECW pilot hardening | revenue optimizer | central orchestrator | connector router | action cache — all wired at /api/*");

  const { default: batch19Routes, initBatch19 } = await import("./batch19Routes");
  app.use("/api", batch19Routes);
  initBatch19(httpServer);
  console.log("[Batch19] Unified system bus | modules state | live real system | live billing | region cluster | master control | WebSocket stream — all wired at /api/*");

  const { default: batch20Routes } = await import("./batch20Routes");
  app.use("/api", batch20Routes);
  console.log("[Batch20] Live adapters | network controller | marketplace engine | workflow optimizer | advanced utils (retry/z-score/universalWrite) — all wired at /api/*");

  const { default: deepAgentRoutes } = await import("./routes/deepAgentRoutes");
  app.use("/api/deep-agent", deepAgentRoutes);
  console.log("[DeepAgent] Python sidecar bridge wired at /api/deep-agent/* (health|run|article-compare|kb-audit|code-review|workflow-upgrade|upgrade-from-article|research)");

  const { default: communicationRoutes } = await import("./routes/communicationRoutes");
  app.use("/api/communication", communicationRoutes);

  const { default: antibioticRoutes } = await import("./routes/antibioticRoutes");
  app.use("/api/antibiotic", antibioticRoutes);

  const { default: clinicalConsistencyRoutes } = await import("./routes/clinicalConsistencyRoutes");
  app.use("/api/clinical-consistency", clinicalConsistencyRoutes);

  const { default: communicationAdvancedRoutes } = await import("./routes/communicationAdvancedRoutes");
  app.use("/api/communication-advanced", communicationAdvancedRoutes);

  const { default: clinicalDecisionRoutes } = await import("./routes/clinicalDecisionRoutes");
  app.use("/api/clinical-decision", clinicalDecisionRoutes);

  const { default: learningEngineRoutes } = await import("./routes/learningEngineRoutes");
  app.use("/api/learning-engine", learningEngineRoutes);

  const { default: simulationRoutes } = await import("./routes/simulationRoutes");
  app.use("/api/sim-cohort", simulationRoutes);

  const { default: monitoringRoutes } = await import("./routes/monitoringRoutes");
  app.use("/api/monitoring", monitoringRoutes);

  const { default: clinicalConsistencyIntegrationRoutes } = await import("./routes/clinicalConsistencyIntegrationRoutes");
  app.use("/api/clinical-consistency-integration", clinicalConsistencyIntegrationRoutes);
  console.log("[ClinicalConsistencyIntegration] KB admin | golden cases | physician overrides | confidence | escalation wired at /api/clinical-consistency-integration/*");

  const { default: controlTowerRoutes } = await import("./routes/controlTower");
  app.use("/api/control-tower", controlTowerRoutes);
  console.log("[ControlTower] Consensus engine | disposition guardrail | next-best-question | interrupt | MCP | parallel dispatch wired at /api/control-tower/*");

  console.log("[LearningEngine] Patient memory | population learning | personalization wired at /api/learning-engine/*");
  console.log("[Simulation] 10k patient synthetic cohort engine wired at /api/sim-cohort/*");
  console.log("[Monitoring] Drift detection | risk governance wired at /api/monitoring/*");
  console.log("[Communication] Script engine | tone detector | script variants | outcome tracker wired at /api/communication/*");
  console.log("[Antibiotic] Demand detector | demand engine | delayed Rx | demand stats wired at /api/antibiotic/*");
  console.log("[ClinicalConsistency] Syndrome scoring | treatment minimalism | disposition engine | variance audit wired at /api/clinical-consistency/*");
  console.log("[CommunicationAdvanced] A/B testing | reasoning trace | learning engine wired at /api/communication-advanced/*");
  console.log("[ClinicalDecision] Centor | Bayesian strep | debate engine | voice delivery wired at /api/clinical-decision/*");

  app.get("/simulate/stress", async (req, res) => {
    try {
      const n = Math.min(Number(req.query.n ?? 1000), 50_000);
      const { runStressTest } = await import("./simulation/stressTest");
      const result = await runStressTest(n);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e?.message ?? "stress test failed" });
    }
  });
  console.log("[StressTest] 50k patient stress test at GET /simulate/stress?n=N");

  app.post("/api/pilot/case", async (req, res) => {
    try {
      const { sendPilotCase } = await import("./integrations/hospitalPilot");
      const result = await sendPilotCase(req.body);
      res.json({ ok: true, result });
    } catch (e: any) {
      res.status(500).json({ error: e?.message });
    }
  });

  app.post("/api/pilot/outcome", async (req, res) => {
    try {
      const { receiveOutcome } = await import("./integrations/hospitalPilot");
      await receiveOutcome(req.body);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e?.message });
    }
  });

  app.get("/api/pilot/outcomes", async (_req, res) => {
    const { getOutcomeBuffer } = await import("./integrations/hospitalPilot");
    res.json(getOutcomeBuffer());
  });
  console.log("[HospitalPilot] Pilot case API at /api/pilot/case | /api/pilot/outcome | /api/pilot/outcomes");

  app.get("/api/pilot/stats", async (_req, res) => {
    const { aggregateStats } = await import("./simulation/pilotStats");
    res.json(aggregateStats());
  });

  app.post("/api/pilot/stats/update", async (req, res) => {
    const { updateStats } = await import("./simulation/pilotStats");
    updateStats(req.body);
    res.json({ ok: true });
  });

  app.post("/api/pilot/stats/reset", async (_req, res) => {
    const { resetStats } = await import("./simulation/pilotStats");
    resetStats();
    res.json({ ok: true });
  });
  console.log("[PilotStats] Live aggregation at /api/pilot/stats");

  app.post("/api/epic/flow", async (req, res) => {
    try {
      const { patientId, token } = req.body;
      if (!patientId) return res.status(400).json({ error: "patientId required" });
      const { epicFullFlow } = await import("./integrations/epicFullFlow");
      const result = await epicFullFlow(patientId, token ?? "");
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e?.message });
    }
  });
  console.log("[EpicFullFlow] FHIR full flow at POST /api/epic/flow");

  app.post("/api/enterprise/package", async (req, res) => {
    try {
      const { generateEnterprisePackage } = await import("./reporting/enterprisePackage");
      const pkg = generateEnterprisePackage(req.body ?? {});
      res.json(pkg);
    } catch (e: any) {
      res.status(500).json({ error: e?.message });
    }
  });
  console.log("[EnterprisePackage] Export at POST /api/enterprise/package");

  app.post("/api/followup", async (req, res) => {
    const { patientId } = req.body ?? {};
    res.json({ ok: true, patientId, scheduledAt: new Date().toISOString() });
  });

  app.get("/api/autoscale/recommendation", async (req, res) => {
    const queueDepth = Number(req.query.queueDepth ?? 0);
    const currentInstances = Number(req.query.currentInstances ?? 2);
    const { getScaleRecommendation } = await import("./infra/awsAutoscale");
    res.json(getScaleRecommendation(queueDepth, currentInstances));
  });
  console.log("[AWSAutoscale] Scale recommendation at GET /api/autoscale/recommendation");

  app.get("/metrics", async (_req, res) => {
    try {
      const { getMetrics: getHttpMetrics }  = await import("./monitoring/metricsStore");
      const { toPrometheusText }            = await import("./automation/metricsTracker");
      const { getQueueState }               = await import("./automation/queue");

      const http  = getHttpMetrics();
      const queue = getQueueState();
      const ts    = Math.floor(Date.now() / 1000) * 1000;

      const httpLines = [
        "# HELP auralyn_http_requests_total Total HTTP requests processed",
        "# TYPE auralyn_http_requests_total counter",
        `auralyn_http_requests_total ${http.totalRequests} ${ts}`,
        "",
        "# HELP auralyn_http_errors_total Total HTTP errors",
        "# TYPE auralyn_http_errors_total counter",
        `auralyn_http_errors_total ${http.totalErrors} ${ts}`,
        "",
        "# HELP auralyn_http_error_rate HTTP error rate (0–1)",
        "# TYPE auralyn_http_error_rate gauge",
        `auralyn_http_error_rate ${http.errorRate} ${ts}`,
        "",
        "# HELP auralyn_http_avg_latency_ms Average HTTP latency in milliseconds",
        "# TYPE auralyn_http_avg_latency_ms gauge",
        `auralyn_http_avg_latency_ms ${http.avgLatency} ${ts}`,
        "",
        "# HELP auralyn_http_p95_latency_ms P95 HTTP latency in milliseconds",
        "# TYPE auralyn_http_p95_latency_ms gauge",
        `auralyn_http_p95_latency_ms ${http.p95Latency} ${ts}`,
        "",
        "# HELP auralyn_queue_running Active automation workers",
        "# TYPE auralyn_queue_running gauge",
        `auralyn_queue_running ${queue.running} ${ts}`,
        "",
        "# HELP auralyn_queue_pending Pending automation jobs",
        "# TYPE auralyn_queue_pending gauge",
        `auralyn_queue_pending ${queue.pending} ${ts}`,
        "",
        "# HELP auralyn_queue_failure_rate Automation queue failure rate (0–1)",
        "# TYPE auralyn_queue_failure_rate gauge",
        `auralyn_queue_failure_rate ${queue.failureRate} ${ts}`,
      ].join("\n");

      const body = httpLines + "\n\n" + toPrometheusText() + "\n";
      res.set("Content-Type", "text/plain; version=0.0.4");
      res.end(body);
    } catch (err: any) {
      res.status(500).send(`# Error generating metrics: ${err.message}\n`);
    }
  });
  console.log("[Prometheus] /metrics endpoint active");

  // ── Batch 28: Full Clinical Pipeline + Physician Dashboard ──
  const { default: fullClinicalPipelineRouter } = await import("./routes/fullClinicalPipeline");
  app.use("/api", fullClinicalPipelineRouter);
  console.log("[FullClinicalPipeline] POST /api/full-pipeline active");

  const { default: physicianRouter } = await import("./routes/physician");
  app.use("/api", physicianRouter);
  console.log("[PhysicianDashboard] /api/physician/* active");

  // Initialise control tower event hooks (side-effectful — must be imported after bus is wired)
  await import("./events/hooks");
  console.log("[EventHooks] Control tower bus hooks active");

  // ── Batch 29: Medical MCP Layer + Clinical Workflow + Golden Cases + RLHF ──
  const { default: workflowRoutes }    = await import("./routes/workflowRoutes");
  const { default: goldenCaseRoutes }  = await import("./routes/goldenCaseRoutes");
  const { default: rlhfRoutes }        = await import("./routes/rlhfRoutes");

  app.use("/api/workflow",      workflowRoutes);
  app.use("/api/golden-cases",  goldenCaseRoutes);
  app.use("/api/rlhf",          rlhfRoutes);

  console.log("[MedicalMCP] /api/workflow/* active");
  console.log("[GoldenCases] /api/golden-cases/* active");
  console.log("[RLHF] /api/rlhf/* active");

  // ── Batch 30: FDA Validation Engine + Immutable Hash Chain + Drift Detection ──
  const { default: fdaRoutes }   = await import("./routes/fdaRoutes");
  const { default: driftRoutes } = await import("./routes/driftRoutes");

  app.use("/api/fda",   fdaRoutes);
  app.use("/api/drift", driftRoutes);

  console.log("[FDA] /api/fda/* active");
  console.log("[Drift] /api/drift/* active");

  // ── Batch 31: SaMD Dossier + Trial Simulator + ROI + CPT + Payer + Pilot + DAG ──
  const { default: samdRoutes }   = await import("./routes/samdRoutes");
  const { default: trialRoutes }  = await import("./routes/trialRoutes");
  const { default: roiRoutes }    = await import("./routes/roiRoutes");
  const { default: cptRoutes }    = await import("./routes/cptRoutes");
  const { default: payerRoutes }  = await import("./routes/payerRoutes");
  const { default: pilotRoutes }  = await import("./routes/pilotRoutes");

  app.use("/api/samd",    samdRoutes);
  app.use("/api/trial",   trialRoutes);
  app.use("/api/roi",     roiRoutes);
  app.use("/api/cpt",     cptRoutes);
  app.use("/api/payer",   payerRoutes);
  app.use("/api/pilot",   pilotRoutes);

  console.log("[SaMD] /api/samd/* active");
  console.log("[Trial] /api/trial/* active");
  console.log("[ROI] /api/roi/* active");
  console.log("[CPT] /api/cpt/* active");
  console.log("[Payer] /api/payer/* active");
  console.log("[Pilot] /api/pilot/* active");

  // ── Batch 32: Clinical Brain — Knowledge Graph + DAG + Debate + Traces + YAML ──
  const { default: clinicalBrainRoutes } = await import("./routes/clinicalBrainRoutes");
  app.use("/api/brain", clinicalBrainRoutes);
  console.log("[Brain] /api/brain/* active");

  // ── Batch 34: Agent System (Context Engine, Reasoner, Evidence, EHR, Plugins) ──
  const { default: agentSystemRoutes } = await import("./routes/agentSystemRoutes");
  app.use("/api/agents", agentSystemRoutes);
  console.log("[AgentSystem] /api/agents/* active");

  // ── Batch 33: Cognitive Brain Orchestrator ────────────────────────────────
  const { default: cognitiveRoutes } = await import("./routes/cognitiveRoutes");
  app.use("/api/cognitive", cognitiveRoutes);   // /api/cognitive/cases, /api/cognitive/memory

  // Top-level alias the user specified: POST /api/cognitive-run
  const { runCognitiveBrain } = await import("./cognitive/cognitiveOrchestrator");
  app.post("/api/cognitive-run", async (req, res) => {
    try {
      const result = await runCognitiveBrain(req.body as any);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Cognitive brain failed" });
    }
  });
  console.log("[Cognitive] /api/cognitive-run and /api/cognitive/* active");

  return httpServer;
}

