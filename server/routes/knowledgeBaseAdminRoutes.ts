import { Router, Request, Response } from "express";
import { db } from "../db";
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

const router = Router();

function changeId() { return `kc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; }

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
}

// ── Seed trigger ─────────────────────────────────────────────────────────────
router.post("/seed", async (_req: Request, res: Response) => {
  try {
    await seedKnowledgeBase();
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
    const body = insertKbDiagnosisRuleSchema.parse(req.body);
    const [row] = await db.insert(kbDiagnosisRules).values(body).returning();
    await logChange("diagnosis_rule", row.ruleId, "create", null, row);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.patch("/diagnosis/:ruleId", async (req: Request, res: Response) => {
  try {
    const old = await db.select().from(kbDiagnosisRules).where(eq(kbDiagnosisRules.ruleId, req.params.ruleId));
    if (!old[0]) return res.status(404).json({ error: "Not found" });
    const [row] = await db.update(kbDiagnosisRules).set({ ...req.body, updatedAt: new Date() }).where(eq(kbDiagnosisRules.ruleId, req.params.ruleId)).returning();
    await logChange("diagnosis_rule", row.ruleId, "update", old[0], row, req.body.rationale);
    res.json(row);
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
