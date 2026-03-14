import fs from "fs";
import path from "path";

const LOG_PATH = path.resolve("brain_decisions.ndjson");

export function logBrainDecision(data: Record<string, any>): void {
  try {
    const line = JSON.stringify({ timestamp: new Date().toISOString(), ...data });
    fs.appendFileSync(LOG_PATH, line + "\n", "utf8");
  } catch (err) {
    console.warn("[BrainAuditLog] Failed to write decision log:", (err as Error).message);
  }
}
