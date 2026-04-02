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

// ── IMMUTABILITY: PUT is restricted to metadata-only fields ──────────────────
// Clinical fields (complaint, answers, symptoms, expectedDiagnosis, expectedDisposition)
// cannot be edited on an existing golden case. Use POST /:id/supersede to create a
// new versioned replacement. This enforces golden-case immutability for FDA auditability.
const IMMUTABLE_FIELDS = ['complaint', 'answers', 'symptoms', 'expectedDiagnosis', 'expectedDisposition'];

goldenCasesRouter.put('/:id', requireRole(['admin', 'physician']), async (req, res) => {
  try {
    const attempted = Object.keys(req.body).filter(k => IMMUTABLE_FIELDS.includes(k));
    if (attempted.length > 0) {
      return res.status(409).json({
        error: 'GOLDEN_CASE_IMMUTABLE',
        message: `Clinical fields [${attempted.join(', ')}] cannot be edited on an existing golden case. Use POST /:id/supersede to create a versioned replacement.`,
        immutableFields: IMMUTABLE_FIELDS,
      });
    }
    const db = getFirestore();
    await db.collection(COLLECTION).doc(req.params.id).update({ ...req.body, updatedAt: new Date().toISOString() });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── DEPRECATE: marks a case as deprecated without creating a replacement ──────
goldenCasesRouter.post('/:id/deprecate', requireRole(['admin']), async (req, res) => {
  try {
    const db = getFirestore();
    const ref = db.collection(COLLECTION).doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Case not found' });
    const data = doc.data() ?? {};
    if (data.status === 'deprecated') return res.status(409).json({ error: 'Already deprecated' });
    await ref.update({
      status: 'deprecated',
      deprecatedAt: new Date().toISOString(),
      deprecatedBy: (req as any).user?.email ?? 'admin',
      deprecationReason: req.body.reason ?? 'Manual deprecation',
    });
    res.json({ ok: true, id: req.params.id, status: 'deprecated' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── SUPERSEDE: deprecates old case + creates a new versioned replacement ──────
// This is the ONLY way to modify clinical content of a golden case.
goldenCasesRouter.post('/:id/supersede', requireRole(['admin', 'physician']), async (req, res) => {
  try {
    const db = getFirestore();
    const oldRef = db.collection(COLLECTION).doc(req.params.id);
    const oldDoc = await oldRef.get();
    if (!oldDoc.exists) return res.status(404).json({ error: 'Case not found' });
    const oldData = oldDoc.data() ?? {};
    if (oldData.status === 'deprecated') {
      return res.status(409).json({ error: 'Cannot supersede an already-deprecated case' });
    }
    const body = req.body as Partial<GoldenCase>;
    if (!body.complaint || !body.expectedDiagnosis || !body.expectedDisposition) {
      return res.status(400).json({ error: 'complaint, expectedDiagnosis, and expectedDisposition are required for the replacement case' });
    }
    const newVersion = (oldData.version ?? 1) + 1;
    const newDoc = {
      complaint: body.complaint,
      answers: body.answers ?? {},
      symptoms: body.symptoms ?? [],
      expectedDiagnosis: body.expectedDiagnosis,
      expectedDisposition: body.expectedDisposition,
      notes: body.notes,
      tags: body.tags ?? [],
      version: newVersion,
      status: 'active',
      supersedes: req.params.id,
      createdBy: (req as any).user?.email ?? 'unknown',
      createdAt: new Date().toISOString(),
    };
    const newRef = await db.collection(COLLECTION).add(newDoc);
    await oldRef.update({
      status: 'deprecated',
      deprecatedAt: new Date().toISOString(),
      deprecatedBy: (req as any).user?.email ?? 'admin',
      replacedBy: newRef.id,
      deprecationReason: req.body.reason ?? `Superseded by version ${newVersion}`,
    });
    res.status(201).json({ ok: true, newId: newRef.id, oldId: req.params.id, version: newVersion });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE: hard delete is disabled — deprecate instead ──────────────────────
goldenCasesRouter.delete('/:id', requireRole(['admin']), async (req, res) => {
  return res.status(405).json({
    error: 'HARD_DELETE_DISABLED',
    message: 'Golden cases cannot be hard-deleted to preserve audit trail and FDA traceability. Use POST /:id/deprecate instead.',
    deprecateEndpoint: `/api/golden-cases/${req.params.id}/deprecate`,
  });
});
