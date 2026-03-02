import fs from "node:fs";
import path from "node:path";

const PAIRS_FILE = path.resolve("phase2a_pairs_20.txt");
const MICRO_DIR = path.resolve("micro_packs");
const OUT_FILE = path.resolve("data/micro_packs.csv");

const HEADER = "Complaint_Slug,Dx_ID,Rule_ID,Logic,Points,Pack_Version,Notes";

function parsePairs(text: string): string[] {
  const slugs = new Set<string>();
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split("|");
    if (parts.length < 2) continue;
    const right = parts[1].trim();
    const [a, b] = right.split(",").map((s) => s.trim());
    if (a) slugs.add(a);
    if (b) slugs.add(b);
  }
  return Array.from(slugs).sort();
}

function main() {
  const outDir = path.dirname(OUT_FILE);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const pairText = fs.readFileSync(PAIRS_FILE, "utf8");
  const needed = parsePairs(pairText);

  const rows: string[] = [HEADER];
  const missing: string[] = [];
  const badHeader: string[] = [];

  for (const slug of needed) {
    const fp = path.join(MICRO_DIR, `${slug}.csv`);
    if (!fs.existsSync(fp)) {
      missing.push(slug);
      continue;
    }
    const content = fs.readFileSync(fp, "utf8").trim();
    if (!content) continue;

    const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    const hdr = lines[0].replace(/\s+/g, "");
    const expected = HEADER.replace(/\s+/g, "");
    if (hdr !== expected) {
      badHeader.push(slug);
      continue;
    }

    for (const line of lines.slice(1)) {
      if (!line) continue;
      rows.push(line);
    }
  }

  fs.writeFileSync(OUT_FILE, rows.join("\n") + "\n", "utf8");

  console.log(`Wrote ${OUT_FILE}`);
  console.log(`Complaints referenced in pairs: ${needed.length}`);
  console.log(`Rows written (excl header): ${rows.length - 1}`);

  if (missing.length) {
    console.log(`\nMissing micro pack files (${missing.length}): ${missing.join(", ")}`);
    process.exitCode = 2;
  }
  if (badHeader.length) {
    console.log(`\nBad header in micro pack files (${badHeader.length}): ${badHeader.join(", ")}`);
    process.exitCode = 3;
  }
}

main();
