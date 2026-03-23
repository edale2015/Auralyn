import { RoboticController } from "../robotics/roboticController";

const roboticController = new RoboticController();

export interface SystemSnapshot {
  clinical?: {
    activePatients: number;
    triageQueue: number;
    avgRiskScore: number;
  };
  robotics?: {
    pose: Record<string, number>;
    mode: string;
    estopActive: boolean;
  };
  infra?: {
    cpuUsage: number;
    memUsage: number;
    requestsPerMin: number;
    errorRate: number;
  };
}

export interface GlobalBrainOutput {
  snapshot: SystemSnapshot;
  systemHealth: "healthy" | "degraded" | "critical";
  dominantAlert?: string;
  recommendedDecision: string;
  confidence: number;
  timestamp: string;
}

function scoreHealth(snapshot: SystemSnapshot): { health: GlobalBrainOutput["systemHealth"]; alert?: string } {
  if (snapshot.robotics?.estopActive) return { health: "critical", alert: "E-STOP is active on robotic system" };
  if ((snapshot.infra?.errorRate ?? 0) > 0.1) return { health: "critical", alert: "Infrastructure error rate exceeds 10%" };
  if ((snapshot.clinical?.avgRiskScore ?? 0) > 0.75) return { health: "degraded", alert: "High average clinical risk score in queue" };
  if ((snapshot.infra?.cpuUsage ?? 0) > 0.8) return { health: "degraded", alert: "CPU usage above 80%" };
  return { health: "healthy" };
}

function chooseDecision(snapshot: SystemSnapshot, health: GlobalBrainOutput["systemHealth"]): { decision: string; confidence: number } {
  if (health === "critical") return { decision: "halt_autonomous_actions_and_alert_operator", confidence: 0.98 };
  if (health === "degraded") return { decision: "reduce_concurrent_load_and_monitor", confidence: 0.82 };
  if ((snapshot.clinical?.triageQueue ?? 0) > 5) return { decision: "scale_triage_workers", confidence: 0.76 };
  return { decision: "continue_normal_operation", confidence: 0.91 };
}

export async function unifySystemsAndDecide(): Promise<GlobalBrainOutput> {
  const pose = await roboticController.getPose();

  const snapshot: SystemSnapshot = {
    clinical: {
      activePatients: Math.floor(Math.random() * 12) + 1,
      triageQueue: Math.floor(Math.random() * 8),
      avgRiskScore: parseFloat((Math.random() * 0.7 + 0.1).toFixed(2)),
    },
    robotics: {
      pose: pose as unknown as Record<string, number>,
      mode: "MANUAL_JOG",
      estopActive: false,
    },
    infra: {
      cpuUsage: parseFloat((Math.random() * 0.6 + 0.1).toFixed(2)),
      memUsage: parseFloat((Math.random() * 0.5 + 0.2).toFixed(2)),
      requestsPerMin: Math.floor(Math.random() * 300 + 50),
      errorRate: parseFloat((Math.random() * 0.05).toFixed(3)),
    },
  };

  const { health, alert } = scoreHealth(snapshot);
  const { decision, confidence } = chooseDecision(snapshot, health);

  return {
    snapshot,
    systemHealth: health,
    dominantAlert: alert,
    recommendedDecision: decision,
    confidence,
    timestamp: new Date().toISOString(),
  };
}
