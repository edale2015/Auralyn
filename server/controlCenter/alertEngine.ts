export interface Alert {
  id: string;
  level: "info" | "warning" | "critical";
  category: string;
  message: string;
  timestamp: number;
}

export function detectAlerts(snapshot: any): Alert[] {
  const alerts: Alert[] = [];
  const now = Date.now();

  if (snapshot.safetyScore?.score < 60) {
    alerts.push({ id: "safety_critical", level: "critical", category: "safety", message: `Clinical safety score critically low: ${snapshot.safetyScore.score}`, timestamp: now });
  } else if (snapshot.safetyScore?.score < 80) {
    alerts.push({ id: "safety_warning", level: "warning", category: "safety", message: `Clinical safety score below target: ${snapshot.safetyScore.score}`, timestamp: now });
  }

  if (!snapshot.graphHealth?.consistencyOk) {
    alerts.push({ id: "graph_inconsistent", level: "warning", category: "graph", message: `Knowledge graph has ${snapshot.graphHealth.problemCount} consistency issues`, timestamp: now });
  }

  if (snapshot.graphHealth?.nodeCount === 0) {
    alerts.push({ id: "graph_empty", level: "info", category: "graph", message: "Knowledge graph is empty — import clinical data to populate", timestamp: now });
  }

  const highErrorEngines = (snapshot.engineStats || []).filter((e: any) => e.errorRate > 0.05);
  highErrorEngines.forEach((e: any) => {
    alerts.push({ id: `engine_errors_${e.engineName}`, level: "warning", category: "engine", message: `${e.engineName} error rate: ${(e.errorRate * 100).toFixed(1)}%`, timestamp: now });
  });

  if (snapshot.governanceStatus?.pending > 5) {
    alerts.push({ id: "governance_backlog", level: "info", category: "governance", message: `${snapshot.governanceStatus.pending} governance items awaiting review`, timestamp: now });
  }

  return alerts.sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return order[a.level] - order[b.level];
  });
}
