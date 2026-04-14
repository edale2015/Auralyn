// INDEPENDENT REVIEW FIX:
//  1. All endpoints exposed PHI (case complaint text, diagnosis history) with zero
//     authentication. Any HTTP client could read or write clinical case memories.
//  2. async handlers had no try/catch — an unhandled rejection crashes the Express process.

import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { storeCaseMemory, findSimilarCases } from "./caseMemoryStore";
import { getEmbeddingStoreSize } from "./hybridMemory";

const router = Router();

// All case memory endpoints require at minimum "staff" role — they contain PHI.
const requireStaff = requireRole(["admin", "physician", "nurse", "staff"]);

router.post("/store", requireStaff, async (req, res) => {
  try {
    const { caseId, complaint } = req.body;
    if (!caseId || !complaint) {
      res.status(400).json({ ok: false, error: "caseId and complaint required" });
      return;
    }
    await storeCaseMemory(req.body);
    res.json({ ok: true, caseId, storeSize: getEmbeddingStoreSize() });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message ?? "Failed to store case memory" });
  }
});

router.post("/search", requireStaff, async (req, res) => {
  try {
    const { query, topK = 5 } = req.body;
    if (!query) {
      res.status(400).json({ ok: false, error: "query required" });
      return;
    }
    const results = await findSimilarCases(String(query), Number(topK));
    res.json({ ok: true, found: results.length, results });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message ?? "Search failed" });
  }
});

router.get("/size", requireStaff, (_req, res) => {
  res.json({ ok: true, embeddingStoreSize: getEmbeddingStoreSize() });
});

export default router;
