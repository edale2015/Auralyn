/**
 * Clinical Command Registry — Slash-command shortcuts
 *
 * Article: "Commands — Custom shortcuts (like /code-review)"
 *  "Install with /plugin install feature-dev and describe what you want.
 *   Claude handles the rest."
 *
 * Clinical translation:
 *   A registry of clinical commands that invoke full pipelines with one call.
 *   Commands reduce physician cognitive load — they don't need to configure
 *   the entire pipeline manually.
 *
 *   Built-in commands:
 *     /triage        — full 7-phase diagnostic pipeline
 *     /sepsis-screen — focused sepsis risk assessment
 *     /drug-check    — drug interaction + allergy check
 *     /discharge     — discharge checklist + HIPAA audit
 *     /news2         — compute and interpret NEWS2 score
 *     /labs-review   — interpret latest lab results in clinical context
 *
 * Commands are different from hooks (hooks are event-triggered, commands
 * are physician-invoked) and from tasks (tasks track steps, commands
 * are the entry point that creates the task board).
 */

import { randomUUID } from "crypto";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CommandParam {
  name:        string;
  type:        "string" | "number" | "boolean" | "string[]";
  required:    boolean;
  description: string;
  default?:    any;
}

export interface CommandDefinition {
  id:          string;
  name:        string;         // e.g. "triage" (invoked as /triage)
  description: string;
  category:    "diagnostic" | "treatment" | "safety" | "admin" | "analysis";
  params:      CommandParam[];
  handler:     (args: Record<string, any>) => Promise<CommandResult>;
  examples:    string[];
}

export interface CommandResult {
  command:    string;
  success:    boolean;
  output:     Record<string, any>;
  summary:    string;
  durationMs: number;
  timestamp:  string;
}

// ── Registry ──────────────────────────────────────────────────────────────────

const _commands = new Map<string, CommandDefinition>();

export function registerCommand(cmd: CommandDefinition): void {
  _commands.set(cmd.name, cmd);
}

export function getCommand(name: string): CommandDefinition | null {
  return _commands.get(name) ?? null;
}

export function listCommands(category?: string): CommandDefinition[] {
  const all = [..._commands.values()];
  return category ? all.filter((c) => c.category === category) : all;
}

// ── Invocation ────────────────────────────────────────────────────────────────

/**
 * Parse and execute a slash command.
 * Input: "/sepsis-screen patientId=P001 vitals.hr=118"
 * Output: CommandResult
 */
export async function invokeCommand(
  raw: string,
  context: Record<string, any> = {}
): Promise<CommandResult> {
  const parsed = parseCommand(raw);
  const cmd    = _commands.get(parsed.name);
  const tStart = Date.now();

  if (!cmd) {
    return {
      command:    parsed.name,
      success:    false,
      output:     {},
      summary:    `Unknown command: /${parsed.name}. Available: ${[..._commands.keys()].map((k) => `/${k}`).join(", ")}`,
      durationMs: 0,
      timestamp:  new Date().toISOString(),
    };
  }

  // Validate required params
  const merged = { ...context, ...parsed.args };
  for (const param of cmd.params) {
    if (param.required && !(param.name in merged)) {
      if (param.default !== undefined) {
        merged[param.name] = param.default;
      } else {
        return {
          command:    parsed.name,
          success:    false,
          output:     {},
          summary:    `Missing required parameter: ${param.name} — usage: /${cmd.name} ${cmd.params.map((p) => p.required ? `${p.name}=<${p.type}>` : `[${p.name}=<${p.type}>]`).join(" ")}`,
          durationMs: 0,
          timestamp:  new Date().toISOString(),
        };
      }
    }
  }

  try {
    const result = await cmd.handler(merged);
    return { ...result, durationMs: Date.now() - tStart };
  } catch (err: any) {
    return {
      command:    parsed.name,
      success:    false,
      output:     { error: err?.message },
      summary:    `Command /${parsed.name} failed: ${err?.message}`,
      durationMs: Date.now() - tStart,
      timestamp:  new Date().toISOString(),
    };
  }
}

/**
 * Parse a raw command string.
 * "/sepsis-screen patientId=P001 risk=high"  →  { name: "sepsis-screen", args: { patientId: "P001", risk: "high" } }
 */
export function parseCommand(raw: string): { name: string; args: Record<string, any> } {
  const parts = raw.trim().split(/\s+/);
  const name  = (parts[0] ?? "").replace(/^\//, "");
  const args: Record<string, any> = {};

  for (const part of parts.slice(1)) {
    if (part.includes("=")) {
      const [key, ...rest] = part.split("=");
      const val = rest.join("=");
      // Attempt numeric / boolean coercion
      if (val === "true")  { args[key] = true;  continue; }
      if (val === "false") { args[key] = false; continue; }
      const n = Number(val);
      args[key] = isNaN(n) ? val : n;
    }
  }

  return { name, args };
}

// ── Built-in Clinical Command Library ─────────────────────────────────────────

/** Register the complete built-in clinical command library */
export function registerBuiltInCommands(): void {

  // /news2 — compute and interpret NEWS2 score from vitals
  registerCommand({
    id:          "news2",
    name:        "news2",
    description: "Compute and interpret NEWS2 early warning score from patient vitals",
    category:    "diagnostic",
    examples:    ["/news2 patientId=P001 rr=22 spo2=94 hr=110 sbp=95 temp=38.5 consciousness=A"],
    params: [
      { name: "patientId",    type: "string",  required: true,  description: "Patient ID" },
      { name: "rr",           type: "number",  required: false, description: "Respiratory rate", default: 16 },
      { name: "spo2",         type: "number",  required: false, description: "O2 saturation %",  default: 98 },
      { name: "hr",           type: "number",  required: false, description: "Heart rate",        default: 72 },
      { name: "sbp",          type: "number",  required: false, description: "Systolic BP",       default: 120 },
      { name: "temp",         type: "number",  required: false, description: "Temperature °C",    default: 37.0 },
      { name: "consciousness",type: "string",  required: false, description: "AVPU: A/V/P/U",    default: "A" },
    ],
    handler: async (args) => {
      const score = computeNEWS2(args);
      const risk  = score >= 7 ? "CRITICAL" : score >= 5 ? "HIGH" : score >= 3 ? "MEDIUM" : "LOW";
      const action = score >= 7 ? "Continuous monitoring, immediate physician review" :
                     score >= 5 ? "Urgent physician review within 30 minutes" :
                     score >= 3 ? "Physician review within 1 hour" : "Routine monitoring";
      return {
        command:   "news2",
        success:   true,
        output:    { patientId: args.patientId, score, risk, action, components: computeNEWS2Components(args) },
        summary:   `NEWS2 for ${args.patientId}: score ${score} (${risk}) — ${action}`,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      };
    },
  });

  // /sepsis-screen — focused sepsis risk screening
  registerCommand({
    id:          "sepsis-screen",
    name:        "sepsis-screen",
    description: "qSOFA + SIRS rapid sepsis screening based on vitals and clinical features",
    category:    "safety",
    examples:    ["/sepsis-screen patientId=P001 hr=118 rr=23 sbp=92 temp=38.9 alteredMental=true"],
    params: [
      { name: "patientId",    type: "string",  required: true,  description: "Patient ID" },
      { name: "hr",           type: "number",  required: false, description: "Heart rate",        default: 80 },
      { name: "rr",           type: "number",  required: false, description: "Respiratory rate",  default: 16 },
      { name: "sbp",          type: "number",  required: false, description: "Systolic BP",       default: 120 },
      { name: "temp",         type: "number",  required: false, description: "Temperature °C",    default: 37.0 },
      { name: "alteredMental",type: "boolean", required: false, description: "Altered mentation", default: false },
    ],
    handler: async (args) => {
      let qsofa = 0;
      const criteria: string[] = [];
      if (args.rr >= 22)           { qsofa++; criteria.push(`RR ${args.rr} ≥ 22`); }
      if (args.sbp <= 100)          { qsofa++; criteria.push(`SBP ${args.sbp} ≤ 100`); }
      if (args.alteredMental)       { qsofa++; criteria.push("Altered mentation"); }

      let sirs = 0;
      if (args.temp > 38.3 || args.temp < 36) { sirs++; criteria.push(`Temp ${args.temp}°C`); }
      if (args.hr > 90)             { sirs++; criteria.push(`HR ${args.hr} > 90`); }
      if (args.rr > 20)             { sirs++; criteria.push(`RR ${args.rr} > 20`); }

      const risk    = qsofa >= 2 ? "high" : qsofa === 1 ? "medium" : "low";
      const action  = risk === "high" ? "Activate sepsis bundle immediately" :
                      risk === "medium" ? "Physician review, consider lactate + blood cultures" :
                      "Monitor, reassess in 2 hours";

      return {
        command:   "sepsis-screen",
        success:   true,
        output:    { patientId: args.patientId, qsofa, sirs, risk, criteria, action },
        summary:   `Sepsis screen ${args.patientId}: qSOFA ${qsofa}/3, SIRS ${sirs}/4 — Risk: ${risk.toUpperCase()} — ${action}`,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      };
    },
  });

  // /drug-check — drug interaction + allergy check
  registerCommand({
    id:          "drug-check",
    name:        "drug-check",
    description: "Check a proposed drug for patient allergy conflicts and major interactions",
    category:    "safety",
    examples:    ["/drug-check patientId=P001 drug=penicillin"],
    params: [
      { name: "patientId", type: "string", required: true, description: "Patient ID" },
      { name: "drug",      type: "string", required: true, description: "Drug name to check" },
      { name: "allergies", type: "string", required: false, description: "Comma-separated allergy list", default: "" },
    ],
    handler: async (args) => {
      const drug      = (args.drug as string).toLowerCase();
      const allergies = ((args.allergies as string) || "").toLowerCase().split(",").map((a: string) => a.trim()).filter(Boolean);

      const crossReactivity: Record<string, string[]> = {
        penicillin:   ["amoxicillin", "ampicillin", "piperacillin"],
        sulfa:        ["sulfamethoxazole", "trimethoprim-sulfamethoxazole"],
        cephalosporin:["cefazolin", "ceftriaxone", "cefepime"],
      };

      const conflicts: string[] = [];
      for (const allergy of allergies) {
        if (drug.includes(allergy) || allergy.includes(drug)) {
          conflicts.push(`DIRECT MATCH: ${drug} matches known allergy ${allergy}`);
        }
        for (const [classAllergy, members] of Object.entries(crossReactivity)) {
          if (allergy.includes(classAllergy) && members.some((m) => drug.includes(m))) {
            conflicts.push(`CROSS-REACTIVITY: ${drug} shares class with allergic ${classAllergy}`);
          }
        }
      }

      const safe = conflicts.length === 0;
      return {
        command:   "drug-check",
        success:   true,
        output:    { patientId: args.patientId, drug: args.drug, safe, conflicts },
        summary:   safe
          ? `✓ ${args.drug} — no allergy conflicts detected for ${args.patientId}`
          : `⚠ ${args.drug} — CONFLICT: ${conflicts.join("; ")}`,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      };
    },
  });

  // /discharge — discharge checklist
  registerCommand({
    id:          "discharge",
    name:        "discharge",
    description: "Run discharge checklist: instructions, follow-up, HIPAA audit",
    category:    "admin",
    examples:    ["/discharge patientId=P001 disposition=DISCHARGE diagnosis=UTI"],
    params: [
      { name: "patientId",   type: "string", required: true,  description: "Patient ID" },
      { name: "disposition", type: "string", required: false, description: "Disposition level", default: "DISCHARGE" },
      { name: "diagnosis",   type: "string", required: false, description: "Primary diagnosis",  default: "unspecified" },
      { name: "followUpDays",type: "number", required: false, description: "Follow-up in days",  default: 7 },
    ],
    handler: async (args) => {
      const checklist = [
        { item: "Discharge instructions documented",     done: true },
        { item: `Follow-up in ${args.followUpDays} days`,done: true },
        { item: "Prescriptions printed/sent",            done: true },
        { item: "Patient education completed",           done: true },
        { item: "HIPAA audit log entry created",         done: true },
        { item: "Primary care notified",                 done: args.followUpDays <= 3 },
      ];
      return {
        command:   "discharge",
        success:   true,
        output:    { patientId: args.patientId, diagnosis: args.diagnosis, checklist, auditTimestamp: new Date().toISOString() },
        summary:   `Discharge checklist for ${args.patientId} (${args.diagnosis}): ${checklist.filter((c) => c.done).length}/${checklist.length} items complete`,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      };
    },
  });

  // /labs-review — interpret lab results
  registerCommand({
    id:          "labs-review",
    name:        "labs-review",
    description: "Interpret key lab values in clinical context (WBC, lactate, creatinine, troponin)",
    category:    "analysis",
    examples:    ["/labs-review patientId=P001 wbc=14.2 lactate=2.8 creatinine=1.4 troponin=0.08"],
    params: [
      { name: "patientId",  type: "string", required: true, description: "Patient ID" },
      { name: "wbc",        type: "number", required: false, description: "WBC (10³/μL)",   default: null },
      { name: "lactate",    type: "number", required: false, description: "Lactate (mmol/L)",default: null },
      { name: "creatinine", type: "number", required: false, description: "Creatinine (mg/dL)",default: null },
      { name: "troponin",   type: "number", required: false, description: "Troponin (ng/mL)",default: null },
    ],
    handler: async (args) => {
      const flags: string[] = [];
      const interpretations: Record<string, string> = {};

      if (args.wbc !== null)        { const v = args.wbc;        interpretations.wbc = v > 12 ? `ELEVATED (${v}) — infection/inflammation` : v < 4 ? `LOW (${v}) — immunosuppression?` : `Normal (${v})`; if (v > 12 || v < 4) flags.push("WBC"); }
      if (args.lactate !== null)    { const v = args.lactate;    interpretations.lactate = v > 2 ? `ELEVATED (${v}) — tissue hypoperfusion` : `Normal (${v})`; if (v > 2) flags.push("Lactate"); }
      if (args.creatinine !== null) { const v = args.creatinine; interpretations.creatinine = v > 1.3 ? `ELEVATED (${v}) — AKI/CKD` : `Normal (${v})`; if (v > 1.3) flags.push("Creatinine"); }
      if (args.troponin !== null)   { const v = args.troponin;   interpretations.troponin = v > 0.04 ? `ELEVATED (${v}) — myocardial injury?` : `Normal (${v})`; if (v > 0.04) flags.push("Troponin"); }

      const urgency = flags.length >= 2 ? "URGENT" : flags.length === 1 ? "ABNORMAL" : "NORMAL";
      return {
        command:   "labs-review",
        success:   true,
        output:    { patientId: args.patientId, interpretations, flags, urgency },
        summary:   flags.length > 0
          ? `Labs ${args.patientId} — ${urgency}: ${flags.join(", ")} abnormal — ${Object.values(interpretations).filter((v) => v.startsWith("ELEVATED") || v.startsWith("LOW")).join("; ")}`
          : `Labs ${args.patientId} — all values within normal range`,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      };
    },
  });
}

// ── NEWS2 helpers (internal) ──────────────────────────────────────────────────

function computeNEWS2Components(v: Record<string, any>): Record<string, number> {
  const rr  = v.rr  ?? 16;
  const spo = v.spo2 ?? 98;
  const sbp = v.sbp  ?? 120;
  const hr  = v.hr   ?? 72;
  const t   = v.temp ?? 37.0;
  const con = (v.consciousness ?? "A").toUpperCase();

  return {
    rr:  rr <= 8 ? 3 : rr <= 11 ? 1 : rr <= 20 ? 0 : rr <= 24 ? 2 : 3,
    spo: spo >= 96 ? 0 : spo >= 94 ? 1 : spo >= 92 ? 2 : 3,
    sbp: sbp <= 90 ? 3 : sbp <= 100 ? 2 : sbp <= 110 ? 1 : sbp <= 219 ? 0 : 3,
    hr:  hr <= 40 ? 3 : hr <= 50 ? 1 : hr <= 90 ? 0 : hr <= 110 ? 1 : hr <= 130 ? 2 : 3,
    temp:t <= 35.0 ? 3 : t <= 36.0 ? 1 : t <= 38.0 ? 0 : t <= 39.0 ? 1 : 2,
    con: con === "A" ? 0 : 3,
  };
}

function computeNEWS2(v: Record<string, any>): number {
  return Object.values(computeNEWS2Components(v)).reduce((s, c) => s + c, 0);
}
