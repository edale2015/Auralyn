# Control Tower and Streaming

## Review Prompt

Review this real-time patient monitoring system.
Focus on:
  - Stale state and missed update scenarios
  - Race conditions in concurrent patient streams
  - Incorrect risk prioritization
  - WebSocket auth and tenant isolation gaps
  - Dashboard data consistency under high load

## Files

---

### Final Meta Question (ask after reviewing)

List the **TOP 5 MOST DANGEROUS FAILURE MODES** in this section.
Be specific. Do not give generic advice. Focus on real-world clinical risk.

### server/ws/patientStream.ts

```ts
import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";

let wss: WebSocketServer | null = null;

export function startPatientStreamSocket(server: Server) {
  if (wss) return;
  wss = new WebSocketServer({ server, path: "/ws/patient-stream" });

  wss.on("connection", (ws: WebSocket) => {
    ws.send(JSON.stringify({ type: "connected", ts: Date.now() }));
    ws.on("error", () => {});
  });
}

export function broadcastPatientEvent(payload: object) {
  if (!wss) return;
  const msg = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(msg); } catch {}
    }
  }
}
```

### server/controlTower/validationDashboard.ts

```ts
/**
 * Validation dashboard aggregator for the Control Tower.
 *
 * Reads the last 50 validation runs from the database and surfaces
 * trend data for the frontend dashboard.
 */

import { db } from "../db/client";
import { sql } from "drizzle-orm";

export interface ValidationDashboardData {
  latest:     Record<string, unknown>;
  passRates:  number[];
  unsafeTrend: number[];
  timestamps: string[];
}

export async function getValidationDashboard(): Promise<ValidationDashboardData> {
  const rows = await db.execute(
    sql`SELECT id, summary, created_at FROM validation_runs ORDER BY created_at DESC LIMIT 50`,
  );

  const runs = rows.rows as Array<{ id: string; summary: unknown; created_at: Date }>;

  const summaries = runs.map((r) => (r.summary as Record<string, unknown>) ?? {});
  const latest    = summaries[0] ?? {};

  return {
    latest,
    passRates:   summaries.map((s) => (s.passRate  as number) ?? 0),
    unsafeTrend: summaries.map((s) => (s.unsafeUndercalls as number) ?? 0),
    timestamps:  runs.map((r) => new Date(r.created_at).toISOString()),
  };
}

export async function logValidationRun(summary: Record<string, unknown>): Promise<void> {
  const id = `val_${Date.now()}`;

  await db.execute(
    sql`INSERT INTO validation_runs (id, summary) VALUES (${id}, ${JSON.stringify(summary)})`,
  );
}
```

### server/controlTower/calibrationService.ts

```ts
/**
 * Per-complaint calibration service.
 *
 * Tracks confidence vs accuracy per complaint category so the control
 * tower can surface where the model is systematically over/under confident.
 */

export interface CalibrationResultRow {
  complaint:    string;
  confidence:   number;
  correct:      boolean;
}

export interface ComplaintCalibration {
  avgConfidence: number;
  accuracy:      number;
  gap:           number;           // positive = overconfident
  count:         number;
}

/**
 * Group calibration rows by complaint and compute per-complaint stats.
 */
export function calibrationByComplaint(
  results: CalibrationResultRow[],
): Record<string, ComplaintCalibration> {
  const map: Record<string, CalibrationResultRow[]> = {};

  for (const r of results) {
    if (!map[r.complaint]) map[r.complaint] = [];
    map[r.complaint].push(r);
  }

  const output: Record<string, ComplaintCalibration> = {};

  for (const complaint in map) {
    const rows = map[complaint];

    const avgConfidence =
      rows.reduce((a, b) => a + b.confidence, 0) / rows.length;
    const accuracy = rows.filter((r) => r.correct).length / rows.length;

    output[complaint] = {
      avgConfidence,
      accuracy,
      gap:   avgConfidence - accuracy,
      count: rows.length,
    };
  }

  return output;
}

/**
 * Flag complaints where the model is significantly overconfident.
 * Threshold: gap ≥ 0.15 and at least 10 samples.
 */
export function flagOverconfidentComplaints(
  calibration: Record<string, ComplaintCalibration>,
  gapThreshold = 0.15,
  minCount     = 10,
): string[] {
  return Object.entries(calibration)
    .filter(([, c]) => c.gap >= gapThreshold && c.count >= minCount)
    .map(([complaint]) => complaint);
}
```

### server/routes/controlTowerRoutes.ts

```ts
/**
 * Control Tower Feed Route (Phase 6 — Step 4 from bundle)
 *
 * GET /api/phase6/control-tower — live system status snapshot
 *
 * Note: /api/control-tower is already registered for run records.
 * This route serves the Phase 6 system status feed at /api/phase6/control-tower
 * to preserve both endpoints without collision.
 */

import { Router }            from "express";
import { getControlTowerData } from "../phase6/controlTower/controlTowerFeed";
import { requireRole }          from "../middleware/requireRole";

const router = Router();

// Phase 2 Fix: Control tower exposes system-wide clinical operations data.
// Lock to admin + physician — unauthenticated access would expose pipeline health,
// rule weights, and clinical throughput metrics without any credential check.
router.use(requireRole(["admin", "physician"]));

router.get("/control-tower", (_req, res) => {
  res.json(getControlTowerData());
});

export default router;
```

### server/routes/controlTowerValidationRoutes.ts

```ts
// FILE NOT FOUND: server/routes/controlTowerValidationRoutes.ts
```

### server/controlTower/anomalyEngine.ts

```ts
import { emitEvent } from "./eventBus";
import { getState } from "./aggregator";

const ERROR_THRESHOLD = 10;
const HIGH_RISK_THRESHOLD = 5;

let lastErrorCount = 0;
let lastHighRiskCount = 0;

function detectAnomalies(): void {
  const state = getState();

  if (state.errors.length > ERROR_THRESHOLD && state.errors.length !== lastErrorCount) {
    lastErrorCount = state.errors.length;
    emitEvent({
      type: "ALERT",
      payload: {
        message: `High error volume detected: ${state.errors.length} errors`,
        severity: "HIGH",
        category: "system",
      },
      timestamp: Date.now(),
    });
  }

  const highRisk = state.patients.filter((p: any) => p.safetyGate?.level === "HIGH" || p.safety?.level === "HIGH");
  if (highRisk.length > HIGH_RISK_THRESHOLD && highRisk.length !== lastHighRiskCount) {
    lastHighRiskCount = highRisk.length;
    emitEvent({
      type: "ALERT",
      payload: {
        message: `Spike in HIGH-risk patients: ${highRisk.length} cases`,
        severity: "HIGH",
        category: "clinical",
      },
      timestamp: Date.now(),
    });
  }
}

let anomalyTimer: ReturnType<typeof setInterval> | null = null;

export function startAnomalyEngine(intervalMs = 5000): void {
  if (anomalyTimer) return;
  anomalyTimer = setInterval(detectAnomalies, intervalMs);
  anomalyTimer.unref();
  console.log("[ControlTower] Anomaly engine started");
}

export function stopAnomalyEngine(): void {
  if (anomalyTimer) {
    clearInterval(anomalyTimer);
    anomalyTimer = null;
  }
}
```

### server/routes/clinicalControlTowerRoutes.ts

```ts
// Phase 1 Security Fix: All CCT endpoints expose clinical system internals
// (engine health, simulation results, coverage stats, improvement suggestions).
// These are sensitive operational data that should not be publicly accessible.

import express from "express";
import { requireRole } from "../middleware/requireRole";
import { requireClinicAccess } from "../middleware/requireClinicAccess";
import { runSystemReview } from "../brain/systemReviewEngine";
import { getAllEngines, getEngineCounts } from "../brain/engineRegistry";
import { listSimulationRuns, getLastRunSummary } from "../simulation/simulationStore";
import { getAllChannelPerformance } from "../simulation/channelSimulationHarness";
import { complaintCoverageMatrix, getOverallCoverageStats } from "../analysis/complaintCoverageMatrix";
import { getImprovements } from "../improvement/improvementStore";
import { getLearningStats } from "../simulation/simulationLearningBridge";

const router = express.Router();

// Phase 2 Fix: Apply auth PER-ROUTE, not via router.use().
// This router is mounted at app.use("/api", router) — a router.use() middleware here
// would intercept ALL /api/* requests, not just /cct/* requests, blocking unrelated
// public endpoints (e.g., the SMS webhook). Per-route middleware scopes auth correctly.
const cctAuth = [requireRole(["admin", "physician"]), requireClinicAccess];

router.get("/cct/health", ...cctAuth, (_req, res) => {
  const review = runSystemReview();
  const engineCounts = getEngineCounts();
  const lastSimSummary = getLastRunSummary();
  const coverageStats = getOverallCoverageStats();

  res.json({
    systemHealth: {
      score: review.healthScore,
      activeEngines: review.activeEngines,
      totalEngines: review.totalEngines,
      enginesByLevel: engineCounts,
    },
    simulation: lastSimSummary
      ? {
          dispositionAccuracy: lastSimSummary.dispositionAccuracy,
          diagnosisAccuracy: lastSimSummary.diagnosisAccuracy,
          avgScore: lastSimSummary.avgScore,
          redFlagMissRate: lastSimSummary.redFlagMissRate,
          totalCases: lastSimSummary.totalCases,
        }
      : null,
    coverage: coverageStats,
    topSuggestions: review.suggestions.slice(0, 5),
    timestamp: Date.now(),
  });
});

router.get("/cct/engines", ...cctAuth, (_req, res) => {
  const engines = getAllEngines();
  const counts = getEngineCounts();
  const active = engines.filter(e => e.status === "active").length;

  res.json({
    total: engines.length,
    active,
    counts,
    engines: engines.map(e => ({
      name: e.name,
      level: e.level,
      status: e.status,
      avgLatencyMs: e.avgLatencyMs,
    })),
  });
});

router.get("/cct/simulation-summary", ...cctAuth, (_req, res) => {
  const runs = listSimulationRuns();
  const lastSummary = getLastRunSummary();
  const learningStats = getLearningStats();

  res.json({
    totalRuns: runs.length,
    lastSummary,
    learningUpdates: learningStats,
    recentRuns: runs.slice(0, 5),
  });
});

router.get("/cct/failures", ...cctAuth, (_req, res) => {
  const runs = listSimulationRuns();

  const allFailures: Record<string, number> = {};
  runs.forEach(r => {
    if ((r as any).failureBreakdown) {
      Object.entries((r as any).failureBreakdown).forEach(([cat, cnt]) => {
        allFailures[cat] = (allFailures[cat] ?? 0) + (cnt as number);
      });
    }
  });

  const sorted = Object.entries(allFailures)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  res.json({ failures: sorted, totalRuns: runs.length });
});

router.get("/cct/channels", ...cctAuth, (_req, res) => {
  res.json(getAllChannelPerformance());
});

router.get("/cct/coverage", ...cctAuth, (_req, res) => {
  res.json({
    stats: getOverallCoverageStats(),
    matrix: complaintCoverageMatrix,
  });
});

router.get("/cct/improvements", ...cctAuth, (_req, res) => {
  const improvements = getImprovements();
  const latest = improvements[0] ?? null;

  res.json({
    total: improvements.length,
    latest,
    allImprovements: improvements.slice(0, 20),
  });
});

router.get("/cct/summary", ...cctAuth, (_req, res) => {
  const review = runSystemReview();
  const lastSim = getLastRunSummary();
  const coverageStats = getOverallCoverageStats();
  const learningStats = getLearningStats();
  const channels = getAllChannelPerformance();
  const improvements = getImprovements();

  res.json({
    health: {
      score: review.healthScore,
      activeEngines: review.activeEngines,
      totalEngines: review.totalEngines,
    },
    simulation: lastSim,
    coverage: coverageStats,
    learning: learningStats,
    channels: channels.map(c => ({
      channel: c.channel,
      dropoutRate: c.dropoutRate,
      avgCompletionTime: c.avgCompletionTime,
    })),
    pendingImprovements: improvements.slice(0, 3).flatMap(r => r.improvements),
    topSuggestion: review.suggestions[0] ?? null,
    timestamp: Date.now(),
  });
});

export default router;
```
