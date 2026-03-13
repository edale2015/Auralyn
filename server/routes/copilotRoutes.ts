import { Router } from "express";
import { generateCopilotSuggestions, getCopilotPresets } from "../copilot/clinicalCopilotService";
import { setClinicalState } from "../state/clinicalStateStore";
import { emitClinicalEvent } from "../state/clinicalEventBus";

const router = Router();

router.get("/api/copilot/presets", (_req, res) => {
  res.json(getCopilotPresets());
});

router.post("/api/copilot/suggestions", (req, res) => {
  try {
    const { caseId, complaint, disposition, symptoms, redFlags, differential } = req.body;
    if (!caseId) return res.status(400).json({ error: "caseId is required" });

    if (complaint) emitClinicalEvent(caseId, "COMPLAINT_IDENTIFIED", { complaint });
    if (disposition) emitClinicalEvent(caseId, "DISPOSITION_SET", { disposition });
    if (symptoms) emitClinicalEvent(caseId, "SYMPTOMS_RECORDED", { symptoms });
    if (redFlags?.length) emitClinicalEvent(caseId, "RED_FLAG_DETECTED", { flags: redFlags });
    if (differential?.length) emitClinicalEvent(caseId, "DIFFERENTIAL_UPDATED", { differential });

    const output = generateCopilotSuggestions(caseId);
    res.json(output);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
