import { Router } from "express";
import { getCodeTable, mapCodes, getComplaintsForCoding, getDispositionsForComplaint } from "../sl6/icd10Mapper";

const router = Router();

router.get("/api/sl6/code-table", (_req, res) => {
  res.json({ table: getCodeTable() });
});

router.get("/api/sl6/complaints", (_req, res) => {
  res.json({ complaints: getComplaintsForCoding() });
});

router.get("/api/sl6/dispositions", (req, res) => {
  const complaint = String(req.query.complaint ?? "");
  res.json({ dispositions: getDispositionsForComplaint(complaint) });
});

router.post("/api/sl6/map-codes", (req, res) => {
  const { complaint, disposition } = req.body;
  if (!complaint || !disposition) {
    return res.status(400).json({ error: "complaint and disposition are required" });
  }
  const mapping = mapCodes(complaint, disposition);
  if (!mapping) {
    return res.status(404).json({ error: "No mapping found for this complaint/disposition combination" });
  }
  res.json(mapping);
});

export default router;
