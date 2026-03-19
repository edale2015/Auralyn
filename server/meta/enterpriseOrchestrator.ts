import { digitalTwin } from "../simulation/digitalTwin";
import { strategyTester } from "../simulation/whatIfEngine";
import { runControlCycle } from "../control/adaptiveController";
import { capacityEngine, serviceMixEngine } from "../optimizer/capacityEngine";
import { scalingPlaybookEngine } from "../scaling/scalingPlaybook";
import { patientAcquisitionEngine } from "../growth/patientAcquisition";
import { getCallCenterStats } from "../voice/callCenter";

export class EnterpriseOrchestrator {
  runFullAnalysis(options?: {
    budget?: number;
    services?: any[];
    systemState?: { revenuePerHour: number; denialRate: number; waitTime: number; capacity: number };
  }) {
    const twinState = digitalTwin.getState();

    const scenarios = strategyTester.generateAutoScenarios(twinState);

    const capacityStatus = capacityEngine.balance(
      twinState.capacity,
      twinState.patientsPerDay / 100
    );

    const controlResult = options?.systemState
      ? runControlCycle(options.systemState)
      : runControlCycle({
          revenuePerHour: twinState.avgRevenue * (twinState.patientsPerDay / 8),
          denialRate: twinState.denialRate,
          waitTime: 15,
          capacity: twinState.capacity
        });

    const marketingAllocation = patientAcquisitionEngine.allocateBudget(
      options?.budget || 5000
    );

    const serviceMix = options?.services
      ? serviceMixEngine.optimize(options.services)
      : [];

    const expansionProjections = scalingPlaybookEngine.projectExpansion(twinState);

    const callCenter = getCallCenterStats();

    const overallHealth = this.computeHealthScore(twinState, controlResult);

    return {
      timestamp: new Date().toISOString(),
      clinicState: twinState,
      projectedRevenue: {
        daily: digitalTwin.getProjectedDailyRevenue(),
        monthly: digitalTwin.getProjectedMonthlyRevenue(),
        annual: digitalTwin.getProjectedDailyRevenue() * 260
      },
      topStrategy: scenarios[0] || null,
      allScenarios: scenarios.slice(0, 5),
      capacityStatus,
      controlSystem: controlResult,
      marketingAllocation: marketingAllocation.slice(0, 5),
      serviceMix,
      expansionTargets: expansionProjections.slice(0, 3),
      callCenter,
      overallHealth,
      recommendations: this.generateRecommendations(twinState, controlResult, capacityStatus)
    };
  }

  private computeHealthScore(state: any, control: any): { score: number; grade: string } {
    let score = 100;

    if (state.denialRate > 0.15) score -= 30;
    else if (state.denialRate > 0.1) score -= 15;
    else if (state.denialRate > 0.05) score -= 5;

    if (state.capacity > 0.95) score -= 20;
    else if (state.capacity > 0.85) score -= 10;
    else if (state.capacity < 0.3) score -= 15;

    if (control.paused) score -= 25;

    let grade: string;
    if (score >= 90) grade = "A";
    else if (score >= 80) grade = "B";
    else if (score >= 70) grade = "C";
    else if (score >= 60) grade = "D";
    else grade = "F";

    return { score: Math.max(0, score), grade };
  }

  private generateRecommendations(state: any, control: any, capacity: any): string[] {
    const recs: string[] = [];

    if (state.denialRate > 0.1) {
      recs.push("Focus on denial reduction — consider payer-specific coding optimization");
    }
    if (state.capacity > 0.85) {
      recs.push("Capacity approaching limits — prepare to scale workers or limit intake");
    }
    if (state.capacity < 0.4) {
      recs.push("Low utilization — increase patient acquisition spending");
    }
    if (state.patientsPerDay < 20) {
      recs.push("Volume below sustainable threshold — prioritize community outreach and referrals");
    }
    if (control.paused) {
      recs.push("ALERT: Control system paused due to safety violations — immediate attention required");
    }
    if (recs.length === 0) {
      recs.push("System operating well — consider growth strategies from scenario analysis");
    }

    return recs;
  }
}

export const enterpriseOrchestrator = new EnterpriseOrchestrator();
