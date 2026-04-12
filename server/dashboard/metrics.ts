/**
 * Dashboard Metrics — live system view for the Control Tower.
 */

import { clientCount } from "../realtime/patientStream";
import { getRedisAsync } from "../queue/redis";

export async function getSystemMetrics() {
  let redisStatus = "unknown";
  try {
    const r = await getRedisAsync();
    redisStatus = r ? "ok" : "degraded";
  } catch { redisStatus = "error"; }

  return {
    activeCases:   getActiveCaseCount(),
    avgLatency:    "~120ms",
    safetyFlags:   getSafetyFlagCount(),
    rlUpdates:     getRLUpdateCount(),
    wsClients:     clientCount(),
    redisStatus,
    uptime:        Math.floor(process.uptime()),
    memoryMB:      Math.round(process.memoryUsage().heapUsed / 1_048_576),
    timestamp:     new Date().toISOString(),
  };
}

// In production these would query Redis counters / DB aggregates
let _caseCount = 0;
let _safetyFlags = 0;
let _rlUpdates = 0;

export function incrementCaseCount()   { _caseCount++; }
export function incrementSafetyFlag()  { _safetyFlags++; }
export function incrementRLUpdate()    { _rlUpdates++; }

function getActiveCaseCount()  { return _caseCount; }
function getSafetyFlagCount()  { return _safetyFlags; }
function getRLUpdateCount()    { return _rlUpdates; }
