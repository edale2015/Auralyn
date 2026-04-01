import type { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";

const CLINICAL_INTAKE_PATTERNS = [
  /^\/api\/chat/,
  /^\/api\/intake/,
  /^\/api\/triage/,
  /^\/api\/patient\//,
  /^\/api\/clinical\/orchestrate/,
  /^\/api\/clinical\/process/,
  /^\/whatsapp\/webhook/,
  /^\/api\/voice/,
];

let dbHealthy = true;
let lastDbCheck = 0;
const DB_CHECK_INTERVAL_MS = 10_000;

async function checkDbHealth(): Promise<boolean> {
  const now = Date.now();
  if (now - lastDbCheck < DB_CHECK_INTERVAL_MS) return dbHealthy;
  lastDbCheck = now;
  try {
    await db.execute(sql`SELECT 1`);
    if (!dbHealthy) console.log("[SAFETY-GATE] ✅ Database connectivity restored — resuming clinical intake");
    dbHealthy = true;
  } catch (e: any) {
    if (dbHealthy) console.error("[SAFETY-GATE] 🚨 Database connectivity LOST — clinical intake BLOCKED (fail-closed)");
    dbHealthy = false;
  }
  return dbHealthy;
}

export function globalSafetyGate(req: Request, res: Response, next: NextFunction): void {
  const isClinicalRoute = CLINICAL_INTAKE_PATTERNS.some(p => p.test(req.path));

  if (!isClinicalRoute) {
    return next();
  }

  checkDbHealth().then(healthy => {
    if (!healthy) {
      console.error(`[SAFETY-GATE] ⛔ FAIL-CLOSED — blocked ${req.method} ${req.path} (database unavailable, red flag rules inaccessible)`);
      res.status(503).json({
        ok: false,
        error: "SAFETY_GATE_FAIL_CLOSED",
        message: "Clinical intake is temporarily unavailable. The system has safely stopped processing to prevent triage without access to safety rules. Please contact a physician immediately.",
        escalate: true,
        contactPhysician: true,
        timestamp: new Date().toISOString(),
      });
    } else {
      next();
    }
  }).catch(() => {
    res.status(503).json({
      ok: false,
      error: "SAFETY_GATE_ERROR",
      message: "Clinical safety gate encountered an internal error. Intake blocked for patient safety.",
      escalate: true,
      timestamp: new Date().toISOString(),
    });
  });
}
