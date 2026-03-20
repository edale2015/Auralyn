import express from "express";
import { requireRole } from "../middleware/requireRole";
import { runFullClinicalFlow, getFlowLog, getOrchestratorMetrics } from "../orchestrator/clinicalOrchestrator";
import { sendSMS, sendWhatsApp, parseSMSIntent } from "../services/smsService";

const router = express.Router();

router.post("/run", requireRole(["admin", "physician", "staff"]), async (req, res) => {
  const { complaint, answers, patientId, channel } = req.body;
  if (!complaint) return res.status(400).json({ error: "complaint is required" });
  const result = await runFullClinicalFlow({ complaint, answers: answers || {}, patientId, channel });
  res.json(result);
});

router.get("/log", requireRole(["admin", "physician"]), (req, res) => {
  const limit = Number(req.query.limit) || 50;
  res.json(getFlowLog(limit));
});

router.get("/metrics", requireRole(["admin"]), (_req, res) => {
  res.json(getOrchestratorMetrics());
});

router.post("/sms/send", requireRole(["admin", "physician", "staff"]), async (req, res) => {
  const { to, body } = req.body;
  if (!to || !body) return res.status(400).json({ error: "to and body are required" });
  const result = await sendSMS(to, body);
  res.json(result);
});

router.post("/sms/whatsapp", requireRole(["admin", "physician", "staff"]), async (req, res) => {
  const { to, body } = req.body;
  if (!to || !body) return res.status(400).json({ error: "to and body are required" });
  const result = await sendWhatsApp(to, body);
  res.json(result);
});

router.post("/sms/parse-intent", requireRole(["admin", "physician", "staff"]), (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "text required" });
  res.json(parseSMSIntent(text));
});

export default router;
