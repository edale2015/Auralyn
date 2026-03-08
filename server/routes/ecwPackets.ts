import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { buildEcwPacket } from "../services/ecwEncounterPacketBuilder";
import { buildExportManifest } from "../services/ecwExportManifestService";

export const ecwPacketsRouter = Router();

ecwPacketsRouter.get("/manifest", requireRole(["admin", "physician"]), async (_req, res) => {
  try {
    const manifest = await buildExportManifest();
    res.json(manifest);
  } catch (err: any) { res.status(500).json({ error: err?.message ?? "Failed" }); }
});

ecwPacketsRouter.get("/:caseId", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    const packet = await buildEcwPacket(req.params.caseId);
    if (!packet) { res.status(404).json({ error: "Case not found" }); return; }
    res.json(packet);
  } catch (err: any) { res.status(500).json({ error: err?.message ?? "Failed" }); }
});
