import { Router } from "express";
import {
  registerPhysician,
  selectPhysician,
  getAllPhysicians,
  getPhysician,
  removePhysician,
  updatePhysicianLoad,
  updatePhysicianPerformance,
  getLoadBalancerStats,
} from "./loadBalancer";

const router = Router();

router.post("/register", (req, res) => {
  const { id, name, skills, activeCases = 0, maxCapacity = 10, avgResponseTimeMs = 1000, performanceScore = 0.8, specialty, online = true } = req.body;
  if (!id || !skills || !Array.isArray(skills)) {
    return res.status(400).json({ ok: false, error: "id and skills[] required" });
  }
  const p = registerPhysician({ id, name: name ?? id, skills, activeCases, maxCapacity, avgResponseTimeMs, performanceScore, specialty, online });
  res.json({ ok: true, physician: p });
});

router.post("/select", (req, res) => {
  const { caseId, complaint, riskScore = 0.5 } = req.body;
  if (!caseId || !complaint) return res.status(400).json({ ok: false, error: "caseId and complaint required" });
  const result = selectPhysician({ caseId, complaint, riskScore });
  if (!result) return res.status(503).json({ ok: false, error: "No available physicians for this case" });
  res.json({ ok: true, ...result });
});

router.get("/physicians", (_req, res) => {
  res.json({ ok: true, physicians: getAllPhysicians(), stats: getLoadBalancerStats() });
});

router.get("/physicians/:id", (req, res) => {
  const p = getPhysician(req.params.id);
  if (!p) return res.status(404).json({ ok: false, error: "Physician not found" });
  res.json({ ok: true, physician: p });
});

router.patch("/physicians/:id/load", (req, res) => {
  const delta = parseInt(req.body.delta ?? "0");
  updatePhysicianLoad(req.params.id, delta);
  res.json({ ok: true, physician: getPhysician(req.params.id) });
});

router.patch("/physicians/:id/performance", (req, res) => {
  const { responseTimeMs = 1000, success = true } = req.body;
  updatePhysicianPerformance(req.params.id, responseTimeMs, success);
  res.json({ ok: true, physician: getPhysician(req.params.id) });
});

router.delete("/physicians/:id", (req, res) => {
  const removed = removePhysician(req.params.id);
  res.json({ ok: removed, message: removed ? "Physician removed" : "Physician not found" });
});

router.get("/stats", (_req, res) => {
  res.json({ ok: true, stats: getLoadBalancerStats() });
});

export default router;
