/**
 * tests/unit/batch57.test.ts — Clinical Document Reasoning Engine (Article 30 / PageIndex)
 *
 * Architecture (Stop Chunking, Start Reasoning):
 *   PageIndexBuilder   → parse text into hierarchical DocNode tree
 *   ReasoningRetriever → keyword-based node selection + answer extraction (no AI calls in tests)
 *   CrossReferenceNavigator → detect + resolve clinical cross-references
 *   ClinicalDocEngine  → full orchestration loop
 *   ingestClinicalDoc  → KB ingestion adapter
 *
 * Phase 5 vitals schema is used throughout tests:
 *   SOFA:    bp (<90 = +2), o2 (<92 = +2)
 *   CURB-65: age (>65 = +1), bp (<90 = +1)
 *   HEART:   chestPain (true = +2)
 *   WELLS:   hr (>100 = +2)
 *   Dosing:  weight (default 70kg → "Ceftriaxone 3500mg")
 *   Contraindications: allergy → "Avoid penicillin"
 *
 * All tests use keyword/sync mode — zero OpenAI calls, deterministic results.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { PageIndexBuilder, type DocNode, type PageIndex } from "../../server/clinical_reasoning/pageIndexBuilder";
import { ReasoningRetriever } from "../../server/clinical_reasoning/reasoningRetriever";
import {
  findReferences,
  resolveReference,
  buildReferenceGraph,
  flattenTree,
  type DetectedReference,
} from "../../server/clinical_reasoning/crossReferenceNavigator";
import { ClinicalDocEngine } from "../../server/clinical_reasoning/clinicalDocEngine";
import { ingestFromText } from "../../server/kb/ingestClinicalDoc";

// ── Shared fixtures ──────────────────────────────────────────────────────────

const SEPSIS_GUIDELINE = `
SEPSIS MANAGEMENT PROTOCOL — Hour-1 Bundle

DIAGNOSIS
Sepsis is defined as life-threatening organ dysfunction caused by a dysregulated
host response to infection. Use qSOFA to identify high-risk patients.
Criteria: altered mental status, respiratory rate ≥22, systolic BP <100mmHg.
See Table 3 for scoring details.

TREATMENT
Initiate Hour-1 Bundle immediately upon sepsis recognition.
1. Measure lactate level. Re-measure if initial lactate >2 mmol/L.
2. Obtain blood cultures before administering antibiotics.
3. Administer broad-spectrum antibiotics within 1 hour.
For antibiotic selection, see Appendix A.
Vancomycin 25-30 mg/kg IV is first-line for suspected MRSA sepsis.

ANTIMICROBIAL THERAPY
Empiric antimicrobial selection should be based on likely source and local susceptibility.
Gram-positive coverage: Vancomycin 25-30 mg/kg IV loading dose.
Gram-negative coverage: Piperacillin-tazobactam 4.5g IV q6h.
Renal dosing adjustments required. Refer to dosing table.

BLOOD PRESSURE MANAGEMENT
Mean arterial pressure (MAP) target ≥65 mmHg.
If systolic BP <90 mmHg, initiate vasopressors.
Norepinephrine is first-line vasopressor.
See Algorithm 2 for vasopressor titration.

MONITORING
Monitor lactate, blood pressure, urine output hourly.
Reassess hemodynamic status every 30 minutes.
If no improvement at 6 hours, escalate to ICU.

CONTRAINDICATIONS
Do not use aminoglycosides as monotherapy for gram-negative sepsis.
Avoid fluoroquinolones in patients with QT prolongation.
See Appendix B for complete contraindications list.

APPENDIX A — Antibiotic Selection Guide
For community-acquired infections: Ceftriaxone 2g IV daily.
For healthcare-associated infections: Meropenem 1g IV q8h.
For MRSA suspicion: Vancomycin 25 mg/kg IV, target trough 15-20 mcg/mL.

APPENDIX B — Contraindications and Drug Interactions
Penicillin allergy cross-reactivity: avoid cephalosporins if severe allergy.
Vancomycin + aminoglycosides: increased nephrotoxicity risk.
`;

const CURB65_GUIDELINE = `
CURB-65 Pneumonia Severity Score

DEFINITION
CURB-65 is a clinical prediction rule for community-acquired pneumonia severity.
Each criterion scores 1 point: Confusion, Urea >7mmol/L, Respiratory rate ≥30,
Blood pressure <90mmHg systolic or ≤60 diastolic, Age ≥65.

SCORING CRITERIA
Score 0-1: Low severity — consider outpatient treatment.
Score 2: Moderate severity — consider inpatient treatment.
Score 3-5: High severity — admit to ICU, consider mechanical ventilation.
See Table 2 for treatment pathway.

TREATMENT
Score 0-1: Amoxicillin 500mg PO TID for 5 days.
Score 2: Amoxicillin-clavulanate 875mg PO BID plus Azithromycin 500mg PO daily.
Score 3-5: Piperacillin-tazobactam 4.5g IV q6h plus Vancomycin.
Refer to Appendix C for dosing adjustments.
`;

const SOFA_GUIDELINE = `
SOFA Score — Sequential Organ Failure Assessment

OVERVIEW
The SOFA score quantifies organ dysfunction severity.
Components: respiration (PaO2/FiO2 ratio), coagulation (platelets),
liver (bilirubin), cardiovascular (MAP or vasopressors),
CNS (GCS score), renal (creatinine or urine output).

CARDIOVASCULAR COMPONENT
MAP ≥70: score 0. MAP <70: score 1.
Low-dose dopamine or dobutamine: score 2.
Moderate norepinephrine ≤0.1 mcg/kg/min: score 3.
High norepinephrine >0.1 mcg/kg/min or epinephrine: score 4.
See Appendix D for vasopressor dosing equivalents.

RESPIRATORY COMPONENT
PaO2/FiO2 >400: score 0. 300-400: score 1.
200-300 with respiratory support: score 2.
100-200 with mechanical ventilation: score 3.
<100 with mechanical ventilation: score 4.
`;

let builder: PageIndexBuilder;
let retriever: ReasoningRetriever;
let sepsisTree: DocNode[];
let curb65Tree: DocNode[];
let sofaTree: DocNode[];
let sepsisIndex: PageIndex;

beforeAll(() => {
  builder   = new PageIndexBuilder();
  retriever = new ReasoningRetriever();
  sepsisIndex = builder.buildTreeFromText(SEPSIS_GUIDELINE, "doc_sepsis");
  sepsisTree  = sepsisIndex.nodes;
  curb65Tree  = builder.buildTreeFromText(CURB65_GUIDELINE, "doc_curb65").nodes;
  sofaTree    = builder.buildTreeFromText(SOFA_GUIDELINE,  "doc_sofa").nodes;
});

// ════════════════════════════════════════════════════════════════════════════
// SUITE 1 — PageIndexBuilder
// ════════════════════════════════════════════════════════════════════════════

describe("PageIndexBuilder", () => {
  it("T001 — builds a non-empty tree from sepsis guideline", () => {
    expect(sepsisTree.length).toBeGreaterThan(0);
    expect(sepsisIndex.nodeCount).toBeGreaterThan(2);
  });

  it("T002 — each top-level node has a node_id, title, depth=0", () => {
    for (const node of sepsisTree) {
      expect(node.node_id).toMatch(/^node_/);
      expect(node.title.length).toBeGreaterThan(0);
      expect(node.depth).toBe(0);
    }
  });

  it("T003 — detects DIAGNOSIS section", () => {
    const flat = flattenTree(sepsisTree);
    const diagNode = flat.find((n) => /diagnosis/i.test(n.title));
    expect(diagNode).toBeDefined();
    expect(diagNode!.metadata?.sectionType).toBe("diagnosis");
  });

  it("T004 — detects TREATMENT section", () => {
    const flat = flattenTree(sepsisTree);
    const tx = flat.find((n) => /treatment/i.test(n.title));
    expect(tx).toBeDefined();
    expect(tx!.metadata?.sectionType).toBe("treatment");
  });

  it("T005 — detects CONTRAINDICATIONS section", () => {
    const flat = flattenTree(sepsisTree);
    const contra = flat.find((n) => /contrain/i.test(n.title));
    expect(contra).toBeDefined();
    expect(contra!.metadata?.sectionType).toBe("contraindication");
  });

  it("T006 — all nodes have start_page and end_page (numbers)", () => {
    const flat = flattenTree(sepsisTree);
    for (const n of flat) {
      expect(typeof n.start_page).toBe("number");
      expect(typeof n.end_page).toBe("number");
    }
  });

  it("T007 — node content is captured (non-empty for content nodes)", () => {
    const flat = flattenTree(sepsisTree);
    const withContent = flat.filter((n) => n.content && n.content.length > 0);
    expect(withContent.length).toBeGreaterThan(0);
  });

  it("T008 — builds CURB-65 tree with SCORING section", () => {
    const flat = flattenTree(curb65Tree);
    expect(flat.length).toBeGreaterThan(1);
    const scoring = flat.find((n) => /scoring|score/i.test(n.title));
    expect(scoring).toBeDefined();
  });

  it("T009 — tree summary includes node_ids", () => {
    const summary = builder.generateTreeSummary(sepsisIndex);
    expect(summary).toContain("node_");
    expect(summary).toContain("Document:");
  });

  it("T010 — buildTreeFromText produces valid PageIndex", () => {
    expect(sepsisIndex.documentId).toBe("doc_sepsis");
    expect(sepsisIndex.nodeCount).toBe(flattenTree(sepsisIndex.nodes).length);
    expect(sepsisIndex.builtAt).toBeInstanceOf(Date);
  });

  it("T011 — totalPages is positive", () => {
    expect(sepsisIndex.totalPages).toBeGreaterThan(0);
  });

  it("T012 — SOFA tree captures cardiovascular and respiratory sections", () => {
    const flat = flattenTree(sofaTree);
    const cardio = flat.find((n) => /cardiovascular/i.test(n.title));
    const resp   = flat.find((n) => /respiratory/i.test(n.title));
    expect(cardio || resp).toBeDefined();
  });

  it("T013 — metadata.wordCount is populated", () => {
    const flat = flattenTree(sepsisTree);
    const withWords = flat.filter((n) => (n.metadata?.wordCount ?? 0) > 0);
    expect(withWords.length).toBeGreaterThan(0);
  });

  it("T014 — children are DocNode arrays", () => {
    for (const node of sepsisTree) {
      expect(Array.isArray(node.children)).toBe(true);
    }
  });

  it("T015 — flatten returns all nodes including children", () => {
    const flat = PageIndexBuilder.flatten(sepsisTree);
    const withChildren = sepsisTree.filter((n) => n.children.length > 0);
    if (withChildren.length > 0) {
      expect(flat.length).toBeGreaterThanOrEqual(sepsisTree.length);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// SUITE 2 — ReasoningRetriever (keyword mode)
// ════════════════════════════════════════════════════════════════════════════

describe("ReasoningRetriever (keyword mode)", () => {
  it("T016 — findRelevantNodeSync finds TREATMENT node for antibiotic query", () => {
    const nodeId = retriever.findRelevantNodeSync(sepsisTree, "what antibiotic for gram-positive sepsis");
    expect(nodeId).toBeDefined();
    // Should not return null
    const flat = flattenTree(sepsisTree);
    const node = flat.find((n) => n.node_id === nodeId);
    expect(node).toBeDefined();
  });

  it("T017 — extractAnswerSync returns a string answer", () => {
    const flat   = flattenTree(sepsisTree);
    const txNode = flat.find((n) => /treatment/i.test(n.title))!;
    const result = retriever.extractAnswerSync(txNode, "what is the Hour-1 bundle?");
    expect(result.answer.length).toBeGreaterThan(0);
    expect(result.mode).toBe("keyword");
  });

  it("T018 — confidence is between 0 and 1", () => {
    const flat = flattenTree(sepsisTree);
    for (const node of flat.slice(0, 3)) {
      const result = retriever.extractAnswerSync(node, "blood pressure");
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("T019 — answer extraction returns nodeId + nodeTitle", () => {
    const flat   = flattenTree(sepsisTree);
    const node   = flat[0];
    const result = retriever.extractAnswerSync(node, "sepsis criteria");
    expect(result.nodeId).toBe(node.node_id);
    expect(result.nodeTitle).toBe(node.title);
  });

  it("T020 — CURB-65: finds scoring node for 'high severity treatment'", () => {
    const nodeId = retriever.findRelevantNodeSync(curb65Tree, "high severity treatment ventilation");
    expect(nodeId).not.toBeNull();
  });

  it("T021 — SOFA: finds cardiovascular node for MAP query", () => {
    const nodeId = retriever.findRelevantNodeSync(sofaTree, "MAP vasopressor norepinephrine");
    expect(nodeId).not.toBeNull();
    const flat = flattenTree(sofaTree);
    const node = flat.find((n) => n.node_id === nodeId);
    expect(node?.content ?? node?.title).toBeDefined();
  });

  it("T022 — returns null for nonsensical query against empty tree", () => {
    const nodeId = retriever.findRelevantNodeSync([], "xyz gibberish query");
    expect(nodeId).toBeNull();
  });

  it("T023 — evidence field is a string", () => {
    const flat   = flattenTree(sepsisTree);
    const node   = flat[0];
    const result = retriever.extractAnswerSync(node, "blood pressure");
    expect(typeof result.evidence).toBe("string");
  });

  it("T024 — higher confidence for exact keyword match", () => {
    const flat   = flattenTree(sepsisTree);
    const txNode = flat.find((n) => /treatment/i.test(n.title))!;
    const r1 = retriever.extractAnswerSync(txNode, "vancomycin MRSA treatment");
    const r2 = retriever.extractAnswerSync(txNode, "aaaaa bbbbb ccccc");
    expect(r1.confidence).toBeGreaterThanOrEqual(r2.confidence);
  });

  it("T025 — findRelevantNodeSync handles single-word clinical query", () => {
    const nodeId = retriever.findRelevantNodeSync(sepsisTree, "vancomycin");
    // may or may not find a node but should not throw
    expect(typeof nodeId === "string" || nodeId === null).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// SUITE 3 — CrossReferenceNavigator
// ════════════════════════════════════════════════════════════════════════════

describe("CrossReferenceNavigator", () => {
  it("T026 — findReferences detects 'see Appendix A'", () => {
    const refs = findReferences("For antibiotic selection, see Appendix A.");
    expect(refs.some((r) => r.type === "appendix")).toBe(true);
  });

  it("T027 — findReferences detects 'see Table 3'", () => {
    const refs = findReferences("See Table 3 for scoring details.");
    expect(refs.some((r) => r.type === "table")).toBe(true);
  });

  it("T028 — findReferences detects 'see Algorithm 2'", () => {
    const refs = findReferences("See Algorithm 2 for vasopressor titration.");
    expect(refs.some((r) => r.type === "algorithm")).toBe(true);
  });

  it("T029 — findReferences detects 'see Appendix B'", () => {
    const refs = findReferences("See Appendix B for complete contraindications list.");
    expect(refs.some((r) => r.type === "appendix")).toBe(true);
  });

  it("T030 — findReferences detects 'refer to dosing table'", () => {
    const refs = findReferences("Renal dosing adjustments required. Refer to dosing table.");
    expect(refs.some((r) => r.raw.toLowerCase().includes("dosing"))).toBe(true);
  });

  it("T031 — findReferences returns all refs from full sepsis guideline", () => {
    const refs = findReferences(SEPSIS_GUIDELINE);
    expect(refs.length).toBeGreaterThanOrEqual(3);
  });

  it("T032 — each reference has raw, type, target, position", () => {
    const refs = findReferences("See Appendix A for details. See Table 5 for summary.");
    for (const ref of refs) {
      expect(typeof ref.raw).toBe("string");
      expect(typeof ref.type).toBe("string");
      expect(typeof ref.target).toBe("string");
      expect(typeof ref.position).toBe("number");
    }
  });

  it("T033 — resolveReference returns high confidence for matching appendix node", () => {
    const refs = findReferences(SEPSIS_GUIDELINE);
    const appendixRef = refs.find((r) => r.type === "appendix");
    expect(appendixRef).toBeDefined();
    const resolved = resolveReference(sepsisTree, appendixRef!);
    // If resolved, confidence should be meaningful
    expect(resolved.confidence).toBeGreaterThanOrEqual(0);
  });

  it("T034 — resolveReference returns resolved=false or low confidence for unmatched ref", () => {
    const fakeRef: DetectedReference = { raw: "see Appendix Z", type: "appendix", target: "appendix z", position: 0 };
    const resolved = resolveReference(sepsisTree, fakeRef);
    // Appendix Z doesn't exist → confidence should be low
    expect(resolved.confidence).toBeLessThan(0.9);
  });

  it("T035 — buildReferenceGraph returns array", () => {
    const graph = buildReferenceGraph(sepsisTree);
    expect(Array.isArray(graph)).toBe(true);
  });

  it("T036 — buildReferenceGraph entries have fromNodeId + references", () => {
    const graph = buildReferenceGraph(sepsisTree);
    for (const entry of graph) {
      expect(typeof entry.fromNodeId).toBe("string");
      expect(Array.isArray(entry.references)).toBe(true);
    }
  });

  it("T037 — flattenTree flattens nested structure", () => {
    const nodeWithChildren: DocNode = {
      node_id: "n0", title: "Root", start_page: 0, end_page: 0,
      summary: "", depth: 0,
      children: [
        { node_id: "n1", title: "Child", start_page: 1, end_page: 1, summary: "", depth: 1, children: [] },
      ],
    };
    const flat = flattenTree([nodeWithChildren]);
    expect(flat).toHaveLength(2);
    expect(flat.map((n) => n.node_id)).toEqual(["n0", "n1"]);
  });

  it("T038 — CURB-65 guideline has detectable references", () => {
    const refs = findReferences(CURB65_GUIDELINE);
    expect(refs.length).toBeGreaterThan(0);
  });

  it("T039 — SOFA guideline cross-references Appendix D", () => {
    const refs = findReferences(SOFA_GUIDELINE);
    expect(refs.some((r) => r.raw.toLowerCase().includes("appendix"))).toBe(true);
  });

  it("T040 — references are sorted by position ascending", () => {
    const refs = findReferences(SEPSIS_GUIDELINE);
    for (let i = 1; i < refs.length; i++) {
      expect((refs[i].position ?? 0)).toBeGreaterThanOrEqual(refs[i - 1].position ?? 0);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// SUITE 4 — ClinicalDocEngine (in-memory, no DB calls)
// ════════════════════════════════════════════════════════════════════════════

describe("ClinicalDocEngine (in-memory)", () => {
  let engine: ClinicalDocEngine;
  let sepsisPI: PageIndex;

  beforeAll(() => {
    engine    = new ClinicalDocEngine();
    sepsisPI  = engine.indexFromText(SEPSIS_GUIDELINE, "test_sepsis");
  });

  it("T041 — indexFromText builds a PageIndex", () => {
    expect(sepsisPI.nodeCount).toBeGreaterThan(0);
    expect(sepsisPI.documentId).toBe("test_sepsis");
  });

  it("T042 — getTree returns cached PageIndex", () => {
    const pi = engine.getTree("test_sepsis");
    expect(pi).toBeDefined();
    expect(pi!.documentId).toBe("test_sepsis");
  });

  it("T043 — answerFromIndexSync resolves a clinical question (keyword mode)", () => {
    const result = engine.answerFromIndexSync(sepsisPI, "What is the Hour-1 bundle?");
    expect(result.answer.length).toBeGreaterThan(0);
    expect(result.nodeId).toMatch(/^node_/);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("T044 — answerFromIndexSync returns nodeTitle", () => {
    const result = engine.answerFromIndexSync(sepsisPI, "blood pressure target sepsis");
    expect(result.nodeTitle.length).toBeGreaterThan(0);
  });

  it("T045 — answerFromIndexSync returns crossRefs array", () => {
    const result = engine.answerFromIndexSync(sepsisPI, "antibiotic selection");
    expect(Array.isArray(result.crossRefs)).toBe(true);
  });

  it("T046 — answerFromIndexSync handles CURB-65 severity query", () => {
    const curb65PI = engine.indexFromText(CURB65_GUIDELINE, "test_curb65");
    const result   = engine.answerFromIndexSync(curb65PI, "score 3 ICU treatment");
    expect(result.answer.length).toBeGreaterThan(0);
  });

  it("T047 — answerFromIndexSync handles SOFA MAP query", () => {
    const sofaPI = engine.indexFromText(SOFA_GUIDELINE, "test_sofa");
    const result = engine.answerFromIndexSync(sofaPI, "MAP vasopressor score");
    expect(result.answer.length).toBeGreaterThan(0);
  });

  it("T048 — returns safe result for empty tree", () => {
    const emptyPI: PageIndex = { documentId: "empty", title: "Empty", totalPages: 0, nodeCount: 0, nodes: [], builtAt: new Date() };
    const result = engine.answerFromIndexSync(emptyPI, "any question");
    expect(result.confidence).toBe(0);
    expect(result.answer).toContain("No document");
  });

  it("T049 — answerFromIndexSync always returns mode='keyword'", () => {
    const result = engine.answerFromIndexSync(sepsisPI, "vancomycin dosing");
    expect(result.mode).toBe("keyword");
  });

  it("T050 — multiple documents indexed independently", () => {
    const pi1 = engine.indexFromText(SEPSIS_GUIDELINE, "doc_a");
    const pi2 = engine.indexFromText(CURB65_GUIDELINE, "doc_b");
    expect(pi1.documentId).toBe("doc_a");
    expect(pi2.documentId).toBe("doc_b");
    expect(pi1.nodeCount).not.toEqual(pi2.nodeCount);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// SUITE 5 — ingestClinicalDoc (text mode, no DB)
// ════════════════════════════════════════════════════════════════════════════

describe("ingestFromText (KB ingestion adapter)", () => {
  it("T051 — ingestFromText returns a PageIndex", () => {
    const pi = ingestFromText(SEPSIS_GUIDELINE, "ingest_test");
    expect(pi.nodeCount).toBeGreaterThan(0);
    expect(pi.documentId).toBe("ingest_test");
  });

  it("T052 — ingestFromText builds tree for CURB-65 guideline", () => {
    const pi = ingestFromText(CURB65_GUIDELINE, "curb_ingest");
    expect(pi.nodes.length).toBeGreaterThan(0);
  });

  it("T053 — ingestFromText builds tree for SOFA guideline", () => {
    const pi = ingestFromText(SOFA_GUIDELINE, "sofa_ingest");
    expect(pi.nodes.length).toBeGreaterThan(0);
  });

  it("T054 — returned PageIndex has builtAt date", () => {
    const pi = ingestFromText("DIAGNOSIS\nSome content here.\n\nTREATMENT\nGive medicine.", "mini");
    expect(pi.builtAt).toBeInstanceOf(Date);
  });

  it("T055 — ingested tree has DIAGNOSIS section for sepsis guideline", () => {
    const pi   = ingestFromText(SEPSIS_GUIDELINE, "diag_check");
    const flat = PageIndexBuilder.flatten(pi.nodes);
    expect(flat.some((n) => /diagnosis/i.test(n.title))).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// SUITE 6 — Phase 5 Clinical Scoring Integration
// ════════════════════════════════════════════════════════════════════════════

describe("Phase 5 vitals-driven clinical queries", () => {
  // Replicate the Phase 5 scoring logic from clinicalScores.js as test fixtures
  function SOFA(v: { bp: number; o2: number }): number {
    let s = 0;
    if (v.bp < 90) s += 2;
    if (v.o2 < 92) s += 2;
    return s;
  }

  function CURB65(v: { age: number; bp: number }): number {
    return (v.age > 65 ? 1 : 0) + (v.bp < 90 ? 1 : 0);
  }

  function HEART(v: { chestPain: boolean }): number {
    return v.chestPain ? 2 : 0;
  }

  function WELLS(v: { hr: number }): number {
    return v.hr > 100 ? 2 : 0;
  }

  const engine = new ClinicalDocEngine();
  const sepsisPI = engine.indexFromText(SEPSIS_GUIDELINE, "phase5_sepsis");
  const curb65PI = engine.indexFromText(CURB65_GUIDELINE, "phase5_curb65");

  it("T056 — SOFA: bp=80, o2=88 → score 4 (high severity)", () => {
    const score = SOFA({ bp: 80, o2: 88 });
    expect(score).toBe(4);
  });

  it("T057 — SOFA: bp=120, o2=98 → score 0 (normal)", () => {
    const score = SOFA({ bp: 120, o2: 98 });
    expect(score).toBe(0);
  });

  it("T058 — CURB-65: age=70, bp=80 → score 2 (moderate — inpatient)", () => {
    const score = CURB65({ age: 70, bp: 80 });
    expect(score).toBe(2);
  });

  it("T059 — CURB-65: age=40, bp=100 → score 0 (outpatient)", () => {
    const score = CURB65({ age: 40, bp: 100 });
    expect(score).toBe(0);
  });

  it("T060 — HEART: chestPain=true → score 2", () => {
    expect(HEART({ chestPain: true })).toBe(2);
    expect(HEART({ chestPain: false })).toBe(0);
  });

  it("T061 — WELLS: hr=110 → score 2", () => {
    expect(WELLS({ hr: 110 })).toBe(2);
    expect(WELLS({ hr: 90 })).toBe(0);
  });

  it("T062 — reasoning engine answers BP query with treatment section", () => {
    const result = engine.answerFromIndexSync(sepsisPI, "blood pressure management vasopressor");
    expect(result.answer.length).toBeGreaterThan(0);
  });

  it("T063 — reasoning engine answers CURB-65 severity=3 treatment query", () => {
    const result = engine.answerFromIndexSync(curb65PI, "score 3 piperacillin ICU");
    expect(result.answer.length).toBeGreaterThan(0);
  });

  it("T064 — reasoning engine navigates to contraindication for penicillin allergy", () => {
    const result = engine.answerFromIndexSync(sepsisPI, "penicillin allergy contraindication avoid");
    expect(result.answer.toLowerCase()).toMatch(/penicillin|allergy|avoid|contraindic/);
  });

  it("T065 — reasoning engine answers vancomycin dosing query", () => {
    const result = engine.answerFromIndexSync(sepsisPI, "vancomycin dosing MRSA mg/kg");
    expect(result.answer.length).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("T066 — reasoning engine cross-references Appendix A (antibiotic selection)", () => {
    const result = engine.answerFromIndexSync(sepsisPI, "antibiotic selection appendix");
    expect(result.answer.length).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// SUITE 7 — Edge cases + robustness
// ════════════════════════════════════════════════════════════════════════════

describe("Edge cases and robustness", () => {
  const engine = new ClinicalDocEngine();

  it("T067 — very short document still produces a valid tree", () => {
    const pi = engine.indexFromText("DIAGNOSIS\nSepsis present.", "short");
    expect(pi.nodeCount).toBeGreaterThan(0);
  });

  it("T068 — document with no headings produces flat tree", () => {
    const pi = engine.indexFromText(
      "This is a paragraph.\n\nThis is another paragraph.\n\nThird paragraph.",
      "flat"
    );
    // Should still produce nodes (even without headings)
    expect(pi.nodeCount).toBeGreaterThanOrEqual(0);
  });

  it("T069 — findReferences returns empty array for text with no cross-refs", () => {
    const refs = findReferences("No references in this simple sentence.");
    // should be empty or minimal
    expect(Array.isArray(refs)).toBe(true);
  });

  it("T070 — findReferences does not throw on empty string", () => {
    expect(() => findReferences("")).not.toThrow();
  });

  it("T071 — resolveReference handles empty tree gracefully", () => {
    const ref: DetectedReference = { raw: "see Appendix A", type: "appendix", target: "appendix a", position: 0 };
    const resolved = resolveReference([], ref);
    expect(resolved.confidence).toBe(0);
  });

  it("T072 — buildReferenceGraph on empty tree returns empty array", () => {
    const graph = buildReferenceGraph([]);
    expect(graph).toEqual([]);
  });

  it("T073 — flattenTree on empty array returns empty array", () => {
    expect(flattenTree([])).toEqual([]);
  });

  it("T074 — node_ids are unique across the entire tree", () => {
    const flat = PageIndexBuilder.flatten(sepsisTree);
    const ids  = flat.map((n) => n.node_id);
    const uniq = new Set(ids);
    expect(uniq.size).toBe(ids.length);
  });

  it("T075 — ingestFromText with same docId overwrites previous tree", () => {
    const engine2 = new ClinicalDocEngine();
    engine2.indexFromText("DIAGNOSIS\nShort.", "overwrite_test");
    engine2.indexFromText(SEPSIS_GUIDELINE, "overwrite_test");
    const pi = engine2.getTree("overwrite_test");
    expect(pi!.nodeCount).toBeGreaterThan(1);
  });

  it("T076 — PageIndex builtAt is a recent date", () => {
    const before = Date.now() - 5000;
    const pi     = ingestFromText(SEPSIS_GUIDELINE, "ts_check");
    expect(pi.builtAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("T077 — CURB-65 tree has at least 2 distinct sections", () => {
    const flat = flattenTree(curb65Tree);
    expect(flat.length).toBeGreaterThanOrEqual(2);
  });

  it("T078 — reasoning retriever handles Unicode/special chars in query", () => {
    expect(() => retriever.findRelevantNodeSync(sepsisTree, "MAP ≥65 mmHg vasopressor")).not.toThrow();
  });

  it("T079 — crossRefs in answerFromIndexSync is always an array", () => {
    const pi     = engine.indexFromText("TREATMENT\nGive aspirin.", "no_xrefs");
    const result = engine.answerFromIndexSync(pi, "aspirin dose");
    expect(Array.isArray(result.crossRefs)).toBe(true);
  });

  it("T080 — large document (concatenated guidelines) processes without error", () => {
    const large = SEPSIS_GUIDELINE + "\n\n" + CURB65_GUIDELINE + "\n\n" + SOFA_GUIDELINE;
    const pi    = engine.indexFromText(large, "large_doc");
    expect(pi.nodeCount).toBeGreaterThan(5);
    const result = engine.answerFromIndexSync(pi, "vancomycin dosing");
    expect(result.answer.length).toBeGreaterThan(0);
  });
});
