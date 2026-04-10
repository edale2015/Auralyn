import { sendSlackAlert, sendWhatsAppAlert } from "./alerts";

export interface AlertRule {
  id: string;
  expr: string;
  target: "slack" | "whatsapp" | "both";
  createdAt: string;
}

const rules: AlertRule[] = [];

export function addRule(rule: Omit<AlertRule, "id" | "createdAt">): AlertRule {
  const entry: AlertRule = {
    ...rule,
    id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  };
  rules.push(entry);
  return entry;
}

export function getAlertRules(): AlertRule[] {
  return [...rules];
}

export function clearRules(): void {
  rules.splice(0);
}

export function removeRule(id: string): boolean {
  const idx = rules.findIndex(r => r.id === id);
  if (idx === -1) return false;
  rules.splice(idx, 1);
  return true;
}

export async function evalRules(metrics: Record<string, number>): Promise<string[]> {
  const fired: string[] = [];
  for (const rule of rules) {
    try {
      const keys = Object.keys(metrics);
      const vals = Object.values(metrics);
      const fn = new Function(...keys, `return !!(${rule.expr});`);
      if (fn(...vals)) {
        if (rule.target === "slack" || rule.target === "both") {
          await sendSlackAlert(`Alert rule fired: ${rule.expr}`);
        }
        if (rule.target === "whatsapp" || rule.target === "both") {
          await sendWhatsAppAlert(`Alert rule fired: ${rule.expr}`);
        }
        fired.push(rule.id);
      }
    } catch {
      continue;
    }
  }
  return fired;
}
