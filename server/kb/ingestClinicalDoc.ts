/**
 * ingestClinicalDoc.ts — KB ingestion via PageIndex tree
 *
 * Architecture file (System Upgrade):
 *   "KB Ingestion Pipeline (Auto → Tree → DB):
 *    OLD: KB ingestion → embeddings → vector DB
 *    NEW: KB ingestion → PageIndex tree → reasoning retrieval"
 *
 *   "ingestClinicalDoc(pdfPath, title):
 *    1. builder.buildTreeFromPDF(path)
 *    2. db.insert(clinical_documents)
 *    3. for each node: db.insert(document_nodes)
 *    4. return doc[0].id"
 *
 * Integration points (architecture):
 *   Module         → Upgrade
 *   Knowledge Base → Tree-based indexing (replaces embedding ingestion)
 *   Golden Cases   → Cross-ref aware generation (tree knows section hierarchy)
 *   RLHF Trainer   → Better ground truth (deterministic source attribution)
 *   FDA Validation → Traceable reasoning chain (node → page → source)
 *   Control Tower  → Document reasoning panel (query log + cross-ref traces)
 *
 * Auralyn KB integration:
 *   The existing `guideline_documents` table stores raw clinical guidelines.
 *   This module builds a PageIndex tree from each guideline's content and
 *   stores the tree nodes in `clinical_doc_nodes` for reasoning retrieval.
 *   Existing vector/embedding pipeline continues to run in parallel — this
 *   is additive, not a replacement of the existing RAG system.
 */

import { db } from "../db";
import { guidelineDocuments } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { PageIndexBuilder } from "../clinical_reasoning/pageIndexBuilder";
import { getClinicalDocEngine } from "../clinical_reasoning/clinicalDocEngine";

const _builder = new PageIndexBuilder();
const _engine  = getClinicalDocEngine();

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IngestionResult {
  documentId: number;
  title:      string;
  nodeCount:  number;
  status:     "indexed" | "error";
  error?:     string;
}

// ── ingestClinicalDoc ─────────────────────────────────────────────────────────
// Primary entry point: ingest a raw text document into the PageIndex tree

export async function ingestClinicalDoc(
  content: string,
  title:   string,
): Promise<IngestionResult> {
  try {
    // 1. Store the raw document in guideline_documents (or find existing)
    let docId: number;

    const existing = await db.select()
      .from(guidelineDocuments)
      .where(eq(guidelineDocuments.title, title))
      .limit(1);

    if (existing.length > 0) {
      docId = existing[0].id;
    } else {
      const [inserted] = await db.insert(guidelineDocuments).values({
        title,
        content,
        source: "page_index_ingestion",
        status: "processed",
      }).returning({ id: guidelineDocuments.id });
      docId = inserted.id;
    }

    // 2. Build tree and persist nodes
    const result = await _engine.indexDocument(content, title, docId);

    return {
      documentId: docId,
      title,
      nodeCount:  result.nodeCount,
      status:     "indexed",
    };
  } catch (err) {
    return {
      documentId: -1,
      title,
      nodeCount:  0,
      status:     "error",
      error:      String(err),
    };
  }
}

// ── ingestAllGuidelineDocuments ───────────────────────────────────────────────
// Bulk index existing guideline_documents into the PageIndex tree

export async function ingestAllGuidelineDocuments(): Promise<IngestionResult[]> {
  const docs = await db.select().from(guidelineDocuments)
    .orderBy(desc(guidelineDocuments.createdAt))
    .limit(100);

  const results: IngestionResult[] = [];

  for (const doc of docs) {
    if (!doc.content) continue;
    const r = await _engine.indexDocument(doc.content, doc.title ?? `doc_${doc.id}`, doc.id);
    results.push({ documentId: doc.id, title: doc.title ?? "", nodeCount: r.nodeCount, status: "indexed" });
  }

  return results;
}

// ── ingestFromText (no DB write) ─────────────────────────────────────────────
// For testing or ephemeral indexing where no DB persistence is needed

export function ingestFromText(content: string, docId = "ephemeral") {
  return _engine.indexFromText(content, docId);
}
