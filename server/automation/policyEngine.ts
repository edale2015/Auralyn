import type { AutomationAction } from "./types";

export type PolicyDecision = {
  allowed: boolean;
  requiresApproval: boolean;
  reason?: string;
};

export function evaluateAutomationPolicy(input: {
  templateKey: string;
  action: AutomationAction;
  payload: Record<string, any>;
}): PolicyDecision {
  const { action } = input;

  if (action.type === "click" && /submit|final|send/i.test(action.name)) {
    return {
      allowed: true,
      requiresApproval: true,
      reason: "Final submission requires human approval",
    };
  }

  if (action.type === "goto" && action.url?.includes("admin")) {
    return {
      allowed: true,
      requiresApproval: true,
      reason: "Administrative target requires checkpoint",
    };
  }

  return { allowed: true, requiresApproval: false };
}
