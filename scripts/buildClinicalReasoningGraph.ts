/**
 * buildClinicalReasoningGraph.ts
 *
 * Reads all clinical knowledge CSVs and produces a single
 * `server/data/clinical_reasoning_graph.json` file consumed by the brain engine.
 *
 * Run with:   npx tsx scripts/buildClinicalReasoningGraph.ts
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ClinicalGraph } from "../server/core/clinicalGraphEngine";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, "../server/data/csv");
const OUT_FILE = path.resolve(__dirname, "../server/data/clinical_reasoning_graph.json");

const graph = new ClinicalGraph();

// ─── CSV helper ────────────────────────────────────────────────────────────────
async function readCSV(file: string): Promise<Record<string, string>[]> {
  const fullPath = path.join(DATA_DIR, file);
  if (!fs.existsSync(fullPath)) {
    console.warn(`[GraphBuilder] Skipping missing file: ${file}`);
    return [];
  }

  const rows: Record<string, string>[] = [];
  const text = fs.readFileSync(fullPath, "utf8");
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));

  for (let i = 1; i < lines.length; i++) {
    const values = splitCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] ?? "").trim().replace(/^"|"$/g, "");
    });
    rows.push(row);
  }
  return rows;
}

function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === "," && !inQuotes) { result.push(current); current = ""; continue; }
    current += ch;
  }
  result.push(current);
  return result;
}

// ─── Loaders ────────────────────────────────────────────────────────────────────

async function loadComplaintRegistry() {
  const rows = await readCSV("COMPLAINT_REGISTRY.csv");
  let count = 0;
  for (const row of rows) {
    const complaint = row["CC_ID"];
    const system    = row["SYSTEM"];
    const label     = row["LABEL"];
    if (!complaint) continue;

    graph.addNode(complaint, "complaint", label);

    // Aliases → complaint
    if (row["ALIASES"]) {
      for (const alias of row["ALIASES"].split(";")) {
        const a = alias.trim();
        if (a) {
          graph.addNode(a, "symptom");
          graph.addEdge(a, complaint, "alias", 1);
        }
      }
    }
    count++;
  }
  console.log(`[GraphBuilder] COMPLAINT_REGISTRY: ${count} complaints loaded`);
}

async function loadClusterScoringRules() {
  const rows = await readCSV("CLUSTER_SCORING_RULES.csv");
  let count = 0;
  for (const row of rows) {
    const complaint  = row["CC_ID"];
    const cluster    = row["CLUSTER_ID"];
    const points     = Number(row["POINTS"] || 1);
    const whenExpr   = row["WHEN_EXPR"] || "";
    const label      = row["EVIDENCE_LABEL"] || "";

    if (!complaint || !cluster) continue;

    // Extract symptom signal from WHEN_EXPR (answers.Q_XXX == 'yes')
    const match = whenExpr.match(/answers\.(\w+)\s*==\s*'yes'/);
    if (match) {
      const questionId = match[1].toLowerCase();
      graph.addNode(questionId, "question", label);
      graph.addNode(cluster, "diagnosis", cluster);
      graph.addEdge(questionId, cluster, "supports", points);
    }

    // complaint → cluster (typical member)
    graph.addNode(complaint, "complaint");
    graph.addNode(cluster, "diagnosis");
    graph.addEdge(complaint, cluster, "typical", 1);
    count++;
  }
  console.log(`[GraphBuilder] CLUSTER_SCORING_RULES: ${count} rules loaded`);
}

async function loadRedFlagRules() {
  const rows = await readCSV("RED_FLAG_RULES.csv");
  let count = 0;
  for (const row of rows) {
    const complaint = row["CC_ID"];
    const flagId    = row["RF_ID"];
    const label     = row["LABEL"] || flagId;
    const action    = row["ACTION"] || "ER_SEND";
    const severity  = row["SEVERITY"] || "HARD";

    if (!complaint || !flagId) continue;

    graph.addNode(complaint, "complaint");
    graph.addNode(flagId, "red_flag", label);
    graph.addEdge(complaint, flagId, "danger", severity === "HARD" ? 2 : 1);

    // Also extract trigger questions from WHEN_EXPR
    const whenExpr = row["TRIGGER_EXPR"] || "";
    const matches = whenExpr.match(/answers\.(\w+)/g) || [];
    for (const m of matches) {
      const qid = m.replace("answers.", "").toLowerCase();
      graph.addNode(qid, "question");
      graph.addEdge(qid, flagId, "triggers", 1);
    }
    count++;
  }
  console.log(`[GraphBuilder] RED_FLAG_RULES: ${count} flags loaded`);
}

async function loadDispositionRules() {
  const rows = await readCSV("DISPOSITION_RULES.csv");
  let count = 0;
  for (const row of rows) {
    const complaint    = row["CC_ID"];
    const disposition  = row["DISPOSITION_LEVEL"];
    const ruleId       = row["DISP_RULE_ID"];

    if (!complaint || !disposition) continue;

    graph.addNode(complaint, "complaint");
    graph.addNode(disposition, "disposition", disposition);
    graph.addEdge(complaint, disposition, "may_result_in", 1);
    count++;
  }
  console.log(`[GraphBuilder] DISPOSITION_RULES: ${count} rules loaded`);
}

async function loadDxCandidates() {
  const rows = await readCSV("DX_CANDIDATES.csv");
  let count = 0;
  for (const row of rows) {
    const complaint = row["CC_ID"];
    const dxId      = row["DX_ID"];
    const dxLabel   = row["DX_LABEL"];
    const cluster   = row["BEST_CLUSTER_ID"];
    const baseScore = Number(row["BASE_SCORE"] || 0.5);

    if (!complaint || !dxId) continue;

    graph.addNode(complaint, "complaint");
    graph.addNode(dxId, "diagnosis", dxLabel);

    graph.addEdge(complaint, dxId, "candidate", baseScore);

    if (cluster) {
      graph.addNode(cluster, "diagnosis");
      graph.addEdge(cluster, dxId, "maps_to", baseScore);
    }
    count++;
  }
  console.log(`[GraphBuilder] DX_CANDIDATES: ${count} diagnoses loaded`);
}

// ─── Main ────────────────────────────────────────────────────────────────────────

async function buildGraph() {
  console.log("[GraphBuilder] Starting clinical reasoning graph build...");

  await loadComplaintRegistry();
  await loadClusterScoringRules();
  await loadRedFlagRules();
  await loadDispositionRules();
  await loadDxCandidates();

  const json = JSON.stringify(graph.toJSON(), null, 2);
  fs.writeFileSync(OUT_FILE, json, "utf8");

  console.log(`\n[GraphBuilder] ✅ Done`);
  console.log(`[GraphBuilder] Nodes: ${graph.nodeCount}`);
  console.log(`[GraphBuilder] Edges: ${graph.edgeCount}`);
  console.log(`[GraphBuilder] Output: ${OUT_FILE}`);
}

buildGraph().catch((err) => {
  console.error("[GraphBuilder] Fatal error:", err);
  process.exit(1);
});
