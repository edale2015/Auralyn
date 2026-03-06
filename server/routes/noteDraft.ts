import { Router } from "express";
import { noteGeneratorService } from "../services/noteGenerator";
import { firestoreCaseStore } from "../services/firestoreCaseStore";
import { requireRole } from "../middleware/requireRole";

export const noteDraftRouter = Router();

noteDraftRouter.get("/:caseId", requireRole(["admin", "physician", "staff"]), async (req, res) => {
  try {
    const { caseId } = req.params;
    const caseRecord = await firestoreCaseStore.getCase(caseId);

    if (!caseRecord) {
      return res.status(404).json({ error: "Case not found" });
    }

    res.json({
      caseId,
      noteDraft: caseRecord.noteDraft || null,
      hasDraft: Boolean(caseRecord.noteDraft)
    });
  } catch (e: any) {
    console.error("[NoteDraft] get error:", e);
    res.status(500).json({ error: e.message });
  }
});

noteDraftRouter.post("/:caseId/generate", requireRole(["admin", "physician", "staff"]), async (req, res) => {
  try {
    const { caseId } = req.params;
    const result = await noteGeneratorService.generateForCase(caseId);
    res.json(result);
  } catch (e: any) {
    console.error("[NoteDraft] generate error:", e);
    const code = e.message?.includes("not found") ? 404 : 500;
    res.status(code).json({ error: e.message });
  }
});

noteDraftRouter.post("/:caseId/save", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    const { caseId } = req.params;
    const { noteDraft, physicianSummary } = req.body ?? {};

    if (noteDraft !== undefined && typeof noteDraft !== "string") {
      return res.status(400).json({ error: "noteDraft must be a string" });
    }
    if (physicianSummary !== undefined && typeof physicianSummary !== "string") {
      return res.status(400).json({ error: "physicianSummary must be a string" });
    }
    if (noteDraft === undefined && physicianSummary === undefined) {
      return res.status(400).json({ error: "provide noteDraft or physicianSummary" });
    }

    const caseRecord = await firestoreCaseStore.getCase(caseId);
    if (!caseRecord) {
      return res.status(404).json({ error: "Case not found" });
    }

    const patch: Record<string, any> = {};
    if (noteDraft !== undefined) patch.noteDraft = noteDraft;
    if (physicianSummary !== undefined) patch.physicianSummary = physicianSummary;

    await firestoreCaseStore.patchCase(caseId, patch);

    res.json({ ok: true });
  } catch (e: any) {
    console.error("[NoteDraft] save error:", e);
    res.status(500).json({ error: e.message });
  }
});
