import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { getLangChainTools, executeLangChainTool, runLangChainSequence } from "../langchain/triageTools";
import admin from "firebase-admin";

export const langchainRouter = Router();

const HISTORY_COLLECTION = "langchainChainHistory";
const MAX_HISTORY = 50;

function getHistoryCol() {
  return admin.firestore().collection(HISTORY_COLLECTION);
}

async function saveChainRun(entry: {
  type: "tool" | "chain";
  tool?: string;
  steps?: Array<{ tool: string; input: unknown }>;
  result: unknown;
  latencyMs: number;
  error?: string;
}) {
  try {
    await getHistoryCol().add({
      ...entry,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error("[LangChain] Failed to save run history:", err);
  }
}

langchainRouter.get("/api/langchain/tools", requireRole(["admin", "physician"]), (_req, res) => {
  res.json({ tools: getLangChainTools(), count: getLangChainTools().length });
});

langchainRouter.post("/api/langchain/run", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    const { tool, input } = req.body;
    if (!tool) return res.status(400).json({ error: "tool name required" });
    const t0 = Date.now();
    const output = await executeLangChainTool(tool, input || {});
    const latencyMs = Date.now() - t0;
    const result = { tool, output, latencyMs };
    saveChainRun({ type: "tool", tool, result: output, latencyMs });
    res.json(result);
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
    saveChainRun({ type: "chain", steps, result, latencyMs: result.totalLatencyMs });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Chain execution failed" });
  }
});

langchainRouter.get("/api/langchain/history", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, MAX_HISTORY);
    const snap = await getHistoryCol()
      .orderBy("timestamp", "desc")
      .limit(limit)
      .get();

    const records = snap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        ...d,
        timestamp: d.timestamp?.toDate?.()?.toISOString() ?? null,
      };
    });

    res.json({ count: records.length, history: records });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to fetch chain history" });
  }
});
