import fs from "fs";
import path from "path";

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function readCsv(filePath: string) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing: ${filePath}`);
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return { headers: [] as string[], rows: [] as Record<string, string>[] };
  const headers = splitCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.every((c) => c === "")) continue;
    const r: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) r[headers[j]] = cols[j] ?? "";
    rows.push(r);
  }
  return { headers, rows };
}

function csvSafe(v: string): string {
  if (v.includes(",") || v.includes('"') || v.includes("\n")) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function writeCsv(filePath: string, headers: string[], rows: Record<string, string>[]) {
  const lines: string[] = [headers.join(",")];
  for (const r of rows) {
    lines.push(headers.map((h) => csvSafe(r[h] ?? "")).join(","));
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf8");
}

function n(s: string): number {
  const x = Number((s ?? "").trim());
  return Number.isFinite(x) ? x : 0;
}

function main() {
  const root = process.cwd();
  const CSR_PATH = path.join(root, "server", "data", "csv", "CLUSTER_SCORING_RULES.csv");
  const DXP_PATH = path.join(root, "server", "data", "csv", "DX_PRIORITY.csv");
  const OUT_PATH = path.join(root, "server", "data", "csv", "DX_CANDIDATES.csv");

  const csr = readCsv(CSR_PATH);
  const dxp = readCsv(DXP_PATH);

  const neededCSR = ["CC_ID", "CLUSTER_ID", "POINTS", "WHEN_EXPR", "EVIDENCE_LABEL"];
  for (const h of neededCSR) {
    if (!csr.headers.includes(h)) throw new Error(`CLUSTER_SCORING_RULES missing column: ${h}`);
  }
  const neededDXP = ["CC_ID", "CLUSTER_ID", "PRIORITY"];
  for (const h of neededDXP) {
    if (!dxp.headers.includes(h)) throw new Error(`DX_PRIORITY missing column: ${h}`);
  }

  const prByCcCluster = new Map<string, number>();
  for (const r of dxp.rows) {
    const cc = (r.CC_ID ?? "").trim();
    const cl = (r.CLUSTER_ID ?? "").trim();
    if (!cc || !cl) continue;
    prByCcCluster.set(`${cc}||${cl}`, n(r.PRIORITY));
  }

  type DxEntry = {
    cc: string;
    dx: string;
    label: string;
    bestCluster: string;
    score: number;
    maxPoints: number;
    clusterPriority: number;
  };

  const agg = new Map<string, DxEntry>();

  for (const r of csr.rows) {
    const cc = (r.CC_ID ?? "").trim();
    const cl = (r.CLUSTER_ID ?? "").trim();
    const dx = (r.EVIDENCE_LABEL ?? "").trim();
    if (!cc || !cl || !dx) continue;

    const whenExpr = (r.WHEN_EXPR ?? "").trim().toLowerCase();
    if (whenExpr === "false") continue;

    const points = n(r.POINTS);
    if (points <= 0) continue;

    const clusterPriority = prByCcCluster.get(`${cc}||${cl}`) ?? 50;
    const score = points * (clusterPriority / 100);

    const key = `${cc}||${dx}`;
    const label = dx.replace(/_/g, " ");

    const cur = agg.get(key);
    if (!cur || score > cur.score) {
      agg.set(key, { cc, dx, label, bestCluster: cl, score, maxPoints: points, clusterPriority });
    }
  }

  const byCc = new Map<string, DxEntry[]>();
  for (const v of agg.values()) {
    if (!byCc.has(v.cc)) byCc.set(v.cc, []);
    byCc.get(v.cc)!.push(v);
  }

  const headersOut = ["CC_ID", "DX_ID", "DX_LABEL", "BEST_CLUSTER_ID", "BASE_POINTS", "CLUSTER_PRIORITY", "BASE_SCORE", "RANK"];
  const rowsOut: Record<string, string>[] = [];

  for (const cc of Array.from(byCc.keys()).sort()) {
    const arr = byCc.get(cc)!;
    arr.sort((a, b) => b.score - a.score);
    const top = arr.slice(0, 15);
    for (let i = 0; i < top.length; i++) {
      const v = top[i];
      rowsOut.push({
        CC_ID: cc,
        DX_ID: v.dx,
        DX_LABEL: v.label,
        BEST_CLUSTER_ID: v.bestCluster,
        BASE_POINTS: String(v.maxPoints),
        CLUSTER_PRIORITY: String(v.clusterPriority),
        BASE_SCORE: v.score.toFixed(2),
        RANK: String(i + 1),
      });
    }
  }

  writeCsv(OUT_PATH, headersOut, rowsOut);
  console.log(`Wrote DX candidates: ${OUT_PATH} (${rowsOut.length} rows across ${byCc.size} complaints)`);
}

main();
