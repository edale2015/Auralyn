import fs from "fs";
import path from "path";

export type ShadowModeEventType =
  | "CASE_ENTERED_SHADOW_MODE"
  | "ENGINE_RECOMMENDATION_CAPTURED"
  | "PHYSICIAN_REVIEW_STARTED"
  | "PHYSICIAN_SIGNOFF_COMPLETED"
  | "DISCREPANCY_RECORDED"
  | "EXPORT_CREATED"
  | "CASE_CLOSED"
  | "CUSTOM";

export interface ShadowModeEvent {
  timestamp: string;
  caseId: string;
  complaintId?: string;
  eventType: ShadowModeEventType;
  actorId?: string;
  disposition?: string;
  notes?: string;
}

const OUT_PATH = path.join(process.cwd(), "data", "complaints", "runtime", "shadow_mode_ops.csv");
const HEADERS = ["TIMESTAMP", "CASE_ID", "CC_ID", "EVENT_TYPE", "ACTOR_ID", "DISPOSITION", "NOTES"];

function csvEscape(v: string): string {
  if (v.includes(",") || v.includes('"') || v.includes("\n")) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function ensureFile() {
  if (fs.existsSync(OUT_PATH)) return;
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, HEADERS.join(",") + "\n", "utf8");
}

export function logShadowModeEvent(ev: ShadowModeEvent) {
  try {
    ensureFile();

    const row = [
      ev.timestamp,
      ev.caseId,
      ev.complaintId ?? "",
      ev.eventType,
      ev.actorId ?? "",
      ev.disposition ?? "",
      ev.notes ?? ""
    ];

    fs.appendFileSync(OUT_PATH, row.map((x) => csvEscape(String(x))).join(",") + "\n", "utf8");
  } catch (err) {
    console.error("[shadowModeLogger] failed:", err);
  }
}
