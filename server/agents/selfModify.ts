export interface AgentFeedback {
  successRate: number;
  failedActions: string[];
  dominantComplaint?: string;
  averageRiskScore?: number;
}

export interface AgentConfig {
  basePrompt: string;
  appendedInstructions: string[];
  confidenceThreshold: number;
  preferDifferentialDiagnosis: boolean;
  lastModifiedAt: string;
  modificationCount: number;
}

const agentConfigs = new Map<string, AgentConfig>();

function getOrCreate(agentId: string): AgentConfig {
  if (!agentConfigs.has(agentId)) {
    agentConfigs.set(agentId, {
      basePrompt: "Diagnose and triage patient based on complaints, vitals, and history.",
      appendedInstructions: [],
      confidenceThreshold: 0.7,
      preferDifferentialDiagnosis: false,
      lastModifiedAt: new Date().toISOString(),
      modificationCount: 0,
    });
  }
  return agentConfigs.get(agentId)!;
}

export function improveAgent(agentId: string, feedback: AgentFeedback): { modified: boolean; changes: string[] } {
  const config = getOrCreate(agentId);
  const changes: string[] = [];

  if (feedback.successRate < 0.7) {
    config.appendedInstructions.push("Consider alternative diagnoses before committing to primary.");
    changes.push("Added differential diagnosis reminder");
    config.preferDifferentialDiagnosis = true;
  }

  if (feedback.failedActions.includes("otoscopy") && !config.appendedInstructions.includes("Verify ear canal alignment before otoscope approach.")) {
    config.appendedInstructions.push("Verify ear canal alignment before otoscope approach.");
    changes.push("Added otoscope alignment check");
  }

  if ((feedback.averageRiskScore ?? 0) > 0.75) {
    config.confidenceThreshold = Math.min(0.95, config.confidenceThreshold + 0.05);
    changes.push(`Raised confidence threshold to ${config.confidenceThreshold}`);
  }

  if (feedback.dominantComplaint === "chest_pain" && !config.appendedInstructions.includes("Always rule out cardiac etiology for chest pain first.")) {
    config.appendedInstructions.push("Always rule out cardiac etiology for chest pain first.");
    changes.push("Added cardiac rule-out priority");
  }

  if (changes.length > 0) {
    config.lastModifiedAt = new Date().toISOString();
    config.modificationCount++;
  }

  return { modified: changes.length > 0, changes };
}

export function getAgentPrompt(agentId: string): string {
  const config = getOrCreate(agentId);
  const parts = [config.basePrompt, ...config.appendedInstructions];
  return parts.join(" ");
}

export function getAgentConfig(agentId: string): AgentConfig {
  return getOrCreate(agentId);
}

export function listAgentConfigs(): Array<{ agentId: string } & AgentConfig> {
  return [...agentConfigs.entries()].map(([agentId, config]) => ({ agentId, ...config }));
}

export function resetAgent(agentId: string): void {
  agentConfigs.delete(agentId);
}
