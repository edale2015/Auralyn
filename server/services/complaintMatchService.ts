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

export function matchComplaintFromText(
  text: string
): { slug: string; display: string } | null {
  const t = text.toLowerCase().trim();
  const rows = loadRegistry();

  for (const r of rows) {
    const aliases = r.ALIASES.split(";")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    for (const a of aliases) {
      if (t.includes(a)) {
        return { slug: r.CC_ID, display: r.LABEL || r.CC_ID };
      }
    }
  }

  for (const r of rows) {
    const slug = r.CC_ID.replaceAll("_", " ");
    if (t.includes(slug)) {
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
