import type { Channel } from "./messageEvent";

interface ChannelMetrics {
  inboundCount: number;
  dedupeHits: number;
  processingTimes: number[];
  frictionEscalations: number;
  frictionStops: number;
  circuitBreakerActivations: number;
  llmBudgetHits: number;
  emergencyWarningsSent: number;
}

function emptyMetrics(): ChannelMetrics {
  return {
    inboundCount: 0,
    dedupeHits: 0,
    processingTimes: [],
    frictionEscalations: 0,
    frictionStops: 0,
    circuitBreakerActivations: 0,
    llmBudgetHits: 0,
    emergencyWarningsSent: 0,
  };
}

const MAX_PROCESSING_TIMES = 1000;

class ChannelOpsTracker {
  private metrics = new Map<string, ChannelMetrics>();
  private resetAt: string;

  constructor() {
    this.resetAt = new Date().toISOString();
  }

  private getOrInit(channel: string): ChannelMetrics {
    let m = this.metrics.get(channel);
    if (!m) {
      m = emptyMetrics();
      this.metrics.set(channel, m);
    }
    return m;
  }

  recordInbound(channel: Channel) {
    this.getOrInit(channel).inboundCount++;
  }

  recordDedupeHit(channel: Channel) {
    this.getOrInit(channel).dedupeHits++;
  }

  recordProcessingTime(channel: Channel, ms: number) {
    const m = this.getOrInit(channel);
    m.processingTimes.push(ms);
    if (m.processingTimes.length > MAX_PROCESSING_TIMES) {
      m.processingTimes = m.processingTimes.slice(-MAX_PROCESSING_TIMES);
    }
  }

  recordFrictionEscalation(channel: Channel) {
    this.getOrInit(channel).frictionEscalations++;
  }

  recordFrictionStop(channel: Channel) {
    this.getOrInit(channel).frictionStops++;
  }

  recordCircuitBreakerActivation(channel: Channel) {
    this.getOrInit(channel).circuitBreakerActivations++;
  }

  recordLlmBudgetHit(channel: Channel) {
    this.getOrInit(channel).llmBudgetHits++;
  }

  recordEmergencyWarning(channel: Channel) {
    this.getOrInit(channel).emergencyWarningsSent++;
  }

  getReport(): Record<string, any> {
    const result: Record<string, any> = { resetAt: this.resetAt, channels: {} };
    for (const [channel, m] of this.metrics) {
      const times = m.processingTimes;
      const sorted = [...times].sort((a, b) => a - b);
      const avg = times.length > 0 ? Math.round(times.reduce((s, t) => s + t, 0) / times.length) : 0;
      const p95 = times.length > 0 ? sorted[Math.floor(sorted.length * 0.95)] : 0;

      result.channels[channel] = {
        inboundCount: m.inboundCount,
        dedupeHits: m.dedupeHits,
        avgProcessingMs: avg,
        p95ProcessingMs: p95,
        frictionEscalations: m.frictionEscalations,
        frictionStops: m.frictionStops,
        circuitBreakerActivations: m.circuitBreakerActivations,
        llmBudgetHits: m.llmBudgetHits,
        emergencyWarningsSent: m.emergencyWarningsSent,
      };
    }
    return result;
  }

  reset() {
    this.metrics.clear();
    this.resetAt = new Date().toISOString();
  }
}

let tracker: ChannelOpsTracker;

export function getChannelOpsTracker(): ChannelOpsTracker {
  if (!tracker) tracker = new ChannelOpsTracker();
  return tracker;
}
