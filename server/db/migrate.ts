import fs from "fs";
import path from "path";
import { query } from "./dbRouter";


export async function runMigrations() {
  const schemaPath = path.join(import.meta.dirname, "schema.sql");

  if (!fs.existsSync(schemaPath)) {
    console.warn("[migrate] schema.sql not found, skipping migration");
    return;
  }

  const sql = fs.readFileSync(schemaPath, "utf8");

  try {
    await query(sql, []);
    console.log("[migrate] schema.sql applied successfully");
  } catch (err: any) {
    console.error("[migrate] Failed to apply schema.sql:", err?.message);
    throw err;
  }
}
