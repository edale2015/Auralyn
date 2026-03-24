import { auditLog } from "../security/auditLogger";
import { logMetric } from "../monitoring/metrics";

export type UIActionType = "type" | "click" | "scroll" | "select" | "navigate" | "wait" | "read";

export interface UIAction {
  action: UIActionType;
  selector?: string;
  value?: string;
  x?: number;
  y?: number;
  url?: string;
  direction?: "up" | "down";
  ms?: number;
}

export interface UIAgentTask {
  goal: string;
  screenState?: Record<string, any>;
  maxSteps?: number;
  sessionId?: string;
}

export interface UIAgentResult {
  success: boolean;
  steps: UIAction[];
  stepsExecuted: number;
  goal: string;
  completedAt: string;
  note?: string;
}

function planStepsForGoal(goal: string, screenState: Record<string, any> = {}): UIAction[] {
  const g = goal.toLowerCase();
  const steps: UIAction[] = [];

  if (g.includes("submit") && g.includes("form")) {
    steps.push({ action: "read", selector: "form" });
    steps.push({ action: "click", selector: "[type='submit']" });
    steps.push({ action: "wait", ms: 500 });
  } else if (g.includes("fill") || g.includes("type")) {
    const valueMatch = goal.match(/["']([^"']+)["']/);
    const selectorMatch = goal.match(/(?:into|in)\s+["`]?([a-zA-Z#.[\]_-]+)["`]?/i);
    steps.push({
      action: "type",
      selector: selectorMatch?.[1] ?? "input",
      value: valueMatch?.[1] ?? goal.replace(/fill|type|into|in/gi, "").trim(),
    });
  } else if (g.includes("click")) {
    const target = goal.replace(/click|on|the/gi, "").trim();
    steps.push({ action: "click", selector: `button:contains("${target}"), [data-testid*="${target}"]` });
  } else if (g.includes("navigate") || g.includes("go to")) {
    const urlMatch = goal.match(/(?:to|url)\s+(https?:\/\/[^\s]+)/i);
    steps.push({ action: "navigate", url: urlMatch?.[1] ?? "/" });
  } else if (g.includes("scroll")) {
    steps.push({ action: "scroll", direction: g.includes("up") ? "up" : "down" });
  } else if (g.includes("approve") || g.includes("override")) {
    const caseMatch = goal.match(/case[- ]?([a-z0-9-]+)/i);
    const action = g.includes("override") ? "override" : "approve";
    steps.push({ action: "click", selector: `[data-testid="${action}-${caseMatch?.[1] ?? ""}"]` });
    steps.push({ action: "wait", ms: 300 });
  } else {
    steps.push({ action: "read", selector: "body" });
  }

  return steps;
}

async function executeStep(step: UIAction): Promise<{ ok: boolean; note?: string }> {
  await new Promise(r => setTimeout(r, step.ms ?? 50));

  switch (step.action) {
    case "type":
      return { ok: true, note: `Typed "${step.value}" into "${step.selector}"` };
    case "click":
      return { ok: true, note: `Clicked "${step.selector ?? `(${step.x},${step.y})`}"` };
    case "scroll":
      return { ok: true, note: `Scrolled ${step.direction ?? "down"}` };
    case "navigate":
      return { ok: true, note: `Navigated to ${step.url}` };
    case "select":
      return { ok: true, note: `Selected "${step.value}" in "${step.selector}"` };
    case "wait":
      return { ok: true, note: `Waited ${step.ms}ms` };
    case "read":
      return { ok: true, note: `Read screen state at "${step.selector}"` };
    default:
      return { ok: false, note: "Unknown action" };
  }
}

export async function runUIAutomation(task: UIAgentTask): Promise<UIAgentResult> {
  const start = Date.now();
  const maxSteps = task.maxSteps ?? 20;

  auditLog({ actor: "ui_agent", action: "task_started", entityType: "ui_task", entityId: task.sessionId ?? "anon", details: { goal: task.goal } });

  const steps = planStepsForGoal(task.goal, task.screenState ?? {});
  const limited = steps.slice(0, maxSteps);

  let stepsExecuted = 0;
  const notes: string[] = [];

  for (const step of limited) {
    const { ok, note } = await executeStep(step);
    stepsExecuted++;
    if (note) notes.push(note);
    if (!ok) break;
  }

  logMetric("ui_agent.steps", stepsExecuted, "automation");

  const result: UIAgentResult = {
    success: stepsExecuted > 0,
    steps: limited,
    stepsExecuted,
    goal: task.goal,
    completedAt: new Date().toISOString(),
    note: notes.join(" → "),
  };

  auditLog({ actor: "ui_agent", action: "task_complete", details: { goal: task.goal, stepsExecuted, latency: Date.now() - start } });

  return result;
}

export function parseInstruction(instruction: string): UIAction {
  const i = instruction.toLowerCase();
  if (i.includes("type") || i.includes("enter") || i.includes("input")) {
    const val = instruction.replace(/type|enter|input/gi, "").trim();
    return { action: "type", value: val };
  }
  if (i.includes("click") || i.includes("press")) {
    const coords = instruction.match(/(\d+)[,\s]+(\d+)/);
    if (coords) return { action: "click", x: Number(coords[1]), y: Number(coords[2]) };
    return { action: "click", selector: instruction.replace(/click|press|the|on/gi, "").trim() };
  }
  if (i.includes("scroll")) return { action: "scroll", direction: i.includes("up") ? "up" : "down" };
  if (i.includes("navigate") || i.includes("go to")) {
    const url = instruction.match(/https?:\/\/[^\s]+/)?.[0];
    return { action: "navigate", url: url ?? "/" };
  }
  return { action: "read", selector: "body" };
}
