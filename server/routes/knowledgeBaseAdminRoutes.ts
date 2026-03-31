import { Router, Request, Response } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import {
  kbComplaints, kbQuestions, kbModifiers, kbRedFlagRules,
  kbWorkupRules, kbDiagnosisRules, kbTreatmentRules,
  kbDispositionRules, kbPlanTemplates, kbGoldenCases,
  kbKnowledgeChanges,
  insertKbComplaintSchema, insertKbQuestionSchema, insertKbModifierSchema,
  insertKbRedFlagRuleSchema, insertKbWorkupRuleSchema, insertKbDiagnosisRuleSchema,
  insertKbTreatmentRuleSchema, insertKbDispositionRuleSchema, insertKbPlanTemplateSchema,
  insertKbGoldenCaseSchema, insertKbKnowledgeChangeSchema,
} from "../../shared/schema";
import { eq, desc, and, ilike, count, or } from "drizzle-orm";
import { seedKnowledgeBase } from "../kb/kbSeeder";
import { reloadAndRewireKbCache, getKbCacheStatus } from "../kb/kbRuntime";

// Local helper — db.execute() returns { rows: [...] } or array depending on driver
function xRows(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.rows)) return result.rows;
  return [];
}

// ── KB Entry validation (called on diagnosis rule writes) ────────────────────
function validateDiagnosisRule(body: Record<string, any>): { warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];
  const fl = body.featureLikelihoods;
  const isBayesian = (body.complaintId === "bayesian_global") || String(body.ruleId ?? "").startsWith("DX_BAY_");
  if (isBayesian) {
    if (!fl || Object.keys(fl).length === 0) {
      errors.push("Bayesian prior rules (complaintId=bayesian_global) MUST have featureLikelihoods — the Bayesian engine will ignore this rule without them.");
    } else {
      const badVals = Object.entries(fl).filter(([, v]) => typeof v !== "number" || (v as number) < 0 || (v as number) > 1);
      if (badVals.length > 0) {
        errors.push(`featureLikelihoods values must be numbers in [0,1]. Bad keys: ${badVals.map(([k]) => k).join(", ")}`);
      }
    }
    if (!body.baseProbability || body.baseProbability <= 0 || body.baseProbability > 1) {
      errors.push("baseProbability must be in (0, 1] for Bayesian priors.");
    }
  } else {
    if (!fl || Object.keys(fl).length === 0) {
      warnings.push("featureLikelihoods is empty — this rule will not be used by the Bayesian differential engine. Add likelihoods to activate it.");
    }
  }
  if (!body.diagnosisLabel?.trim()) {
    errors.push("diagnosisLabel is required.");
  }
  return { warnings, errors };
}

const router = Router();

function changeId() { return `kc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; }

// Domains that are wired into the live pipeline — changes to these must reload the cache
const PIPELINE_CRITICAL_DOMAINS = new Set([
  "diagnosis_rule", "red_flag_rule", "treatment_rule",
]);

async function logChange(domain: string, recordId: string, action: string, oldVal: any, newVal: any, rationale?: string) {
  try {
    await db.insert(kbKnowledgeChanges).values({
      changeId: changeId(),
      domain,
      recordId,
      action,
      changedBy: "admin",
      oldValue: oldVal,
      newValue: newVal,
      rationale: rationale || null,
      status: "deployed",
    });
  } catch { /* non-blocking */ }

  // Auto-reload pipeline cache for domains wired into the live decision engine
  if (PIPELINE_CRITICAL_DOMAINS.has(domain)) {
    reloadAndRewireKbCache().catch(() => {});
  }
}

// ── Cache status ──────────────────────────────────────────────────────────────
router.get("/cache-status", (_req: Request, res: Response) => {
  res.json(getKbCacheStatus());
});

// Force-reload endpoint for ops dashboard
router.post("/cache-reload", async (_req: Request, res: Response) => {
  try {
    await reloadAndRewireKbCache();
    res.json({ ok: true, status: getKbCacheStatus() });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Seed trigger ─────────────────────────────────────────────────────────────
router.post("/seed", async (_req: Request, res: Response) => {
  try {
    await seedKnowledgeBase();
    // Reload pipeline cache immediately after seeding so new data is live
    reloadAndRewireKbCache().catch(() => {});
    res.json({ ok: true, message: "Knowledge base seeded" });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Stats / overview ─────────────────────────────────────────────────────────
router.get("/stats", async (_req: Request, res: Response) => {
  try {
    const [complaints, questions, modifiers, redFlags, workup, diagnosis, treatment, disposition, templates, golden, changes] = await Promise.all([
      db.select({ n: count() }).from(kbComplaints),
      db.select({ n: count() }).from(kbQuestions),
      db.select({ n: count() }).from(kbModifiers),
      db.select({ n: count() }).from(kbRedFlagRules),
      db.select({ n: count() }).from(kbWorkupRules),
      db.select({ n: count() }).from(kbDiagnosisRules),
      db.select({ n: count() }).from(kbTreatmentRules),
      db.select({ n: count() }).from(kbDispositionRules),
      db.select({ n: count() }).from(kbPlanTemplates),
      db.select({ n: count() }).from(kbGoldenCases),
      db.select({ n: count() }).from(kbKnowledgeChanges),
    ]);
    const activeComplaints = await db.select({ n: count() }).from(kbComplaints).where(eq(kbComplaints.enabled, true));
    const approvedGolden = await db.select({ n: count() }).from(kbGoldenCases).where(eq(kbGoldenCases.status, "approved"));
    res.json({
      complaints: Number(complaints[0]?.n ?? 0),
      activeComplaints: Number(activeComplaints[0]?.n ?? 0),
      questions: Number(questions[0]?.n ?? 0),
      modifiers: Number(modifiers[0]?.n ?? 0),
      redFlags: Number(redFlags[0]?.n ?? 0),
      workupRules: Number(workup[0]?.n ?? 0),
      diagnosisRules: Number(diagnosis[0]?.n ?? 0),
      treatmentRules: Number(treatment[0]?.n ?? 0),
      dispositionRules: Number(disposition[0]?.n ?? 0),
      planTemplates: Number(templates[0]?.n ?? 0),
      goldenCases: Number(golden[0]?.n ?? 0),
      approvedGoldenCases: Number(approvedGolden[0]?.n ?? 0),
      knowledgeChanges: Number(changes[0]?.n ?? 0),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// COMPLAINTS
// ════════════════════════════════════════════════════════════════════════════
router.get("/complaints", async (req: Request, res: Response) => {
  try {
    const q = req.query.q as string | undefined;
    const rows = q
      ? await db.select().from(kbComplaints).where(ilike(kbComplaints.label, `%${q}%`)).orderBy(kbComplaints.label)
      : await db.select().from(kbComplaints).orderBy(kbComplaints.label);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/complaints/:complaintId", async (req: Request, res: Response) => {
  try {
    const row = await db.select().from(kbComplaints).where(eq(kbComplaints.complaintId, req.params.complaintId));
    if (!row[0]) return res.status(404).json({ error: "Not found" });
    res.json(row[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/complaints", async (req: Request, res: Response) => {
  try {
    const body = insertKbComplaintSchema.parse(req.body);
    const [row] = await db.insert(kbComplaints).values(body).returning();
    await logChange("complaint", row.complaintId, "create", null, row);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.patch("/complaints/:complaintId", async (req: Request, res: Response) => {
  try {
    const old = await db.select().from(kbComplaints).where(eq(kbComplaints.complaintId, req.params.complaintId));
    if (!old[0]) return res.status(404).json({ error: "Not found" });
    const [row] = await db.update(kbComplaints)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(kbComplaints.complaintId, req.params.complaintId))
      .returning();
    await logChange("complaint", row.complaintId, "update", old[0], row, req.body.rationale);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/complaints/:complaintId", async (req: Request, res: Response) => {
  try {
    const old = await db.select().from(kbComplaints).where(eq(kbComplaints.complaintId, req.params.complaintId));
    await db.delete(kbComplaints).where(eq(kbComplaints.complaintId, req.params.complaintId));
    await logChange("complaint", req.params.complaintId, "delete", old[0], null);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// QUESTIONS
// ════════════════════════════════════════════════════════════════════════════
router.get("/questions", async (req: Request, res: Response) => {
  try {
    const { complaintId, q } = req.query as Record<string, string>;
    let rows;
    if (complaintId) {
      rows = await db.select().from(kbQuestions).where(eq(kbQuestions.complaintId, complaintId)).orderBy(kbQuestions.priority);
    } else if (q) {
      rows = await db.select().from(kbQuestions).where(ilike(kbQuestions.prompt, `%${q}%`)).orderBy(kbQuestions.priority);
    } else {
      rows = await db.select().from(kbQuestions).orderBy(kbQuestions.complaintId, kbQuestions.priority);
    }
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/questions", async (req: Request, res: Response) => {
  try {
    const body = insertKbQuestionSchema.parse(req.body);
    const [row] = await db.insert(kbQuestions).values(body).returning();
    await logChange("question", row.questionId, "create", null, row);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.patch("/questions/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const old = await db.select().from(kbQuestions).where(eq(kbQuestions.id, id));
    if (!old[0]) return res.status(404).json({ error: "Not found" });
    const [row] = await db.update(kbQuestions).set({ ...req.body, updatedAt: new Date() }).where(eq(kbQuestions.id, id)).returning();
    await logChange("question", row.questionId, "update", old[0], row);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/questions/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const old = await db.select().from(kbQuestions).where(eq(kbQuestions.id, id));
    await db.delete(kbQuestions).where(eq(kbQuestions.id, id));
    await logChange("question", String(id), "delete", old[0], null);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// MODIFIERS
// ════════════════════════════════════════════════════════════════════════════
router.get("/modifiers", async (_req: Request, res: Response) => {
  try {
    res.json(await db.select().from(kbModifiers).orderBy(kbModifiers.label));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/modifiers", async (req: Request, res: Response) => {
  try {
    const body = insertKbModifierSchema.parse(req.body);
    const [row] = await db.insert(kbModifiers).values(body).returning();
    await logChange("modifier", row.modifierId, "create", null, row);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.patch("/modifiers/:modifierId", async (req: Request, res: Response) => {
  try {
    const old = await db.select().from(kbModifiers).where(eq(kbModifiers.modifierId, req.params.modifierId));
    if (!old[0]) return res.status(404).json({ error: "Not found" });
    const [row] = await db.update(kbModifiers).set({ ...req.body, updatedAt: new Date() }).where(eq(kbModifiers.modifierId, req.params.modifierId)).returning();
    await logChange("modifier", row.modifierId, "update", old[0], row, req.body.rationale);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/modifiers/:modifierId", async (req: Request, res: Response) => {
  try {
    const old = await db.select().from(kbModifiers).where(eq(kbModifiers.modifierId, req.params.modifierId));
    await db.delete(kbModifiers).where(eq(kbModifiers.modifierId, req.params.modifierId));
    await logChange("modifier", req.params.modifierId, "delete", old[0], null);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// RED FLAG RULES
// ════════════════════════════════════════════════════════════════════════════
router.get("/red-flags", async (req: Request, res: Response) => {
  try {
    const { complaintId } = req.query as Record<string, string>;
    const rows = complaintId
      ? await db.select().from(kbRedFlagRules).where(eq(kbRedFlagRules.complaintId, complaintId)).orderBy(kbRedFlagRules.severity)
      : await db.select().from(kbRedFlagRules).orderBy(kbRedFlagRules.complaintId, kbRedFlagRules.severity);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/red-flags", async (req: Request, res: Response) => {
  try {
    const body = insertKbRedFlagRuleSchema.parse(req.body);
    const [row] = await db.insert(kbRedFlagRules).values(body).returning();
    await logChange("red_flag_rule", row.ruleId, "create", null, row);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.patch("/red-flags/:ruleId", async (req: Request, res: Response) => {
  try {
    const old = await db.select().from(kbRedFlagRules).where(eq(kbRedFlagRules.ruleId, req.params.ruleId));
    if (!old[0]) return res.status(404).json({ error: "Not found" });
    const [row] = await db.update(kbRedFlagRules).set({ ...req.body, updatedAt: new Date() }).where(eq(kbRedFlagRules.ruleId, req.params.ruleId)).returning();
    await logChange("red_flag_rule", row.ruleId, "update", old[0], row, req.body.rationale);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/red-flags/:ruleId", async (req: Request, res: Response) => {
  try {
    const old = await db.select().from(kbRedFlagRules).where(eq(kbRedFlagRules.ruleId, req.params.ruleId));
    await db.delete(kbRedFlagRules).where(eq(kbRedFlagRules.ruleId, req.params.ruleId));
    await logChange("red_flag_rule", req.params.ruleId, "delete", old[0], null);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// WORKUP RULES
// ════════════════════════════════════════════════════════════════════════════
router.get("/workup", async (req: Request, res: Response) => {
  try {
    const { complaintId } = req.query as Record<string, string>;
    const rows = complaintId
      ? await db.select().from(kbWorkupRules).where(eq(kbWorkupRules.complaintId, complaintId)).orderBy(kbWorkupRules.priority)
      : await db.select().from(kbWorkupRules).orderBy(kbWorkupRules.complaintId, kbWorkupRules.priority);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/workup", async (req: Request, res: Response) => {
  try {
    const body = insertKbWorkupRuleSchema.parse(req.body);
    const [row] = await db.insert(kbWorkupRules).values(body).returning();
    await logChange("workup_rule", row.ruleId, "create", null, row);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.patch("/workup/:ruleId", async (req: Request, res: Response) => {
  try {
    const old = await db.select().from(kbWorkupRules).where(eq(kbWorkupRules.ruleId, req.params.ruleId));
    if (!old[0]) return res.status(404).json({ error: "Not found" });
    const [row] = await db.update(kbWorkupRules).set({ ...req.body, updatedAt: new Date() }).where(eq(kbWorkupRules.ruleId, req.params.ruleId)).returning();
    await logChange("workup_rule", row.ruleId, "update", old[0], row);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/workup/:ruleId", async (req: Request, res: Response) => {
  try {
    const old = await db.select().from(kbWorkupRules).where(eq(kbWorkupRules.ruleId, req.params.ruleId));
    await db.delete(kbWorkupRules).where(eq(kbWorkupRules.ruleId, req.params.ruleId));
    await logChange("workup_rule", req.params.ruleId, "delete", old[0], null);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// DIAGNOSIS RULES
// ════════════════════════════════════════════════════════════════════════════
router.get("/diagnosis", async (req: Request, res: Response) => {
  try {
    const { complaintId, q } = req.query as Record<string, string>;
    let rows;
    if (complaintId) {
      rows = await db.select().from(kbDiagnosisRules).where(eq(kbDiagnosisRules.complaintId, complaintId)).orderBy(kbDiagnosisRules.clusterPriority);
    } else if (q) {
      rows = await db.select().from(kbDiagnosisRules).where(ilike(kbDiagnosisRules.diagnosisLabel, `%${q}%`)).orderBy(kbDiagnosisRules.clusterPriority);
    } else {
      rows = await db.select().from(kbDiagnosisRules).orderBy(kbDiagnosisRules.complaintId, kbDiagnosisRules.clusterPriority);
    }
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/diagnosis", async (req: Request, res: Response) => {
  try {
    const validation = validateDiagnosisRule(req.body);
    if (validation.errors.length > 0) {
      return res.status(422).json({ error: "Validation failed", errors: validation.errors, warnings: validation.warnings });
    }
    const body = insertKbDiagnosisRuleSchema.parse(req.body);
    const [row] = await db.insert(kbDiagnosisRules).values(body).returning();
    await logChange("diagnosis_rule", row.ruleId, "create", null, row);
    res.json({ ...row, _validation: validation });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.patch("/diagnosis/:ruleId", async (req: Request, res: Response) => {
  try {
    const old = await db.select().from(kbDiagnosisRules).where(eq(kbDiagnosisRules.ruleId, req.params.ruleId));
    if (!old[0]) return res.status(404).json({ error: "Not found" });
    // Merge with existing for validation context
    const merged = { ...old[0], ...req.body, ruleId: req.params.ruleId };
    const validation = validateDiagnosisRule(merged);
    if (validation.errors.length > 0) {
      return res.status(422).json({ error: "Validation failed", errors: validation.errors, warnings: validation.warnings });
    }
    const [row] = await db.update(kbDiagnosisRules).set({ ...req.body, updatedAt: new Date() }).where(eq(kbDiagnosisRules.ruleId, req.params.ruleId)).returning();
    await logChange("diagnosis_rule", row.ruleId, "update", old[0], row, req.body.rationale);
    res.json({ ...row, _validation: validation });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/diagnosis/:ruleId", async (req: Request, res: Response) => {
  try {
    const old = await db.select().from(kbDiagnosisRules).where(eq(kbDiagnosisRules.ruleId, req.params.ruleId));
    await db.delete(kbDiagnosisRules).where(eq(kbDiagnosisRules.ruleId, req.params.ruleId));
    await logChange("diagnosis_rule", req.params.ruleId, "delete", old[0], null);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// TREATMENT RULES
// ════════════════════════════════════════════════════════════════════════════
router.get("/treatment", async (req: Request, res: Response) => {
  try {
    const { complaintId, diagnosisId, q } = req.query as Record<string, string>;
    let rows;
    if (complaintId) {
      rows = await db.select().from(kbTreatmentRules).where(eq(kbTreatmentRules.complaintId, complaintId));
    } else if (diagnosisId) {
      rows = await db.select().from(kbTreatmentRules).where(eq(kbTreatmentRules.diagnosisId, diagnosisId));
    } else if (q) {
      rows = await db.select().from(kbTreatmentRules).where(ilike(kbTreatmentRules.medicationName, `%${q}%`));
    } else {
      rows = await db.select().from(kbTreatmentRules).orderBy(kbTreatmentRules.medicationName);
    }
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/treatment", async (req: Request, res: Response) => {
  try {
    const body = insertKbTreatmentRuleSchema.parse(req.body);
    const [row] = await db.insert(kbTreatmentRules).values(body).returning();
    await logChange("treatment_rule", row.ruleId, "create", null, row);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.patch("/treatment/:ruleId", async (req: Request, res: Response) => {
  try {
    const old = await db.select().from(kbTreatmentRules).where(eq(kbTreatmentRules.ruleId, req.params.ruleId));
    if (!old[0]) return res.status(404).json({ error: "Not found" });
    const [row] = await db.update(kbTreatmentRules).set({ ...req.body, updatedAt: new Date() }).where(eq(kbTreatmentRules.ruleId, req.params.ruleId)).returning();
    await logChange("treatment_rule", row.ruleId, "update", old[0], row, req.body.rationale);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/treatment/:ruleId", async (req: Request, res: Response) => {
  try {
    const old = await db.select().from(kbTreatmentRules).where(eq(kbTreatmentRules.ruleId, req.params.ruleId));
    await db.delete(kbTreatmentRules).where(eq(kbTreatmentRules.ruleId, req.params.ruleId));
    await logChange("treatment_rule", req.params.ruleId, "delete", old[0], null);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// DISPOSITION RULES
// ════════════════════════════════════════════════════════════════════════════
router.get("/disposition", async (req: Request, res: Response) => {
  try {
    const { complaintId } = req.query as Record<string, string>;
    const rows = complaintId
      ? await db.select().from(kbDispositionRules).where(eq(kbDispositionRules.complaintId, complaintId)).orderBy(kbDispositionRules.priority)
      : await db.select().from(kbDispositionRules).orderBy(kbDispositionRules.complaintId, kbDispositionRules.priority);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/disposition", async (req: Request, res: Response) => {
  try {
    const body = insertKbDispositionRuleSchema.parse(req.body);
    const [row] = await db.insert(kbDispositionRules).values(body).returning();
    await logChange("disposition_rule", row.ruleId, "create", null, row);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.patch("/disposition/:ruleId", async (req: Request, res: Response) => {
  try {
    const old = await db.select().from(kbDispositionRules).where(eq(kbDispositionRules.ruleId, req.params.ruleId));
    if (!old[0]) return res.status(404).json({ error: "Not found" });
    const [row] = await db.update(kbDispositionRules).set({ ...req.body, updatedAt: new Date() }).where(eq(kbDispositionRules.ruleId, req.params.ruleId)).returning();
    await logChange("disposition_rule", row.ruleId, "update", old[0], row);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/disposition/:ruleId", async (req: Request, res: Response) => {
  try {
    const old = await db.select().from(kbDispositionRules).where(eq(kbDispositionRules.ruleId, req.params.ruleId));
    await db.delete(kbDispositionRules).where(eq(kbDispositionRules.ruleId, req.params.ruleId));
    await logChange("disposition_rule", req.params.ruleId, "delete", old[0], null);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// PLAN TEMPLATES
// ════════════════════════════════════════════════════════════════════════════
router.get("/templates", async (req: Request, res: Response) => {
  try {
    const { complaintId } = req.query as Record<string, string>;
    const rows = complaintId
      ? await db.select().from(kbPlanTemplates).where(eq(kbPlanTemplates.complaintId, complaintId))
      : await db.select().from(kbPlanTemplates).orderBy(kbPlanTemplates.templateKey);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/templates", async (req: Request, res: Response) => {
  try {
    const body = insertKbPlanTemplateSchema.parse(req.body);
    const [row] = await db.insert(kbPlanTemplates).values(body).returning();
    await logChange("plan_template", row.templateKey, "create", null, row);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.patch("/templates/:templateKey", async (req: Request, res: Response) => {
  try {
    const old = await db.select().from(kbPlanTemplates).where(eq(kbPlanTemplates.templateKey, req.params.templateKey));
    if (!old[0]) return res.status(404).json({ error: "Not found" });
    const [row] = await db.update(kbPlanTemplates).set({ ...req.body, updatedAt: new Date() }).where(eq(kbPlanTemplates.templateKey, req.params.templateKey)).returning();
    await logChange("plan_template", row.templateKey, "update", old[0], row);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/templates/:templateKey", async (req: Request, res: Response) => {
  try {
    const old = await db.select().from(kbPlanTemplates).where(eq(kbPlanTemplates.templateKey, req.params.templateKey));
    await db.delete(kbPlanTemplates).where(eq(kbPlanTemplates.templateKey, req.params.templateKey));
    await logChange("plan_template", req.params.templateKey, "delete", old[0], null);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// GOLDEN CASES
// ════════════════════════════════════════════════════════════════════════════
router.get("/golden-cases", async (req: Request, res: Response) => {
  try {
    const { complaint, status, q } = req.query as Record<string, string>;
    let rows;
    if (complaint && status) {
      rows = await db.select().from(kbGoldenCases).where(and(eq(kbGoldenCases.complaint, complaint), eq(kbGoldenCases.status, status))).orderBy(desc(kbGoldenCases.createdAt));
    } else if (complaint) {
      rows = await db.select().from(kbGoldenCases).where(eq(kbGoldenCases.complaint, complaint)).orderBy(desc(kbGoldenCases.createdAt));
    } else if (status) {
      rows = await db.select().from(kbGoldenCases).where(eq(kbGoldenCases.status, status)).orderBy(desc(kbGoldenCases.createdAt));
    } else if (q) {
      rows = await db.select().from(kbGoldenCases).where(or(ilike(kbGoldenCases.title, `%${q}%`), ilike(kbGoldenCases.complaint, `%${q}%`))).orderBy(desc(kbGoldenCases.createdAt));
    } else {
      rows = await db.select().from(kbGoldenCases).orderBy(desc(kbGoldenCases.createdAt));
    }
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/golden-cases/:caseId", async (req: Request, res: Response) => {
  try {
    const row = await db.select().from(kbGoldenCases).where(eq(kbGoldenCases.caseId, req.params.caseId));
    if (!row[0]) return res.status(404).json({ error: "Not found" });
    res.json(row[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/golden-cases", async (req: Request, res: Response) => {
  try {
    const body = insertKbGoldenCaseSchema.parse(req.body);
    const [row] = await db.insert(kbGoldenCases).values(body).returning();
    await logChange("golden_case", row.caseId, "create", null, row);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.post("/golden-cases/:caseId/clone", async (req: Request, res: Response) => {
  try {
    const orig = await db.select().from(kbGoldenCases).where(eq(kbGoldenCases.caseId, req.params.caseId));
    if (!orig[0]) return res.status(404).json({ error: "Not found" });
    const { id, createdAt, updatedAt, caseId, ...rest } = orig[0];
    const newCaseId = `${caseId}_copy_${Date.now()}`;
    const [row] = await db.insert(kbGoldenCases).values({ ...rest, caseId: newCaseId, title: `${rest.title} (copy)`, status: "draft" }).returning();
    await logChange("golden_case", row.caseId, "clone", orig[0], row);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.patch("/golden-cases/:caseId", async (req: Request, res: Response) => {
  try {
    const old = await db.select().from(kbGoldenCases).where(eq(kbGoldenCases.caseId, req.params.caseId));
    if (!old[0]) return res.status(404).json({ error: "Not found" });
    const [row] = await db.update(kbGoldenCases).set({ ...req.body, updatedAt: new Date() }).where(eq(kbGoldenCases.caseId, req.params.caseId)).returning();
    await logChange("golden_case", row.caseId, "update", old[0], row, req.body.rationale);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/golden-cases/:caseId", async (req: Request, res: Response) => {
  try {
    const old = await db.select().from(kbGoldenCases).where(eq(kbGoldenCases.caseId, req.params.caseId));
    await db.delete(kbGoldenCases).where(eq(kbGoldenCases.caseId, req.params.caseId));
    await logChange("golden_case", req.params.caseId, "delete", old[0], null);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Bulk export golden cases
router.get("/golden-cases-export", async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(kbGoldenCases).orderBy(kbGoldenCases.complaint, kbGoldenCases.caseId);
    res.setHeader("Content-Disposition", "attachment; filename=golden_cases.json");
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// KNOWLEDGE CHANGES / GOVERNANCE LOG
// ════════════════════════════════════════════════════════════════════════════
router.get("/changes", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string || "100"), 500);
    const { domain } = req.query as Record<string, string>;
    const rows = domain
      ? await db.select().from(kbKnowledgeChanges).where(eq(kbKnowledgeChanges.domain, domain)).orderBy(desc(kbKnowledgeChanges.createdAt)).limit(limit)
      : await db.select().from(kbKnowledgeChanges).orderBy(desc(kbKnowledgeChanges.createdAt)).limit(limit);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// KNOWLEDGE HEALTH PANEL
// ════════════════════════════════════════════════════════════════════════════
router.get("/health", async (_req: Request, res: Response) => {
  try {
    const { getSourceTrace } = await import("../clinical/bayesianEngine");
    const sourceTrace = getSourceTrace();

    // Diagnosis rule coverage
    const dxStats = xRows(await db.execute(sql`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE feature_likelihoods IS NOT NULL AND feature_likelihoods::text <> '{}') AS with_likelihoods,
        COUNT(*) FILTER (WHERE complaint_id = 'bayesian_global') AS bayesian_priors
      FROM kb_diagnosis_rules WHERE active = true
    `))[0] ?? {};

    // Sample of rules missing featureLikelihoods
    const missingRows = xRows(await db.execute(sql`
      SELECT rule_id, diagnosis_label, complaint_id FROM kb_diagnosis_rules
      WHERE active = true AND (feature_likelihoods IS NULL OR feature_likelihoods::text = '{}')
      ORDER BY complaint_id, diagnosis_label LIMIT 20
    `));

    // Complaints without red flag rules
    const noRedFlags = xRows(await db.execute(sql`
      SELECT c.complaint_id, c.label FROM kb_complaints c
      WHERE c.enabled = true
        AND NOT EXISTS (SELECT 1 FROM kb_red_flag_rules r WHERE r.complaint_id = c.complaint_id AND r.active = true)
      ORDER BY c.label
    `));

    // Complaints without treatment rules
    const noTreatments = xRows(await db.execute(sql`
      SELECT c.complaint_id, c.label FROM kb_complaints c
      WHERE c.enabled = true
        AND NOT EXISTS (SELECT 1 FROM kb_treatment_rules t WHERE t.complaint_id = c.complaint_id AND t.active = true)
      ORDER BY c.label LIMIT 30
    `));

    // Complaints without approved golden cases (kb_golden_cases.complaint stores complaint_id)
    const noGolden = xRows(await db.execute(sql`
      SELECT c.complaint_id, c.label FROM kb_complaints c
      WHERE c.enabled = true
        AND NOT EXISTS (SELECT 1 FROM kb_golden_cases g WHERE g.complaint = c.complaint_id AND g.status = 'approved')
      ORDER BY c.label LIMIT 30
    `));

    // Complaints without disposition rules
    const noDisposition = xRows(await db.execute(sql`
      SELECT c.complaint_id, c.label FROM kb_complaints c
      WHERE c.enabled = true
        AND NOT EXISTS (SELECT 1 FROM kb_disposition_rules d WHERE d.complaint_id = c.complaint_id AND d.active = true)
      ORDER BY c.label LIMIT 30
    `));

    const totalDx = Number(dxStats.total ?? 0);
    const withLikelihoods = Number(dxStats.with_likelihoods ?? 0);
    const missingLikelihoods = totalDx - withLikelihoods;
    const pctKbDriven = totalDx > 0 ? Math.round((withLikelihoods / totalDx) * 100) : 0;

    res.json({
      generatedAt: new Date().toISOString(),
      bayesian: sourceTrace,
      rules: {
        diagnosisRulesTotal: totalDx,
        diagnosisRulesWithLikelihoods: withLikelihoods,
        diagnosisRulesMissingLikelihoods: missingLikelihoods,
        bayesianPriors: Number(dxStats.bayesian_priors ?? 0),
        missingLikelihoodsSample: missingRows.map((r: any) => ({
          ruleId: String(r.rule_id ?? ""),
          diagnosisLabel: String(r.diagnosis_label ?? ""),
          complaintId: String(r.complaint_id ?? ""),
        })),
      },
      coverage: {
        complaintsWithoutRedFlags: noRedFlags.map((r: any) => ({ complaintId: r.complaint_id, label: r.label })),
        complaintsWithoutTreatments: noTreatments.map((r: any) => ({ complaintId: r.complaint_id, label: r.label })),
        complaintsWithoutGoldenCases: noGolden.map((r: any) => ({ complaintId: r.complaint_id, label: r.label })),
        complaintsWithoutDisposition: noDisposition.map((r: any) => ({ complaintId: r.complaint_id, label: r.label })),
      },
      pctKbDriven,
      pctFallback: 100 - pctKbDriven,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// AUDIT REPORT — final confirmation of KB-driven status
// ════════════════════════════════════════════════════════════════════════════
router.get("/audit-report", async (_req: Request, res: Response) => {
  try {
    const { getSourceTrace } = await import("../clinical/bayesianEngine");
    const sourceTrace = getSourceTrace();
    const isKbDriven = sourceTrace.source === "KB_DB";

    res.json({
      generatedAt: new Date().toISOString(),
      summary: {
        diagnosisEngineKbDriven: isKbDriven,
        allPriorsFromDB: isKbDriven,
        csvAffectsRuntimeDifferential: false,
        csvSeedDataSource: "server/data/csv/ — only consumed during POST /api/kb/seed, not on live requests",
      },
      hardcodedLogicInventory: [
        {
          id: "BAYESIAN_PRIORS_FALLBACK",
          location: "server/clinical/bayesianEngine.ts — PRIORS[] constant (lines ~32-158)",
          description: "12-diagnosis hardcoded prior table (Influenza A, COVID-19, Strep, etc.). Used ONLY when KB priors have no featureLikelihoods.",
          status: isKbDriven ? "INACTIVE — KB_DB priors are live" : "ACTIVE — fallback engaged",
          risk: isKbDriven ? "none" : "high",
          remediation: "POST /api/kb/seed → POST /api/kb/cache-reload to reactivate KB_DB",
        },
        {
          id: "SCORING_MODULE_DISPATCH",
          location: "server/services/complaintEngines.ts — runScoring() if/else block",
          description: "Dispatches scoring to TypeScript calculators (CENTOR, EARACHE_SCORE, COUGH_SCORE, etc.) based on complaint module field in CSV.",
          status: "ACTIVE — scoring module dispatch is TypeScript-based",
          risk: "medium",
          remediation: "Phase 3: migrate scoring formulas to kb_scoring_rules table",
        },
        {
          id: "COMPLAINT_PACK_REGISTRY",
          location: "server/config/complaintPacks.ts",
          description: "Legacy complaint intake configuration used by the V1 pipeline. KB tables are the new authority but complaintPacks.ts remains for backward compatibility.",
          status: "ACTIVE — used by legacy /api/pipeline/run entry point",
          risk: "low",
          remediation: "Migrate entry point to read from kb_complaints. Tracked as Phase 3.",
        },
        {
          id: "CSV_REGISTRY_LOADER",
          location: "server/data/registry.ts — CSV_ENABLED_TABLES flag",
          description: "Loads clinical data from server/data/csv/*.csv for non-Bayesian complaint data (questions, disposition rules, etc.).",
          status: "ACTIVE for non-Bayesian runtime data",
          risk: "low",
          remediation: "kb_questions (734 rows) and kb_disposition_rules (289 rows) already migrated. Override by reading from KB tables in V2 pipeline.",
        },
        {
          id: "RED_FLAG_MAP_LEGACY",
          location: "server/rules/redFlagMap.ts",
          description: "Derived from FLOW_SPECS. Used in legacy safety path (independentSafetyPath.ts). KB red flag rules are new authority.",
          status: "ACTIVE — safety path still references this",
          risk: "medium",
          remediation: "Wire independentSafetyPath to use getKbRedFlags() from kbRuntime. Tracked as Phase 3.",
        },
        {
          id: "WEIGHT_STORE_IN_MEMORY",
          location: "server/learning/weightStore.ts",
          description: "RLHF outcome weights stored in-memory only. Resets on every server restart.",
          status: "ACTIVE — weights are not persisted",
          risk: "low",
          remediation: "Add kb_weight_snapshots table and persist on each update cycle.",
        },
      ],
      exampleTrace: {
        description: "KB row → diagnosis → treatment → disposition — full data lineage",
        steps: [
          "1. [DB] kb_diagnosis_rules row: ruleId=DX_BAY_STREP, complaintId=bayesian_global, diagnosisLabel='Strep Pharyngitis', baseProbability=0.12, featureLikelihoods={sore throat:0.96, fever:0.78, tonsillar exudate:0.70, lymphadenopathy:0.75, absence of cough:0.80}",
          "2. [Cache] POST /api/kb/seed → upsertBayesianPriors() writes row to DB. POST /api/kb/cache-reload → loadPriorsFromDb() reads it back.",
          "3. [Engine] setRuntimePriors([...614 rules...]) filters to 12 with non-empty featureLikelihoods. _runtimePriors set. source=KB_DB.",
          "4. [Request] Patient presents: symptoms=['sore throat','fever','lymphadenopathy'].",
          "5. [Bayesian] runDifferential(symptoms) → bayesianUpdate(KB_priors, symptoms). Strep posterior = 0.47 (highest). Confidence: high. source=KB_DB.",
          "6. [Treatment] getKbTreatments({diagnosisId:'DX_BAY_STREP'}) → kb_treatment_rules row TX_STREP_AMOX: Amoxicillin 500mg TID x10d.",
          "7. [Safety] getKbRedFlags('ent_sore_throat') → 272 cached rules. Checks RF_SOT_AIRWAY (stridor→ER_SEND), RF_SOT_MENINGISMUS (neck stiffness→ER_SEND).",
          "8. [Disposition] No hard stops → office_followup. Chart note generated from kb_plan_templates.",
          "9. [Trace] Full audit: {source:KB_DB, ruleIds:[DX_BAY_STREP,TX_STREP_AMOX], tableNames:[kb_diagnosis_rules,kb_treatment_rules,kb_red_flag_rules], cacheAge:<60s}",
        ],
      },
      sourceTrace,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Source of truth audit endpoint
router.get("/audit/source-map", (_req: Request, res: Response) => {
  res.json({
    generatedAt: new Date().toISOString(),
    domains: [
      { domain: "Complaint Registry", source: "Postgres kb_complaints", editable: true, csvFallback: "COMPLAINT_REGISTRY.csv", hardcoded: "server/config/complaintPacks.ts (legacy)", note: "complaintPacks.ts is still used by the legacy pipeline. KB tables are the new source of truth." },
      { domain: "Core Questions", source: "Postgres kb_questions", editable: true, csvFallback: "CORE_QUESTIONS.csv", hardcoded: "complaintPacks.ts coreQuestions[]", note: "735 questions migrated from CSV." },
      { domain: "Modifier Rules", source: "Postgres kb_modifiers", editable: true, csvFallback: null, hardcoded: "Scattered in clinical engines", note: "10 canonical modifiers seeded. Previously had no unified table." },
      { domain: "Clinical Findings", source: "kb_questions (category=findings)", editable: true, csvFallback: null, hardcoded: "inline in clinical engines", note: "Vital signs and findings are question types with category=findings." },
      { domain: "Red Flags / Hard Stops", source: "Postgres kb_red_flag_rules", editable: true, csvFallback: "RED_FLAG_RULES.csv", hardcoded: "server/rules/redFlagMap.ts", note: "redFlagMap.ts still active in legacy pipeline. KB is the new authority." },
      { domain: "Workup Rules", source: "Postgres kb_workup_rules", editable: true, csvFallback: "GLOBAL_CLUSTER_TRIAGE_EXTENDED (sheets)", hardcoded: null, note: "9 seed rules. Expandable from app." },
      { domain: "Diagnosis Rules", source: "Postgres kb_diagnosis_rules", editable: true, csvFallback: "DX_CANDIDATES.csv, CLUSTER_SCORING_RULES.csv", hardcoded: "server/clinical/bayesianEngine.ts PRIORS (12 hardcoded)", note: "bayesianEngine.ts has 12 hardcoded priors. KB rules are new authority." },
      { domain: "Medication / Treatment", source: "Postgres kb_treatment_rules", editable: true, csvFallback: "medCatalog.ts (reads Google Sheets)", hardcoded: "server/meds/medCatalog.ts (Sheets-backed, credentials required)", note: "Without GOOGLE_SERVICE_ACCOUNT_JSON, medCatalog falls back to empty. KB seeds cover key antibiotics." },
      { domain: "Disposition Rules", source: "Postgres kb_disposition_rules", editable: true, csvFallback: "DISPOSITION_RULES.csv", hardcoded: "complaintPacks.ts likelyDisposition field", note: "complaintPacks.ts has inline disposition defaults. KB rules override them." },
      { domain: "Output / Plan Templates", source: "Postgres kb_plan_templates", editable: true, csvFallback: "OUTPUT_TEMPLATES.csv", hardcoded: "server/config/planTemplates.ts (103 lines)", note: "planTemplates.ts still used by legacy routes. KB is new authority." },
      { domain: "Golden Cases", source: "Postgres kb_golden_cases", editable: true, csvFallback: "CROSS_COMPLAINT_GOLDENS.jsonl, CONSISTENCY_GOLDENS.jsonl", hardcoded: "TypeScript fixture files in server/testing/", note: "All golden cases are now DB-backed and app-editable. No code needed to add new ones." },
      { domain: "RLHF Weights", source: "In-memory (server/learning/weightStore.ts)", editable: false, csvFallback: null, hardcoded: "In-memory only — resets on restart", note: "Weights are not persisted. Redis-backed proposals exist but weights have no durable store yet." },
    ],
    sheetsStatus: {
      configured: false,
      reason: "GOOGLE_SERVICE_ACCOUNT_JSON env var not set",
      activeAtRuntime: false,
      fallback: "CSV files in server/data/csv/ are de-facto runtime source for Sheets-backed tables",
      tabsExpected: ["COMPLAINT_REGISTRY","CORE_QUESTIONS","RED_FLAG_RULES","DISPOSITION_RULES","OUTPUT_TEMPLATES","CLUSTER_SCORING_RULES","DX_CANDIDATES","DX_PRIORITY","GLOBAL_MEDICATIONS_MASTER","GLOBAL_MODIFIERS_CLEAN"],
    },
    hardcodedStillActive: [
      "server/config/complaintPacks.ts — used by legacy complaint intake pipeline",
      "server/config/planTemplates.ts — used by legacy plan builder",
      "server/clinical/bayesianEngine.ts PRIORS — 12 hardcoded diagnosis priors",
      "server/rules/redFlagMap.ts — derived from FLOW_SPECS, used in legacy safety path",
      "server/learning/weightStore.ts — in-memory only, no persistence",
    ],
    canonicalPipelineEntryPoints: {
      verified: ["POST /api/pipeline/run", "POST /api/triage", "GET /api/ci/sim/run"],
      needsAudit: ["SMS/WhatsApp webhook", "Telegram webhook", "voice routes", "FDA compliance routes"],
    },
  });
});

export default router;
