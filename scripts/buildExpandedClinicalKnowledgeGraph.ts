/**
 * buildExpandedClinicalKnowledgeGraph.ts
 *
 * Reads all available clinical CSVs and writes one unified knowledge graph.
 * Uses the actual column names present in this codebase's CSV exports.
 *
 * Run with:  npx tsx scripts/buildExpandedClinicalKnowledgeGraph.ts
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { knowledgeGraphExpansionEngine } from "../server/core/knowledgeGraphExpansionEngine";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const CSV_DIR  = path.resolve(__dirname, "../server/data/csv");
const OUT_FILE = path.resolve(__dirname, "../server/data/expandedClinicalKnowledgeGraph.json");

// ─── Minimal CSV parser (no external dependency) ────────────────────────────────
function splitLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === "," && !inQ) { result.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  result.push(cur.trim());
  return result;
}

function readCSV(filename: string): Record<string, string>[] {
  const fp = path.join(CSV_DIR, filename);
  if (!fs.existsSync(fp)) return [];
  const lines = fs.readFileSync(fp, "utf8").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = splitLine(lines[0]);
  return lines.slice(1).map((line) => {
    const vals = splitLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ""; });
    return row;
  });
}

async function main() {
  console.log("[ExpandedGraphBuilder] Starting...");

  const datasets = {
    complaintRegistry:    readCSV("COMPLAINT_REGISTRY.csv"),
    clusterScoringRules:  readCSV("CLUSTER_SCORING_RULES.csv"),
    redFlagRules:         readCSV("RED_FLAG_RULES.csv"),
    outputTemplates:      readCSV("OUTPUT_TEMPLATES.csv"),
    dxCandidates:         readCSV("DX_CANDIDATES.csv"),
    dispositionRules:     readCSV("DISPOSITION_RULES.csv"),
    crossComplaintBoosts: readCSV("CROSS_COMPLAINT_BOOSTS.csv"),
    // Optional sheets (gracefully skipped if absent):
    diagnosisClusters:    readCSV("DIAGNOSIS_CLUSTERS.csv"),
    medicationRules:      readCSV("MEDICATION_RULES.csv"),
    testRules:            readCSV("TEST_RECOMMENDATIONS.csv"),
    symptomSynonyms:      readCSV("SYMPTOM_SYNONYMS.csv"),
  };

  for (const [name, rows] of Object.entries(datasets)) {
    console.log(`  [${name}] ${rows.length} rows`);
  }

  const graph = knowledgeGraphExpansionEngine(datasets);

  fs.writeFileSync(OUT_FILE, JSON.stringify(graph, null, 2), "utf8");

  console.log(`\n[ExpandedGraphBuilder] ✅ Done`);
  console.log(`  Nodes: ${graph.nodes.length}`);
  console.log(`  Edges: ${graph.edges.length}`);
  console.log(`  Output: ${OUT_FILE}`);
}

main().catch((err) => {
  console.error("[ExpandedGraphBuilder] Fatal:", err);
  process.exit(1);
});
