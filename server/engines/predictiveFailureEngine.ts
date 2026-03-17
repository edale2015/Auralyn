interface MetricPoint {
  timestamp: number;
  latency: number;
  errors: number;
}

export interface PredictiveRisk {
  service: string;
  risk: "low" | "medium" | "high" | "critical";
  reason: string;
  latencyTrend: number[];
  errorRate: number;
  prediction: string;
}

export class PredictiveFailureEngine {
  private history: Record<string, MetricPoint[]> = {};

  record(service: string, latency: number, error: boolean) {
    if (!this.history[service]) this.history[service] = [];
    this.history[service].push({ timestamp: Date.now(), latency, errors: error ? 1 : 0 });
    if (this.history[service].length > 100) this.history[service].shift();
  }

  detect(service: string): PredictiveRisk | null {
    const data = this.history[service] || [];
    if (data.length < 5) return null;

    const recent = data.slice(-5);
    const latencyTrend = recent.map((d) => d.latency);
    const increasing = latencyTrend.every((v, i, arr) => i === 0 || v >= arr[i - 1]);
    const errorRate = recent.reduce((s, d) => s + d.errors, 0) / recent.length;
    const avgLatency = latencyTrend.reduce((s, v) => s + v, 0) / latencyTrend.length;

    let risk: PredictiveRisk["risk"] = "low";
    let reason = "Stable";
    let prediction = "No issues expected";

    if (errorRate > 0.5) {
      risk = "critical";
      reason = "Error spike detected";
      prediction = "Service failure imminent within minutes";
    } else if (increasing && avgLatency > 1000) {
      risk = "high";
      reason = "Latency continuously increasing above threshold";
      prediction = "Service degradation likely within 10 minutes";
    } else if (increasing) {
      risk = "medium";
      reason = "Latency trending upward";
      prediction = "Monitor closely — may degrade if trend continues";
    } else if (errorRate > 0.2) {
      risk = "medium";
      reason = "Intermittent errors detected";
      prediction = "Possible instability developing";
    }

    return risk !== "low" ? { service, risk, reason, latencyTrend, errorRate, prediction } : null;
  }

  detectAll(): PredictiveRisk[] {
    const risks: PredictiveRisk[] = [];
    for (const service of Object.keys(this.history)) {
      const risk = this.detect(service);
      if (risk) risks.push(risk);
    }
    return risks;
  }

  getHistory(): Record<string, { points: number; avgLatency: number; errorRate: number }> {
    const summary: Record<string, any> = {};
    for (const [service, points] of Object.entries(this.history)) {
      const avgLatency = points.reduce((s, p) => s + p.latency, 0) / points.length;
      const errorRate = points.reduce((s, p) => s + p.errors, 0) / points.length;
      summary[service] = { points: points.length, avgLatency: Math.round(avgLatency), errorRate: Number(errorRate.toFixed(3)) };
    }
    return summary;
  }

  seedDemoData() {
    const services = ["OpenAI API", "Knowledge Graph", "Reasoning Engine", "Safety Layer", "PubMed API", "Firebase"];
    services.forEach((svc) => {
      for (let i = 0; i < 20; i++) {
        const baseLatency = svc === "OpenAI API" ? 400 : svc === "PubMed API" ? 300 : 50;
        const jitter = Math.random() * 100 - 50;
        const trend = svc === "OpenAI API" ? i * 5 : 0;
        this.record(svc, Math.max(10, baseLatency + jitter + trend), Math.random() < 0.05);
      }
    });
  }
}

export const predictiveFailureEngine = new PredictiveFailureEngine();
predictiveFailureEngine.seedDemoData();
