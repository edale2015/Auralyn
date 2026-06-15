import fs from "node:fs";
import path from "node:path";

type RegistryRow = {
  CC_ID: string;
  LABEL: string;
  ALIASES: string;
  ENABLED: string;
};

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') {
      cur += '"';
      i++;
      continue;
    }
    if (ch === '"') {
      inQ = !inQ;
      continue;
    }
    if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

let CACHE: RegistryRow[] | null = null;

function loadRegistry(): RegistryRow[] {
  if (CACHE) return CACHE;
  const p = path.resolve("server/data/csv/COMPLAINT_REGISTRY.csv");
  const text = fs.readFileSync(p, "utf8").trim();
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const header = splitCsvLine(lines[0]);
  const idx = (k: string) => header.indexOf(k);

  CACHE = lines
    .slice(1)
    .map((line) => {
      const c = splitCsvLine(line);
      return {
        CC_ID: c[idx("CC_ID")] ?? "",
        LABEL: c[idx("LABEL")] ?? "",
        ALIASES: c[idx("ALIASES")] ?? "",
        ENABLED: c[idx("ENABLED")] ?? "TRUE",
      };
    })
    .filter((r) => r.CC_ID && r.ENABLED.toUpperCase() === "TRUE");

  return CACHE;
}

// Continuation markers: a message updating an ALREADY-discussed symptom
// ("my head still hurts", "it aches again") is a follow-up, not a fresh chief
// complaint. The old unanchored substring match re-fired on these and reset the
// interview mid-conversation. Emergency phrasing is handled upstream
// (matchesEmergencyBypass / hasInstantEscalationInText in kbIntake), so a more
// conservative matcher here only falls back to the complaint menu — it never
// bypasses red-flag/escalation handling.
const CONTINUATION_MARKERS = /\b(still|again)\b/;

// Does `alias` appear in `t` as a NEW-complaint mention, not an embedded
// fragment or an anaphoric reference?
//   - Left word boundary: rejects mid-word hits (e.g. alias "ache" in "headache").
//     A trailing suffix is allowed so "headache" still matches "headaches".
//   - Not preceded by "the ": "the headache is on the left" refers back to a
//     headache already under discussion, so it is not a new chief complaint.
function aliasMatches(t: string, alias: string): boolean {
  let from = 0;
  for (;;) {
    const i = t.indexOf(alias, from);
    if (i < 0) return false;
    const prev = i > 0 ? t[i - 1] : "";
    const leftBoundary = !prev || !/[a-z0-9]/.test(prev);
    const anaphoric = i >= 4 && t.slice(i - 4, i) === "the ";
    if (leftBoundary && !anaphoric) return true;
    from = i + 1;
  }
}

export function matchComplaintFromText(
  text: string
): { slug: string; display: string } | null {
  const t = text.toLowerCase().trim();

  // A symptom echo / refinement is not a new chief complaint.
  if (CONTINUATION_MARKERS.test(t)) return null;

  const rows = loadRegistry();

  for (const r of rows) {
    const aliases = r.ALIASES.split(";")
      .map((s) => s.trim().toLowerCase().replaceAll("_", " "))
      .filter(Boolean);

    for (const a of aliases) {
      if (aliasMatches(t, a)) {
        return { slug: r.CC_ID, display: r.LABEL || r.CC_ID };
      }
    }
  }

  for (const r of rows) {
    const slug = r.CC_ID.replaceAll("_", " ");
    if (aliasMatches(t, slug)) {
      return { slug: r.CC_ID, display: r.LABEL || r.CC_ID };
    }
  }

  return null;
}

export function listEnabledComplaints(): RegistryRow[] {
  return loadRegistry();
}

export function resetComplaintMatchCache(): void {
  CACHE = null;
}

// Pre-warm: populate cache at module load so the first patient message
// never pays the synchronous file-read cost (~50ms → 0ms hot path).
loadRegistry();
