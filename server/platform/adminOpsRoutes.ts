import express from "express";
import { evaluateReleaseGate } from "./releaseGateService";
import { getDeploymentReadiness } from "./deploymentReadinessService";
import { buildUnifiedReviewQueue } from "./reviewQueueService";
import { listTenantCaseRecords } from "./tenantCaseStore";
import { PLATFORM_CONFIGS } from "./platformConfig";

const router = express.Router();

router.get("/api/platform/deployment-readiness", async (_req, res) => {
  try {
    const result = await getDeploymentReadiness();
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/api/platform/release-gate/:complaint", async (req, res) => {
  try {
    const siteId = String(req.query.siteId ?? "default");
    const result = await evaluateReleaseGate(req.params.complaint, siteId);
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/api/platform/review-queue", async (_req, res) => {
  try {
    const queue = await buildUnifiedReviewQueue();
    res.json({ ok: true, queue });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/api/platform/tenant-cases", async (req, res) => {
  try {
    const siteId = String(req.query.siteId ?? "default");
    const limit = Number(req.query.limit ?? 50);
    const records = await listTenantCaseRecords(siteId, limit);
    res.json({ ok: true, records });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/api/platform/config", async (req, res) => {
  try {
    const siteId = String(req.query.siteId ?? "default");
    const config =
      PLATFORM_CONFIGS.find((c) => c.siteId === siteId) ?? PLATFORM_CONFIGS[0];
    res.json({ ok: true, config });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
