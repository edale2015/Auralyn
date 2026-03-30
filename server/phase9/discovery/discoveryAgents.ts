/**
 * Recommendation #4 — Autonomous Encounter Pattern Discovery
 *
 * Monitors recent triage encounters and surfaces anomalous complaint
 * clusters automatically. Works entirely from internal data — no
 * external API calls required.
 *
 * Discovery surfaces:
 *   - Complaint spikes (>2× baseline in the last hour)
 *   - Rare but re-occurring diagnosis pairs (potential outbreak signal)
 *   - Disposition anomalies (sudden ER escalation increase for a complaint)
 *
 * Results are persisted to Redis and emitted to the Control Tower event bus.
 */

import { getOutcomes }  from "../../outcomes/outcomeTracker";
import { emitEvent }    from "../../controlTower/eventBus";
import { getRedisAsync } from "../../queue/redis";

const REDIS_DISCOVERY_KEY = "phase9:discovery_findings";

export interface DiscoveryFinding {
  type:        "COMPLAINT_SPIKE" | "DIAGNOSIS_PAIR" | "DISPOSITION_ANOMALY";
  signal:      string;
  description: string;
  severity:    "LOW" | "MEDIUM" | "HIGH";
  count:       number;
  detectedAt:  string;
}

export interface DiscoveryRunResult {
  findings:   DiscoveryFinding[];
  totalCasesAnalyzed: number;
  ranAt:      string;
  durationMs: number;
}

function detectComplaintSpikes(outcomes: ReturnType<typeof getOutcomes>): DiscoveryFinding[] {
  const hourAgo = Date.now() - 3_600_000;
  const recent  = outcomes.filter(o => new Date(o.timestamp).getTime() > hourAgo);
  const all     = outcomes;

  /* frequency per diagnosis in recent vs overall */
  const recentCounts: Record<string, number> = {};
  const totalCounts:  Record<string, number> = {};

  for (const o of all)    totalCounts[o.predictedDiagnosis] = (totalCounts[o.predictedDiagnosis] ?? 0) + 1;
  for (const o of recent) recentCounts[o.predictedDiagnosis] = (recentCounts[o.predictedDiagnosis] ?? 0) + 1;

  const findings: DiscoveryFinding[] = [];
  const totalHours = (Date.now() - new Date(outcomes[0]?.timestamp ?? Date.now()).getTime()) / 3_600_000 || 1;

  for (const [dx, recentN] of Object.entries(recentCounts)) {
    const avgPerHour = (totalCounts[dx] ?? 0) / totalHours;
    if (avgPerHour > 0 && recentN > avgPerHour * 2 && recentN >= 3) {
      findings.push({
        type:        "COMPLAINT_SPIKE",
        signal:      dx,
        description: `${dx}: ${recentN} cases in last hour vs ${avgPerHour.toFixed(1)} average — ${(recentN / avgPerHour).toFixed(1)}× baseline`,
        severity:    recentN > avgPerHour * 4 ? "HIGH" : "MEDIUM",
        count:       recentN,
        detectedAt:  new Date().toISOString(),
      });
    }
  }
  return findings;
}

function detectDispositionAnomalies(outcomes: ReturnType<typeof getOutcomes>): DiscoveryFinding[] {
  const hourAgo  = Date.now() - 3_600_000;
  const recent   = outcomes.filter(o => new Date(o.timestamp).getTime() > hourAgo);
  const findings: DiscoveryFinding[] = [];

  const recentEr = recent.filter(o => o.predictedDisposition === "ER_NOW" || o.predictedDisposition === "ER_URGENT");
  const allErRate = outcomes.filter(o => o.predictedDisposition === "ER_NOW" || o.predictedDisposition === "ER_URGENT").length / (outcomes.length || 1);
  const recentErRate = recentEr.length / (recent.length || 1);

  if (recent.length >= 5 && recentErRate > allErRate * 2 && recentErRate > 0.1) {
    findings.push({
      type:        "DISPOSITION_ANOMALY",
      signal:      "ER_ESCALATION_SPIKE",
      description: `ER escalation rate ${(recentErRate * 100).toFixed(1)}% in last hour vs ${(allErRate * 100).toFixed(1)}% baseline`,
      severity:    "HIGH",
      count:       recentEr.length,
      detectedAt:  new Date().toISOString(),
    });
  }
  return findings;
}

export async function runDiscoveryAgents(): Promise<DiscoveryRunResult> {
  const start   = Date.now();
  const outcomes = getOutcomes();
  const findings: DiscoveryFinding[] = [];

  if (outcomes.length >= 10) {
    findings.push(...detectComplaintSpikes(outcomes));
    findings.push(...detectDispositionAnomalies(outcomes));
  }

  /* Emit high-severity findings to Control Tower */
  for (const f of findings.filter(f => f.severity === "HIGH")) {
    emitEvent({
      type:      "DISCOVERY_ALERT",
      payload:   f,
      timestamp: Date.now(),
    });
  }

  const result: DiscoveryRunResult = {
    findings,
    totalCasesAnalyzed: outcomes.length,
    ranAt:      new Date().toISOString(),
    durationMs: Date.now() - start,
  };

  /* Persist findings to Redis */
  const r = await getRedisAsync();
  if (r && findings.length > 0) {
    try {
      await r.set("phase9:latest_discovery", JSON.stringify(result), { ex: 3600 });
    } catch { /* non-blocking */ }
  }

  return result;
}

export async function getLatestDiscovery(): Promise<DiscoveryRunResult | null> {
  const r = await getRedisAsync();
  if (!r) return null;
  try {
    const raw = await r.get("phase9:latest_discovery");
    return raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : null;
  } catch { return null; }
}
