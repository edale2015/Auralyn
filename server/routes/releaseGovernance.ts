import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { listReleases, createRelease, updateGate } from "../services/releaseGovernanceService";

export const releaseGovernanceRouter = Router();

releaseGovernanceRouter.get("/", requireRole(["admin"]), async (_req, res) => {
  res.json({ releases: listReleases() });
});

releaseGovernanceRouter.post("/", requireRole(["admin"]), async (req, res) => {
  try {
    const { version } = req.body;
    if (!version) { res.status(400).json({ error: "version required" }); return; }
    res.json(createRelease(version));
  } catch (err: any) { res.status(500).json({ error: err?.message ?? "Failed" }); }
});

releaseGovernanceRouter.post("/:version/gate", requireRole(["admin"]), async (req, res) => {
  try {
    const { gateId, status } = req.body;
    const result = updateGate(req.params.version, gateId, status);
    if (!result) { res.status(404).json({ error: "Release or gate not found" }); return; }
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err?.message ?? "Failed" }); }
});
