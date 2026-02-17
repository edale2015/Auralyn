import { getTable } from "../data/registry";
import type { CaseState } from "../../shared/agentTypes";
import { detectRedFlags } from "../agent/safety/redFlags";
import { getRedFlagEntry, type RedFlagEntry } from "./supervisorEnhanced";

export interface RedFlagMasterRow {
  flagId: string;
  label: string;
  system: string;
  triggerType: string;
  triggerCondition: string;
  severity: "critical" | "high" | "moderate";
  action: string;
  immediateActions: string[];
  reasons: string[];
  channelMessage: string;
}

export interface RedFlagGateResult {
  evaluated: boolean;
  flagsFound: Array<{
    flagId: string;
    label: string;
    severity: string;
    action: string;
    reasons: string[];
    immediateActions: string[];
    source: string;
  }>;
  gateResult: "PASS" | "ER_SEND" | "ESCALATE";
  formattedOutput?: Record<string, any>;
}

function norm(s: any): string {
  return String(s ?? "").trim().toLowerCase();
}

function splitList(s: any): string[] {
  return String(s ?? "").split(/[;,]/).map(x => x.trim()).filter(Boolean);
}

function parseRedFlagRow(row: Record<string, any>): RedFlagMasterRow | null {
  const flagId = String(row.Flag_ID ?? row.flagId ?? "").trim();
  if (!flagId) return null;
  return {
    flagId,
    label: String(row.Label ?? row.label ?? "").trim(),
    system: norm(row.System),
    triggerType: norm(row.Trigger_Type ?? row.triggerType),
    triggerCondition: String(row.Trigger_Condition ?? row.triggerCondition ?? "").trim(),
    severity: (norm(row.Severity) || "high") as RedFlagMasterRow["severity"],
    action: norm(row.Action) || "er_send",
    immediateActions: splitList(row.Immediate_Actions ?? row.immediateActions),
    reasons: splitList(row.Reasons ?? row.reasons),
    channelMessage: String(row.Channel_Message ?? row.channelMessage ?? "").trim(),
  };
}

const DEFAULT_RED_FLAG_ROWS: RedFlagMasterRow[] = [
  {
    flagId: "RF_SOB", label: "Shortness of Breath", system: "", triggerType: "answer",
    triggerCondition: "Q_SHORTNESS_OF_BREATH==yes", severity: "critical", action: "er_send",
    immediateActions: ["Call 911 if worsening", "Sit upright", "Do not lie flat"],
    reasons: ["Patient reports shortness of breath"], channelMessage: ""
  },
  {
    flagId: "RF_CHEST_PAIN", label: "Chest Pain", system: "", triggerType: "answer",
    triggerCondition: "Q_CHEST_PAIN==yes", severity: "critical", action: "er_send",
    immediateActions: ["Call 911 immediately", "Chew aspirin 325mg if available", "Do not drive yourself"],
    reasons: ["Patient reports chest pain"], channelMessage: ""
  },
  {
    flagId: "RF_STRIDOR", label: "Stridor", system: "", triggerType: "answer",
    triggerCondition: "Q_STRIDOR==yes", severity: "critical", action: "er_send",
    immediateActions: ["Call 911 immediately", "Keep calm and upright"],
    reasons: ["Stridor detected"], channelMessage: ""
  },
  {
    flagId: "RF_DROOLING", label: "Unable to Swallow Saliva", system: "", triggerType: "answer",
    triggerCondition: "Q_UNABLE_TO_SWALLOW_SALIVA==yes", severity: "critical", action: "er_send",
    immediateActions: ["Call 911 immediately", "Do not attempt to eat or drink"],
    reasons: ["Cannot swallow saliva — airway concern"], channelMessage: ""
  },
  {
    flagId: "RF_HTN_EMERGENCY_NEURO", label: "HTN Emergency with Neuro Deficit", system: "htn", triggerType: "answer",
    triggerCondition: "Q_HTN_NEURO_DEFICIT==yes", severity: "critical", action: "er_send",
    immediateActions: ["Call 911 immediately", "Note time of onset of symptoms"],
    reasons: ["Hypertensive emergency with neurological deficit"], channelMessage: ""
  },
  {
    flagId: "RF_DKA_HHS", label: "DKA / HHS", system: "dm", triggerType: "composite",
    triggerCondition: "Q_DM_ALTERED_MENTAL_STATUS==yes OR (Q_DM_PERSISTENT_VOMITING==yes AND Q_DM_DEHYDRATION==yes) OR Q_DM_KUSSMAUL==yes",
    severity: "critical", action: "er_send",
    immediateActions: ["Call 911 immediately", "Do not take insulin without supervision", "Nothing by mouth", "Maintain hydration if alert"],
    reasons: ["Diabetic emergency signs detected"], channelMessage: ""
  },
  {
    flagId: "RF_SEVERE_HYPOGLYCEMIA", label: "Severe Hypoglycemia", system: "dm", triggerType: "answer",
    triggerCondition: "Q_DM_SEVERE_HYPO==yes", severity: "critical", action: "er_send",
    immediateActions: ["Give fast-acting glucose if conscious", "Call 911 if unresponsive", "Administer glucagon if available"],
    reasons: ["Severe hypoglycemia detected"], channelMessage: ""
  },
];

function evaluateTableRedFlags(
  rows: RedFlagMasterRow[],
  state: CaseState
): RedFlagGateResult["flagsFound"] {
  const found: RedFlagGateResult["flagsFound"] = [];

  for (const row of rows) {
    let triggered = false;

    if (row.triggerType === "answer" || row.triggerType === "") {
      const parts = row.triggerCondition.split(/\s+(AND|OR)\s+/i);
      const conditions = parts.filter(p => p !== "AND" && p !== "OR");
      const isOr = row.triggerCondition.toUpperCase().includes(" OR ");

      const results = conditions.map(cond => {
        const match = cond.trim().match(/^(\w+)\s*==\s*(.+)$/);
        if (match) {
          const val = state.answers[match[1]] ?? state.modifierAnswers[match[1]];
          return String(val).toLowerCase() === match[2].toLowerCase();
        }
        return false;
      });

      triggered = isOr ? results.some(Boolean) : results.every(Boolean);
    } else if (row.triggerType === "composite") {
      const orGroups = row.triggerCondition.split(/\s+OR\s+/i);
      triggered = orGroups.some(group => {
        const andParts = group.replace(/[()]/g, "").split(/\s+AND\s+/i);
        return andParts.every(part => {
          const match = part.trim().match(/^(\w+)\s*==\s*(.+)$/);
          if (match) {
            const val = state.answers[match[1]] ?? state.modifierAnswers[match[1]];
            return String(val).toLowerCase() === match[2].toLowerCase();
          }
          return false;
        });
      });
    } else if (row.triggerType === "state_field") {
      if (row.triggerCondition === "htn.endOrganSymptoms.critical") {
        const critical = ["neuro_deficit", "vision_loss", "pulmonary_edema", "aortic_dissection"];
        triggered = (state.htn?.endOrganSymptoms ?? []).some(s => critical.includes(s));
      } else if (row.triggerCondition === "dm.ketoneRisk AND Q_DM_FRUITY_BREATH==yes") {
        triggered = state.dm?.ketoneRisk === true && state.answers["Q_DM_FRUITY_BREATH"] === "yes";
      }
    }

    if (triggered) {
      found.push({
        flagId: row.flagId,
        label: row.label,
        severity: row.severity,
        action: row.action,
        reasons: row.reasons.length > 0 ? row.reasons : [`${row.label} triggered`],
        immediateActions: row.immediateActions,
        source: "RED_FLAGS_MASTER",
      });
    }
  }

  return found;
}

export async function evaluateRedFlagsMaster(state: CaseState): Promise<RedFlagGateResult> {
  let tableRows: RedFlagMasterRow[] = [];
  let source = "built_in";

  try {
    const sheetRows = await getTable("RED_FLAGS_MASTER");
    if (sheetRows.length > 0) {
      tableRows = sheetRows.map(parseRedFlagRow).filter((r): r is RedFlagMasterRow => r !== null);
      source = "RED_FLAGS_MASTER";
    }
  } catch {
  }

  if (tableRows.length === 0) {
    tableRows = DEFAULT_RED_FLAG_ROWS;
    source = "built_in_defaults";
  }

  const tableFlags = evaluateTableRedFlags(tableRows, state);

  const legacyFlags = detectRedFlags(state);
  for (const legacyId of legacyFlags) {
    if (tableFlags.some(f => f.flagId === legacyId)) continue;
    const entry = getRedFlagEntry(legacyId);
    tableFlags.push({
      flagId: legacyId,
      label: entry?.label ?? legacyId,
      severity: entry?.severity ?? "high",
      action: "er_send",
      reasons: [`Legacy red flag: ${entry?.label ?? legacyId}`],
      immediateActions: entry?.immediateActions ?? [],
      source: "legacy_detectRedFlags",
    });
  }

  for (const existingFlag of state.redFlags) {
    if (tableFlags.some(f => f.flagId === existingFlag)) continue;
    const entry = getRedFlagEntry(existingFlag);
    tableFlags.push({
      flagId: existingFlag,
      label: entry?.label ?? existingFlag,
      severity: entry?.severity ?? "high",
      action: "er_send",
      reasons: [`Pre-existing red flag: ${existingFlag}`],
      immediateActions: entry?.immediateActions ?? [],
      source: "state.redFlags",
    });
  }

  let gateResult: RedFlagGateResult["gateResult"] = "PASS";
  if (tableFlags.some(f => f.action === "er_send" || f.severity === "critical")) {
    gateResult = "ER_SEND";
  } else if (tableFlags.length > 0) {
    gateResult = "ESCALATE";
  }

  return {
    evaluated: true,
    flagsFound: tableFlags,
    gateResult,
  };
}

export function formatRedFlagOutput(
  result: RedFlagGateResult,
  channel: "web" | "whatsapp" | "telegram" | "ecw"
): Record<string, any> {
  if (result.flagsFound.length === 0) return { channel, sections: [] };

  if (channel === "web") {
    return {
      channel,
      sections: result.flagsFound.map(f => ({
        type: "red_flag",
        title: f.label,
        severity: f.severity,
        flagId: f.flagId,
        action: f.action,
        reasons: f.reasons,
        immediateActions: f.immediateActions,
      })),
    };
  }

  if (channel === "whatsapp" || channel === "telegram") {
    const lines: string[] = ["!! RED FLAGS DETECTED !!"];
    for (const f of result.flagsFound) {
      lines.push(`\n[${f.label.toUpperCase()}]`);
      lines.push(`Severity: ${f.severity}`);
      for (let i = 0; i < Math.min(f.immediateActions.length, 3); i++) {
        lines.push(`${i + 1}. ${f.immediateActions[i]}`);
      }
    }
    return { channel, text: lines.join("\n") };
  }

  if (channel === "ecw") {
    const lines: string[] = [
      "[Assessment/Plan — Red Flags]",
      "--- RED FLAGS (AI-Assisted Triage) ---",
      `>> ${result.gateResult === "ER_SEND" ? "IMMEDIATE ER EVALUATION RECOMMENDED" : "CLINICAL ESCALATION REQUIRED"} <<`,
    ];
    for (const f of result.flagsFound) {
      lines.push(`\n[${f.flagId}] ${f.label} (${f.severity})`);
      for (const action of f.immediateActions) {
        lines.push(`  - ${action}`);
      }
    }
    lines.push("\n[Suggested Orders]");
    lines.push("--- Suggested Orders ---");
    lines.push("CRITICAL:");
    lines.push("  [ ] ER referral/transfer");
    return { channel, text: lines.join("\n") };
  }

  return { channel, sections: [] };
}
