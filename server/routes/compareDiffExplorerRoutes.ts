import express from "express";
import { exploreCompareDiffs } from "../platform/compareDiffExplorerService";

const router = express.Router();

router.get("/api/platform/compare-diff-explorer", async (req, res) => {
  try {
    const result = await exploreCompareDiffs({
      limit: Number(req.query.limit ?? 200),
      complaint: req.query.complaint ? String(req.query.complaint) : undefined,
      sameDisposition:
        req.query.sameDisposition === undefined
          ? undefined
          : String(req.query.sameDisposition) === "true",
      sameComplaint:
        req.query.sameComplaint === undefined
          ? undefined
          : String(req.query.sameComplaint) === "true",
    });

    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
