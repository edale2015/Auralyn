/**
 * SYSTEM INVENTORY — Single endpoint for full component status
 *
 * Returns a structured map of all major system components:
 *   - Background loops and their heartbeat status
 *   - Performance drift status
 *   - Event loop health
 *   - DB pool stats
 *   - Software version manifest
 *   - Golden case monitor summary
 *   - Memory usage
 *
 * Designed for operator dashboards, CI smoke tests, and FDA audit readiness.
 * GET /api/system/inventory
 */

import { Router } from "express";
import { getAllLoops, getLoopSummary, attemptRestartStaleLoops } from "../monitoring/loopRegistry";
import { getDriftStatus } from "../fda/performanceDriftAlert";
import { getEventLoopStats } from "../monitoring/eventLoopMonitor";
import { getSoftwareVersionManifest } from "../fda/softwareVersionManifest";
import { getMetricsSummary } from "../monitoring/metrics";
import { pg } from "../db/postgres";

export const systemInventoryRouter = Router();

systemInventoryRouter.get("/", async (_req, res) => {
  const [loopSummary, loops, drift, eventLoop, metrics] = await Promise.all([
    Promise.resolve(getLoopSummary()),
    Promise.resolve(getAllLoops()),
    Promise.resolve(getDriftStatus()),
    Promise.resolve(getEventLoopStats()),
    Promise.resolve(getMetricsSummary()),
  ]);

  let dbPoolStats: Record<string, number> = {};
  try {
    dbPoolStats = {
      totalCount: (pg as any).totalCount ?? 0,
      idleCount: (pg as any).idleCount ?? 0,
      waitingCount: (pg as any).waitingCount ?? 0,
    };
  } catch {
    dbPoolStats = { totalCount: -1, idleCount: -1, waitingCount: -1 };
  }

  const mem = process.memoryUsage();

  const inventory = {
    timestamp: new Date().toISOString(),
    system: {
      uptime: Math.round(process.uptime()),
      nodeVersion: process.version,
      memoryMB: {
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
        rss: Math.round(mem.rss / 1024 / 1024),
        external: Math.round(mem.external / 1024 / 1024),
      },
    },
    software: {
      version: getSoftwareVersionManifest().softwareVersion,
      releaseDate: getSoftwareVersionManifest().releaseDate,
      deviceName: getSoftwareVersionManifest().deviceName,
      regulatoryClass: getSoftwareVersionManifest().regulatoryClassification.regulatoryClass,
      intendedUseScope: getSoftwareVersionManifest().intendedUse.description,
    },
    loops: {
      summary: loopSummary,
      details: loops.map((l) => ({
        name: l.name,
        description: l.description,
        status: l.status,
        cycleCount: l.cycleCount,
        errorCount: l.errorCount,
        lastHeartbeatAgoSec: Math.round((Date.now() - l.lastHeartbeat) / 1000),
        uptimeSec: Math.round((Date.now() - l.startedAt) / 1000),
      })),
    },
    performance: {
      drift: drift,
      metrics: metrics,
    },
    infrastructure: {
      eventLoop: eventLoop,
      dbPool: dbPoolStats,
    },
  };

  const overallStatus =
    loopSummary.crashed > 0 || drift.isInDrift || eventLoop.status === "critical"
      ? "degraded"
      : loopSummary.stale > 0 || eventLoop.status === "warning"
        ? "warning"
        : "healthy";

  res.json({ status: overallStatus, inventory });
});

systemInventoryRouter.post("/restart-stale-loops", (_req, res) => {
  const restarted = attemptRestartStaleLoops();
  res.json({ ok: true, restarted });
});

systemInventoryRouter.get("/version-manifest", (_req, res) => {
  res.json(getSoftwareVersionManifest());
});
