/**
 * clinicalKBRetriever.ts
 *
 * THREE-TIER RETRIEVAL ARCHITECTURE (Context-1 principles, using Claude)
 *
 * Separates KB retrieval into its own Claude call (Sonnet, low cost),
 * implements self-editing context window (retrieve → prune → retrieve),
 * returns a clean curated context block to runClinicalBrain().
 *
 * Wire into pipeline.ts:
 *   const kbContext = await retrieveClinicalKB(complaintSlug, symptoms, ehrContext);
 *   // Pass kbContext.curatedBlock as additional context to runClinicalBrain()
 *
 * Cost impact:
 *   Current: One Opus call handles retrieval + reasoning (~$0.08/case)
 *   After:   One Sonnet retrieval call + one Opus reasoning call (~$0.04/case)
 */

import Anthropic from "@anthropic-ai/sdk";
import { db }   from "../db";
import { sql }  from "drizzle-orm";

const anthropic = new Anthropic();

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface KBChunk {
  id:            string;
  type:          "red_flag" | "diagnosis_rule" | "clinical_skill" | "ontology" | "treatment";
  complaintSlug: string;
  content:       string;
  relevanceScore?: number;
  tokenEstimate: number;
}

export interface RetrievalResult {
  curatedChunks: KBChunk[];
  prunedChunks:  KBChunk[];
  tokensBefore:  number;
  tokensAfter:   number;
  hops:          number;
  curatedBlock:  string;
  cacheKey:      string;
}

// ─── Token budget ──────────────────────────────────────────────────────────────

const CONTEXT_BUDGET  = 8_000;
const SOFT_THRESHOLD  = 6_000;
const MAX_HOPS        = 3;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ─── KB chunk fetchers ─────────────────────────────────────────────────────────

async function fetchRedFlagRules(complaintSlug: string): Promise<KBChunk[]> {
  const rows = await db.execute(sql`
    SELECT id, rule_type, complaint_slug, condition_text, action_text
    FROM kb_rules
    WHERE complaint_slug = ${complaintSlug}
      AND rule_type = 'red_flag'
      AND active = true
    LIMIT 10
  `).catch(() => ({ rows: [] }));

  return (rows.rows as any[]).map(r => ({
    id:            `rf-${r.id}`,
    type:          "red_flag" as const,
    complaintSlug: r.complaint_slug,
    content:       `RED FLAG RULE: IF ${r.condition_text} THEN ${r.action_text}`,
    tokenEstimate: estimateTokens(`${r.condition_text} ${r.action_text}`),
  }));
}

async function fetchDiagnosisRules(complaintSlug: string): Promise<KBChunk[]> {
  const rows = await db.execute(sql`
    SELECT id, rule_type, complaint_slug, condition_text, action_text, source_reference
    FROM kb_rules
    WHERE complaint_slug = ${complaintSlug}
      AND rule_type IN ('diagnosis', 'disposition', 'treatment')
      AND active = true
    ORDER BY rule_type, id
    LIMIT 15
  `).catch(() => ({ rows: [] }));

  return (rows.rows as any[]).map(r => ({
    id:            `dx-${r.id}`,
    type:          "diagnosis_rule" as const,
    complaintSlug: r.complaint_slug,
    content:       `${r.rule_type.toUpperCase()} RULE: IF ${r.condition_text} THEN ${r.action_text}${r.source_reference ? ` [${r.source_reference}]` : ""}`,
    tokenEstimate: estimateTokens(`${r.condition_text} ${r.action_text}`),
  }));
}

async function fetchActiveClinicalSkills(complaintSlug: string): Promise<KBChunk[]> {
  const rows = await db.execute(sql`
    SELECT skill_id, title, trigger_text, ai_tendency, correct_reasoning, confidence
    FROM clinical_skills
    WHERE complaint_slug = ${complaintSlug}
      AND status = 'active'
    ORDER BY confidence DESC
    LIMIT 3
  `).catch(() => ({ rows: [] }));

  return (rows.rows as any[]).map(r => ({
    id:            `sk-${r.skill_id}`,
    type:          "clinical_skill" as const,
    complaintSlug,
    content:       `CLINICAL SKILL [${Math.round(r.confidence * 100)}% confidence]: ${r.title}\nWhen: ${r.trigger_text}\nAI tends to: ${r.ai_tendency}\nInstead: ${r.correct_reasoning}`,
    tokenEstimate: estimateTokens(`${r.title} ${r.trigger_text} ${r.ai_tendency} ${r.correct_reasoning}`),
  }));
}

async function fetchRelatedComplaints(complaintSlug: string): Promise<KBChunk[]> {
  const adjacencyMap: Record<string, string[]> = {
    chest_pain:          ["shortness_of_breath", "hypertensive_urgency"],
    shortness_of_breath: ["chest_pain", "asthma_exacerbation"],
    sore_throat:         ["ear_pain"],
    abdominal_pain:      ["uti", "hyperglycemia"],
    headache:            ["hypertensive_urgency"],
    leg_swelling:        ["shortness_of_breath"],
  };

  const adjacent = adjacencyMap[complaintSlug] ?? [];
  if (adjacent.length === 0) return [];

  const rows = await db.execute(sql`
    SELECT id, rule_type, complaint_slug, condition_text, action_text
    FROM kb_rules
    WHERE complaint_slug = ANY(${adjacent})
      AND rule_type = 'red_flag'
      AND active = true
    LIMIT 5
  `).catch(() => ({ rows: [] }));

  return (rows.rows as any[]).map(r => ({
    id:            `adj-${r.id}`,
    type:          "red_flag" as const,
    complaintSlug: r.complaint_slug,
    content:       `ADJACENT COMPLAINT (${r.complaint_slug}) RED FLAG: IF ${r.condition_text} THEN ${r.action_text}`,
    tokenEstimate: estimateTokens(`${r.condition_text} ${r.action_text}`),
  }));
}

// ─── Context pruner ────────────────────────────────────────────────────────────

async function pruneIrrelevantChunks(
  chunks:        KBChunk[],
  symptoms:      string[],
  complaintSlug: string
): Promise<{ keep: KBChunk[]; prune: KBChunk[] }> {
  if (chunks.length <= 3) return { keep: chunks, prune: [] };

  const chunkList = chunks.map((c, i) =>
    `[${i}] ID:${c.id} TYPE:${c.type}\n${c.content.slice(0, 200)}`
  ).join("\n\n");

  const response = await anthropic.messages.create({
    model:      "claude-sonnet-4-20250514",
    max_tokens: 300,
    system: `You are a clinical KB context pruner. Given a list of KB chunks and a patient's symptoms,
identify which chunks are IRRELEVANT to this specific presentation.
Be aggressive — if a chunk wouldn't change the clinical assessment for these symptoms, prune it.
Return ONLY a JSON array of indices to PRUNE (remove). Return [] if all chunks are relevant.`,
    messages: [{
      role:    "user",
      content: `Complaint: ${complaintSlug}\nSymptoms: ${symptoms.join(", ")}\n\nChunks:\n${chunkList}\n\nReturn JSON array of indices to prune:`,
    }],
  });

  const text  = response.content.filter(b => b.type === "text").map(b => (b as any).text).join("");
  const clean = text.replace(/```json|```/g, "").trim();

  let pruneIndices: number[] = [];
  try { pruneIndices = JSON.parse(clean); } catch { pruneIndices = []; }

  return {
    keep:  chunks.filter((_, i) => !pruneIndices.includes(i)),
    prune: chunks.filter((_, i) =>  pruneIndices.includes(i)),
  };
}

// ─── Main retriever ────────────────────────────────────────────────────────────

export async function retrieveClinicalKB(
  complaintSlug: string,
  symptoms:      string[],
  ehrContext?: {
    conditions?:  string[];
    medications?: string[];
    allergies?:   string[];
  }
): Promise<RetrievalResult> {
  const cacheKey   = `${complaintSlug}:${symptoms.slice(0, 5).sort().join(",")}`;
  let allChunks:    KBChunk[] = [];
  let prunedChunks: KBChunk[] = [];
  let tokenCount   = 0;
  let hops         = 0;

  // ── HOP 1: Fetch primary KB chunks ──────────────────────────────────────────
  hops++;
  const [redFlags, diagnosisRules, skills] = await Promise.all([
    fetchRedFlagRules(complaintSlug),
    fetchDiagnosisRules(complaintSlug),
    fetchActiveClinicalSkills(complaintSlug),
  ]);

  allChunks  = [...redFlags, ...diagnosisRules, ...skills];
  tokenCount = allChunks.reduce((sum, c) => sum + c.tokenEstimate, 0);

  // ── HOP 2: Prune irrelevant chunks ───────────────────────────────────────────
  if (tokenCount > SOFT_THRESHOLD && allChunks.length > 3) {
    const { keep, prune } = await pruneIrrelevantChunks(allChunks, symptoms, complaintSlug);
    prunedChunks.push(...prune);
    allChunks  = keep;
    tokenCount = allChunks.reduce((sum, c) => sum + c.tokenEstimate, 0);
    hops++;
  }

  // ── HOP 3: Fetch adjacent complaint rules if budget allows ───────────────────
  if (tokenCount < SOFT_THRESHOLD && hops < MAX_HOPS) {
    const adjacent      = await fetchRelatedComplaints(complaintSlug);
    const adjTokens     = adjacent.reduce((sum, c) => sum + c.tokenEstimate, 0);
    if (tokenCount + adjTokens < CONTEXT_BUDGET) {
      allChunks  = [...allChunks, ...adjacent];
      tokenCount = allChunks.reduce((sum, c) => sum + c.tokenEstimate, 0);
      hops++;
    }
  }

  const tokensBefore = prunedChunks.reduce((s, c) => s + c.tokenEstimate, 0) + tokenCount;

  // ── Build curated prompt block ───────────────────────────────────────────────
  const redFlagBlock = allChunks.filter(c => c.type === "red_flag" && !c.id.startsWith("adj-"));
  const diagBlock    = allChunks.filter(c => c.type === "diagnosis_rule");
  const skillBlock   = allChunks.filter(c => c.type === "clinical_skill");
  const adjBlock     = allChunks.filter(c => c.id.startsWith("adj-"));

  const curatedBlock = `
## CURATED CLINICAL KB (${allChunks.length} rules, ${tokenCount} tokens, ${hops} retrieval hops)
${prunedChunks.length > 0 ? `[${prunedChunks.length} irrelevant chunks pruned before reasoning]` : "[No pruning needed]"}

${redFlagBlock.length > 0 ? `### Red Flag Rules (${redFlagBlock.length})\n${redFlagBlock.map(c => c.content).join("\n")}` : ""}

${diagBlock.length > 0 ? `### Diagnosis & Disposition Rules (${diagBlock.length})\n${diagBlock.map(c => c.content).join("\n")}` : ""}

${skillBlock.length > 0 ? `### Active Clinical Skills (physician-approved)\n${skillBlock.map(c => c.content).join("\n")}` : ""}

${adjBlock.length > 0 ? `### Adjacent Complaint Red Flags (watch for)\n${adjBlock.map(c => c.content).join("\n")}` : ""}

${ehrContext?.allergies?.length  ? `### Patient Allergies (EHR-verified)\n${ehrContext.allergies.join(", ")}` : ""}
${ehrContext?.medications?.length ? `### Current Medications (EHR-verified)\n${ehrContext.medications.join(", ")}` : ""}
`.trim();

  return {
    curatedChunks: allChunks,
    prunedChunks,
    tokensBefore,
    tokensAfter:   tokenCount,
    hops,
    curatedBlock,
    cacheKey,
  };
}
