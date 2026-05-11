/**
 * clinicalDocumentChunker.ts
 * server/retrieval/clinicalDocumentChunker.ts
 *
 * SEMANTIC CLINICAL DOCUMENT CHUNKER
 *
 * WHAT THIS REPLACES:
 * The current clinicalDocumentIndexer.ts (Win 20 — PageIndex) splits
 * clinical guideline PDFs by page number. Page boundaries are arbitrary
 * — they split clinical content mid-topic based on print layout, not
 * clinical meaning.
 *
 * Example problem with page-based chunking:
 *   Page 6: "...for patients with penicillin allergy, consider azithromycin
 *   500mg daily for 3 days. In patients with macrolide resistance or failed"
 *   Page 7: "...macrolide therapy, use respiratory fluoroquinolone..."
 *
 * A query for "penicillin allergy antibiotic alternative" retrieves page 6,
 * which contains an incomplete recommendation. The clinical answer spans
 * the page break.
 *
 * WHAT THIS BUILDS:
 * Clinical-domain-aware semantic chunking that:
 *   1. Detects clinical section boundaries (headings, recommendation blocks)
 *   2. Keeps clinical recommendations complete (don't split dose + indication)
 *   3. Groups related content (drug + dose + indication + contraindication)
 *   4. Respects clinical document structure (background, recommendations, evidence)
 *
 * THE ARTICLE'S TECHNIQUE ADAPTED FOR CLINICAL DOCUMENTS:
 * The article uses sentence embeddings to detect topic shifts via cosine
 * similarity gap scores. For clinical documents, we can do better by
 * combining:
 *   - Structural signals (headings, "Recommendation:", "Evidence:", numbered items)
 *   - Clinical semantic signals (drug names, dose patterns, condition names)
 *   - Coherence scoring (does this chunk answer one clinical question?)
 *
 * WHY NOT USE SBERT + PYTHON:
 * Auralyn runs TypeScript/Node.js. We use Claude (already in the gateway)
 * for semantic analysis — no Python dependency, no SBERT model download,
 * no infrastructure change. The article's insight (topic coherence via
 * semantic similarity) is implemented through Claude's understanding of
 * clinical text structure.
 *
 * INTEGRATION:
 * This module is called by clinicalDocumentIndexer.ts during the
 * "generateIndex" step, replacing the current page-split approach.
 * The PageIndex tree structure is preserved — chunks become leaf nodes.
 */

import { llmGateway } from "../gateway/llmGateway";

// ─── Clinical document structure signals ──────────────────────────────────────
// These patterns identify meaningful boundaries in clinical guidelines.
// Far more precise than page breaks for clinical content.

const SECTION_BOUNDARY_PATTERNS = [
  // Major section headings
  /^#{1,3}\s+\w/m,                                    // Markdown headings
  /^[A-Z][A-Z\s]{4,}$/m,                              // ALL CAPS headings
  /^\d+\.\s+[A-Z]/m,                                  // Numbered sections (1. Background)
  /^(BACKGROUND|INTRODUCTION|RECOMMENDATIONS?|EVIDENCE|DISCUSSION|METHODS?|REFERENCES?)\b/im,

  // Clinical recommendation markers
  /^(Recommendation|Guideline|Clinical Pearl|Key Point|Summary|Conclusion)\s*:/im,
  /^\[(Grade|Level|Class|Evidence)\s+[A-Z0-9]+\]/im,  // [Grade A], [Level I]
  /^(Strong|Weak|Conditional)\s+recommendation/im,
  /^(GRADE|COR|LOE)\s*[:\-]/im,                       // GRADE classification

  // Clinical content boundaries
  /^(Diagnosis|Treatment|Management|Prevention|Screening|Follow.?up)\s*:/im,
  /^(Adults?|Pediatrics?|Children|Neonates?|Elderly|Pregnant)\s*:/im,
  /^(First.?line|Second.?line|Alternative|Empiric)\s*(therapy|treatment)/im,
];

const CLINICAL_COHERENCE_MARKERS = [
  // Drug + dose + indication — these should never be split
  /\b(mg|mcg|g|mL|units?)\/?(kg|day|dose|hour|hr)\b/i,
  /\b(daily|BID|TID|QID|once|twice|every \d+ hours?)\b/i,
  /\b(for \d+[\-–]\d+ days?|for \d+ weeks?|for \d+ months?)\b/i,

  // Clinical decision nodes — keep trigger + action together
  /\b(if|when|in patients? with|for patients? who)\b/i,
  /\b(contraindicated|avoid|do not use|preferred over)\b/i,
  /\b(first|second|alternative|preferred)\s*(choice|line|option)\b/i,
];

// ─── Chunk types ──────────────────────────────────────────────────────────────

export type ChunkType =
  | "recommendation"      // Clinical recommendation with evidence level
  | "drug_protocol"       // Drug + dose + indication + contraindications
  | "diagnostic_criteria" // Diagnostic criteria or scoring
  | "background"          // Background/epidemiology (lower retrieval priority)
  | "evidence_summary"    // Evidence tables, references
  | "algorithm"           // Clinical decision algorithm
  | "general";            // Unclassified content

export interface ClinicalChunk {
  chunkId:         string;
  documentId:      string;
  pageStart:       number;
  pageEnd:         number;
  text:            string;
  chunkType:       ChunkType;
  headingPath:     string[];    // breadcrumb: ["CAP Treatment", "Adults", "Outpatient"]
  clinicalTerms:   string[];    // extracted drug names, conditions, scores
  evidenceLevel?:  string;      // "Grade A", "Level I", "Strong recommendation"
  wordCount:       number;
  retrievalWeight: number;      // 0.0-1.0 — higher = more clinically relevant for retrieval
}

// ─── Structural splitter ──────────────────────────────────────────────────────
// Step 1: Split by structural signals before semantic analysis.
// This is fast and handles 80% of boundary detection correctly.

interface RawSection {
  text:       string;
  pageStart:  number;
  pageEnd:    number;
  startLine:  number;
  heading?:   string;
}

export function structuralSplit(
  fullText: string,
  pageMap:  Map<number, number>  // char offset → page number
): RawSection[] {

  const lines    = fullText.split("\n");
  const sections: RawSection[] = [];
  let currentLines:    string[]          = [];
  let currentHeading:  string | undefined;
  let sectionStartLine = 0;

  function getPage(lineIndex: number): number {
    const charPos = lines.slice(0, lineIndex).join("\n").length;
    let page = 1;
    for (const [offset, pg] of pageMap.entries()) {
      if (charPos >= offset) page = pg;
    }
    return page;
  }

  function flushSection(): void {
    const text = currentLines.join("\n").trim();
    if (text.length > 50) {
      sections.push({
        text,
        heading:       currentHeading,
        startLine:     sectionStartLine,
        pageStart:     getPage(sectionStartLine),
        pageEnd:       getPage(sectionStartLine + currentLines.length),
      });
    }
    currentLines     = [];
    sectionStartLine = 0;
  }

  for (let i = 0; i < lines.length; i++) {
    const line        = lines[i];
    const isBoundary  = SECTION_BOUNDARY_PATTERNS.some(pattern => pattern.test(line));

    if (isBoundary && currentLines.length > 0) {
      flushSection();
      currentHeading   = line.trim();
      sectionStartLine = i;
    }

    currentLines.push(line);
  }

  flushSection();
  return sections;
}

// ─── Coherence merger ─────────────────────────────────────────────────────────
// Step 2: Merge sections that are too small or incomplete.
// Clinical recommendations must be complete — don't leave a drug name
// in one chunk and its dose in the next.

const MIN_CHUNK_WORDS = 40;
const MAX_CHUNK_WORDS = 400;

export function mergeIncompleteChunks(sections: RawSection[]): RawSection[] {
  const merged: RawSection[] = [];
  let pending: RawSection | null = null;

  for (const section of sections) {
    const wordCount = section.text.split(/\s+/).length;

    if (!pending) {
      pending = { ...section };
      continue;
    }

    const pendingWords    = pending.text.split(/\s+/).length;
    const combinedWords   = pendingWords + wordCount;

    if (pendingWords < MIN_CHUNK_WORDS) {
      pending.text    += "\n\n" + section.text;
      pending.pageEnd  = section.pageEnd;
      continue;
    }

    const endsIncomplete = (
      !pending.text.trimEnd().match(/[.!?]$/) ||
      CLINICAL_COHERENCE_MARKERS.some(p => {
        const lastSentence = pending!.text.split(/[.!?]/).pop() ?? "";
        return p.test(lastSentence) && wordCount < 30;
      })
    );

    if (endsIncomplete && combinedWords <= MAX_CHUNK_WORDS) {
      pending.text    += "\n\n" + section.text;
      pending.pageEnd  = section.pageEnd;
      continue;
    }

    merged.push(pending);
    pending = { ...section };
  }

  if (pending) merged.push(pending);
  return merged;
}

// ─── Clinical classifier ──────────────────────────────────────────────────────
// Step 3: Classify each chunk's type and extract clinical terms.
// Uses pattern matching — no LLM call needed for this step.

function classifyChunk(text: string): ChunkType {
  if (/\b(recommend|guideline|advise|suggest)\b/i.test(text) &&
      /\b(grade|level|class|evidence|strong|weak|conditional)\b/i.test(text)) {
    return "recommendation";
  }
  if (/\b(mg|mcg|g)\b/i.test(text) &&
      /\b(daily|bid|tid|for \d+ days?)\b/i.test(text)) {
    return "drug_protocol";
  }
  if (/\b(criteria|diagnosis|score|scoring|sensitivity|specificity|positive predictive)\b/i.test(text)) {
    return "diagnostic_criteria";
  }
  if (/\b(algorithm|flowchart|decision|step \d|if.*then)\b/i.test(text)) {
    return "algorithm";
  }
  if (/\b(background|epidemiology|prevalence|incidence|etiology|pathophysiology)\b/i.test(text)) {
    return "background";
  }
  if (/\b(table \d|references?|bibliography|evidence table)\b/i.test(text)) {
    return "evidence_summary";
  }
  return "general";
}

function extractClinicalTerms(text: string): string[] {
  const terms: string[] = [];

  const drugPattern = /\b[A-Z][a-z]+(?:cillin|mycin|floxacin|oxacin|cycline|azole|vir|mab|nib|stat|pril|sartan|olol|pam|zepam)\b/g;
  terms.push(...(text.match(drugPattern) ?? []).map(d => d.toLowerCase()));

  const scorePattern = /\b(HEART|Wells|PERC|Centor|McIsaac|Ottawa|CURB-65|PSI|APACHE|SOFA|qSOFA|NIHSS|GCS)\b/g;
  terms.push(...(text.match(scorePattern) ?? []));

  const conditionPattern = /\b([A-Z][a-z]+ (?:syndrome|disease|failure|injury|infection|disorder|pneumonia|sepsis|embolism))\b/g;
  terms.push(...(text.match(conditionPattern) ?? []).map(c => c.toLowerCase()));

  return [...new Set(terms)].slice(0, 10);
}

function extractEvidenceLevel(text: string): string | undefined {
  const patterns = [
    /\[Grade ([A-C])\]/i,
    /\[Level ([I-IV]+)\]/i,
    /\(COR ([I-III]+[ab]?)\)/i,
    /\bStrong recommendation\b/i,
    /\bConditional recommendation\b/i,
    /\bGRADE ([A-D])\b/i,
  ];
  for (const p of patterns) {
    const match = text.match(p);
    if (match) return match[0];
  }
  return undefined;
}

function scoreRetrievalWeight(chunk: Omit<ClinicalChunk, "retrievalWeight">): number {
  let score = 0.5;

  if (chunk.chunkType === "recommendation")      score += 0.30;
  if (chunk.chunkType === "drug_protocol")       score += 0.25;
  if (chunk.chunkType === "diagnostic_criteria") score += 0.20;
  if (chunk.chunkType === "algorithm")           score += 0.15;
  if (chunk.chunkType === "background")          score -= 0.20;
  if (chunk.chunkType === "evidence_summary")    score -= 0.10;

  if (chunk.evidenceLevel) score += 0.10;

  score += Math.min(chunk.clinicalTerms.length * 0.02, 0.10);

  return Math.min(Math.max(score, 0.1), 1.0);
}

// ─── LLM-assisted semantic coherence check ───────────────────────────────────
// Step 4: For chunks that structural analysis can't resolve cleanly,
// use a fast LLM call to check coherence and suggest splits.
// Only called for chunks that fail coherence heuristics.

async function checkSemanticCoherence(chunk: RawSection): Promise<{
  isCoherent:      boolean;
  suggestedSplits: number[];  // word positions to split at
  reason:          string;
}> {

  const wordCount = chunk.text.split(/\s+/).length;

  // Fast heuristic: within size with clear heading → coherent, no LLM needed
  if (wordCount <= 200 && chunk.heading) {
    return { isCoherent: true, suggestedSplits: [], reason: "Within size limit with clear heading" };
  }

  if (wordCount > MAX_CHUNK_WORDS) {
    const result = await llmGateway.complete({
      purpose:  "retrieval_pruner",
      messages: [{
        role:    "user",
        content: `This is a chunk from a clinical guideline document (${wordCount} words).
Assess whether it covers a single clinical topic or multiple topics.

TEXT:
${chunk.text.slice(0, 1500)}

Return JSON:
{
  "isCoherent": true/false,
  "topicCount": number,
  "suggestedSplitAfterWord": [word_positions_if_splitting_recommended],
  "reason": "one sentence explanation"
}`,
      }],
      system:    "You are analyzing clinical guideline text for chunking. Return ONLY valid JSON.",
      maxTokens: 200,
      cacheKey:  `coherence:${chunk.text.slice(0, 100)}`,
    }).catch(() => null);

    if (result?.content) {
      try {
        const clean  = result.content.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(clean);
        return {
          isCoherent:      parsed.isCoherent ?? true,
          suggestedSplits: parsed.suggestedSplitAfterWord ?? [],
          reason:          parsed.reason ?? "",
        };
      } catch {
        // JSON parse failed — assume coherent, don't split
      }
    }
  }

  return { isCoherent: true, suggestedSplits: [], reason: "Default coherent" };
}

// ─── Main chunker ─────────────────────────────────────────────────────────────

export async function chunkClinicalDocument(params: {
  documentId:       string;
  fullText:         string;
  pageMap:          Map<number, number>;
  headingStack:     string[];
  useSemanticCheck: boolean;
}): Promise<ClinicalChunk[]> {

  const { documentId, fullText, pageMap, headingStack, useSemanticCheck } = params;

  // Step 1: Structural split
  const rawSections = structuralSplit(fullText, pageMap);

  // Step 2: Merge incomplete chunks
  const mergedSections = mergeIncompleteChunks(rawSections);

  // Step 3 (optional): Semantic coherence check for oversized chunks
  const finalSections: RawSection[] = [];

  if (useSemanticCheck) {
    for (const section of mergedSections) {
      const wordCount = section.text.split(/\s+/).length;

      if (wordCount > MAX_CHUNK_WORDS) {
        const coherence = await checkSemanticCoherence(section);

        if (!coherence.isCoherent && coherence.suggestedSplits.length > 0) {
          const words    = section.text.split(/\s+/);
          let lastSplit  = 0;

          for (const splitPos of coherence.suggestedSplits) {
            if (splitPos > lastSplit && splitPos < words.length) {
              finalSections.push({
                ...section,
                text:      words.slice(lastSplit, splitPos).join(" "),
                startLine: section.startLine + lastSplit,
              });
              lastSplit = splitPos;
            }
          }

          const remaining = words.slice(lastSplit).join(" ");
          if (remaining.trim().length > 50) {
            finalSections.push({ ...section, text: remaining });
          }
          continue;
        }
      }

      finalSections.push(section);
    }
  } else {
    finalSections.push(...mergedSections);
  }

  // Step 4: Classify and enrich each chunk
  return finalSections.map((section, index) => {
    const chunkType     = classifyChunk(section.text);
    const clinicalTerms = extractClinicalTerms(section.text);
    const evidenceLevel = extractEvidenceLevel(section.text);

    const partial = {
      chunkId:       `${documentId}_chunk_${String(index + 1).padStart(3, "0")}`,
      documentId,
      pageStart:     section.pageStart,
      pageEnd:       section.pageEnd,
      text:          section.text,
      chunkType,
      headingPath:   section.heading ? [...headingStack, section.heading] : headingStack,
      clinicalTerms,
      evidenceLevel,
      wordCount:     section.text.split(/\s+/).length,
    };

    return { ...partial, retrievalWeight: scoreRetrievalWeight(partial) };
  });
}

// ─── Retrieval-weighted ranking ───────────────────────────────────────────────
// When retrieving chunks for a clinical query, weight results by
// chunk type relevance — recommendations and drug protocols first.

export function rankChunksByRelevance(
  chunks: ClinicalChunk[],
  query:  string
): ClinicalChunk[] {

  const queryLower = query.toLowerCase();

  return chunks.map(chunk => {
    let score = chunk.retrievalWeight;

    // Boost if query terms overlap with extracted clinical terms
    const termOverlap = chunk.clinicalTerms.filter(t =>
      queryLower.includes(t.toLowerCase())
    ).length;
    score += termOverlap * 0.1;

    // Boost evidence-level chunks when query asks about guidelines
    if (/evidence|guideline/i.test(query) && chunk.evidenceLevel) {
      score += 0.15;
    }

    // Boost drug protocols for treatment queries
    if (/treat|medic|drug|dose|prescri/i.test(query) && chunk.chunkType === "drug_protocol") {
      score += 0.2;
    }

    // Boost diagnostic criteria for diagnostic queries
    if (/diagnos|criteria|score|test|sensitivity/i.test(query) && chunk.chunkType === "diagnostic_criteria") {
      score += 0.2;
    }

    return { ...chunk, retrievalWeight: Math.min(score, 1.0) };
  }).sort((a, b) => b.retrievalWeight - a.retrievalWeight);
}

// ─── Integration guide for clinicalDocumentIndexer.ts ────────────────────────
/*
 * Find the section that splits extracted PDF text into pages/chunks.
 *
 * BEFORE (page-based):
 *   const chunks = pdfText.split('\f')  // form feed = page break
 *     .map((page, i) => ({ text: page, page: i + 1 }));
 *
 * AFTER (semantic):
 *   import { chunkClinicalDocument } from "./clinicalDocumentChunker";
 *
 *   // Build page map from PDF extraction
 *   const pageMap = new Map<number, number>();
 *   let charOffset = 0;
 *   for (let i = 0; i < pages.length; i++) {
 *     pageMap.set(charOffset, i + 1);
 *     charOffset += pages[i].length;
 *   }
 *
 *   const chunks = await chunkClinicalDocument({
 *     documentId:       guidelineId,
 *     fullText:         pdfText,
 *     pageMap,
 *     headingStack:     [guidelineTitle],
 *     useSemanticCheck: true,  // set false for large docs to save API calls
 *   });
 *
 *   // Store chunks with type and retrieval weight
 *   for (const chunk of chunks) {
 *     await db.execute(sql`
 *       INSERT INTO guideline_chunks (
 *         chunk_id, document_id, page_start, page_end,
 *         text, chunk_type, heading_path, clinical_terms,
 *         evidence_level, word_count, retrieval_weight
 *       ) VALUES (
 *         ${chunk.chunkId}, ${chunk.documentId},
 *         ${chunk.pageStart}, ${chunk.pageEnd},
 *         ${chunk.text}, ${chunk.chunkType},
 *         ${JSON.stringify(chunk.headingPath)},
 *         ${JSON.stringify(chunk.clinicalTerms)},
 *         ${chunk.evidenceLevel ?? null},
 *         ${chunk.wordCount}, ${chunk.retrievalWeight}
 *       )
 *     `);
 *   }
 *
 * DATABASE MIGRATION (run once):
 *   ALTER TABLE guideline_chunks ADD COLUMN IF NOT EXISTS chunk_type text;
 *   ALTER TABLE guideline_chunks ADD COLUMN IF NOT EXISTS heading_path jsonb;
 *   ALTER TABLE guideline_chunks ADD COLUMN IF NOT EXISTS clinical_terms jsonb;
 *   ALTER TABLE guideline_chunks ADD COLUMN IF NOT EXISTS evidence_level text;
 *   ALTER TABLE guideline_chunks ADD COLUMN IF NOT EXISTS retrieval_weight numeric DEFAULT 0.5;
 *   CREATE INDEX IF NOT EXISTS idx_chunks_type ON guideline_chunks (chunk_type);
 *   CREATE INDEX IF NOT EXISTS idx_chunks_weight ON guideline_chunks (retrieval_weight DESC);
 */
