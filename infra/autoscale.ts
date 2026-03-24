export interface FargateService {
  autoScaleTaskCount(config: { minCapacity: number; maxCapacity: number }): ScalingPolicy;
}

export interface ScalingPolicy {
  scaleOnCpuUtilization(id: string, config: { targetUtilizationPercent: number }): void;
  scaleOnMemoryUtilization(id: string, config: { targetUtilizationPercent: number }): void;
}

export function attachAutoScaling(service: FargateService): ScalingPolicy {
  const scaling = service.autoScaleTaskCount({
    minCapacity: 2,
    maxCapacity: 20,
  });

  scaling.scaleOnCpuUtilization("CpuScaling", {
    targetUtilizationPercent: 60,
  });

  scaling.scaleOnMemoryUtilization("MemScaling", {
    targetUtilizationPercent: 70,
  });

  console.log("[AutoScale] ECS Fargate autoscaling attached: min=2 max=20 cpu=60% mem=70%");
  return scaling;
}

export function evaluateRoomLoad(rooms: { riskScore: number }[]): {
  highRiskCount: number;
  recommendation: "SCALE_UP" | "SCALE_DOWN" | "STEADY";
  targetInstances: number;
} {
  const highRisk = rooms.filter((r) => r.riskScore > 0.7).length;
  const recommendation =
    highRisk > 10 ? "SCALE_UP" : highRisk === 0 ? "SCALE_DOWN" : "STEADY";
  const targetInstances =
    highRisk > 10 ? 5 : highRisk > 5 ? 3 : 2;

  return { highRiskCount: highRisk, recommendation, targetInstances };
}
