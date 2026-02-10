import type { StoredTrace } from "./traceStore";

const APP_BASE_URL = process.env.REPLIT_DEV_DOMAIN
  ? `https://${process.env.REPLIT_DEV_DOMAIN}`
  : process.env.APP_URL || "http://localhost:5000";

export function formatRunReceipt(trace: StoredTrace): string {
  const lines: string[] = [];

  lines.push(`*Run Receipt: ${trace.runId.slice(0, 8)}*`);
  lines.push("");

  lines.push(`Disposition: ${trace.normalized.disposition}`);

  if (trace.normalized.dx.length > 0) {
    lines.push(`Dx: ${trace.normalized.dx.join(", ")}`);
  }

  if (Object.keys(trace.normalized.scores).length > 0) {
    const scores = Object.entries(trace.normalized.scores)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    lines.push(`Scores: ${scores}`);
  }

  if (trace.normalized.redFlags.length > 0) {
    lines.push(`Red Flags: ${trace.normalized.redFlags.join(", ")}`);
  } else {
    lines.push("Red Flags: none");
  }

  const missingQids = extractMissingQuestionIds(trace);
  if (missingQids.length > 0) {
    lines.push(`Missing QIDs: ${missingQids.join(", ")}`);
  }

  lines.push(`Stop: ${trace.stopReason}`);
  lines.push(`Steps: ${trace.steps.length}`);
  lines.push(`Hash: ${trace.normalizedHash.slice(0, 12)}`);

  if (trace.scenarioId) {
    lines.push(`Scenario: ${trace.scenarioId}`);
  }

  lines.push("");
  lines.push(`View: ${APP_BASE_URL}/debug/traces?runId=${trace.runId}`);

  return lines.join("\n");
}

export function formatTraceForWhatsApp(trace: StoredTrace): string {
  const lines: string[] = [];

  lines.push(`*Trace: ${trace.runId.slice(0, 8)}*`);
  if (trace.scenarioId) lines.push(`Scenario: ${trace.scenarioId}`);
  lines.push(`Complaint: ${trace.chiefComplaint}`);
  lines.push(`Stop: ${trace.stopReason}`);
  lines.push("");

  lines.push(`*Result*`);
  lines.push(`Disposition: ${trace.normalized.disposition}`);
  if (trace.normalized.dx.length > 0) {
    lines.push(`Dx: ${trace.normalized.dx.join(", ")}`);
  }
  if (Object.keys(trace.normalized.scores).length > 0) {
    const scores = Object.entries(trace.normalized.scores)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    lines.push(`Scores: ${scores}`);
  }
  if (trace.normalized.redFlags.length > 0) {
    lines.push(`Red Flags: ${trace.normalized.redFlags.join(", ")}`);
  }
  lines.push("");

  lines.push(`*Steps (${trace.steps.length})*`);
  const maxSteps = 8;
  const stepsToShow = trace.steps.slice(0, maxSteps);
  for (const step of stepsToShow) {
    const action = step.action?.type || "?";
    const actor = step.actor || "?";
    const refs = step.ruleRefs.length > 0 ? ` [${step.ruleRefs.join(",")}]` : "";
    const outputKeys = Object.keys(step.outputs || {});
    const outputSnippet = outputKeys.length > 0 ? ` -> ${outputKeys.join(",")}` : "";
    lines.push(`${step.step}. ${actor}/${action}${refs}${outputSnippet}`);
  }
  if (trace.steps.length > maxSteps) {
    lines.push(`... +${trace.steps.length - maxSteps} more`);
  }

  if (trace.events.length > 0) {
    lines.push("");
    lines.push(`*Events (${trace.events.length})*`);
    for (const evt of trace.events.slice(0, 5)) {
      lines.push(`[${evt.severity}] ${evt.type}${evt.message ? ": " + evt.message : ""}`);
    }
  }

  lines.push("");
  lines.push(`Hash: ${trace.normalizedHash.slice(0, 12)}`);
  lines.push(`Time: ${trace.createdAt}`);

  return lines.join("\n");
}

export function formatStepExplain(trace: StoredTrace, stepNum: number): string {
  const step = trace.steps.find(s => s.step === stepNum);
  if (!step) {
    return `Step ${stepNum} not found in trace ${trace.runId.slice(0, 8)}.\nAvailable steps: 1-${trace.steps.length}`;
  }

  const lines: string[] = [];
  lines.push(`*Step ${step.step} of ${trace.runId.slice(0, 8)}*`);
  lines.push("");
  lines.push(`Action: ${step.action.type}`);
  lines.push(`Actor: ${step.actor}`);

  if (step.inputsUsed.length > 0) {
    lines.push(`Inputs: ${step.inputsUsed.join(", ")}`);
  }

  if (step.ruleRefs.length > 0) {
    lines.push(`Rules: ${step.ruleRefs.join(", ")}`);
  }

  if (Object.keys(step.outputs).length > 0) {
    lines.push("");
    lines.push("*Outputs*");
    for (const [k, v] of Object.entries(step.outputs)) {
      const val = typeof v === "object" ? JSON.stringify(v) : String(v ?? "null");
      const truncated = val.length > 120 ? val.slice(0, 117) + "..." : val;
      lines.push(`  ${k}: ${truncated}`);
    }
  }

  const actionExtra = { ...step.action };
  delete actionExtra.type;
  if (Object.keys(actionExtra).length > 0) {
    lines.push("");
    lines.push("*Action Details*");
    for (const [k, v] of Object.entries(actionExtra)) {
      const val = typeof v === "object" ? JSON.stringify(v) : String(v ?? "null");
      const truncated = val.length > 120 ? val.slice(0, 117) + "..." : val;
      lines.push(`  ${k}: ${truncated}`);
    }
  }

  return lines.join("\n");
}

export function formatScenarioList(scenarios: Array<{ id: string; label: string; complaint: string; tags: string[] }>): string {
  if (scenarios.length === 0) return "No test scenarios found.";

  const lines: string[] = ["*Available Scenarios*", ""];
  for (const s of scenarios) {
    const tagStr = s.tags.length > 0 ? ` [${s.tags.join(",")}]` : "";
    lines.push(`- ${s.id}${tagStr}`);
    lines.push(`  ${s.label}`);
  }
  lines.push("");
  lines.push("Run: !scenario run <id> [--llm=on|off] [--seed=N]");
  return lines.join("\n");
}

function extractMissingQuestionIds(trace: StoredTrace): string[] {
  const missing: string[] = [];
  for (const step of trace.steps) {
    if (step.action.type === "STOP" && step.outputs?.requiredInputsMissing) {
      const arr = step.outputs.requiredInputsMissing;
      if (Array.isArray(arr)) missing.push(...arr.map(String));
    }
    if (step.action.type === "ASK_QUESTION" && step.action.questionId) {
      missing.push(String(step.action.questionId));
    }
  }
  return [...new Set(missing)];
}
