import * as fs from "fs/promises";
import * as path from "path";

export interface GraphEdge {
  symptom: string;
  diagnosis: string;
  weight: number;
  complaint?: string;
  confirmedCount: number;
  refutedCount: number;
  lastUpdated: string;
}

export interface GraphStats {
  totalNodes: number;
  totalEdges: number;
  topSymptomDiagnosisPairs: Array<{ symptom: string; diagnosis: string; strength: number }>;
  diagnosisByComplaint: Record<string, string[]>;
}

const GRAPH_PATH = path.join(process.cwd(), "data", "reasoning_graph.json");

interface GraphData {
  edges: Record<string, Record<string, { weight: number; confirmed: number; refuted: number; complaint?: string; lastUpdated: string }>>;
}

let graphData: GraphData = { edges: {} };
let loaded = false;

const SEED_GRAPH: Array<{ symptom: string; diagnosis: string; weight: number; complaint: string }> = [
  { symptom: "fever", diagnosis: "Group A Streptococcus (Strep)", weight: 3, complaint: "sore_throat" },
  { symptom: "exudate", diagnosis: "Group A Streptococcus (Strep)", weight: 5, complaint: "sore_throat" },
  { symptom: "no cough", diagnosis: "Group A Streptococcus (Strep)", weight: 4, complaint: "sore_throat" },
  { symptom: "drooling", diagnosis: "Peritonsillar Abscess", weight: 8, complaint: "sore_throat" },
  { symptom: "muffled voice", diagnosis: "Peritonsillar Abscess", weight: 8, complaint: "sore_throat" },
  { symptom: "cough", diagnosis: "Viral URTI / Bronchitis", weight: 4, complaint: "cough" },
  { symptom: "fever", diagnosis: "Community-Acquired Pneumonia", weight: 3, complaint: "cough" },
  { symptom: "shortness of breath", diagnosis: "Community-Acquired Pneumonia", weight: 6, complaint: "cough" },
  { symptom: "sputum production", diagnosis: "Community-Acquired Pneumonia", weight: 4, complaint: "cough" },
  { symptom: "wheezing", diagnosis: "Asthma Exacerbation", weight: 7, complaint: "cough" },
  { symptom: "radiation to arm/jaw", diagnosis: "ACS / NSTEMI", weight: 8, complaint: "chest_pain" },
  { symptom: "diaphoresis", diagnosis: "ACS / NSTEMI", weight: 7, complaint: "chest_pain" },
  { symptom: "pleuritic", diagnosis: "Pulmonary Embolism", weight: 5, complaint: "chest_pain" },
  { symptom: "reproducible with palpation", diagnosis: "Musculoskeletal / Costochondritis", weight: 7, complaint: "chest_pain" },
  { symptom: "dysuria", diagnosis: "Uncomplicated UTI (Cystitis)", weight: 6, complaint: "uti" },
  { symptom: "frequency", diagnosis: "Uncomplicated UTI (Cystitis)", weight: 5, complaint: "uti" },
  { symptom: "flank pain", diagnosis: "Pyelonephritis", weight: 8, complaint: "uti" },
  { symptom: "fever/chills", diagnosis: "Pyelonephritis", weight: 7, complaint: "uti" },
  { symptom: "neck stiffness", diagnosis: "Early Bacterial Sepsis", weight: 9, complaint: "fever" },
  { symptom: "confusion", diagnosis: "Early Bacterial Sepsis", weight: 8, complaint: "fever" },
  { symptom: "rash", diagnosis: "Viral Syndrome", weight: 3, complaint: "fever" },
  { symptom: "spreading", diagnosis: "Cellulitis", weight: 7, complaint: "rash" },
  { symptom: "petechiae", diagnosis: "Meningococcemia", weight: 10, complaint: "rash" },
  { symptom: "facial pain", diagnosis: "Acute Bacterial Sinusitis", weight: 5, complaint: "sinus_pressure" },
  { symptom: "duration > 10 days", diagnosis: "Acute Bacterial Sinusitis", weight: 7, complaint: "sinus_pressure" },
  { symptom: "rlq pain", diagnosis: "Appendicitis", weight: 7, complaint: "abdominal_pain" },
  { symptom: "rebound tenderness", diagnosis: "Appendicitis", weight: 9, complaint: "abdominal_pain" },
  { symptom: "nausea/vomiting", diagnosis: "Gastroenteritis", weight: 5, complaint: "abdominal_pain" },
  { symptom: "diarrhea", diagnosis: "Gastroenteritis", weight: 6, complaint: "abdominal_pain" },
];

async function load(): Promise<void> {
  if (loaded) return;
  try {
    const raw = await fs.readFile(GRAPH_PATH, "utf8");
    graphData = JSON.parse(raw);
  } catch {
    for (const s of SEED_GRAPH) {
      if (!graphData.edges[s.symptom]) graphData.edges[s.symptom] = {};
      graphData.edges[s.symptom][s.diagnosis] = { weight: s.weight, confirmed: s.weight, refuted: 0, complaint: s.complaint, lastUpdated: new Date().toISOString() };
    }
  }
  loaded = true;
}

async function persist(): Promise<void> {
  await fs.mkdir(path.join(process.cwd(), "data"), { recursive: true });
  await fs.writeFile(GRAPH_PATH, JSON.stringify(graphData, null, 2), "utf8");
}

export async function addEdge(symptom: string, diagnosis: string, confirmed: boolean, complaint?: string): Promise<void> {
  await load();
  const sym = symptom.toLowerCase().trim();
  if (!graphData.edges[sym]) graphData.edges[sym] = {};
  const existing = graphData.edges[sym][diagnosis] ?? { weight: 0, confirmed: 0, refuted: 0, lastUpdated: "" };
  if (confirmed) {
    existing.confirmed++;
    existing.weight = Math.min(10, existing.weight + 0.5);
  } else {
    existing.refuted++;
    existing.weight = Math.max(0, existing.weight - 0.3);
  }
  if (complaint) existing.complaint = complaint;
  existing.lastUpdated = new Date().toISOString();
  graphData.edges[sym][diagnosis] = existing;
  await persist();
}

export async function rankDiagnoses(symptoms: string[], complaint?: string): Promise<Array<{ diagnosis: string; score: number; evidence: string[] }>> {
  await load();
  const scores: Record<string, { score: number; evidence: string[] }> = {};
  for (const sym of symptoms) {
    const symLower = sym.toLowerCase().trim();
    const edges = graphData.edges[symLower] ?? {};
    for (const [dx, data] of Object.entries(edges)) {
      if (complaint && data.complaint && data.complaint !== complaint) continue;
      if (!scores[dx]) scores[dx] = { score: 0, evidence: [] };
      scores[dx].score += data.weight;
      scores[dx].evidence.push(`${sym} (w=${data.weight.toFixed(1)})`);
    }
  }
  return Object.entries(scores)
    .map(([diagnosis, { score, evidence }]) => ({ diagnosis, score: Math.round(score * 10) / 10, evidence }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

export async function getGraphStats(): Promise<GraphStats> {
  await load();
  const totalNodes = Object.keys(graphData.edges).length;
  const allEdges: Array<{ symptom: string; diagnosis: string; strength: number }> = [];
  const diagByComplaint: Record<string, Set<string>> = {};

  for (const [symptom, targets] of Object.entries(graphData.edges)) {
    for (const [diagnosis, data] of Object.entries(targets)) {
      allEdges.push({ symptom, diagnosis, strength: data.weight });
      if (data.complaint) {
        if (!diagByComplaint[data.complaint]) diagByComplaint[data.complaint] = new Set();
        diagByComplaint[data.complaint].add(diagnosis);
      }
    }
  }

  const totalEdges = allEdges.length;
  const topPairs = allEdges.sort((a, b) => b.strength - a.strength).slice(0, 10).map(e => ({ ...e }));
  const diagnosisByComplaint: Record<string, string[]> = {};
  for (const [c, dxSet] of Object.entries(diagByComplaint)) diagnosisByComplaint[c] = Array.from(dxSet);

  return { totalNodes, totalEdges, topSymptomDiagnosisPairs: topPairs, diagnosisByComplaint };
}
