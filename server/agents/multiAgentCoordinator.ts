interface AgentTask {
  agent: string;
  task: string;
  assignedAt: number;
  status: "active" | "completed" | "failed";
}

export interface CoordinatorSummary {
  activeTasks: AgentTask[];
  completedTasks: number;
  failedTasks: number;
  totalAssigned: number;
  agents: string[];
}

export class MultiAgentCoordinator {
  private tasks: AgentTask[] = [];

  assign(agent: string, task: string): { status: string; reason?: string } {
    const conflict = this.tasks.find((t) => t.task === task && t.status === "active");
    if (conflict) {
      return { status: "blocked", reason: `Task already assigned to ${conflict.agent}` };
    }
    this.tasks.push({ agent, task, assignedAt: Date.now(), status: "active" });
    return { status: "assigned" };
  }

  complete(agent: string, task: string) {
    const t = this.tasks.find((t) => t.agent === agent && t.task === task && t.status === "active");
    if (t) t.status = "completed";
  }

  fail(agent: string, task: string) {
    const t = this.tasks.find((t) => t.agent === agent && t.task === task && t.status === "active");
    if (t) t.status = "failed";
  }

  getSummary(): CoordinatorSummary {
    const agents = [...new Set(this.tasks.map((t) => t.agent))];
    return {
      activeTasks: this.tasks.filter((t) => t.status === "active"),
      completedTasks: this.tasks.filter((t) => t.status === "completed").length,
      failedTasks: this.tasks.filter((t) => t.status === "failed").length,
      totalAssigned: this.tasks.length,
      agents,
    };
  }
}

export const multiAgentCoordinator = new MultiAgentCoordinator();

multiAgentCoordinator.assign("AutoDebugger", "system_health_scan");
multiAgentCoordinator.assign("PredictiveEngine", "failure_forecasting");
multiAgentCoordinator.assign("SimulationAgent", "stress_test_generation");
multiAgentCoordinator.assign("LearningAgent", "outcome_analysis");
multiAgentCoordinator.assign("GovernanceAgent", "deployment_validation");
