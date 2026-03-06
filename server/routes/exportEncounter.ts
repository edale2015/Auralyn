import { Router } from "express";
import { ecwSidecarExportService } from "../services/ecwSidecarExport";
import { firestoreCaseStore } from "../services/firestoreCaseStore";
import { requireRole } from "../middleware/requireRole";

export const exportEncounterRouter = Router();

exportEncounterRouter.get("/:caseId/status", requireRole(["admin", "physician", "staff"]), async (req, res) => {
  try {
    const caseRecord = await firestoreCaseStore.getCase(req.params.caseId);
    if (!caseRecord) {
      return res.status(404).json({ error: "Case not found" });
    }

    res.json({
      caseId: caseRecord.caseId,
      exportedToEcw: caseRecord.exportedToEcw ?? false,
      signoffRequired: caseRecord.signoffRequired,
      reviewStatus: caseRecord.reviewStatus,
      status: caseRecord.status
    });
  } catch (err: any) {
    console.error("[ExportEncounter] status error:", err);
    res.status(500).json({ error: err?.message ?? "Failed to load export status" });
  }
});

exportEncounterRouter.post("/:caseId/export", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    const caseRecord = await firestoreCaseStore.getCase(req.params.caseId);
    if (!caseRecord) {
      return res.status(404).json({ error: "Case not found" });
    }

    if (
      caseRecord.signoffRequired &&
      caseRecord.reviewStatus !== "APPROVED" &&
      caseRecord.reviewStatus !== "OVERRIDDEN"
    ) {
      return res.status(400).json({
        error: "Case must be reviewed and signed off before export"
      });
    }

    const result = await ecwSidecarExportService.exportCase(req.params.caseId);
    res.json(result);
  } catch (err: any) {
    console.error("[ExportEncounter] export error:", err);
    const code = err.message?.includes("not found") ? 404 : 500;
    res.status(code).json({ error: err?.message ?? "Failed to export encounter" });
  }
});
