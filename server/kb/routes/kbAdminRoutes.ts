import { Router } from "express";
import { requireKbAdmin } from "../middleware/kbAuthMiddleware";
import {
  previewCanonicalPromotionHandler,
  promoteCanonicalPathwayHandler,
  retireCanonicalPathwayHandler,
  generateCanonicalDraftFromCaseHandler,
} from "../../services/kbAdminConsistencyIntegration";
import { listCanonicalPathways, getCanonicalPathway } from "../services/kbWriteService";

const router = Router();

router.post(
  "/canonical-pathways/preview-promotion",
  requireKbAdmin,
  previewCanonicalPromotionHandler
);

router.post(
  "/canonical-pathways/promote",
  requireKbAdmin,
  promoteCanonicalPathwayHandler
);

router.post(
  "/canonical-pathways/retire",
  requireKbAdmin,
  retireCanonicalPathwayHandler
);

router.post(
  "/canonical-pathways/generate-draft-from-case",
  requireKbAdmin,
  generateCanonicalDraftFromCaseHandler
);

// FIX: Canonical-pathway reads were silently swallowing DB errors and returning
// empty arrays. In a safety-critical admin console, DB failure must surface as a
// 503 so operators know the system is broken, not "just empty."
router.get("/canonical-pathways", async (req, res) => {
  try {
    const { complaintId } = req.query;
    const pathways = await listCanonicalPathways(complaintId as string | undefined);
    res.json({ ok: true, pathways });
  } catch (err: any) {
    res.status(503).json({
      ok: false,
      code: "KB_PATHWAYS_UNAVAILABLE",
      message: err?.message ?? "Canonical pathways unavailable",
    });
  }
});

router.get("/canonical-pathways/:pathwayId", async (req, res) => {
  try {
    const pathway = await getCanonicalPathway(req.params.pathwayId);
    if (!pathway) {
      res.status(404).json({ ok: false, error: "Not found" });
      return;
    }
    res.json({ ok: true, pathway });
  } catch (err: any) {
    res.status(503).json({
      ok: false,
      code: "KB_PATHWAY_UNAVAILABLE",
      message: err?.message ?? "Canonical pathway unavailable",
    });
  }
});

export default router;
