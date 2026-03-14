import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { getLangChainTools, executeLangChainTool, runLangChainSequence } from "../langchain/triageTools";

export const langchainRouter = Router();

langchainRouter.get("/api/langchain/tools", requireRole(["admin", "physician"]), (_req, res) => {
  res.json({ tools: getLangChainTools(), count: getLangChainTools().length });
});

langchainRouter.post("/api/langchain/run", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    const { tool, input } = req.body;
    if (!tool) return res.status(400).json({ error: "tool name required" });
    const t0 = Date.now();
    const output = await executeLangChainTool(tool, input || {});
    res.json({ tool, output, latencyMs: Date.now() - t0 });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Tool execution failed" });
  }
});

langchainRouter.post("/api/langchain/chain", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    const { steps } = req.body;
    if (!Array.isArray(steps) || steps.length === 0) return res.status(400).json({ error: "steps array required" });
    if (steps.length > 10) return res.status(400).json({ error: "Maximum 10 steps per chain" });
    const result = await runLangChainSequence(steps);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Chain execution failed" });
  }
});
