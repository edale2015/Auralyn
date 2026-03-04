import fs from "node:fs";

export type CrossBoostRule = {
  Rule_ID: string;
  Applies_To_Complaint: string;
  When_AnyAnswers_Logic: string;
  Target_Dx_ID: string;
  Points: number;
  Max_Applications: number;
  Severity: "LOW" | "MODERATE" | "HIGH";
  Message: string;
};

export type CrossAdjustment = {
  ruleId: string;
  targetDxId: string;
  points: number;
  severity: "LOW" | "MODERATE" | "HIGH";
  message: string;
};

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; continue; }
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === "," && !inQ) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim().replace(/^"|"$/g, ""));
}

let _cachedRules: CrossBoostRule[] | null = null;

export function loadCrossComplaintBoosts(csvPath: string): CrossBoostRule[] {
  if (_cachedRules) return _cachedRules;
  if (!fs.existsSync(csvPath)) { _cachedRules = []; return []; }
  const text = fs.readFileSync(csvPath, "utf8").trim();
  if (!text) { _cachedRules = []; return []; }
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const header = splitCsvLine(lines[0]);
  const idx = (k: string) => header.indexOf(k);

  _cachedRules = lines.slice(1).map(line => {
    const c = splitCsvLine(line);
    return {
      Rule_ID: c[idx("Rule_ID")] ?? "",
      Applies_To_Complaint: c[idx("Applies_To_Complaint")] ?? "",
      When_AnyAnswers_Logic: c[idx("When_AnyAnswers_Logic")] ?? "",
      Target_Dx_ID: c[idx("Target_Dx_ID")] ?? "",
      Points: Number(c[idx("Points")] ?? "0"),
      Max_Applications: Number(c[idx("Max_Applications")] ?? "1"),
      Severity: (c[idx("Severity")] ?? "LOW") as "LOW" | "MODERATE" | "HIGH",
      Message: c[idx("Message")] ?? "",
    };
  }).filter(r => r.Rule_ID && r.Applies_To_Complaint && r.When_AnyAnswers_Logic && r.Target_Dx_ID);

  return _cachedRules;
}

export function resetCrossBoostCache(): void {
  _cachedRules = null;
}

export function evalAnyLogic(expr: string, anyAnswers: Record<string, unknown>): boolean {
  const norm = expr.replace(/\s+/g, " ").trim();
  const groups = splitTopLevel(norm, " OR ");
  for (const orPart of groups) {
    const andParts = splitTopLevel(orPart.trim(), " AND ");
    let ok = true;
    for (const p of andParts) {
      const trimmed = p.trim().replace(/^\(|\)$/g, "").trim();
      if (trimmed.includes(" OR ") || trimmed.includes(" AND ")) {
        ok = ok && evalAnyLogic(trimmed, anyAnswers);
      } else {
        if (!trimmed.startsWith("any.")) { ok = false; break; }
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx < 0) { ok = false; break; }
        const key = trimmed.substring(4, eqIdx).trim();
        const want = trimmed.substring(eqIdx + 1).trim();
        const val = anyAnswers[key];
        const isTrue = (v: unknown) => v === true || v === "yes" || v === "true";
        if (want === "true") ok = ok && isTrue(val);
        else if (want === "false") ok = ok && !isTrue(val);
        else { ok = false; break; }
      }
      if (!ok) break;
    }
    if (ok) return true;
  }
  return false;
}

function splitTopLevel(expr: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  let i = 0;
  while (i < expr.length) {
    if (expr[i] === "(") depth++;
    if (expr[i] === ")") depth--;
    if (depth === 0 && expr.substring(i, i + sep.length) === sep) {
      parts.push(cur);
      cur = "";
      i += sep.length;
      continue;
    }
    cur += expr[i];
    i++;
  }
  parts.push(cur);
  return parts;
}

export function applyCrossComplaintBoosts(params: {
  complaintSlug: string;
  anyAnswers: Record<string, unknown>;
  rules: CrossBoostRule[];
  scores: Record<string, number>;
}): { scores: Record<string, number>; adjustments: CrossAdjustment[] } {
  const outScores = { ...params.scores };
  const adjustments: CrossAdjustment[] = [];

  for (const r of params.rules) {
    if (r.Applies_To_Complaint !== params.complaintSlug) continue;
    if (!evalAnyLogic(r.When_AnyAnswers_Logic, params.anyAnswers)) continue;

    const current = outScores[r.Target_Dx_ID] ?? 0;
    outScores[r.Target_Dx_ID] = current + r.Points;

    adjustments.push({
      ruleId: r.Rule_ID,
      targetDxId: r.Target_Dx_ID,
      points: r.Points,
      severity: r.Severity,
      message: r.Message,
    });
  }

  return { scores: outScores, adjustments };
}
