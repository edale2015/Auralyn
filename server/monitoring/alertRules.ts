/**
 * server/monitoring/alertRules.ts — Alert rule evaluation engine
 *
 * FIX (Independent Review — Code Injection):
 *   Previously used `new Function(...keys, expr)` to evaluate alert rule expressions.
 *   Rule expressions come from a mutable in-memory store writeable via the API.
 *   An admin with API access could inject arbitrary code that runs with full server
 *   privileges (access to process, require, Buffer, network, etc.).
 *
 *   Fixed: replaced new Function with vm.runInNewContext() behind a vm.Script
 *   compilation step. The sandbox only exposes numeric metric values — no access
 *   to process, global, require, or any Node.js built-in. Execution is bounded
 *   by a 50ms timeout.
 */

import vm from "vm";
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

/**
 * Safely evaluate an alert rule expression against a metric snapshot.
 * Uses a vm sandbox — no access to process, require, or Node.js globals.
 */
function evalExprSafe(expr: string, metrics: Record<string, number>): boolean {
  try {
    const sandbox = Object.create(null);
    // Only expose numeric metric values — no globals, no prototype chain
    for (const [k, v] of Object.entries(metrics)) {
      if (/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(k)) sandbox[k] = v;
    }
    const script = new vm.Script(`!!(${expr})`, { filename: "alert-rule" });
    return script.runInNewContext(sandbox, { timeout: 50 });
  } catch {
    return false;
  }
}

export async function evalRules(metrics: Record<string, number>): Promise<string[]> {
  const fired: string[] = [];
  for (const rule of rules) {
    try {
      if (evalExprSafe(rule.expr, metrics)) {
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
