import { auditLog } from "../security/auditLogger";

export interface TriageThresholds {
  escalate: number;
  urgent: number;
  routine: number;
}

export interface TriageOutcomeRecord {
  predictedRisk: number;
  actualSeverity: number;
  complaint?: string;
  caseId?: string;
  ts: number;
}

let thresholds: TriageThresholds = {
  escalate: 0.7,
  urgent: 0.4,
  routine: 0.1,
};

const history: TriageOutcomeRecord[] = [];
let cycleCount = 0;

export function recordTriageOutcome(data: Omit<TriageOutcomeRecord, "ts">): void {
  history.push({ ...data, ts: Date.now() });
}

export function classifyRisk(score: number): "escalate" | "urgent" | "routine" | "monitor" {
  if (score >= thresholds.escalate) return "escalate";
  if (score >= thresholds.urgent) return "urgent";
  if (score >= thresholds.routine) return "routine";
  return "monitor";
}

export function optimizeThresholds(): TriageThresholds {
  if (history.length < 10) return { ...thresholds };

  const recent = history.slice(-200);
  let totalError = 0;
  let falseNegatives = 0;
  let falsePositives = 0;

  for (const h of recent) {
    const err = Math.abs(h.predictedRisk - h.actualSeverity);
    totalError += err;
    if (h.actualSeverity >= 0.7 && h.predictedRisk < thresholds.escalate) falseNegatives++;
    if (h.predictedRisk >= thresholds.escalate && h.actualSeverity < 0.5) falsePositives++;
  }

  const avgError = totalError / recent.length;
  const fnRate = falseNegatives / recent.length;
  const fpRate = falsePositives / recent.length;

  const prev = { ...thresholds };

  if (avgError > 0.2 || fnRate > 0.05) {
    thresholds.escalate = Math.max(0.5, thresholds.escalate - 0.05);
    thresholds.urgent = Math.max(0.25, thresholds.urgent - 0.03);
  } else if (fpRate > 0.1 && avgError <= 0.1) {
    thresholds.escalate = Math.min(0.9, thresholds.escalate + 0.02);
  }

  thresholds.escalate = Math.max(0.5, Math.min(0.9, thresholds.escalate));
  thresholds.urgent = Math.max(0.2, Math.min(thresholds.escalate - 0.1, thresholds.urgent));
  thresholds.routine = Math.max(0.05, Math.min(thresholds.urgent - 0.1, thresholds.routine));

  cycleCount++;

  auditLog({
    actor: "triage_optimizer",
    action: "thresholds_updated",
    details: {
      cycle: cycleCount,
      avgError: avgError.toFixed(3),
      fnRate: fnRate.toFixed(3),
      fpRate: fpRate.toFixed(3),
      prev,
      next: { ...thresholds },
      samplesUsed: recent.length,
    },
  });

  return { ...thresholds };
}

export function getThresholds(): TriageThresholds {
  return { ...thresholds };
}

export function getOptimizerStats() {
  const recentMse = history.slice(-50).reduce((s, h) => s + Math.pow(h.predictedRisk - h.actualSeverity, 2), 0) / Math.max(history.slice(-50).length, 1);
  return {
    totalRecords: history.length,
    cycleCount,
    currentThresholds: { ...thresholds },
    recentMse: parseFloat(recentMse.toFixed(4)),
    recentSamples: history.slice(-5).map((h) => ({ predicted: h.predictedRisk.toFixed(2), actual: h.actualSeverity.toFixed(2) })),
  };
}

export function startOptimizerLoop(intervalMs = 60_000): () => void {
  const timer = setInterval(() => {
    const updated = optimizeThresholds();
    console.log(`[TriageOptimizer] Cycle #${cycleCount} — thresholds:`, JSON.stringify(updated));
  }, intervalMs);
  return () => clearInterval(timer);
}
