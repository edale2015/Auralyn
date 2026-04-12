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

router.get("/canonical-pathways", async (req, res) => {
  const { complaintId } = req.query;
  const pathways = await listCanonicalPathways(complaintId as string | undefined);
  res.json({ ok: true, pathways });
});

router.get("/canonical-pathways/:pathwayId", async (req, res) => {
  const pathway = await getCanonicalPathway(req.params.pathwayId);
  if (!pathway) return res.status(404).json({ ok: false, error: "Not found" });
  res.json({ ok: true, pathway });
});

export default router;
