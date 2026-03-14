/**
 * clinicalGraph.ts
 *
 * Loads the pre-built clinical reasoning graph JSON into a ClinicalGraph instance.
 * The JSON is produced by:  npx tsx scripts/buildClinicalReasoningGraph.ts
 *
 * Falls back gracefully if the file doesn't exist yet (returns an empty graph).
 */

import fs from "fs";
import path from "path";
import { ClinicalGraph } from "../core/clinicalGraphEngine";

const GRAPH_FILE = path.resolve(__dirname, "clinical_reasoning_graph.json");

function loadGraph(): ClinicalGraph {
  if (!fs.existsSync(GRAPH_FILE)) {
    console.warn("[ClinicalGraph] clinical_reasoning_graph.json not found — using empty graph. Run: npx tsx scripts/buildClinicalReasoningGraph.ts");
    return new ClinicalGraph();
  }
  try {
    const raw = fs.readFileSync(GRAPH_FILE, "utf8");
    const data = JSON.parse(raw);
    const g = ClinicalGraph.fromJSON(data);
    console.log(`[ClinicalGraph] Loaded graph: ${g.nodeCount} nodes, ${g.edgeCount} edges`);
    return g;
  } catch (err) {
    console.error("[ClinicalGraph] Failed to parse graph file:", (err as Error).message);
    return new ClinicalGraph();
  }
}

export const clinicalGraph = loadGraph();
