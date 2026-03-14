export type KGNodeType =
  | "symptom"
  | "diagnosis"
  | "complaint"
  | "question"
  | "test"
  | "treatment"
  | "red_flag"
  | "disposition"
  | "medication"
  | "alias";

export type KGNode = {
  id: string;
  type: KGNodeType;
  label?: string;
  metadata?: Record<string, any>;
};

export type KGEdge = {
  from: string;
  to: string;
  relation: string;
  weight?: number;
  source?: string;
  metadata?: Record<string, any>;
};

export type ClinicalKnowledgeGraph = {
  nodes: KGNode[];
  edges: KGEdge[];
};

export type ExpansionDatasets = {
  complaintRegistry?:   any[];
  clusterScoringRules?: any[];
  redFlagRules?:        any[];
  diagnosisClusters?:   any[];
  outputTemplates?:     any[];
  medicationRules?:     any[];
  testRules?:           any[];
  symptomSynonyms?:     any[];
  dxCandidates?:        any[];
  dispositionRules?:    any[];
  crossComplaintBoosts?: any[];
};

function slug(v: string): string {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

class GraphBuilder {
  private nodeMap = new Map<string, KGNode>();
  private edgeSet  = new Set<string>();
  private edges: KGEdge[] = [];

  addNode(id: string, type: KGNodeType, label?: string, metadata?: Record<string, any>): void {
    if (!id) return;
    const existing = this.nodeMap.get(id);
    if (!existing) {
      this.nodeMap.set(id, { id, type, label, metadata });
    } else {
      this.nodeMap.set(id, {
        ...existing,
        label:    existing.label    || label,
        metadata: { ...(existing.metadata || {}), ...(metadata || {}) },
      });
    }
  }

  addEdge(
    from: string,
    to: string,
    relation: string,
    weight = 1,
    source?: string,
    metadata?: Record<string, any>
  ): void {
    if (!from || !to || !relation) return;
    const key = `${from}|${relation}|${to}|${source || ""}`;
    if (this.edgeSet.has(key)) return;
    this.edgeSet.add(key);
    this.edges.push({ from, to, relation, weight, source, metadata });
  }

  build(): ClinicalKnowledgeGraph {
    return { nodes: [...this.nodeMap.values()], edges: this.edges };
  }
}

export function knowledgeGraphExpansionEngine(data: ExpansionDatasets): ClinicalKnowledgeGraph {
  const g = new GraphBuilder();

  // ── COMPLAINT_REGISTRY ───────────────────────────────────────────────────────
  for (const row of data.complaintRegistry || []) {
    const complaint = slug(row.CC_ID || row.complaint || row.chief_complaint || row.cc || "");
    const label     = row.LABEL || row.complaint || row.chief_complaint || "";
    const aliases   = String(row.ALIASES || row.aliases || "").split(";").map(slug).filter(Boolean);

    if (complaint) {
      g.addNode(complaint, "complaint", label, { system: row.SYSTEM });
      for (const alias of aliases) {
        g.addNode(alias, "alias", alias);
        g.addEdge(alias, complaint, "alias_of", 1, "complaint_registry");
      }
    }
  }

  // ── CLUSTER_SCORING_RULES ────────────────────────────────────────────────────
  for (const row of data.clusterScoringRules || []) {
    const complaint  = slug(row.CC_ID || row.complaint || "");
    const cluster    = slug(row.CLUSTER_ID || row.cluster || row.diagnosis || "");
    const points     = Number(row.POINTS || row.weight || row.score || 1);
    const evidLabel  = row.EVIDENCE_LABEL || row.evidence_label || "";
    const whenExpr   = row.WHEN_EXPR || row.when_expr || "";

    if (complaint) g.addNode(complaint, "complaint");
    if (cluster)   g.addNode(cluster,   "diagnosis", cluster);

    // Extract question id from WHEN_EXPR pattern: answers.Q_XXX == 'yes'
    const match = whenExpr.match(/answers\.(\w+)\s*==\s*'yes'/);
    if (match) {
      const qid = match[1].toLowerCase();
      g.addNode(qid, "question", evidLabel || qid);
      if (cluster) {
        g.addEdge(qid, cluster, "supports_diagnosis", points, "cluster_scoring_rules");
        g.addEdge(cluster, qid, "supported_by_symptom", points, "cluster_scoring_rules");
      }
    }
    if (complaint && cluster) {
      g.addEdge(complaint, cluster, "has_differential", 1, "cluster_scoring_rules");
    }
  }

  // ── RED_FLAG_RULES ───────────────────────────────────────────────────────────
  for (const row of data.redFlagRules || []) {
    const complaint   = slug(row.CC_ID || row.complaint || "");
    const flagId      = slug(row.RF_ID || row.red_flag || row.flag || row.trigger || "");
    const flagLabel   = row.LABEL || row.label || row.red_flag || flagId;
    const action      = slug(row.ACTION || row.disposition || "er_now");
    const severity    = row.SEVERITY || row.severity || "HARD";
    const whenExpr    = row.TRIGGER_EXPR || row.trigger_expr || row.WHEN_EXPR || "";

    if (complaint) g.addNode(complaint, "complaint");
    if (flagId)    g.addNode(flagId, "red_flag", flagLabel);
    if (action)    g.addNode(action, "disposition", action);

    if (complaint && flagId) {
      g.addEdge(complaint, flagId, "has_red_flag", severity === "HARD" ? 2 : 1, "red_flag_rules");
    }
    if (flagId && action) {
      g.addEdge(flagId, action, "implies_disposition", 1, "red_flag_rules");
    }

    // Wire trigger questions
    const qMatches = whenExpr.match(/answers\.(\w+)/g) || [];
    for (const m of qMatches) {
      const qid = m.replace("answers.", "").toLowerCase();
      g.addNode(qid, "question");
      if (flagId) g.addEdge(qid, flagId, "triggers_red_flag", 1, "red_flag_rules");
    }
  }

  // ── DIAGNOSIS_CLUSTERS (optional sheet) ──────────────────────────────────────
  for (const row of data.diagnosisClusters || []) {
    const complaint  = slug(row.CC_ID || row.complaint || row.chief_complaint || "");
    const diagnosis  = slug(row.CLUSTER_ID || row.diagnosis || row.cluster_name || row.cluster || "");
    const question   = slug(row.question || row.key_question || row.secondary_question || "");

    if (complaint) g.addNode(complaint, "complaint");
    if (diagnosis) g.addNode(diagnosis, "diagnosis");
    if (question)  g.addNode(question, "question");

    if (complaint && diagnosis) g.addEdge(complaint, diagnosis, "has_differential",     1, "diagnosis_clusters");
    if (diagnosis && question)  g.addEdge(diagnosis, question,  "confirmed_by_question", 1, "diagnosis_clusters");
  }

  // ── OUTPUT_TEMPLATES → disposition inference ─────────────────────────────────
  for (const row of data.outputTemplates || []) {
    const complaint   = slug(row.CC_ID || row.complaint || "");
    const disposition = slug(row.DISPOSITION_LEVEL || row.disposition || row.output_disposition || "");

    if (complaint)   g.addNode(complaint, "complaint");
    if (disposition) g.addNode(disposition, "disposition");
    if (complaint && disposition) {
      g.addEdge(complaint, disposition, "may_result_in", 1, "output_templates");
    }
  }

  // ── DX_CANDIDATES ────────────────────────────────────────────────────────────
  for (const row of data.dxCandidates || []) {
    const complaint   = slug(row.CC_ID || row.complaint || "");
    const dxId        = slug(row.DX_ID || row.dx_id || row.diagnosis || "");
    const dxLabel     = row.DX_LABEL || row.dx_label || dxId;
    const cluster     = slug(row.BEST_CLUSTER_ID || row.cluster || "");
    const baseScore   = Number(row.BASE_SCORE || row.base_score || 0.5);

    if (complaint) g.addNode(complaint, "complaint");
    if (dxId)      g.addNode(dxId, "diagnosis", dxLabel);
    if (cluster)   g.addNode(cluster, "diagnosis");

    if (complaint && dxId) g.addEdge(complaint, dxId, "candidate_diagnosis", baseScore, "dx_candidates");
    if (cluster && dxId)   g.addEdge(cluster, dxId, "maps_to_diagnosis", baseScore, "dx_candidates");
  }

  // ── DISPOSITION_RULES ────────────────────────────────────────────────────────
  for (const row of data.dispositionRules || []) {
    const complaint   = slug(row.CC_ID || row.complaint || "");
    const disposition = slug(row.DISPOSITION_LEVEL || row.disposition_level || row.disposition || "");

    if (complaint)   g.addNode(complaint, "complaint");
    if (disposition) g.addNode(disposition, "disposition");
    if (complaint && disposition) {
      g.addEdge(complaint, disposition, "may_result_in", 1, "disposition_rules");
    }
  }

  // ── CROSS_COMPLAINT_BOOSTS ────────────────────────────────────────────────────
  for (const row of data.crossComplaintBoosts || []) {
    const from  = slug(row.FROM_CC || row.from_cc || row.from || "");
    const to    = slug(row.TO_CC   || row.to_cc   || row.to   || "");
    const boost = Number(row.BOOST || row.boost || 1);

    if (from) g.addNode(from, "complaint");
    if (to)   g.addNode(to, "complaint");
    if (from && to) g.addEdge(from, to, "cross_complaint_boost", boost, "cross_complaint_boosts");
  }

  // ── MEDICATION_RULES (optional) ───────────────────────────────────────────────
  for (const row of data.medicationRules || []) {
    const diagnosis  = slug(row.diagnosis || row.cluster || "");
    const medication = slug(row.medication || row.treatment || row.drug || "");

    if (diagnosis)  g.addNode(diagnosis, "diagnosis");
    if (medication) g.addNode(medication, "medication", row.medication || row.treatment || row.drug, {
      dosage: row.dose,
      route:  row.route,
    });
    if (diagnosis && medication) g.addEdge(diagnosis, medication, "treated_with", 1, "medication_rules");
  }

  // ── TEST_RULES (optional) ─────────────────────────────────────────────────────
  for (const row of data.testRules || []) {
    const diagnosis = slug(row.diagnosis || row.cluster || "");
    const test      = slug(row.test || row.study || row.recommended_test || "");
    const urgency   = slug(row.urgency || "routine");

    if (diagnosis) g.addNode(diagnosis, "diagnosis");
    if (test)      g.addNode(test, "test", row.test || row.study, { urgency });
    if (diagnosis && test) {
      g.addEdge(diagnosis, test, "evaluated_by_test", 1, "test_rules", { urgency });
    }
  }

  // ── SYMPTOM_SYNONYMS (optional) ───────────────────────────────────────────────
  for (const row of data.symptomSynonyms || []) {
    const canonical = slug(row.canonical || row.symptom || "");
    const alias     = slug(row.alias || row.synonym || row.input || "");

    if (canonical) g.addNode(canonical, "symptom");
    if (alias)     g.addNode(alias, "alias");
    if (alias && canonical) g.addEdge(alias, canonical, "maps_to", 1, "symptom_synonyms");
  }

  return g.build();
}
