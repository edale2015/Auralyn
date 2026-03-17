export interface ServiceStatus {
  name: string;
  category: string;
  status: "healthy" | "warning" | "down";
  latency: number;
  lastChecked: number;
  errorCount: number;
}

const services: Record<string, ServiceStatus> = {};

export function updateService(name: string, category: string, latency: number, error?: boolean) {
  const existing = services[name];
  services[name] = {
    name,
    category,
    latency,
    status: error ? "down" : latency > 1000 ? "warning" : "healthy",
    lastChecked: Date.now(),
    errorCount: error ? (existing?.errorCount || 0) + 1 : 0,
  };
}

export function getSystemHealth(): ServiceStatus[] {
  return Object.values(services);
}

export function getHealthSummary() {
  const all = Object.values(services);
  const healthy = all.filter((s) => s.status === "healthy").length;
  const warning = all.filter((s) => s.status === "warning").length;
  const down = all.filter((s) => s.status === "down").length;
  const avgLatency = all.length ? Math.round(all.reduce((s, v) => s + v.latency, 0) / all.length) : 0;

  return {
    totalServices: all.length,
    healthy,
    warning,
    down,
    avgLatency,
    overallStatus: down > 0 ? "degraded" : warning > 0 ? "warning" : "healthy",
    services: all,
  };
}

updateService("Interface Layer", "layer", 12);
updateService("Normalization Layer", "layer", 8);
updateService("State Layer", "layer", 5);
updateService("Knowledge Layer", "layer", 45);
updateService("Safety Layer", "layer", 15);
updateService("Reasoning Layer", "layer", 120);
updateService("Decision Layer", "layer", 18);
updateService("Learning Layer", "layer", 85);
updateService("Analytics Layer", "layer", 95);
updateService("Governance Layer", "layer", 10);
updateService("Integration Layer", "layer", 250);
updateService("Orchestration Layer", "layer", 350);
updateService("Knowledge Graph", "service", 40);
updateService("OpenAI API", "external", 450);
updateService("PubMed API", "external", 380);
