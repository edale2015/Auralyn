import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import twilio from "twilio";

// Initialize Twilio client
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || "whatsapp:+14155238886";

// Log credential info for debugging (masked for security)
console.log(`Twilio Config: SID=${TWILIO_SID?.substring(0, 8)}..., Token=${TWILIO_TOKEN ? `${TWILIO_TOKEN.substring(0, 4)}...` : 'NOT SET'}, WhatsApp=${TWILIO_WHATSAPP_NUMBER}`);

const twilioClient = twilio(TWILIO_SID, TWILIO_TOKEN);

// ENT Flu Triage Questionnaire Flow
const ENT_FLU_FLOW = [
  { id: "RF_SOB", text: "Trouble breathing at rest? (yes/no)", type: "yesno" },
  { id: "RF_CP", text: "Chest pain or pressure? (yes/no)", type: "yesno" },
  { id: "RF_NEURO", text: "Confusion, fainting, or severe weakness? (yes/no)", type: "yesno" },
  { id: "RF_DEHY", text: "Unable to keep fluids down or signs of dehydration? (yes/no)", type: "yesno" },
  { id: "ONSET_DAYS", text: "How many days since symptoms started? (number)", type: "number" },
  { id: "FEVER", text: "Fever ≥100.4°F / 38°C? (yes/no)", type: "yesno" },
  { id: "ACHES", text: "Body aches or marked fatigue? (yes/no)", type: "yesno" },
  { id: "COUGH", text: "Cough? (yes/no)", type: "yesno" },
  { id: "SORE_THROAT", text: "Sore throat? (yes/no)", type: "yesno" },
  { id: "CONGESTION", text: "Nasal congestion or sinus pressure? (yes/no)", type: "yesno" },
  { id: "EAR_PAIN", text: "Ear pain or fullness? (yes/no)", type: "yesno" },
  { id: "GI", text: "Nausea or diarrhea? (yes/no)", type: "yesno" },
  { id: "PREGNANT", text: "Are you pregnant? (yes/no)", type: "yesno" },
  { id: "HTN", text: "Do you have high blood pressure? (yes/no)", type: "yesno" },
  { id: "ANXIETY", text: "Anxiety/panic or very sensitive to stimulants? (yes/no)", type: "yesno" },
  { id: "SSRI", text: "Do you take an SSRI/SNRI antidepressant? (yes/no)", type: "yesno" },
  { id: "ALLERGIES", text: "Any medication allergies? (short answer)", type: "text" },
  { id: "COVID_POS", text: "COVID test positive? (yes/no/not tested)", type: "choice" },
  { id: "FLU_POS", text: "Flu test positive? (yes/no/not tested)", type: "choice" }
];

// Helper function to parse patient answers
function parseAnswer(type: string, raw: string): boolean | number | string {
  const v = raw.toLowerCase().trim();
  if (type === "yesno") return ["yes", "y", "yeah", "yep", "true", "1"].includes(v);
  if (type === "number") return Number(v) || 0;
  if (type === "choice") {
    if (v.startsWith("y")) return "yes";
    if (v.startsWith("n")) return "no";
    return "not tested";
  }
  return raw.trim();
}

// Compute medical proposal based on answers
function computeProposal(a: Record<string, any>) {
  const redFlag =
    a.RF_SOB === true || a.RF_CP === true || a.RF_NEURO === true || a.RF_DEHY === true;

  const onsetDays = typeof a.ONSET_DAYS === "number" ? a.ONSET_DAYS : null;

  const tamifluEligible =
    !redFlag &&
    onsetDays !== null &&
    onsetDays <= 2 &&
    a.FEVER === true &&
    a.ACHES === true;

  const paxlovidFlag = a.COVID_POS === "yes";

  // Med suggestions (simple baseline + pruning)
  const meds: string[] = ["acetaminophen", "saline nasal spray", "guaifenesin"];
  const avoid: string[] = [];

  if (a.SSRI === true) avoid.push("dextromethorphan");
  if (a.HTN === true || a.ANXIETY === true) avoid.push("pseudoephedrine/phenylephrine");
  if (a.PREGNANT === true) avoid.push("ibuprofen/NSAIDs");

  const disposition = redFlag ? "urgent_or_ed" : "self_care_with_precautions";

  const tests: string[] = [];
  tests.push("COVID antigen/NAAT (if available)");
  if (tamifluEligible) tests.push("Influenza test (if available)");

  return { redFlag, tamifluEligible, paxlovidFlag, meds, avoid, tests, disposition };
}

// Build physician summary for review
function buildPhysicianSummary(a: Record<string, any>, p: ReturnType<typeof computeProposal>) {
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
      
      console.log(`Flow state: index=${flowIndex}, answers=${JSON.stringify(answers)}`);
      
      let responseMessage: string;
      
      // If this is the first message (flowIndex = 0), send the first question
      if (flowIndex === 0) {
        const firstQuestion = ENT_FLU_FLOW[0];
        responseMessage = `Welcome to the ENT Flu Triage System. I'll ask you a series of questions to assess your symptoms.\n\n${firstQuestion.text}`;
        
        await storage.updateEncounter(encounter.id, {
          flowIndex: 1,
        });
      } else {
        // Save the answer for the previous question
        const prevQuestion = ENT_FLU_FLOW[flowIndex - 1];
        const parsed = parseAnswer(prevQuestion.type, msg);
        answers[prevQuestion.id] = parsed;
        
        console.log(`Saved answer for ${prevQuestion.id}: ${parsed}`);
        
        // Check if we've completed all questions
        if (flowIndex >= ENT_FLU_FLOW.length) {
          // Compute proposal and finalize
          const proposal = computeProposal(answers);
          const physicianSummary = buildPhysicianSummary(answers, proposal);
          
          // Determine urgency based on red flags
          const urgencyLevel = proposal.redFlag ? "urgent" : "routine";
          
          await storage.updateEncounter(encounter.id, {
            answers: JSON.stringify(answers),
            proposal: JSON.stringify(proposal),
            physicianSummary: JSON.stringify(physicianSummary),
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
          const nextQuestion = ENT_FLU_FLOW[flowIndex];
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
      
      let responseMessage: string;
      let newStatus = encounter.status;
      
      // Process flow
      if (flowIndex === 0) {
        const firstQuestion = ENT_FLU_FLOW[0];
        responseMessage = `Welcome to the ENT Flu Triage System. I'll ask you a series of questions to assess your symptoms.\n\n${firstQuestion.text}`;
        
        await storage.updateEncounter(encounter.id, {
          flowIndex: 1,
        });
      } else {
        // Save the answer for the previous question
        const prevQuestion = ENT_FLU_FLOW[flowIndex - 1];
        const parsed = parseAnswer(prevQuestion.type, msg);
        answers[prevQuestion.id] = parsed;
        
        if (flowIndex >= ENT_FLU_FLOW.length) {
          // Finalize
          const proposal = computeProposal(answers);
          const physicianSummary = buildPhysicianSummary(answers, proposal);
          const urgencyLevel = proposal.redFlag ? "urgent" : "routine";
          
          await storage.updateEncounter(encounter.id, {
            answers: JSON.stringify(answers),
            proposal: JSON.stringify(proposal),
            physicianSummary: JSON.stringify(physicianSummary),
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
          const nextQuestion = ENT_FLU_FLOW[flowIndex];
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
        questionsRemaining: ENT_FLU_FLOW.length - (encounter.flowIndex ?? 0),
      });
    } catch (error) {
      console.error("Simulate message error:", error);
      res.status(500).json({ error: "Failed to process message" });
    }
  });

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
