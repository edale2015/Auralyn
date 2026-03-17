import { predictiveFailureEngine } from "../engines/predictiveFailureEngine";
import { memoryEngine } from "../engines/memoryEngine";
import { autoDebuggerAgent } from "../agents/autoDebuggerAgent";
import { rootCauseEngine } from "../agents/rootCauseEngine";
import { multiAgentCoordinator } from "../agents/multiAgentCoordinator";

export interface ImprovementCycle {
  cycleId: string;
  failures: any[];
  rootCause: any;
  debugActions: any[];
  agentStatus: any;
  memorySnapshot: any;
  recommendations: string[];
  timestamp: number;
}

export class SelfImprovingClinicalBrain {
  private cycles: ImprovementCycle[] = [];

  runCycle(): ImprovementCycle {
    autoDebuggerAgent.start();

    const failures = predictiveFailureEngine.detectAll();
    const rootCause = rootCauseEngine.analyze();
    const debugActions = autoDebuggerAgent.getActions(10);
    const agentStatus = multiAgentCoordinator.getSummary();
    const memorySnapshot = memoryEngine.getSummary();

    const recommendations: string[] = [];

    if (failures.length > 0) {
      recommendations.push(`${failures.length} predictive risk(s) detected — monitor ${failures.map((f) => f.service).join(", ")}`);
    }
    if (rootCause.rootCause) {
      recommendations.push(`Root cause analysis: "${rootCause.rootCause}" is the primary error source`);
    }
    if (rootCause.patterns.length > 0) {
      rootCause.patterns.forEach((p: string) => recommendations.push(`Pattern: ${p}`));
    }
    if (debugActions.filter((a) => a.severity === "critical").length > 2) {
      recommendations.push("Multiple critical debug actions — consider system-wide health review");
    }
    if (memorySnapshot.totalEntries > 800) {
      recommendations.push("Memory approaching capacity — consider pruning old entries");
    }
    if (failures.length === 0 && !rootCause.rootCause) {
      recommendations.push("System stable — no immediate improvements needed");
    }

    const cycle: ImprovementCycle = {
      cycleId: `cycle_${Date.now()}`,
      failures,
      rootCause,
      debugActions,
      agentStatus,
      memorySnapshot,
      recommendations,
      timestamp: Date.now(),
    };

    this.cycles.unshift(cycle);
    if (this.cycles.length > 50) this.cycles = this.cycles.slice(0, 50);
    memoryEngine.store("improvement_cycle", cycle.cycleId, { recommendations, failureCount: failures.length });

    return cycle;
  }

  getHistory(limit: number = 10): ImprovementCycle[] {
    return this.cycles.slice(0, limit);
  }
}

export const selfImprovingBrain = new SelfImprovingClinicalBrain();
