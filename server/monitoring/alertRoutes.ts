import { Router } from "express";
import { emitAlert, getRecentAlerts, getAlertStats, clearAlerts } from "./alertBus";

const router = Router();

router.get("/", (_req, res) => {
  const { n } = _req.query as { n?: string };
  const alerts = getRecentAlerts(n ? parseInt(n) : 50);
  res.json({ ok: true, alerts, stats: getAlertStats() });
});

router.post("/", (req, res) => {
  const { message, severity = "info", source } = req.body ?? {};
  if (!message) return res.status(400).json({ ok: false, error: "message required" });
  const alert = emitAlert(message, severity, source);
  res.json({ ok: true, alert });
});

router.get("/stats", (_req, res) => {
  res.json({ ok: true, ...getAlertStats() });
});

router.delete("/", (_req, res) => {
  clearAlerts();
  res.json({ ok: true, message: "Alert log cleared" });
});

export default router;
