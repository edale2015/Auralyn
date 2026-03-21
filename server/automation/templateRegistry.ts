import type { AutomationTemplate } from "./types";

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    templateKey: "demo-intake-form",
    name: "Demo Intake Form",
    description: "Example browser automation template for testing the automation layer",
    targetType: "web",
    startUrl: "https://example.com/form",
    fields: [
      { internalKey: "firstName", selector: "#first_name", type: "text", required: true },
      { internalKey: "lastName", selector: "#last_name", type: "text", required: true },
      { internalKey: "dob", selector: "#dob", type: "date" },
      { internalKey: "state", selector: "#state", type: "select" },
      { internalKey: "agree", selector: "#agree_terms", type: "checkbox" },
    ],
    actions: [
      { type: "goto", name: "open-form", url: "https://example.com/form" },
      { type: "fill", name: "fill-first-name", selector: "#first_name", valueKey: "firstName" },
      { type: "fill", name: "fill-last-name", selector: "#last_name", valueKey: "lastName" },
      { type: "fill", name: "fill-dob", selector: "#dob", valueKey: "dob" },
      { type: "select", name: "select-state", selector: "#state", valueKey: "state" },
      { type: "check", name: "accept-terms", selector: "#agree_terms", valueKey: "agree" },
      { type: "screenshot", name: "pre-submit-shot", screenshotLabel: "pre-submit" },
      { type: "humanApproval", name: "await-human-approval", checkpointName: "before-submit" },
      { type: "click", name: "submit-form", selector: "button[type='submit']" },
      { type: "waitFor", name: "wait-for-confirmation", selector: ".confirmation", timeoutMs: 10000 },
      { type: "screenshot", name: "confirmation-shot", screenshotLabel: "confirmation" },
    ],
  },
];

export function getAutomationTemplate(templateKey: string): AutomationTemplate {
  const template = AUTOMATION_TEMPLATES.find((t) => t.templateKey === templateKey);
  if (!template) {
    throw new Error(`Automation template not found: ${templateKey}`);
  }
  return template;
}

export function listAutomationTemplates(): AutomationTemplate[] {
  return AUTOMATION_TEMPLATES;
}
