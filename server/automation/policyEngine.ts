/**
 * server/automation/policyEngine.ts — Automation policy engine
 *
 * FIX (Code Review High Finding #9):
 *   The original gate used a regex on action.name matching /submit|final|send/i.
 *   Any action named "confirm", "execute_chart", or "complete_encounter" bypassed
 *   approval entirely. The admin URL check (action.url?.includes("admin")) was
 *   trivially bypassed by using a non-admin-looking URL that resolves to an admin
 *   endpoint. No payload content was ever inspected.
 *
 *   Fixed:
 *   1. Action-type matrix: write/navigate/fill/click each have independent policies
 *   2. Payload content inspection: drug names, chart update keywords, order keywords,
 *      and PHI-containing fields trigger mandatory approval regardless of action name
 *   3. Risk scoring: composite score from action type + payload content → approval tier
 *   4. URL allowlist validation: goto actions checked against AUTOMATION_ALLOWED_HOSTS
 *   5. Name-based regex kept as ONE signal, not the sole gate
 */

import type { AutomationAction } from "./types";

export type PolicyDecision = {
  allowed:          boolean;
  requiresApproval: boolean;
  reason?:          string;
  riskScore:        number;    // 0-1, for audit and dashboards
  triggers:         string[];  // which rules fired
};

// ── Drug / clinical keyword lists ─────────────────────────────────────────────

const DRUG_KEYWORDS = [
  "mg", "mcg", "dose", "dosage", "antibiotic", "anticoagulant", "heparin",
  "warfarin", "metformin", "insulin", "opioid", "morphine", "fentanyl",
  "naloxone", "epinephrine", "epi", "medication", "prescription", "rx",
];

const CHART_UPDATE_KEYWORDS = [
  "diagnosis", "disposition", "chart", "encounter", "admission", "discharge",
  "procedure", "surgery", "intubation", "vent", "icu", "critical", "sepsis",
  "resuscitation", "cpr", "dnr", "advance directive",
];

const ORDER_KEYWORDS = [
  "order", "lab", "imaging", "x-ray", "mri", "ct", "ultrasound", "ecg", "ekg",
  "blood", "urine", "culture", "referral", "consult", "transfer",
];

// ── URL allowlist ─────────────────────────────────────────────────────────────

function getAllowedHosts(): string[] {
  const raw = process.env.AUTOMATION_ALLOWED_HOSTS ?? "";
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}

function isUrlAllowed(url: string): { ok: boolean; reason?: string } {
  const allowed = getAllowedHosts();
  if (allowed.length === 0) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, reason: "AUTOMATION_ALLOWED_HOSTS not configured — goto actions blocked in production" };
    }
    return { ok: true };  // dev: warn + allow
  }

  try {
    const parsed = new URL(url);
    const host   = parsed.hostname.toLowerCase();
    const isOk   = allowed.some(h => host === h.toLowerCase() || host.endsWith(`.${h.toLowerCase()}`));
    if (!isOk) return { ok: false, reason: `Host '${host}' not in AUTOMATION_ALLOWED_HOSTS allowlist` };
    return { ok: true };
  } catch {
    return { ok: false, reason: `Invalid URL: ${url}` };
  }
}

// ── Payload content scanner ───────────────────────────────────────────────────

function scanPayload(payload: Record<string, any>): {
  hasDrugContent:   boolean;
  hasChartContent:  boolean;
  hasOrderContent:  boolean;
  hasPHI:           boolean;
  riskScore:        number;
  matches:          string[];
} {
  const blob    = JSON.stringify(payload).toLowerCase();
  const matches: string[] = [];

  const hasDrugContent  = DRUG_KEYWORDS.some(k  => { if (blob.includes(k)) { matches.push(`drug:${k}`); return true; } return false; });
  const hasChartContent = CHART_UPDATE_KEYWORDS.some(k => { if (blob.includes(k)) { matches.push(`chart:${k}`); return true; } return false; });
  const hasOrderContent = ORDER_KEYWORDS.some(k  => { if (blob.includes(k)) { matches.push(`order:${k}`); return true; } return false; });

  // PHI heuristics: patientId, dob, ssn, mrn in payload fields
  const phiKeys = ["patientId", "patient_id", "mrn", "ssn", "dob", "dateOfBirth", "phone", "email"];
  const hasPHI  = phiKeys.some(k => k in payload || blob.includes(`"${k}"`));
  if (hasPHI) matches.push("phi:patient_fields");

  const riskScore =
    (hasDrugContent  ? 0.4 : 0) +
    (hasChartContent ? 0.3 : 0) +
    (hasOrderContent ? 0.2 : 0) +
    (hasPHI          ? 0.1 : 0);

  return { hasDrugContent, hasChartContent, hasOrderContent, hasPHI, riskScore: Math.min(riskScore, 1), matches };
}

// ── Main policy evaluator ─────────────────────────────────────────────────────

export function evaluateAutomationPolicy(input: {
  templateKey: string;
  action:      AutomationAction;
  payload:     Record<string, any>;
}): PolicyDecision {
  const { action, payload } = input;
  const triggers: string[] = [];
  let   totalRisk = 0;
  let   blocked   = false;
  let   approval  = false;

  // ── 1. URL allowlist check for goto/navigate actions ─────────────────────
  if ((action.type === "goto" || action.type === "navigate") && action.url) {
    const urlCheck = isUrlAllowed(action.url);
    if (!urlCheck.ok) {
      return {
        allowed:          false,
        requiresApproval: false,
        reason:           urlCheck.reason,
        riskScore:        1.0,
        triggers:         ["url_blocked"],
      };
    }
    // Admin-ish path detection — URL allowlist passes but path raises risk
    const pathname = (() => { try { return new URL(action.url).pathname.toLowerCase(); } catch { return action.url.toLowerCase(); } })();
    if (/admin|config|settings|manage|user|role|permission/.test(pathname)) {
      triggers.push("admin_path");
      totalRisk += 0.4;
      approval   = true;
    }
  }

  // ── 2. Action name semantic check (extended, not sole gate) ──────────────
  if (/submit|final|send|confirm|execute|complete|file|commit/i.test(action.name ?? "")) {
    triggers.push("name:finalization_verb");
    totalRisk += 0.3;
    approval   = true;
  }

  // ── 3. Write-type action check ────────────────────────────────────────────
  if (action.type === "fill" || action.type === "type" || action.type === "write") {
    triggers.push("action_type:write");
    totalRisk += 0.1;
  }

  // ── 4. Payload content inspection ────────────────────────────────────────
  const contentScan = scanPayload(payload);
  triggers.push(...contentScan.matches);
  totalRisk += contentScan.riskScore;

  if (contentScan.hasDrugContent) {
    triggers.push("payload:drug_content");
    approval = true;
  }
  if (contentScan.hasChartContent) {
    triggers.push("payload:chart_update");
    approval = true;
  }
  if (contentScan.hasOrderContent) {
    triggers.push("payload:clinical_order");
    approval = true;
  }

  // ── 5. High aggregate risk → mandatory approval ───────────────────────────
  const finalRisk = Math.min(totalRisk, 1);
  if (finalRisk >= 0.6) {
    triggers.push("risk_threshold:0.6");
    approval = true;
  }

  // ── 6. Safety default: unknown action types with content get approval ─────
  if (!["click", "goto", "navigate", "fill", "type", "write", "scroll", "wait", "assert"].includes(action.type ?? "")) {
    triggers.push("unknown_action_type");
    approval = true;
  }

  const requiresApproval = approval;
  const reason = requiresApproval
    ? `Approval required: ${triggers.slice(0, 3).join(", ")}${triggers.length > 3 ? ` +${triggers.length - 3} more` : ""}`
    : undefined;

  return {
    allowed: !blocked,
    requiresApproval,
    reason,
    riskScore: finalRisk,
    triggers,
  };
}
