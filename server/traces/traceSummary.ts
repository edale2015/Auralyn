import type { StoredTrace } from "./traceStore";

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

export function formatScenarioList(scenarios: Array<{ id: string; label: string; complaint: string; tags: string[] }>): string {
  if (scenarios.length === 0) return "No test scenarios found.";

  const lines: string[] = ["*Available Scenarios*", ""];
  for (const s of scenarios) {
    const tagStr = s.tags.length > 0 ? ` [${s.tags.join(",")}]` : "";
    lines.push(`- ${s.id}${tagStr}`);
    lines.push(`  ${s.label}`);
  }
  lines.push("");
  lines.push("Run: !scenario run <id>");
  return lines.join("\n");
}
