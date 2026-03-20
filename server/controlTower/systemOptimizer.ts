import { getRecentEvents } from "./eventBus";
import { getAllBreakerStates } from "../utils/circuitBreaker";
import { getQueueStats } from "../queue/patientQueue";
import { getLoopStats } from "../system/autonomousLoop";

export interface OptimizerRecommendation {
  id: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  category: string;
  title: string;
  description: string;
  action?: string;
}

export interface SystemHealthSnapshot {
  recommendations: OptimizerRecommendation[];
  score: number;
  analyzedAt: string;
  eventsSampled: number;
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}`;
}

export async function analyzeSystemHealth(): Promise<SystemHealthSnapshot> {
  const recommendations: OptimizerRecommendation[] = [];
  const events = getRecentEvents(200);
  const breakers = getAllBreakerStates();
  const queueStats = getQueueStats();
  const loopStats = getLoopStats();

  const criticalAlerts = events.filter(e => e.type === "ALERT" && e.payload?.severity === "CRITICAL");
  const errors = events.filter(e => e.type === "ERROR");
  const rpaFailures = events.filter(e => e.type === "RPA_FAILURE");

  if (criticalAlerts.length >= 3) {
    recommendations.push({
      id: makeId("crit_alerts"),
      severity: "CRITICAL",
      category: "Reliability",
      title: `${criticalAlerts.length} CRITICAL alerts in event stream`,
      description: "Multiple critical alerts detected. Immediate review required to prevent patient safety issues.",
      action: "Inspect recent CRITICAL alerts, check on-call notification channel, and confirm physician escalation pathways.",
    });
  }

  for (const breaker of breakers) {
    if (breaker.state === "open") {
      recommendations.push({
        id: makeId(`cb_${breaker.name}`),
        severity: "CRITICAL",
        category: "Circuit Breaker",
        title: `Circuit breaker OPEN: ${breaker.name}`,
        description: `The ${breaker.name} service is down (${breaker.failures} consecutive failures). All requests are being rejected.`,
        action: `Investigate ${breaker.name} service health. Circuit will auto-recover after cooldown. You can reset it via POST /api/monitoring/circuit-reset.`,
      });
    } else if (breaker.state === "half-open") {
      recommendations.push({
        id: makeId(`cb_half_${breaker.name}`),
        severity: "HIGH",
        category: "Circuit Breaker",
        title: `Circuit breaker HALF-OPEN: ${breaker.name}`,
        description: `The ${breaker.name} service is recovering. System is probing with test requests.`,
        action: "Monitor the next few requests. If failures resume, the circuit will re-open automatically.",
      });
    } else if (breaker.failures >= 3) {
      recommendations.push({
        id: makeId(`cb_warn_${breaker.name}`),
        severity: "MEDIUM",
        category: "Circuit Breaker",
        title: `${breaker.name} has ${breaker.failures} recent failures`,
        description: `Circuit breaker for ${breaker.name} is approaching the failure threshold.`,
        action: "Monitor this service closely. Check logs for transient errors.",
      });
    }
  }

  if (queueStats.atCapacity) {
    recommendations.push({
      id: makeId("queue_cap"),
      severity: "CRITICAL",
      category: "Queue",
      title: "Patient queue at capacity",
      description: `Queue is full (${queueStats.queueDepth}/${queueStats.maxDepth}). New patients are being rejected with 503.`,
      action: "Scale worker capacity, investigate slow processing jobs, or temporarily redirect patients to alternate intake.",
    });
  } else if (queueStats.queueDepth > queueStats.maxDepth * 0.8) {
    recommendations.push({
      id: makeId("queue_warn"),
      severity: "HIGH",
      category: "Queue",
      title: `Queue at ${Math.round((queueStats.queueDepth / queueStats.maxDepth) * 100)}% capacity`,
      description: `${queueStats.queueDepth} patients in queue. Approaching system limit.`,
      action: "Monitor queue drain rate. Consider scaling if backlog continues to grow.",
    });
  }

  if (queueStats.failed > 5) {
    recommendations.push({
      id: makeId("queue_failures"),
      severity: "HIGH",
      category: "Queue",
      title: `${queueStats.failed} failed patient jobs`,
      description: "Multiple patient jobs have failed in the queue.",
      action: "Review failed job error logs. Consider retrying failed jobs or alerting affected patients.",
    });
  }

  if (errors.length >= 10) {
    recommendations.push({
      id: makeId("error_storm"),
      severity: "HIGH",
      category: "Errors",
      title: `${errors.length} errors in event stream`,
      description: "High error rate detected across the system.",
      action: "Review error events in the Control Tower feed. Check engine health dashboard.",
    });
  }

  if (rpaFailures.length >= 2) {
    recommendations.push({
      id: makeId("rpa_fail"),
      severity: "MEDIUM",
      category: "RPA",
      title: `${rpaFailures.length} RPA automation failures`,
      description: "UI automation workflows are encountering selector failures. EHR interface may have changed.",
      action: "Review RPA templates for the affected workflows. Update selectors if EHR UI has been modified.",
    });
  }

  if (loopStats.skippedCount > 0 && loopStats.skippedCount >= loopStats.cycleCount * 0.5) {
    recommendations.push({
      id: makeId("learning_skipped"),
      severity: "MEDIUM",
      category: "Learning",
      title: `Learning cycles skipped ${loopStats.skippedCount} times`,
      description: "More than 50% of learning cycles are being skipped due to distributed lock contention.",
      action: "Verify only one server instance holds the global learning lock. Check Redis connectivity.",
    });
  }

  const noRecentPatients = !events.some(e => e.type === "PATIENT_FLOW" && Date.now() - e.timestamp < 300_000);
  if (noRecentPatients && loopStats.cycleCount > 2) {
    recommendations.push({
      id: makeId("no_patients"),
      severity: "LOW",
      category: "Utilization",
      title: "No patient flows in last 5 minutes",
      description: "No patient triage events have been processed recently. System may be idle or intake channels may be down.",
      action: "Verify WhatsApp/Telegram webhook connectivity. Check intake form availability.",
    });
  }

  const critCount = recommendations.filter(r => r.severity === "CRITICAL").length;
  const highCount = recommendations.filter(r => r.severity === "HIGH").length;
  const medCount = recommendations.filter(r => r.severity === "MEDIUM").length;
  const score = Math.max(0, 100 - critCount * 30 - highCount * 15 - medCount * 5);

  return {
    recommendations,
    score,
    analyzedAt: new Date().toISOString(),
    eventsSampled: events.length,
  };
}
