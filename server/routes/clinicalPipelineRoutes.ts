import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import { db } from "../db";
import { eq, desc } from "drizzle-orm";
import {
  kbComplaints, kbQuestions, kbRedFlagRules, kbDiagnosisRules,
  kbWorkupRules, kbTreatmentRules, kbDispositionRules, kbKnowledgeChanges,
} from "../../shared/schema";

const router = Router();

router.use(requireRole(["admin", "physician", "clinician"]));

// ── Full complaint bundle — one call returns all KB layers ─────────────────────
router.get("/:complaintId/bundle", async (req: Request, res: Response) => {
  const { complaintId } = req.params;
  try {
    const [complaint, questions, redFlags, diagnosis, workup, treatment, disposition, changes] = await Promise.all([
      db.select().from(kbComplaints).where(eq(kbComplaints.complaintId, complaintId)),
      db.select().from(kbQuestions).where(eq(kbQuestions.complaintId, complaintId)).orderBy(kbQuestions.order),
      db.select().from(kbRedFlagRules).where(eq(kbRedFlagRules.complaintId, complaintId)),
      db.select().from(kbDiagnosisRules).where(eq(kbDiagnosisRules.complaintId, complaintId)),
      db.select().from(kbWorkupRules).where(eq(kbWorkupRules.complaintId, complaintId)),
      db.select().from(kbTreatmentRules).where(eq(kbTreatmentRules.complaintId, complaintId)),
      db.select().from(kbDispositionRules).where(eq(kbDispositionRules.complaintId, complaintId)),
      db.select().from(kbKnowledgeChanges).where(eq(kbKnowledgeChanges.complaintId, complaintId)).orderBy(desc(kbKnowledgeChanges.createdAt)).limit(20),
    ]);

    if (!complaint[0]) return res.status(404).json({ error: "Complaint not found" });

    res.json({
      complaint: complaint[0],
      layers: {
        questions: { count: questions.length, rows: questions },
        redFlags: { count: redFlags.length, rows: redFlags },
        diagnosis: { count: diagnosis.length, rows: diagnosis },
        workup: { count: workup.length, rows: workup },
        treatment: { count: treatment.length, rows: treatment },
        disposition: { count: disposition.length, rows: disposition },
      },
      changeHistory: changes,
      summary: {
        totalRules: questions.length + redFlags.length + diagnosis.length + workup.length + treatment.length + disposition.length,
        hasRedFlags: redFlags.length > 0,
        hasDisposition: disposition.length > 0,
        hasDiagnosis: diagnosis.length > 0,
        lastChanged: changes[0]?.createdAt ?? null,
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Live clinical trace — run symptoms through Bayesian engine with full KB provenance ──
router.post("/:complaintId/trace", async (req: Request, res: Response) => {
  const { complaintId } = req.params;
  const { symptoms = [], freeText = "" } = req.body;

  if (!Array.isArray(symptoms) || symptoms.length === 0) {
    return res.status(400).json({ error: "symptoms must be a non-empty array of strings" });
  }

  try {
    const { runDifferential, getSourceTrace } = await import("../clinical/bayesianEngine");
    const { getKbCacheStatus, reloadAndRewireKbCache } = await import("../kb/kbRuntime");

    const cacheStatus = getKbCacheStatus();
    if (!cacheStatus || cacheStatus.priors?.count === 0) {
      await reloadAndRewireKbCache();
    }

    const sourceTrace = getSourceTrace();
    const differentials = runDifferential(symptoms);

    const [redFlags, disposition] = await Promise.all([
      db.select().from(kbRedFlagRules).where(eq(kbRedFlagRules.complaintId, complaintId)),
      db.select().from(kbDispositionRules).where(eq(kbDispositionRules.complaintId, complaintId)),
    ]);

    const triggeredRedFlags = redFlags.filter(rf => {
      const trigger = (rf.triggerKeywords ?? []) as string[];
      return trigger.some(kw => symptoms.includes(kw) || freeText.toLowerCase().includes(kw.toLowerCase()));
    });

    const topDx = differentials[0];
    let suggestedDisposition: any = null;
    if (topDx) {
      suggestedDisposition = disposition.find(d =>
        (d.conditionId ?? "").toLowerCase().includes(topDx.diagnosis.toLowerCase().slice(0, 6))
      ) ?? disposition[0] ?? null;
    }

    res.json({
      ok: true,
      complaintId,
      symptoms,
      freeText,
      engineSource: sourceTrace.source,
      activeRuleCount: sourceTrace.priorCount,
      pipeline: [
        {
          stage: "red_flag_check",
          label: "Red Flag Detection",
          triggered: triggeredRedFlags.length > 0,
          results: triggeredRedFlags.map(rf => ({
            ruleId: rf.ruleId,
            description: rf.description,
            severity: rf.severity,
            action: rf.action,
            tableName: "kb_red_flag_rules",
          })),
          allRuleCount: redFlags.length,
        },
        {
          stage: "bayesian_differential",
          label: "Bayesian Differential Engine",
          triggered: differentials.length > 0,
          results: differentials.slice(0, 5).map((d, i) => ({
            rank: i + 1,
            diagnosis: d.diagnosis,
            posterior: d.posterior,
            confidence: d.confidence,
            matchedFeatures: d.matchedFeatures,
            ruleId: d.ruleId ?? null,
            tableName: d.tableName ?? (d.source === "KB_DB" ? "kb_diagnosis_rules" : "hardcoded"),
            source: d.source ?? sourceTrace.source,
          })),
          allRuleCount: sourceTrace.priorCount,
        },
        {
          stage: "disposition_lookup",
          label: "Disposition Rule Selection",
          triggered: suggestedDisposition !== null,
          results: suggestedDisposition
            ? [{
                ruleId: suggestedDisposition.ruleId,
                disposition: suggestedDisposition.disposition,
                priority: suggestedDisposition.priority,
                conditionId: suggestedDisposition.conditionId,
                tableName: "kb_disposition_rules",
              }]
            : [],
          allRuleCount: disposition.length,
        },
      ],
      finalDisposition: triggeredRedFlags.length > 0
        ? "ESCALATE_IMMEDIATELY"
        : (suggestedDisposition?.disposition ?? topDx?.confidence === "high" ? "refer_specialist" : "routine_care"),
      isEscalated: triggeredRedFlags.length > 0,
      topDiagnosis: topDx ?? null,
      tracedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── All complaints list (for selector) ──────────────────────────────────────────
router.get("/", async (_req: Request, res: Response) => {
  try {
    const rows = await db.select({
      complaintId: kbComplaints.complaintId,
      label: kbComplaints.label,
      category: kbComplaints.category,
      urgencyLevel: kbComplaints.urgencyLevel,
    }).from(kbComplaints).orderBy(kbComplaints.label);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
