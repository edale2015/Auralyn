/**
 * pageIndexBuilder.ts — Hierarchical tree construction from clinical documents
 *
 * Article (Stop Chunking, Start Reasoning):
 *   "PageIndex parses a PDF and generates a JSON tree — a machine-readable table
 *    of contents with summaries, page ranges, and nested sub-sections. Each node_id
 *    maps directly to raw content: text, images, or tables from the corresponding pages.
 *    The tree preserves the document's natural hierarchy instead of shredding it into
 *    512-token fragments."
 *
 * Architecture file: "DocNode — node_id, title, start_page, end_page, summary,
 *  children, content. buildTreeFromPDF(path) — parse PDF, detect section titles,
 *  build hierarchical tree"
 *
 * Why this beats chunking (article's five failure modes):
 *   1. Query-knowledge space mismatch: tree gives the LLM a structured map so it
 *      can reason "debt trends → Long-Term Obligations section" not just find
 *      the most similar words
 *   2. Similarity ≠ relevance: tree navigation is reasoning-based, not cosine-based
 *   3. Hard chunking breaks context: tree nodes preserve full sections
 *   4. No conversation memory: tree structure is persistent and reusable
 *   5. Cross-references vanish: crossReferenceNavigator follows them through the tree
 *
 * Clinical adaptation:
 *   Medical guideline section detection goes beyond generic title patterns.
 *   Clinical documents have predictable header patterns: numbered sections (1., 1.1),
 *   ALL-CAPS section names, evidence levels (A, B, C), and domain markers
 *   (DIAGNOSIS, TREATMENT, CONTRAINDICATIONS, WARNINGS, etc.)
 *
 * PageIndex's "in-context index" concept:
 *   The tree is pure JSON that lives in the LLM's context window. The LLM navigates
 *   it directly during inference — no vector database, no similarity search.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DocNode {
  node_id:    string;
  title:      string;
  start_page: number;
  end_page:   number;
  summary:    string;
  children:   DocNode[];
  content?:   string;
  depth:      number;     // nesting level: 0 = top, 1 = subsection, 2 = sub-sub
  metadata?:  {
    evidenceLevel?: string;   // A/B/C, Grade I/II/III
    sectionType?:  string;    // diagnosis, treatment, contraindication, etc.
    wordCount?:    number;
  };
}

export interface PageIndex {
  documentId:   string;
  title:        string;
  totalPages:   number;
  nodeCount:    number;
  nodes:        DocNode[];
  builtAt:      Date;
}

// ── Clinical section patterns ─────────────────────────────────────────────────

// Medical guidelines have highly predictable section headers
const CLINICAL_SECTION_PATTERNS: RegExp[] = [
  /^[0-9]+(?:\.[0-9]+)*\s+[A-Z]/,                    // 1. DIAGNOSIS / 1.2 Treatment
  /^[A-Z][A-Z\s\-:]{4,}$/,                            // ALL CAPS TITLE
  /^(?:DIAGNOSIS|TREATMENT|MANAGEMENT|ASSESSMENT|EVALUATION|MONITORING|FOLLOW-UP)/i,
  /^(?:CONTRAINDICATION|WARNING|CAUTION|NOTE|RECOMMENDATION)/i,
  /^(?:DEFINITION|INTRODUCTION|BACKGROUND|EPIDEMIOLOGY|PATHOPHYSIOLOGY)/i,
  /^(?:CLINICAL|LABORATORY|IMAGING|CRITERIA|CLASSIFICATION)/i,
  /^(?:DOSING|DOSAGE|ADMINISTRATION|PHARMACOLOGY)/i,
  /^(?:COMPLICATIONS|PROGNOSIS|OUTCOMES|EVIDENCE|REFERENCES)/i,
  /^[A-Z][A-Za-z\s\-]{5,}(?:Protocol|Algorithm|Criteria|Scale|Score)/,
  /^(?:Hour-1|Hour 1|6-Hour|Sepsis|SIRS|NEWS|qSOFA)/i,
];

const EVIDENCE_LEVEL_PATTERN = /\b(?:Grade\s+[A-C]|Level\s+[I]{1,3}[V]?|Evidence\s+Level\s+[A-C]|Recommendation\s+[A-C])\b/gi;

function detectSectionType(title: string): string {
  const t = title.toLowerCase();
  if (/diagno/i.test(t))      return "diagnosis";
  if (/treatment|therapy|management/i.test(t)) return "treatment";
  if (/contrain|warning|caution/i.test(t)) return "contraindication";
  if (/dosing|dosage|administration/i.test(t)) return "dosing";
  if (/criteria|classification/i.test(t)) return "criteria";
  if (/monitoring|follow/i.test(t)) return "monitoring";
  if (/evidence|reference/i.test(t)) return "evidence";
  if (/introduction|background|overview/i.test(t)) return "background";
  return "general";
}

// ── PageIndexBuilder ──────────────────────────────────────────────────────────

export class PageIndexBuilder {
  private nodeSeq = 0;

  private nextId(): string {
    return `node_${String(this.nodeSeq++).padStart(4, "0")}`;
  }

  // ── Build tree from raw text ────────────────────────────────────────────────

  buildTreeFromText(text: string, documentId = "doc_0"): PageIndex {
    this.nodeSeq = 0;
    const paragraphs = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
    const nodes      = this.buildNodes(paragraphs);

    return {
      documentId,
      title:      this.inferDocumentTitle(paragraphs),
      totalPages: Math.max(...nodes.map((n) => n.end_page), 0) + 1,
      nodeCount:  this.countNodes(nodes),
      nodes,
      builtAt:    new Date(),
    };
  }

  // ── Build nodes from paragraphs ─────────────────────────────────────────────

  private buildNodes(paragraphs: string[]): DocNode[] {
    const topLevel: DocNode[] = [];
    let current: DocNode | null = null;
    let subCurrent: DocNode | null = null;
    let pageIndex = 0;

    for (const para of paragraphs) {
      const level = this.detectHeadingLevel(para);

      if (level === 1) {
        // Top-level section
        if (current) {
          if (subCurrent) { current.children.push(subCurrent); subCurrent = null; }
          topLevel.push(current);
        }
        current = this.makeNode(para, pageIndex, level);
        subCurrent = null;
        pageIndex++;
      } else if (level === 2 && current) {
        // Sub-section
        if (subCurrent) current.children.push(subCurrent);
        subCurrent = this.makeNode(para, pageIndex, level);
        pageIndex++;
      } else if (current) {
        // Content paragraph
        const target = subCurrent ?? current;
        target.content  = ((target.content ?? "") + "\n" + para).trim();
        target.end_page = pageIndex;
        if (!target.summary) target.summary = para.slice(0, 200).replace(/\n/g, " ");
        pageIndex++;
      }
    }

    if (subCurrent && current) current.children.push(subCurrent);
    if (current) topLevel.push(current);

    return topLevel;
  }

  private detectHeadingLevel(text: string): 0 | 1 | 2 {
    const firstLine = text.split("\n")[0].trim();

    // Numbered top-level: "1. ", "2. ", "I. ", "A. "
    if (/^[0-9]+\.\s+[A-Z]/.test(firstLine) || /^[IVX]+\.\s+[A-Z]/.test(firstLine)) return 1;

    // Numbered sub-level: "1.1 ", "1.2.3 "
    if (/^[0-9]+\.[0-9]+/.test(firstLine)) return 2;

    // ALL CAPS headers (≥ 4 chars)
    if (/^[A-Z][A-Z\s\-:]{4,}$/.test(firstLine) && firstLine.length < 60) return 1;

    // Clinical section markers
    for (const pattern of CLINICAL_SECTION_PATTERNS) {
      if (pattern.test(firstLine) && firstLine.length < 80) return 1;
    }

    // Title case heading with no period and ≤ 60 chars
    if (/^[A-Z][a-z]/.test(firstLine) && firstLine.length < 60 && !/\.$/.test(firstLine) && !/[,:;]/.test(firstLine)) return 1;

    return 0;
  }

  private makeNode(content: string, pageIndex: number, depth: number): DocNode {
    const firstLine = content.split("\n")[0].trim();
    const title     = firstLine.slice(0, 100);
    const body      = content.split("\n").slice(1).join("\n").trim();
    const evLevel   = (content.match(EVIDENCE_LEVEL_PATTERN) ?? [])[0];

    return {
      node_id:    this.nextId(),
      title,
      start_page: pageIndex,
      end_page:   pageIndex,
      summary:    body.slice(0, 200).replace(/\n/g, " ") || title,
      children:   [],
      content:    body || content,
      depth,
      metadata: {
        sectionType:  detectSectionType(title),
        evidenceLevel: evLevel,
        wordCount:    content.split(/\s+/).length,
      },
    };
  }

  private inferDocumentTitle(paragraphs: string[]): string {
    for (const p of paragraphs.slice(0, 5)) {
      const line = p.split("\n")[0].trim();
      if (line.length > 5 && line.length < 120) return line;
    }
    return "Clinical Document";
  }

  private countNodes(nodes: DocNode[]): number {
    return nodes.reduce((s, n) => s + 1 + this.countNodes(n.children), 0);
  }

  // ── Utility: flatten to searchable list ────────────────────────────────────

  static flatten(nodes: DocNode[]): DocNode[] {
    const result: DocNode[] = [];
    const walk = (ns: DocNode[]) => { for (const n of ns) { result.push(n); walk(n.children); } };
    walk(nodes);
    return result;
  }

  // ── Summary generation (lightweight, no AI) ────────────────────────────────

  generateTreeSummary(index: PageIndex): string {
    const lines = [`Document: ${index.title}`, `Nodes: ${index.nodeCount}`, ""];
    for (const node of index.nodes) {
      lines.push(`[${node.node_id}] ${node.title} (${node.metadata?.sectionType ?? "general"})`);
      for (const child of node.children) {
        lines.push(`  [${child.node_id}] ${child.title}`);
      }
    }
    return lines.join("\n");
  }
}
