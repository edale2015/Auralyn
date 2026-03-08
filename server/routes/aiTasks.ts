import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { runAiReasoning } from "../services/ai/aiReasoningService";
import { listTemplates } from "../services/ai/promptTemplates";
import { checkSafety } from "../services/ai/aiSafetyGuardrails";

export const aiTasksRouter = Router();

aiTasksRouter.get("/templates", requireRole(["admin", "physician"]), async (_req, res) => {
  res.json({ templates: listTemplates() });
});

aiTasksRouter.post("/reason", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    const { templateId, variables } = req.body;
    if (!templateId) { res.status(400).json({ error: "templateId required" }); return; }

    const inputCheck = checkSafety(JSON.stringify(variables || {}));
    if (!inputCheck.safe) { res.status(400).json({ error: "Safety check failed", flags: inputCheck.flags }); return; }

    const result = await runAiReasoning({ templateId, variables: variables || {} });

    const outputCheck = checkSafety(result.output);
    res.json({ ...result, safetyCheck: outputCheck });
  } catch (err: any) { res.status(500).json({ error: err?.message ?? "Failed" }); }
});

aiTasksRouter.post("/safety-check", requireRole(["admin", "physician"]), async (req, res) => {
  const { content } = req.body;
  res.json(checkSafety(content || ""));
});
