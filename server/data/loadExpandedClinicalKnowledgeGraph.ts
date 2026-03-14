import fs from "fs";
import path from "path";
import type { ClinicalKnowledgeGraph } from "../core/knowledgeGraphExpansionEngine";

const GRAPH_FILE = path.resolve(__dirname, "expandedClinicalKnowledgeGraph.json");

export function loadExpandedClinicalKnowledgeGraph(): ClinicalKnowledgeGraph {
  if (!fs.existsSync(GRAPH_FILE)) {
    console.warn("[ExpandedGraph] expandedClinicalKnowledgeGraph.json not found. Run: npx tsx scripts/buildExpandedClinicalKnowledgeGraph.ts");
    return { nodes: [], edges: [] };
  }
  try {
    const raw = fs.readFileSync(GRAPH_FILE, "utf8");
    const data: ClinicalKnowledgeGraph = JSON.parse(raw);
    console.log(`[ExpandedGraph] Loaded: ${data.nodes.length} nodes, ${data.edges.length} edges`);
    return data;
  } catch (err) {
    console.error("[ExpandedGraph] Failed to parse graph:", (err as Error).message);
    return { nodes: [], edges: [] };
  }
}

let _cache: ClinicalKnowledgeGraph | null = null;

/** Singleton — loads once and caches in memory for the process lifetime. */
export function getExpandedGraph(): ClinicalKnowledgeGraph {
  if (!_cache) _cache = loadExpandedClinicalKnowledgeGraph();
  return _cache;
}
