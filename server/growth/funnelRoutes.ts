import { Router } from "express";
import { trackEvent, getConversionStats, generatePatientLink, getNYCLinks, getRecentEvents } from "./funnelEngine";

const router = Router();

router.post("/track", (req, res) => {
  const { source, step, zip, caseId, patientId } = req.body;
  if (!source || !step) return res.status(400).json({ ok: false, error: "source and step required" });
  const event = trackEvent({ source, step, zip, caseId, patientId, metadata: req.body.metadata });
  res.json({ ok: true, event });
});

router.get("/stats", (req, res) => {
  const source = req.query.source as string | undefined;
  const stats = getConversionStats(source);
  res.json({ ok: true, stats });
});

router.get("/link/:zip", (req, res) => {
  const link = generatePatientLink(req.params.zip, (req.query.source as string) ?? "nyc_campaign", req.query.complaint as string);
  res.json({ ok: true, zip: req.params.zip, link });
});

router.get("/nyc/links", (_req, res) => {
  res.json({ ok: true, links: getNYCLinks() });
});

router.get("/events", (req, res) => {
  const limit = parseInt(String(req.query.limit ?? "50"));
  res.json({ ok: true, events: getRecentEvents(limit) });
});

export default router;
