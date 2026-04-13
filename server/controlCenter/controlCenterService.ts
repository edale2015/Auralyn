import { safetyScoreEngine, SafetyMetrics } from "../safety/clinicalSafetyScoreEngine";
import { getEngineStats, getProfilerSummary, seedProfilerData } from "../performance/engineProfiler";
import { getKnowledgeGraph } from "../knowledge/knowledgeGraphStore";
import { checkKnowledgeConsistency } from "../governance/knowledgeConsistencyEngine";
import { getVersionSummary } from "../versioning/clinicalVersionManager";
import { getGovernanceStatsCached } from "../governance/governanceQueue";
import { detectAlerts, Alert } from "./alertEngine";

export interface ControlCenterSnapshot {
  safetyScore: any;
  engineStats: any[];
  engineSummary: any;
  graphHealth: {
    nodeCount: number;
    edgeCount: number;
    consistencyOk: boolean;
    problemCount: number;
  };
  versionStatus: any;
  governanceStatus: any;
  alerts: Alert[];
  systemHealth: "healthy" | "warning" | "critical";
  timestamp: number;
}

let seeded = false;

export function generateControlCenterSnapshot(metrics?: SafetyMetrics): ControlCenterSnapshot {
  if (!seeded) {
    seedProfilerData();
    seeded = true;
  }

  const safetyMetrics = metrics || safetyScoreEngine.getDefaultMetrics();
  const safety = safetyScoreEngine.calculate(safetyMetrics);
  const engineStatsList = getEngineStats();
  const engineSummary = getProfilerSummary();
  const graph = getKnowledgeGraph();
  const consistency = checkKnowledgeConsistency();
  const versionStatus = getVersionSummary();
  const governanceStatus = getGovernanceStatsCached();

  let systemHealth: ControlCenterSnapshot["systemHealth"] = "healthy";
  if (safety.score < 70 || !consistency.ok) systemHealth = "warning";
  if (safety.score < 50) systemHealth = "critical";

  const snapshot: ControlCenterSnapshot = {
    safetyScore: safety,
    engineStats: engineStatsList,
    engineSummary,
    graphHealth: {
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      consistencyOk: consistency.ok,
      problemCount: consistency.problems.length,
    },
    versionStatus,
    governanceStatus,
    alerts: [],
    systemHealth,
    timestamp: Date.now(),
  };

  snapshot.alerts = detectAlerts(snapshot);

  return snapshot;
}
