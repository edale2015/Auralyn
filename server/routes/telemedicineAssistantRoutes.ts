import { Router } from "express";
import { createSession, getSession, updateSession, listActiveSessions, listAllSessions, closeSession } from "../assistant/telemedicineSessionService";
import { checkSafetyAlerts } from "../assistant/telemedicineSafetyService";
import { getUpdatedDifferential } from "../assistant/telemedicineDifferentialService";
import { getMedicationSuggestions } from "../assistant/telemedicineMedicationSuggestionService";
import { checkMedicationSafety } from "../assistant/telemedicineMedicationSafetyService";
import { generateClinicalCodes } from "../assistant/telemedicineCodingService";
import { getReturnPrecautions, formatDischargeMessage } from "../assistant/telemedicineReturnPrecautionService";
import { generateChartNote } from "../assistant/telemedicineNoteService";

const router = Router();

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

router.post("/api/telemed/session/:caseId/message", (req, res) => {
  const { message } = req.body;
  const session = getSession(req.params.caseId);
  if (message) session.patientMessages.push(message);
  res.json({ ok: true });
});

router.post("/api/telemed/session/:caseId/close", (req, res) => {
  closeSession(req.params.caseId, req.body.status ?? "discharged");
  res.json({ ok: true });
});

router.post("/api/telemed/analyze", (req, res) => {
  try {
    const { caseId, complaint, symptoms = [], patientText = "", disposition, patientMedications = [], allergies = [], conditions = [] } = req.body;
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
      medicationSuggestions.filter(m => m.category === "first-line").map(m => m.name),
      patientMedications,
      allergies,
      [...conditions, ...symptoms]
    );
    const codes = complaint && disposition ? generateClinicalCodes(complaint, disposition) : { icd10: [], cpt: [] };
    const returnPrecautions = complaint && disposition ? getReturnPrecautions(complaint, disposition) : null;

    updateSession(caseId, {
      complaint,
      checkedSymptoms: symptoms,
      disposition,
      differential: differential.map(d => ({ diagnosis: d.diagnosis, confidence: d.confidence })),
      safetyAlerts: safetyAlerts.map(a => a.message),
      redFlags: safetyAlerts.filter(a => a.severity === "critical").map(a => a.message),
      medicationSuggestions: medicationSuggestions.slice(0, 4).map(m => `${m.name} ${m.dose} ${m.route} ${m.frequency} × ${m.duration}`),
      medicationAlerts: medicationAlerts.map(a => a.concern),
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

router.post("/api/telemed/note/:caseId", (req, res) => {
  const session = getSession(req.params.caseId);
  const note = generateChartNote(session);
  updateSession(req.params.caseId, { noteGenerated: { hpi: note.hpi, assessment: note.assessment, plan: note.plan, disposition: note.disposition } });
  res.json({ ok: true, note });
});

router.post("/api/telemed/discharge/:caseId", (req, res) => {
  const session = getSession(req.params.caseId);
  if (!session.complaint || !session.disposition) {
    return res.status(400).json({ error: "Session must have complaint and disposition before generating discharge" });
  }
  const precautions = getReturnPrecautions(session.complaint, session.disposition);
  const message = formatDischargeMessage(precautions, req.body.patientName);
  closeSession(req.params.caseId, "discharged");
  res.json({ ok: true, dischargeMessage: message, precautions });
});

router.post("/api/telemed/codes", (req, res) => {
  const { complaint, disposition } = req.body;
  if (!complaint || !disposition) return res.status(400).json({ error: "complaint and disposition required" });
  res.json(generateClinicalCodes(complaint, disposition));
});

router.post("/api/telemed/medication-safety", (req, res) => {
  const { proposedMedications = [], patientMedications = [], allergies = [], conditions = [] } = req.body;
  res.json({ alerts: checkMedicationSafety(proposedMedications, patientMedications, allergies, conditions) });
});

export default router;
