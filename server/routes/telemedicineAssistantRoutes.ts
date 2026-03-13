import { Router } from "express";
import { runTelemedicineAssistant } from "../assistant/telemedicineAssistantService";
import { generateChartNoteFromResult } from "../assistant/chartNoteGenerator";
import { generateDischargeFromResult } from "../assistant/dischargeGenerator";
import {
  createSession,
  getSession,
  updateSession,
  addPatientMessage,
  addDoctorMessage,
  setDraftReply,
  listActiveSessions,
  listAllSessions,
  closeSession,
} from "../assistant/telemedicineSessionService";
import { checkSafetyAlerts } from "../assistant/telemedicineSafetyService";
import { getUpdatedDifferential } from "../assistant/telemedicineDifferentialService";
import { getMedicationSuggestions } from "../assistant/telemedicineMedicationSuggestionService";
import { checkMedicationSafety } from "../assistant/telemedicineMedicationSafetyService";
import { generateClinicalCodes } from "../assistant/telemedicineCodingService";
import { getReturnPrecautions, formatDischargeMessage } from "../assistant/telemedicineReturnPrecautionService";
import { generateChartNote } from "../assistant/telemedicineNoteService";
import { CANNED_MESSAGES } from "../assistant/cannedMessages";

const router = Router();

// ─── Canned Doctor Messages ──────────────────────────────────────────────────
router.get("/api/telemed/canned-messages", (_req, res) => {
  res.json({ messages: CANNED_MESSAGES });
});

// ─── Unified Assistant (analyze + record patient message) ───────────────────
router.post("/api/telemed/assistant", async (req, res) => {
  try {
    const { caseId, message } = req.body;
    if (!caseId) return res.status(400).json({ error: "caseId required" });
    if (message?.trim()) addPatientMessage(caseId, message.trim());
    const result = await runTelemedicineAssistant(caseId, message);

    // Auto-generate a draft reply from the top question/recommendation
    const questions: string[] = (result as any).nextQuestions ?? [];
    const diff: { diagnosis: string; score: number }[] = (result as any).differential ?? [];
    let draft = "";
    if (questions.length) {
      draft = questions[0];
    } else if (diff.length) {
      draft = `Based on your description, this looks most consistent with ${diff[0].diagnosis}. Let me send you some care instructions.`;
    }
    if (draft) setDraftReply(caseId, draft);

    res.json({ ok: true, result, draft });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post("/api/telemed/assistant/note", async (req, res) => {
  try {
    const { caseId, message = "" } = req.body;
    if (!caseId) return res.status(400).json({ error: "caseId required" });
    const result = await runTelemedicineAssistant(caseId);
    const note = generateChartNoteFromResult(result, message);
    res.json({ ok: true, note });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post("/api/telemed/assistant/discharge", async (req, res) => {
  try {
    const { caseId, patientName } = req.body;
    if (!caseId) return res.status(400).json({ error: "caseId required" });
    const result = await runTelemedicineAssistant(caseId);
    const discharge = generateDischargeFromResult(result, patientName);
    res.json({ ok: true, discharge });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Session CRUD ────────────────────────────────────────────────────────────
router.post("/api/telemed/session/start", (req, res) => {
  const { caseId, patientInfo } = req.body;
  if (!caseId) return res.status(400).json({ error: "caseId required" });
  const session = createSession(caseId, patientInfo);
  res.json({ ok: true, session });
});

router.get("/api/telemed/sessions", (_req, res) => {
  res.json({ sessions: listActiveSessions() });
});

router.get("/api/telemed/sessions/all", (_req, res) => {
  res.json({ sessions: listAllSessions() });
});

router.get("/api/telemed/session/:caseId", (req, res) => {
  const session = getSession(req.params.caseId);
  res.json(session);
});

// ─── Conversation Thread ─────────────────────────────────────────────────────
router.get("/api/telemed/session/:caseId/conversation", (req, res) => {
  const session = getSession(req.params.caseId);
  res.json({
    caseId: session.caseId,
    conversation: session.conversation,
    draftReply: session.draftReply,
    status: session.status,
    updatedAt: session.updatedAt,
  });
});

// Patient sends a message (for Telegram/WhatsApp webhook simulation or UI test)
router.post("/api/telemed/session/:caseId/patient-message", (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: "text required" });
  const msg = addPatientMessage(req.params.caseId, text.trim());
  res.json({ ok: true, message: msg });
});

// Doctor sends a reply (marks it as sent, clears draft)
router.post("/api/telemed/session/:caseId/doctor-reply", (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: "text required" });
  const msg = addDoctorMessage(req.params.caseId, text.trim());
  res.json({ ok: true, message: msg });
});

// Generate a fresh AI draft reply for the doctor to review
router.post("/api/telemed/session/:caseId/generate-draft", async (req, res) => {
  try {
    const { hint } = req.body;
    const session = getSession(req.params.caseId);
    const result = await runTelemedicineAssistant(req.params.caseId);
    const questions: string[] = (result as any).nextQuestions ?? [];
    const diff: { diagnosis: string; score: number }[] = (result as any).differential ?? [];
    let draft = hint ?? "";
    if (!draft && questions.length) draft = questions[0];
    else if (!draft && diff.length)
      draft = `Based on your description, this looks most consistent with ${diff[0].diagnosis}. I'll send care instructions shortly.`;
    setDraftReply(session.caseId, draft);
    res.json({ ok: true, draft, result });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Update draft reply (doctor edits it)
router.patch("/api/telemed/session/:caseId/draft", (req, res) => {
  const { text } = req.body;
  setDraftReply(req.params.caseId, text ?? "");
  res.json({ ok: true });
});

// Old-style message endpoint kept for backward compat
router.post("/api/telemed/session/:caseId/message", (req, res) => {
  const { message } = req.body;
  if (message) addPatientMessage(req.params.caseId, message);
  res.json({ ok: true });
});

router.post("/api/telemed/session/:caseId/close", (req, res) => {
  closeSession(req.params.caseId, req.body.status ?? "discharged");
  res.json({ ok: true });
});

// ─── Analyze ────────────────────────────────────────────────────────────────
router.post("/api/telemed/analyze", (req, res) => {
  try {
    const {
      caseId,
      complaint,
      symptoms = [],
      patientText = "",
      disposition,
      patientMedications = [],
      allergies = [],
      conditions = [],
    } = req.body;
    if (!caseId) return res.status(400).json({ error: "caseId required" });

    const session = getSession(caseId);
    if (complaint) session.complaint = complaint;
    if (symptoms.length) session.checkedSymptoms = symptoms;
    if (disposition) session.disposition = disposition;

    const allText = `${patientText} ${symptoms.join(" ")}`;
    const safetyAlerts = checkSafetyAlerts(allText, symptoms);
    const differential = complaint ? getUpdatedDifferential(complaint, symptoms, patientText) : [];
    const medicationSuggestions = complaint ? getMedicationSuggestions(complaint, symptoms) : [];
    const medicationAlerts = checkMedicationSafety(
      medicationSuggestions.filter((m) => m.category === "first-line").map((m) => m.name),
      patientMedications,
      allergies,
      [...conditions, ...symptoms]
    );
    const codes =
      complaint && disposition ? generateClinicalCodes(complaint, disposition) : { icd10: [], cpt: [] };
    const returnPrecautions =
      complaint && disposition ? getReturnPrecautions(complaint, disposition) : null;

    updateSession(caseId, {
      complaint,
      checkedSymptoms: symptoms,
      disposition,
      differential: differential.map((d) => ({ diagnosis: d.diagnosis, confidence: d.confidence })),
      safetyAlerts: safetyAlerts.map((a) => a.message),
      redFlags: safetyAlerts.filter((a) => a.severity === "critical").map((a) => a.message),
      medicationSuggestions: medicationSuggestions
        .slice(0, 4)
        .map((m) => `${m.name} ${m.dose} ${m.route} ${m.frequency} × ${m.duration}`),
      medicationAlerts: medicationAlerts.map((a) => a.concern),
      icdCodes: codes.icd10,
      cptCodes: codes.cpt,
      returnPrecautions: returnPrecautions?.immediateReturn ?? [],
    });

    res.json({
      ok: true,
      safetyAlerts,
      differential,
      medicationSuggestions,
      medicationAlerts,
      codes,
      returnPrecautions,
      session: getSession(caseId),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Note / Discharge / Codes ────────────────────────────────────────────────
router.post("/api/telemed/note/:caseId", (req, res) => {
  const session = getSession(req.params.caseId);
  const note = generateChartNote(session);
  updateSession(req.params.caseId, {
    noteGenerated: { hpi: note.hpi, assessment: note.assessment, plan: note.plan, disposition: note.disposition },
  });
  res.json({ ok: true, note });
});

router.post("/api/telemed/discharge/:caseId", (req, res) => {
  const session = getSession(req.params.caseId);
  if (!session.complaint || !session.disposition) {
    return res
      .status(400)
      .json({ error: "Session must have complaint and disposition before generating discharge" });
  }
  const precautions = getReturnPrecautions(session.complaint, session.disposition);
  const message = formatDischargeMessage(precautions, req.body.patientName);
  closeSession(req.params.caseId, "discharged");
  res.json({ ok: true, dischargeMessage: message, precautions });
});

router.post("/api/telemed/codes", (req, res) => {
  const { complaint, disposition } = req.body;
  if (!complaint || !disposition)
    return res.status(400).json({ error: "complaint and disposition required" });
  res.json(generateClinicalCodes(complaint, disposition));
});

router.post("/api/telemed/medication-safety", (req, res) => {
  const { proposedMedications = [], patientMedications = [], allergies = [], conditions = [] } = req.body;
  res.json({ alerts: checkMedicationSafety(proposedMedications, patientMedications, allergies, conditions) });
});

export default router;
