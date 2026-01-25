import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage, type FlowQuestion } from "./storage";
import twilio from "twilio";
import { getEntFluRules } from "./rules/entFluRuleLoader";
import { syncClinicalSheets, importEntMedications, importEntDiagnoses } from "./admin/sheetsAgent";
import { runTests, applyPatch } from "./admin/devAgent";
import { getMedicationCatalog, pickBestMed, medMatchesAllergy, shouldAvoidMedByModifiers } from "./meds/medCatalog";
import { getDiagnosisCatalog } from "./meds/diagnosisCatalog";

// Initialize Twilio client
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || "whatsapp:+14155238886";

// Log credential info for debugging (masked for security)
console.log(`Twilio Config: SID=${TWILIO_SID?.substring(0, 8)}..., Token=${TWILIO_TOKEN ? `${TWILIO_TOKEN.substring(0, 4)}...` : 'NOT SET'}, WhatsApp=${TWILIO_WHATSAPP_NUMBER}`);

const twilioClient = twilio(TWILIO_SID, TWILIO_TOKEN);

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

  // New: structured meds using catalog + modifiers
  const modifiers = buildModifiersFromAnswers(a);
  const allergies = modifiers.allergies || [];

  let medsDetailed: any[] = [];
  let avoidDetailed: any[] = [];

  try {
    const catalog = await getMedicationCatalog();

    for (const m of meds) {
      const rows = catalog.get(String(m).trim().toLowerCase()) || [];
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

  return { 
    redFlag, tamifluEligible, paxlovidFlag, 
    meds, avoid, medsDetailed, avoidDetailed, 
    tests, disposition, rulesVersion,
    diagnosis_ids, presentation_label
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

  // Encounters API - List by filter
  app.get("/api/encounters/pending", async (req: Request, res: Response) => {
    try {
      const encounters = await storage.getEncountersByStatus("pending_review");
      res.json(encounters);
    } catch (error) {
      console.error("Error fetching pending encounters:", error);
      res.status(500).json({ error: "Failed to fetch encounters" });
    }
  });

  app.get("/api/encounters/approved", async (req: Request, res: Response) => {
    try {
      const encounters = await storage.getEncountersByStatus("approved");
      res.json(encounters);
    } catch (error) {
      console.error("Error fetching approved encounters:", error);
      res.status(500).json({ error: "Failed to fetch encounters" });
    }
  });

  app.get("/api/encounters/all", async (req: Request, res: Response) => {
    try {
      const encounters = await storage.getEncountersByStatus(undefined);
      res.json(encounters);
    } catch (error) {
      console.error("Error fetching all encounters:", error);
      res.status(500).json({ error: "Failed to fetch encounters" });
    }
  });

  app.get("/api/encounters/:id", async (req: Request, res: Response) => {
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

  app.post("/api/encounters/:id/approve", async (req: Request, res: Response) => {
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

  app.post("/api/encounters/:id/request-info", async (req: Request, res: Response) => {
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

  // Twilio WhatsApp Webhook - Deterministic ENT Flu Triage Flow
  app.post("/api/webhooks/whatsapp", async (req: Request, res: Response) => {
    try {
      const { From, Body, MessageSid } = req.body;
      const phoneNumber = From; // Format: whatsapp:+1234567890
      const msg = Body.trim();
      
      console.log(`Received WhatsApp message from ${phoneNumber}: ${msg}`);
      
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
      
      // Ensure ENT flow fields are set (for existing encounters)
      if (!encounter.system) {
        await storage.updateEncounter(encounter.id, {
          system: "ENT",
          complaint: "FLU_LIKE_URI",
          specialty: "ENT",
          flowId: "ENT_FLU_LIKE_V1",
          flowIndex: encounter.flowIndex ?? 0,
          answers: encounter.answers ?? JSON.stringify({}),
          status: "in_progress",
        });
        encounter = await storage.getEncounter(encounter.id) as typeof encounter;
      }
      
      // Save incoming message
      await storage.createMessage({
        patientId: patient.id,
        encounterId: encounter.id,
        direction: "inbound",
        messageBody: msg,
        messageSid: MessageSid,
      });
      
      // Get current flow state
      const flowIndex = encounter.flowIndex ?? 0;
      const answers: Record<string, any> = encounter.answers ? JSON.parse(encounter.answers) : {};
      
      // Load flow questions dynamically (tries Sheets first, falls back to hardcoded)
      const flowId = encounter.flowId || "ENT_FLU_LIKE_V1";
      const flow = await getFlowQuestions(flowId);
      
      console.log(`Flow state: index=${flowIndex}, answers=${JSON.stringify(answers)}, using ${flow.length} questions`);
      
      let responseMessage: string;
      
      // If this is the first message (flowIndex = 0), send the first question
      if (flowIndex === 0) {
        const firstQuestion = flow[0];
        responseMessage = `Welcome to the ENT Flu Triage System. I'll ask you a series of questions to assess your symptoms.\n\n${firstQuestion.text}`;
        
        await storage.updateEncounter(encounter.id, {
          flowIndex: 1,
        });
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

  // Test endpoint to simulate WhatsApp message using deterministic flow
  app.post("/api/test/simulate-message", async (req: Request, res: Response) => {
    try {
      const { phoneNumber, message } = req.body;
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
      
      // Get or create active encounter with ENT flow fields
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
      
      // Ensure ENT flow fields are set
      if (!encounter.system) {
        await storage.updateEncounter(encounter.id, {
          system: "ENT",
          complaint: "FLU_LIKE_URI",
          specialty: "ENT",
          flowId: "ENT_FLU_LIKE_V1",
          flowIndex: encounter.flowIndex ?? 0,
          answers: encounter.answers ?? JSON.stringify({}),
          status: "in_progress",
        });
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
      if (flowIndex === 0) {
        const firstQuestion = flow[0];
        responseMessage = `Welcome to the ENT Flu Triage System. I'll ask you a series of questions to assess your symptoms.\n\n${firstQuestion.text}`;
        
        await storage.updateEncounter(encounter.id, {
          flowIndex: 1,
        });
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
      
      res.json({
        response: responseMessage,
        encounterId: encounter.id,
        status: newStatus,
        flowIndex: (encounter.flowIndex ?? 0) + 1,
        questionsRemaining: flow.length - (encounter.flowIndex ?? 0),
      });
    } catch (error) {
      console.error("Simulate message error:", error);
      res.status(500).json({ error: "Failed to process message" });
    }
  });

  // Admin routes - simple token-based auth for now
  const requireAdmin = (req: Request, res: Response, next: any) => {
    const token = req.headers["x-admin-token"];
    const adminToken = process.env.ADMIN_TOKEN || "admin-secret";
    if (token !== adminToken) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  };

  app.post("/api/admin/sheets/sync", requireAdmin, syncClinicalSheets);
  app.post("/api/admin/sheets/import-medications", requireAdmin, importEntMedications);
  app.post("/api/admin/sheets/import-diagnoses", requireAdmin, importEntDiagnoses);
  app.post("/api/admin/dev/run-tests", requireAdmin, runTests);
  app.post("/api/admin/dev/apply-patch", requireAdmin, applyPatch);

  return httpServer;
}

// Helper function to send WhatsApp message
async function sendWhatsAppMessage(to: string, body: string): Promise<void> {
  // Ensure proper WhatsApp phone number format: whatsapp:+1234567890
  let formattedTo = to;
  
  // Remove "whatsapp:" prefix if present to normalize
  if (formattedTo.startsWith("whatsapp:")) {
    formattedTo = formattedTo.replace("whatsapp:", "").trim();
  }
  
  // Ensure + prefix for E.164 format
  if (!formattedTo.startsWith("+")) {
    formattedTo = "+" + formattedTo;
  }
  
  // Add whatsapp: prefix back
  formattedTo = "whatsapp:" + formattedTo;
  
  console.log(`Sending WhatsApp message to: ${formattedTo}`);
  
  await twilioClient.messages.create({
    from: TWILIO_WHATSAPP_NUMBER,
    to: formattedTo,
    body: body,
  });
}
