import express from "express";
import {
  complaintCoverageMatrix,
  getCoverageForComplaint,
  getOverallCoverageStats,
} from "../analysis/complaintCoverageMatrix";

const router = express.Router();

router.get("/coverage-matrix", (_req, res) => {
  res.json(complaintCoverageMatrix);
});

router.get("/coverage-matrix/stats", (_req, res) => {
  res.json(getOverallCoverageStats());
});

router.get("/coverage-matrix/:complaint", (req, res) => {
  const coverage = getCoverageForComplaint(req.params.complaint);
  if (!coverage) return res.status(404).json({ error: "complaint_not_found" });
  res.json(coverage);
});

export default router;
