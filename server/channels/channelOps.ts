import type { Channel } from "./messageEvent";

export type LLMEventType =
  | "call_start"
  | "call_complete"
  | "budget_exceeded"
  | "circuit_breaker_trip"
  | "circuit_breaker_block"
  | "fallback";

interface LLMMetrics {
  callsUsed: number;
  tokensUsed: number;
  budgetExceededCount: number;
  circuitBreakerTrips: number;
  fallbackCount: number;
  cooldownActive: boolean;
  latencies: number[];
}

function emptyLLMMetrics(): LLMMetrics {
  return {
    callsUsed: 0,
    tokensUsed: 0,
    budgetExceededCount: 0,
    circuitBreakerTrips: 0,
    fallbackCount: 0,
    cooldownActive: false,
    latencies: [],
  };
}

interface ChannelMetrics {
  inboundCount: number;
  dedupeHits: number;
  processingTimes: number[];
  frictionEscalations: number;
  frictionStops: number;
  circuitBreakerActivations: number;
  llmBudgetHits: number;
  emergencyWarningsSent: number;
  llm: LLMMetrics;
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
    llm: emptyLLMMetrics(),
  };
}

const MAX_PROCESSING_TIMES = 1000;
const MAX_LLM_LATENCIES = 1000;

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

  recordLLMEvent(opts: {
    channel: Channel;
    type: LLMEventType;
    tokens?: number;
    latencyMs?: number;
  }) {
    const m = this.getOrInit(opts.channel);
    const llm = m.llm;

    switch (opts.type) {
      case "call_start":
        llm.callsUsed++;
        break;
      case "call_complete":
        if (opts.tokens) llm.tokensUsed += opts.tokens;
        if (opts.latencyMs != null) {
          llm.latencies.push(opts.latencyMs);
          if (llm.latencies.length > MAX_LLM_LATENCIES) {
            llm.latencies = llm.latencies.slice(-MAX_LLM_LATENCIES);
          }
        }
        break;
      case "budget_exceeded":
        llm.budgetExceededCount++;
        m.llmBudgetHits++;
        break;
      case "circuit_breaker_trip":
        llm.circuitBreakerTrips++;
        m.circuitBreakerActivations++;
        break;
      case "circuit_breaker_block":
        llm.fallbackCount++;
        break;
      case "fallback":
        llm.fallbackCount++;
        break;
    }
  }

  setCooldownActive(channel: Channel, active: boolean) {
    this.getOrInit(channel).llm.cooldownActive = active;
  }

  getReport(): Record<string, any> {
    const result: Record<string, any> = { resetAt: this.resetAt, channels: {} };
    for (const [channel, m] of this.metrics) {
      const times = m.processingTimes;
      const sorted = [...times].sort((a, b) => a - b);
      const avg = times.length > 0 ? Math.round(times.reduce((s, t) => s + t, 0) / times.length) : 0;
      const p95 = times.length > 0 ? sorted[Math.floor(sorted.length * 0.95)] : 0;

      const llmLatencies = m.llm.latencies;
      const llmSorted = [...llmLatencies].sort((a, b) => a - b);
      const llmAvg = llmLatencies.length > 0 ? Math.round(llmLatencies.reduce((s, t) => s + t, 0) / llmLatencies.length) : 0;
      const llmP95 = llmLatencies.length > 0 ? llmSorted[Math.floor(llmSorted.length * 0.95)] : 0;

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
        llm: {
          callsUsed: m.llm.callsUsed,
          tokensUsed: m.llm.tokensUsed,
          budgetExceededCount: m.llm.budgetExceededCount,
          circuitBreakerTrips: m.llm.circuitBreakerTrips,
          fallbackCount: m.llm.fallbackCount,
          cooldownActive: m.llm.cooldownActive,
          avgLatencyMs: llmAvg,
          p95LatencyMs: llmP95,
        },
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
