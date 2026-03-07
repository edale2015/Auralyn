import fs from "fs";
import path from "path";
import { Router } from "express";
import { requireRole } from "../middleware/requireRole";

export const chatCoercionAuditRouter = Router();

const AUDIT_PATH = path.join(
  process.cwd(),
  "data",
  "complaints",
  "runtime",
  "chat_answer_coercion_audit.csv"
);

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function readCsv(filePath: string) {
  if (!fs.existsSync(filePath))
    return { headers: [] as string[], rows: [] as Record<string, string>[] };

  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return { headers: [], rows: [] };

  const headers = splitCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) row[headers[j]] = cols[j] ?? "";
    rows.push(row);
  }

  return { headers, rows };
}

chatCoercionAuditRouter.get(
  "/",
  requireRole(["admin", "physician", "staff"]),
  async (req, res) => {
    try {
      const limit = Number(req.query.limit ?? 200);
      const confidence = String(req.query.confidence ?? "")
        .trim()
        .toLowerCase();

      const csv = readCsv(AUDIT_PATH);

      let rows = csv.rows;
      if (confidence) {
        rows = rows.filter(
          (r) => String(r.CONFIDENCE ?? "").toLowerCase() === confidence
        );
      }

      rows = rows
        .sort((a, b) =>
          String(b.TIMESTAMP ?? "").localeCompare(String(a.TIMESTAMP ?? ""))
        )
        .slice(0, limit);

      res.json({ count: rows.length, rows });
    } catch (err: any) {
      res.status(500).json({
        error: err?.message ?? "Failed to load coercion audit",
      });
    }
  }
);
