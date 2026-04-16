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

// Maximum number of appended instructions per agent.
// Prevents unbounded prompt bloat that degrades LLM output quality.
const MAX_APPENDED_INSTRUCTIONS = 20;

function appendIfMissing(instructions: string[], text: string, changes: string[], label: string): void {
  if (instructions.length >= MAX_APPENDED_INSTRUCTIONS) {
    console.warn(`[selfModify] Instruction cap (${MAX_APPENDED_INSTRUCTIONS}) reached for agent — skipping: "${label}"`);
    return;
  }
  if (!instructions.includes(text)) {
    instructions.push(text);
    changes.push(label);
  }
}

export function improveAgent(agentId: string, feedback: AgentFeedback): { modified: boolean; changes: string[] } {
  const config = getOrCreate(agentId);
  const changes: string[] = [];

  // FIX: was unconditional `.push()` — appended duplicate instructions on every call.
  // Now deduplicated via appendIfMissing(), consistent with all other branches.
  if (feedback.successRate < 0.7) {
    appendIfMissing(
      config.appendedInstructions,
      "Consider alternative diagnoses before committing to primary.",
      changes,
      "Added differential diagnosis reminder",
    );
    config.preferDifferentialDiagnosis = true;
  }

  appendIfMissing(
    config.appendedInstructions,
    "Verify ear canal alignment before otoscope approach.",
    changes,
    "Added otoscope alignment check",
  );

  if ((feedback.averageRiskScore ?? 0) > 0.75) {
    config.confidenceThreshold = Math.min(0.95, config.confidenceThreshold + 0.05);
    changes.push(`Raised confidence threshold to ${config.confidenceThreshold}`);
  }

  if (feedback.dominantComplaint === "chest_pain") {
    appendIfMissing(
      config.appendedInstructions,
      "Always rule out cardiac etiology for chest pain first.",
      changes,
      "Added cardiac rule-out priority",
    );
  }

  if (changes.length > 0) {
    config.lastModifiedAt = new Date().toISOString();
    config.modificationCount++;
    // NOTE: These mutations are in-memory only and are not persisted.
    // For regulated deployments, route through the selfImprove.ts governance
    // pipeline (propose → pending_review → approved → applied) so every
    // prompt change is audited, physician-gated, and DB-persisted.
    console.warn(
      `[selfModify] In-memory prompt mutation for agent "${agentId}". ` +
      `Changes: ${changes.join("; ")}. ` +
      `This is NOT persisted and NOT audit-logged. Route through selfImprove.ts for production.`
    );
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
