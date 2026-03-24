import { Router } from "express";
import { storeCaseMemory, findSimilarCases } from "./caseMemoryStore";
import { getEmbeddingStoreSize } from "./hybridMemory";

const router = Router();

router.post("/store", async (req, res) => {
  const { caseId, complaint } = req.body;
  if (!caseId || !complaint) return res.status(400).json({ ok: false, error: "caseId and complaint required" });
  await storeCaseMemory(req.body);
  res.json({ ok: true, caseId, storeSize: getEmbeddingStoreSize() });
});

router.post("/search", async (req, res) => {
  const { query, topK = 5 } = req.body;
  if (!query) return res.status(400).json({ ok: false, error: "query required" });
  const results = await findSimilarCases(String(query), Number(topK));
  res.json({ ok: true, found: results.length, results });
});

router.get("/size", (_req, res) => {
  res.json({ ok: true, embeddingStoreSize: getEmbeddingStoreSize() });
});

export default router;
