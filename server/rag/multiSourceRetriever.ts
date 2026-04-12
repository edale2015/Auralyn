/**
 * Multi-Source Retriever — pulls context from multiple clinical knowledge bases simultaneously
 * Sources: KB Entity Store · Clinical Knowledge Graph · Symptom Skill Layer
 * Merges and deduplicates results for downstream relevance scoring.
 */

import { db }                             from "../db";
import { kbEntityStore, kbSources }       from "@shared/schema";
import { ilike, or }                      from "drizzle-orm";
import { getKnowledgeGraph }              from "../knowledge/knowledgeGraphStore";
import type { QueryRoute }                from "./clinicalQueryRouter";

export interface RetrievedChunk {
  id:       string;
  text:     string;
  source:   "kb_entity" | "knowledge_graph" | "symptom_skill";
  metadata: Record<string, any>;
  score?:   number;
}

/** Pull matching entities from the KB entity store */
async function retrieveFromKB(query: string, limit = 5): Promise<RetrievedChunk[]> {
  try {
    const terms = query.split(/\s+/).filter((t) => t.length > 3).slice(0, 4);
    if (terms.length === 0) return [];

    const conditions = terms.flatMap((t) => [
      ilike(kbEntityStore.entityKey, `%${t}%`),
      ilike(kbEntityStore.label,     `%${t}%`),
    ]);

    const rows = await db
      .select()
      .from(kbEntityStore)
      .where(or(...conditions))
      .limit(limit);

    return rows.map((r) => ({
      id:       `kb:${r.id}`,
      text:     [r.label, r.entityKey, JSON.stringify(r.data ?? {})].join(" — ").slice(0, 500),
      source:   "kb_entity" as const,
      metadata: { entityType: r.entityType, sourceId: r.sourceId, status: r.status },
    }));
  } catch {
    return [];
  }
}

/** Pull relevant nodes from the clinical knowledge graph (in-memory) */
function retrieveFromKnowledgeGraph(query: string, limit = 4): RetrievedChunk[] {
  try {
    const graph = getKnowledgeGraph();
    const lower = query.toLowerCase();
    const terms = lower.split(/\s+/).filter((t) => t.length > 3);

    return graph.nodes
      .filter((n) => {
        const haystack = `${n.label ?? ""} ${n.type ?? ""} ${JSON.stringify(n.data ?? {})}`.toLowerCase();
        return terms.some((t) => haystack.includes(t));
      })
      .slice(0, limit)
      .map((n) => ({
        id:       `kg:${n.id}`,
        text:     `${n.label} (${n.type})${n.data ? " — " + JSON.stringify(n.data).slice(0, 200) : ""}`,
        source:   "knowledge_graph" as const,
        metadata: { nodeType: n.type, nodeId: n.id },
      }));
  } catch {
    return [];
  }
}

/** Inline clinical skill snippets for ACUTE_HIGH_RISK queries */
const SKILL_SNIPPETS: Array<{ keywords: string[]; text: string; id: string }> = [
  {
    id:       "skill:sepsis_bundle",
    keywords: ["sepsis", "septic shock", "fever", "hypotension"],
    text:     "SEPSIS BUNDLE: Draw lactate + 2x blood cultures, give 30mL/kg IV crystalloid, broad-spectrum antibiotics within 1h, re-assess lactate if >2 mmol/L. qSOFA ≥2 = high risk.",
  },
  {
    id:       "skill:chest_pain_acs",
    keywords: ["chest pain", "acs", "stemi", "mi", "heart attack"],
    text:     "CHEST PAIN PROTOCOL: 12-lead ECG within 10min, aspirin 325mg, troponin x2 at 0+3h, risk stratify with HEART score. STEMI = cath lab activation. NSTEMI = anticoagulation + cardiology consult.",
  },
  {
    id:       "skill:stroke_fast",
    keywords: ["stroke", "tia", "facial droop", "arm weakness", "speech"],
    text:     "STROKE PROTOCOL (FAST): Face droop + Arm weakness + Speech difficulty + Time. CT head stat, last known well time, tPA eligibility if <4.5h. Activate stroke team.",
  },
  {
    id:       "skill:anaphylaxis",
    keywords: ["anaphylaxis", "allergic reaction", "epinephrine"],
    text:     "ANAPHYLAXIS: Epinephrine 0.3mg IM (lateral thigh) immediately. Airway, positioning, IV access. Diphenhydramine + corticosteroids. Monitor 4-6h for biphasic reaction.",
  },
];

function retrieveFromSkillLayer(query: string, route: QueryRoute): RetrievedChunk[] {
  if (route !== "ACUTE_HIGH_RISK") return [];
  const lower = query.toLowerCase();
  return SKILL_SNIPPETS
    .filter((s) => s.keywords.some((k) => lower.includes(k)))
    .map((s) => ({
      id:       s.id,
      text:     s.text,
      source:   "symptom_skill" as const,
      metadata: { skillId: s.id },
    }));
}

export interface MultiSourceResult {
  chunks:         RetrievedChunk[];
  sourceCounts:   Record<string, number>;
  totalRetrieved: number;
  retrievedAt:    string;
}

export async function retrieveMultiSource(
  query: string,
  route: QueryRoute = "GENERAL_MEDICAL"
): Promise<MultiSourceResult> {
  const [kbChunks, graphChunks, skillChunks] = await Promise.all([
    retrieveFromKB(query),
    Promise.resolve(retrieveFromKnowledgeGraph(query)),
    Promise.resolve(retrieveFromSkillLayer(query, route)),
  ]);

  // Deduplicate by id
  const seen = new Set<string>();
  const chunks: RetrievedChunk[] = [];
  for (const c of [...skillChunks, ...kbChunks, ...graphChunks]) {
    if (!seen.has(c.id)) { seen.add(c.id); chunks.push(c); }
  }

  const sourceCounts = {
    kb_entity:       kbChunks.length,
    knowledge_graph: graphChunks.length,
    symptom_skill:   skillChunks.length,
  };

  return { chunks, sourceCounts, totalRetrieved: chunks.length, retrievedAt: new Date().toISOString() };
}
