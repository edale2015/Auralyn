import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import { listVersions, getVersion } from "../versioning/clinicalVersionStore";
import { createClinicalVersion, getVersionSummary } from "../versioning/clinicalVersionManager";
import { diffVersions } from "../versioning/clinicalVersionDiff";
import { deployClinicalVersion, rollbackClinicalVersion, getCurrentDeploymentInfo } from "../versioning/clinicalRollbackManager";
import { buildClinicalTimeline } from "../versioning/clinicalChangeTimeline";

const router = Router();

router.get("/api/clinical-versions", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  res.json({
    versions: listVersions(),
    summary: getVersionSummary(),
  });
});

router.get("/api/clinical-versions/summary", requireRole(["admin"]), (_req: Request, res: Response) => {
  res.json(getVersionSummary());
});

router.get("/api/clinical-versions/deployment/current", requireRole(["admin"]), (_req: Request, res: Response) => {
  res.json(getCurrentDeploymentInfo());
});

router.get("/api/clinical-versions/diff/:from/:to", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  const diff = diffVersions(req.params.from, req.params.to);
  if (!diff) return res.status(404).json({ error: "One or both versions not found" });
  res.json(diff);
});

router.get("/api/clinical-versions/:id", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  const version = getVersion(req.params.id);
  if (!version) return res.status(404).json({ error: "Version not found" });
  res.json(version);
});

router.post("/api/clinical-versions", requireRole(["admin"]), (req: Request, res: Response) => {
  const { description, sheets, files, summary } = req.body;
  const user = req.authUser?.displayName || req.authUser?.email || "system";

  const version = createClinicalVersion({
    user,
    description,
    sheets,
    files,
    summary,
  });

  res.json(version);
});

router.post("/api/clinical-versions/deploy", requireRole(["admin"]), (req: Request, res: Response) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: "Version id is required" });

  const result = deployClinicalVersion(id, req.authUser?.email);
  if (!result) return res.status(404).json({ error: "Version not found" });
  res.json(result);
});

router.post("/api/clinical-versions/rollback", requireRole(["admin"]), (req: Request, res: Response) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: "Version id is required" });

  const result = rollbackClinicalVersion(id, req.authUser?.email);
  if (!result) return res.status(404).json({ error: "Version not found" });
  res.json(result);
});

router.get("/api/clinical-change-timeline", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  res.json(buildClinicalTimeline());
});

export default router;
