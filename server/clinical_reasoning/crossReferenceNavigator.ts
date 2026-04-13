/**
 * crossReferenceNavigator.ts — Clinical document cross-reference detection and resolution
 *
 * Article (PageIndex / Stop Chunking): "Cross-references vanish: When a document
 *  says 'Table 5.3 summarizes income and expenses; see Appendix G for detailed
 *  statistical tables,' a vector retriever has no mechanism to follow that reference.
 *  The answer is in Appendix G, but nothing there is semantically similar to the
 *  original question."
 *
 * Architecture file: "findReferences(text) — regex: 'see Appendix/Table/Figure/Algorithm'
 *  resolveReference(tree, ref) — find matching node in tree"
 *
 * Clinical translation:
 *   Medical guidelines are dense with cross-references. A sepsis protocol says
 *   "see Table 3 for antibiotic dosing." The dosing table is on a completely different
 *   page. Vector search ranks the summary paragraph (high similarity) over the actual
 *   table (low similarity but contains the answer). The cross-reference navigator
 *   reads the cue and follows it to the table.
 *
 * Reference types supported:
 *   Structural:  see Appendix X, see Section X.Y, see Table X, see Figure X, see Algorithm X
 *   Clinical:    refer to dosing table, per protocol, as described above, see below
 *   Regulatory:  per FDA guidance, see CFR 820, reference guideline X
 */

import type { DocNode } from "./pageIndexBuilder";

// ── Reference detection ───────────────────────────────────────────────────────

export interface DetectedReference {
  raw:       string;       // original matched string, e.g. "see Appendix G"
  type:      ReferenceType;
  target:    string;       // normalized target, e.g. "appendix g"
  position?: number;       // character offset in source text
}

export type ReferenceType =
  | "appendix"
  | "table"
  | "figure"
  | "algorithm"
  | "section"
  | "protocol"
  | "guideline"
  | "unknown";

// All patterns the article's system should detect
const REFERENCE_PATTERNS: Array<{ pattern: RegExp; type: ReferenceType }> = [
  { pattern: /see\s+Appendix\s+([A-Z0-9]+(?:\.[0-9]+)*)/gi,   type: "appendix"   },
  { pattern: /see\s+Table\s+([A-Z0-9]+(?:\.[0-9]+)*)/gi,      type: "table"      },
  { pattern: /see\s+Figure\s+([A-Z0-9]+(?:\.[0-9]+)*)/gi,     type: "figure"     },
  { pattern: /see\s+Algorithm\s+([A-Z0-9]+(?:\.[0-9]+)*)/gi,  type: "algorithm"  },
  { pattern: /see\s+Section\s+([0-9]+(?:\.[0-9]+)*)/gi,       type: "section"    },
  { pattern: /per\s+(?:Figure|Table|Algorithm)\s+([A-Z0-9]+(?:\.[0-9]+)*)/gi, type: "table" },
  { pattern: /refer\s+to\s+(Appendix|Table|Figure|Algorithm)\s+([A-Z0-9]+)/gi, type: "appendix" },
  { pattern: /\((?:see|cf\.)\s+(Appendix|Table|Figure|Section)\s+([A-Z0-9.]+)\)/gi, type: "unknown" },
  // Clinical-specific
  { pattern: /see\s+(?:dosing|drug|treatment)\s+table/gi,         type: "table"    },
  { pattern: /refer\s+to\s+(?:dosing|drug|treatment)\s+table/gi,  type: "table"    },
  { pattern: /per\s+(?:sepsis|ACLS|BLS|ATLS)\s+protocol/gi,      type: "protocol" },
  { pattern: /(?:per|see)\s+(?:UpToDate|CDC|NIH|AHA|ACC)\s+guideline/gi, type: "guideline" },
  // Positional references
  { pattern: /as\s+(?:described|shown|detailed)\s+(?:above|below)/gi, type: "unknown" },
];

export function findReferences(text: string): DetectedReference[] {
  const refs: DetectedReference[] = [];
  const seen = new Set<string>();

  for (const { pattern, type } of REFERENCE_PATTERNS) {
    const regex = new RegExp(pattern.source, "gi");
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const raw    = match[0];
      const target = raw.toLowerCase().replace(/^(?:see|per|refer to)\s+/i, "").trim();

      if (!seen.has(raw.toLowerCase())) {
        seen.add(raw.toLowerCase());
        refs.push({ raw, type, target, position: match.index });
      }
    }
  }

  return refs.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

// ── Reference resolution ──────────────────────────────────────────────────────

export interface ResolvedReference extends DetectedReference {
  resolvedNode?: DocNode;
  resolvedNodeId?: string;
  confidence: number;   // 0-1: how confident is the match
}

export function resolveReference(tree: DocNode[], ref: DetectedReference): ResolvedReference {
  const targetNorm = ref.target.toLowerCase();

  // Try exact match first
  for (const node of flattenTree(tree)) {
    const titleNorm = node.title.toLowerCase();
    if (titleNorm.includes(targetNorm) || targetNorm.includes(titleNorm.split(" ")[0])) {
      return { ...ref, resolvedNode: node, resolvedNodeId: node.node_id, confidence: 0.9 };
    }
  }

  // Try partial keyword match
  const keywords = targetNorm.split(/\s+/).filter((w) => w.length > 2);
  let bestNode: DocNode | undefined;
  let bestScore = 0;

  for (const node of flattenTree(tree)) {
    const titleNorm = node.title.toLowerCase();
    const matches = keywords.filter((k) => titleNorm.includes(k)).length;
    const score = matches / Math.max(keywords.length, 1);
    if (score > bestScore) { bestScore = score; bestNode = node; }
  }

  if (bestNode && bestScore > 0.3) {
    return { ...ref, resolvedNode: bestNode, resolvedNodeId: bestNode.node_id, confidence: bestScore };
  }

  return { ...ref, confidence: 0 };
}

// ── buildReferenceGraph ───────────────────────────────────────────────────────
// Maps every node's outgoing cross-references to their resolved targets

export interface ReferenceGraphEntry {
  fromNodeId:  string;
  fromTitle:   string;
  references:  ResolvedReference[];
}

export function buildReferenceGraph(tree: DocNode[]): ReferenceGraphEntry[] {
  const graph: ReferenceGraphEntry[] = [];

  for (const node of flattenTree(tree)) {
    if (!node.content) continue;
    const raw  = findReferences(node.content);
    const resolved = raw.map((r) => resolveReference(tree, r));
    if (resolved.length > 0) {
      graph.push({ fromNodeId: node.node_id, fromTitle: node.title, references: resolved });
    }
  }

  return graph;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

export function flattenTree(nodes: DocNode[]): DocNode[] {
  const result: DocNode[] = [];
  function walk(ns: DocNode[]) {
    for (const n of ns) {
      result.push(n);
      if (n.children.length > 0) walk(n.children);
    }
  }
  walk(nodes);
  return result;
}
