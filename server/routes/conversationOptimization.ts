import { Router } from 'express';
import { requireRole } from '../middleware/requireRole';
import { conversationAuditEngine, type ConversationMessage } from '../core/conversationAuditEngine';
import { conversationToneEngine } from '../core/conversationToneEngine';
import { deEscalationEngine } from '../core/deEscalationEngine';
import { conversationNextBestQuestion, buildQuestionQueue } from '../core/conversationNextBestQuestion';
import { promptImprovementEngine, replayWithBetterTone } from '../core/promptImprovementEngine';

export const conversationOptimizationRouter = Router();

// ── Conversation Audit ────────────────────────────────────────────────────────
conversationOptimizationRouter.post('/audit', requireRole(['admin', 'physician']), (req, res) => {
  try {
    const { messages } = req.body as { messages: ConversationMessage[] };
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array required' });
    }
    res.json(conversationAuditEngine(messages));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Tone Analysis ────────────────────────────────────────────────────────────
conversationOptimizationRouter.post('/tone', requireRole(['admin', 'physician']), (req, res) => {
  try {
    const { text } = req.body as { text: string };
    if (!text) return res.status(400).json({ error: 'text is required' });
    res.json(conversationToneEngine(text));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── De-escalation Protocol ────────────────────────────────────────────────────
conversationOptimizationRouter.post('/de-escalate', requireRole(['admin', 'physician']), (req, res) => {
  try {
    const { patientStatement, emotionalState, complaint } = req.body;
    if (!patientStatement) return res.status(400).json({ error: 'patientStatement is required' });
    res.json(deEscalationEngine({ patientStatement, emotionalState, complaint }));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Next Best Question ────────────────────────────────────────────────────────
conversationOptimizationRouter.post('/next-question', requireRole(['admin', 'physician']), (req, res) => {
  try {
    const { complaint, askedQuestions = [], knownSymptoms = [], conversationTurn = 1 } = req.body;
    if (!complaint) return res.status(400).json({ error: 'complaint is required' });
    const next = conversationNextBestQuestion({ complaint, askedQuestions, knownSymptoms, conversationTurn });
    const queue = buildQuestionQueue({ complaint, askedQuestions, knownSymptoms, conversationTurn }, 5);
    res.json({ next, queue });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Prompt Improvement (GPT-4o) ───────────────────────────────────────────────
conversationOptimizationRouter.post('/improve-prompt', requireRole(['admin', 'physician']), async (req, res) => {
  try {
    const { originalPrompt, context = '', goal = 'clarity', complaint } = req.body;
    if (!originalPrompt) return res.status(400).json({ error: 'originalPrompt is required' });
    const result = await promptImprovementEngine({ originalPrompt, context, goal, complaint });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Replay with Better Tone (GPT-4o) ─────────────────────────────────────────
conversationOptimizationRouter.post('/replay', requireRole(['admin', 'physician']), async (req, res) => {
  try {
    const { messages, targetTone = 'empathy' } = req.body;
    if (!Array.isArray(messages)) return res.status(400).json({ error: 'messages array required' });
    const result = await replayWithBetterTone(messages, targetTone);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Full interaction review ───────────────────────────────────────────────────
conversationOptimizationRouter.post('/full-review', requireRole(['admin', 'physician']), async (req, res) => {
  try {
    const { messages, complaint, askedQuestions = [] } = req.body;
    if (!Array.isArray(messages)) return res.status(400).json({ error: 'messages array required' });

    const audit = conversationAuditEngine(messages);
    const aiText = messages.filter((m: ConversationMessage) => m.role === 'ai').map((m: ConversationMessage) => m.text).join(' ');
    const tone = conversationToneEngine(aiText || 'No AI messages found');
    const nextQ = complaint
      ? conversationNextBestQuestion({ complaint, askedQuestions, conversationTurn: messages.length })
      : null;

    res.json({
      audit,
      tone,
      nextBestQuestion: nextQ,
      summary: {
        grade: audit.grade,
        overallScore: audit.overallScore,
        criticalFlags: audit.flags.filter((f) => f.severity === 'critical').length,
        topImprovement: audit.improvements[0] ?? 'No improvements needed',
        detectedTone: tone.tone,
        jargonTerms: tone.jargonTerms.slice(0, 5),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
