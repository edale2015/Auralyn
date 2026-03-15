/**
 * Clinical Reasoning Graph Builder
 * Exports CLINICAL_GRAPH_EDGES to a JSON file for inspection or downstream tooling.
 * Replace CSV_PATHS below with your real Google Sheet exports to extend the graph.
 */
import fs from 'fs';
import path from 'path';
import { CLINICAL_GRAPH_EDGES } from '../data/clinicalKnowledgeGraph';

const OUT = path.join(process.cwd(), 'clinical_reasoning_graph.json');
fs.writeFileSync(OUT, JSON.stringify({ edges: CLINICAL_GRAPH_EDGES, generated: new Date().toISOString() }, null, 2));
console.log(`Wrote ${CLINICAL_GRAPH_EDGES.length} edges to ${OUT}`);
