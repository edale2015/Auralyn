import { Router } from 'express';
import { requireRole } from '../middleware/requireRole';
import { GOLDEN_CASE_TEMPLATES, getAllComplaintLabels, getTemplateForComplaint } from '../core/goldenCaseRegistry';
import type { GoldenCase } from '../core/goldenCaseRegistry';
import { getFirestore } from '../firebase';

export const goldenCasesRouter = Router();

const COLLECTION = 'golden_cases';

goldenCasesRouter.get('/templates', requireRole(['admin', 'physician']), (_req, res) => {
  res.json({ templates: GOLDEN_CASE_TEMPLATES, complaints: getAllComplaintLabels() });
});

goldenCasesRouter.get('/templates/:complaint', requireRole(['admin', 'physician']), (req, res) => {
  const template = getTemplateForComplaint(req.params.complaint);
  if (!template) return res.status(404).json({ error: 'No template for this complaint' });
  res.json(template);
});

goldenCasesRouter.get('/', requireRole(['admin', 'physician']), async (_req, res) => {
  try {
    const db = getFirestore();
    const snap = await db.collection(COLLECTION).orderBy('createdAt', 'desc').limit(200).get();
    res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

goldenCasesRouter.get('/complaint/:complaint', requireRole(['admin', 'physician']), async (req, res) => {
  try {
    const db = getFirestore();
    const snap = await db.collection(COLLECTION).where('complaint', '==', req.params.complaint).orderBy('createdAt', 'desc').get();
    res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

goldenCasesRouter.post('/', requireRole(['admin', 'physician']), async (req, res) => {
  try {
    const body = req.body as Partial<GoldenCase>;
    if (!body.complaint || !body.expectedDiagnosis || !body.expectedDisposition) {
      return res.status(400).json({ error: 'complaint, expectedDiagnosis, and expectedDisposition are required' });
    }
    const doc: Omit<GoldenCase, 'id'> = {
      complaint: body.complaint,
      answers: body.answers ?? {},
      symptoms: body.symptoms ?? [],
      expectedDiagnosis: body.expectedDiagnosis,
      expectedDisposition: body.expectedDisposition,
      notes: body.notes,
      createdBy: (req as any).user?.email ?? 'unknown',
      createdAt: new Date().toISOString(),
      tags: body.tags ?? [],
    };
    const db = getFirestore();
    const ref = await db.collection(COLLECTION).add(doc);
    res.status(201).json({ id: ref.id, ...doc });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

goldenCasesRouter.put('/:id', requireRole(['admin', 'physician']), async (req, res) => {
  try {
    const db = getFirestore();
    await db.collection(COLLECTION).doc(req.params.id).update({ ...req.body, updatedAt: new Date().toISOString() });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

goldenCasesRouter.delete('/:id', requireRole(['admin']), async (req, res) => {
  try {
    const db = getFirestore();
    await db.collection(COLLECTION).doc(req.params.id).delete();
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
