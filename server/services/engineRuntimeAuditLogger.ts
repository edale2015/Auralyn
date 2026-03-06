/**
 * server/services/engineRuntimeAuditLogger.ts
 *
 * Runtime audit logger for production engine executions.
 *
 * Appends CSV rows to:
 *   data/complaints/runtime/engine_runtime_audit.csv
 */

import fs from "fs";
import path from "path";

export type EngineRuntimeAuditEvent = {
  timestamp: string;
  case_id: string;
  complaint_id: string;
  winning_cluster_id?: string;
  triggered_red_flags?: string[];
  disposition?: string;
  fired_cluster_ids?: string[];
  engine_version?: string;
};

const AUDIT_PATH = path.join(process.cwd(), "data", "complaints", "runtime", "engine_runtime_audit.csv");
const HEADERS = [
  "TIMESTAMP",
  "CASE_ID",
  "CC_ID",
  "WINNING_CLUSTER_ID",
  "TRIGGERED_RED_FLAGS",
  "DISPOSITION",
  "FIRED_CLUSTER_IDS",
  "ENGINE_VERSION"
];

function csvEscape(v: string): string {
  if (v.includes(",") || v.includes('"') || v.includes("\n")) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function ensureFile() {
  if (fs.existsSync(AUDIT_PATH)) return;
  fs.mkdirSync(path.dirname(AUDIT_PATH), { recursive: true });
  fs.writeFileSync(AUDIT_PATH, HEADERS.join(",") + "\n", "utf8");
}

export function logEngineRuntimeAudit(ev: EngineRuntimeAuditEvent) {
  try {
    ensureFile();

    const row = [
      ev.timestamp,
      ev.case_id,
      ev.complaint_id,
      ev.winning_cluster_id ?? "",
      (ev.triggered_red_flags ?? []).join("|"),
      ev.disposition ?? "",
      (ev.fired_cluster_ids ?? []).join("|"),
      ev.engine_version ?? "GENERIC_V1"
    ];

    fs.appendFileSync(AUDIT_PATH, row.map((x) => csvEscape(String(x))).join(",") + "\n", "utf8");
  } catch (err) {
    console.error("[engineRuntimeAuditLogger] failed:", err);
  }
}
