import { pool } from "../db/pool";
import { appendAuditEvent } from "../governance/audit";

export interface ParsedScoringSystem {
  key: string;
  displayName: string;
  interpretation: Array<{ scoreRange: [number, number]; label: string; disposition: string }>;
  source: string;
}

/**
 * CRITICAL: SCORING_SYSTEMS parse failures are BLOCKING.
 * 
 * Per Claude Q6 evaluation: a missing/unreadable SCORING_SYSTEMS sheet
 * must halt the KB load cycle entirely, not fall back to cached or empty data.
 * Clinical scoring systems (HEART, CURB-65, Ottawa, Wells) are patient-safety critical.
 * Loading with empty scoring systems silently degrades triage accuracy.
 */
export async function loadScoringSystemsOrFail(
  rawRows: Array<Record<string, string>>,
  sheetName = "SCORING_SYSTEMS"
): Promise<ParsedScoringSystem[]> {
  if (!rawRows || rawRows.length === 0) {
    const err = new Error(
      `SCORING_SYSTEMS_PARSE_FAILURE: Sheet "${sheetName}" returned 0 rows. ` +
      `Verify the sheet exists, the range A1:Z2000 is correct, and the service account has read access. ` +
      `KB load cycle HALTED — clinical scoring accuracy cannot be guaranteed without scoring system definitions.`
    );
    (err as any).code = "SCORING_SYSTEMS_PARSE_FAILURE";
    (err as any).blocking = true;
    (err as any).sheetName = sheetName;
    console.error(`[ScoringSystemsLoader] BLOCKING FAILURE: ${err.message}`);
    throw err;
  }

  const required = ["key", "display_name", "score_min", "score_max", "label", "disposition"];
  const headers = Object.keys(rawRows[0]);
  const missing = required.filter(f => !headers.includes(f));
  if (missing.length > 0) {
    const err = new Error(
      `SCORING_SYSTEMS_SCHEMA_FAILURE: Sheet "${sheetName}" is missing required columns: ` +
      `[${missing.join(", ")}]. ` +
      `Found columns: [${headers.join(", ")}]. ` +
      `KB load cycle HALTED.`
    );
    (err as any).code = "SCORING_SYSTEMS_PARSE_FAILURE";
    (err as any).blocking = true;
    (err as any).missingColumns = missing;
    console.error(`[ScoringSystemsLoader] BLOCKING FAILURE: ${err.message}`);
    throw err;
  }

  const systems = new Map<string, ParsedScoringSystem>();

  for (const row of rawRows) {
    const key = row.key?.trim();
    const displayName = row.display_name?.trim();
    const source = row.source?.trim() ?? sheetName;

    if (!key || !displayName) continue;

    const scoreMin = Number(row.score_min);
    const scoreMax = Number(row.score_max);
    const label = row.label?.trim();
    const disposition = row.disposition?.trim();

    if (isNaN(scoreMin) || isNaN(scoreMax) || !label || !disposition) {
      console.warn(`[ScoringSystemsLoader] Skipping malformed row for key="${key}": score_min=${row.score_min}, score_max=${row.score_max}, label=${label}, disposition=${disposition}`);
      continue;
    }

    if (!systems.has(key)) {
      systems.set(key, { key, displayName, interpretation: [], source });
    }
    systems.get(key)!.interpretation.push({
      scoreRange: [scoreMin, scoreMax],
      label,
      disposition,
    });
  }

  const parsed = Array.from(systems.values());

  if (parsed.length === 0) {
    const err = new Error(
      `SCORING_SYSTEMS_EMPTY: Sheet "${sheetName}" produced 0 valid scoring systems after parsing. ` +
      `All rows may have been skipped due to malformed data. KB load cycle HALTED.`
    );
    (err as any).code = "SCORING_SYSTEMS_PARSE_FAILURE";
    (err as any).blocking = true;
    throw err;
  }

  await persistScoringSystemVersion(parsed, sheetName);

  console.log(`[ScoringSystemsLoader] Loaded ${parsed.length} scoring systems from "${sheetName}": ${parsed.map(s => s.key).join(", ")}`);
  return parsed;
}

async function persistScoringSystemVersion(
  systems: ParsedScoringSystem[],
  sheetName: string
): Promise<void> {
  const contentHash = require("crypto")
    .createHash("sha256")
    .update(JSON.stringify(systems))
    .digest("hex");

  try {
    await pool.query(
      `INSERT INTO scoring_system_versions (sheet_name, system_count, content_hash, systems_json)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (content_hash) DO NOTHING`,
      [sheetName, systems.length, contentHash, JSON.stringify(systems)]
    );

    await appendAuditEvent({
      tenantId: null,
      actorId: "system",
      action: "SCORING_SYSTEMS_LOADED",
      entityType: "scoring_system_version",
      payload: {
        sheetName,
        systemCount: systems.length,
        contentHash,
        keys: systems.map(s => s.key),
      },
    });
  } catch (err: any) {
    console.warn("[ScoringSystemsLoader] Could not persist version record:", err?.message);
  }
}

export function lookupScoringInterpretation(
  systems: ParsedScoringSystem[],
  key: string,
  score: number
): { label: string; disposition: string } | null {
  const system = systems.find(s => s.key === key);
  if (!system) return null;
  const band = system.interpretation.find(
    b => score >= b.scoreRange[0] && score <= b.scoreRange[1]
  );
  return band ? { label: band.label, disposition: band.disposition } : null;
}
