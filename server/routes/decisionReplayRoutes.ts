import { Router } from 'express';
import { requireRole } from '../middleware/requireRole';
import { DecisionReplayEngine } from '../engines/decisionReplayEngine';
import { FirestoreCaseStore } from '../services/firestoreCaseStore';
import { compactQuestionComposer } from '../engines/compactQuestionComposer';
import { telegramMiniAppSchema, getMiniAppSchema, listMiniAppComplaints } from '../channels/telegramMiniAppSchema';
import { whatsappFlowSchema, getWhatsAppFlow, listWhatsAppFlows } from '../channels/whatsappFlowSchema';

export const decisionReplayRouter = Router();
const engine = new DecisionReplayEngine();
const caseStore = new FirestoreCaseStore();

// ── Decision Replay ──────────────────────────────────────────────────────────

decisionReplayRouter.get('/replay/:caseId', requireRole(['admin', 'physician']), async (req, res) => {
  try {
    const caseRecord = await caseStore.getCase(req.params.caseId);
    if (!caseRecord) {
      return res.status(404).json({ error: 'Case not found', caseId: req.params.caseId });
    }
    const includeInputs = req.query.includeInputs !== 'false';
    const replay = engine.buildReplay(caseRecord, { includeInputs });
    res.json(replay);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

decisionReplayRouter.get('/replay/:caseId/steps', requireRole(['admin', 'physician']), async (req, res) => {
  try {
    const caseRecord = await caseStore.getCase(req.params.caseId);
    if (!caseRecord) return res.status(404).json({ error: 'Case not found' });
    const replay = engine.buildReplay(caseRecord, { includeInputs: false });
    res.json({ caseId: replay.caseId, complaint: replay.complaint, totalSteps: replay.totalSteps, steps: replay.steps.map((s) => ({ engine: s.engine, layer: s.layer, confidence: s.confidence, durationMs: s.durationMs, timestamp: s.timestamp })) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

decisionReplayRouter.get('/replay/demo/:complaint', requireRole(['admin', 'physician']), (req, res) => {
  const replay = engine.buildDemoReplay(req.params.complaint);
  res.json(replay);
});

// ── Compact Question Composer ────────────────────────────────────────────────

decisionReplayRouter.post('/compose/telegram', requireRole(['admin', 'physician']), (req, res) => {
  try {
    const { bundle } = req.body;
    if (!bundle?.complaint || !Array.isArray(bundle?.questions)) {
      return res.status(400).json({ error: 'bundle with complaint and questions required' });
    }
    res.json(compactQuestionComposer.toTelegram(bundle));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

decisionReplayRouter.post('/compose/telegram-mini-app', requireRole(['admin', 'physician']), (req, res) => {
  try {
    const { bundle } = req.body;
    if (!bundle?.complaint || !Array.isArray(bundle?.questions)) {
      return res.status(400).json({ error: 'bundle required' });
    }
    res.json(compactQuestionComposer.toTelegramMiniApp(bundle));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

decisionReplayRouter.post('/compose/whatsapp', requireRole(['admin', 'physician']), (req, res) => {
  try {
    const { bundle } = req.body;
    if (!bundle?.complaint || !Array.isArray(bundle?.questions)) {
      return res.status(400).json({ error: 'bundle required' });
    }
    res.json(compactQuestionComposer.toWhatsApp(bundle));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

decisionReplayRouter.post('/compose/all', requireRole(['admin', 'physician']), (req, res) => {
  try {
    const { bundle } = req.body;
    if (!bundle?.complaint || !Array.isArray(bundle?.questions)) {
      return res.status(400).json({ error: 'bundle required' });
    }
    res.json({
      telegram: compactQuestionComposer.toTelegram(bundle),
      telegramMiniApp: compactQuestionComposer.toTelegramMiniApp(bundle),
      whatsapp: compactQuestionComposer.toWhatsApp(bundle),
      whatsappFlow: compactQuestionComposer.toWhatsAppFlow(bundle),
      sms: compactQuestionComposer.toSMSShortForm(bundle),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Schema Registry ──────────────────────────────────────────────────────────

decisionReplayRouter.get('/schemas/telegram-mini-app', requireRole(['admin', 'physician']), (_req, res) => {
  res.json({ complaints: listMiniAppComplaints(), schemas: telegramMiniAppSchema });
});

decisionReplayRouter.get('/schemas/telegram-mini-app/:complaint', requireRole(['admin', 'physician']), (req, res) => {
  const schema = getMiniAppSchema(req.params.complaint);
  if (!schema) return res.status(404).json({ error: 'Schema not found for complaint', complaint: req.params.complaint });
  res.json(schema);
});

decisionReplayRouter.get('/schemas/whatsapp', requireRole(['admin', 'physician']), (_req, res) => {
  res.json({ complaints: listWhatsAppFlows(), flows: whatsappFlowSchema });
});

decisionReplayRouter.get('/schemas/whatsapp/:complaint', requireRole(['admin', 'physician']), (req, res) => {
  const flow = getWhatsAppFlow(req.params.complaint);
  if (!flow) return res.status(404).json({ error: 'Flow not found for complaint', complaint: req.params.complaint });
  res.json(flow);
});

decisionReplayRouter.get('/schemas/compose-preview/:complaint', requireRole(['admin', 'physician']), (req, res) => {
  const schema = getMiniAppSchema(req.params.complaint);
  if (!schema) return res.status(404).json({ error: 'No schema for complaint' });
  const bundle = { complaint: schema.complaint, questions: schema.questions.map((q: any) => ({ id: q.id, text: q.label ?? q.text, type: q.type, options: q.options })) };
  res.json({
    complaint: req.params.complaint,
    telegram: compactQuestionComposer.toTelegram(bundle),
    telegramMiniApp: compactQuestionComposer.toTelegramMiniApp(bundle),
    whatsapp: compactQuestionComposer.toWhatsApp(bundle),
    whatsappFlow: compactQuestionComposer.toWhatsAppFlow(bundle),
    sms: compactQuestionComposer.toSMSShortForm(bundle),
  });
});
