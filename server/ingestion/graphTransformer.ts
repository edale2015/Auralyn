import { addKnowledgeNode, addKnowledgeEdge } from "../knowledge/knowledgeGraphStore";
import { recordClinicalChange } from "../audit/clinicalChangeAuditLog";

let edgeCounter = 0;
function nextEdgeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${++edgeCounter}`;
}

export function ingestComplaints(rows: Record<string, any>[]): number {
  let count = 0;
  rows.forEach((r) => {
    if (!r.CC_ID) return;

    addKnowledgeNode({
      id: `complaint:${r.CC_ID}`,
      type: "complaint",
      label: r.CC_LABEL || r.CC_ID,
      metadata: {
        system: r.SYSTEM,
        enabled: r.ENABLED,
        graphId: r.GRAPH_ID,
        version: r.CORE_QUESTIONS_VERSION,
      },
    });

    if (r.RED_FLAG_SET_ID) {
      addKnowledgeEdge({
        id: nextEdgeId("rf"),
        from: `complaint:${r.CC_ID}`,
        to: "skill:red_flag_detection",
        relation: "requires",
      });
    }

    if (r.SCORING_ID) {
      addKnowledgeEdge({
        id: nextEdgeId("sc"),
        from: `complaint:${r.CC_ID}`,
        to: "engine:cluster_scoring",
        relation: "handled_by",
      });
    }

    recordClinicalChange({
      timestamp: Date.now(),
      sheet: "COMPLAINT_REGISTRY",
      changeType: "upsert",
      key: r.CC_ID,
      row: r,
    });

    count++;
  });
  return count;
}

export function ingestQuestions(rows: Record<string, any>[]): number {
  let count = 0;
  rows.forEach((q) => {
    if (!q.QUESTION_ID || !q.CC_ID) return;

    addKnowledgeNode({
      id: `question:${q.QUESTION_ID}`,
      type: "question",
      label: q.QUESTION_TEXT || q.QUESTION_ID,
      metadata: {
        answerType: q.ANSWER_TYPE,
        order: q.ORDER,
        required: q.REQUIRED,
        mapsTo: q.MAPS_TO_FIELD,
        version: q.VERSION,
      },
    });

    addKnowledgeEdge({
      id: nextEdgeId("qa"),
      from: `complaint:${q.CC_ID}`,
      to: `question:${q.QUESTION_ID}`,
      relation: "asks",
    });

    recordClinicalChange({
      timestamp: Date.now(),
      sheet: "CORE_QUESTIONS",
      changeType: "upsert",
      key: q.QUESTION_ID,
      row: q,
    });

    count++;
  });
  return count;
}

export function ingestDispositionRules(rows: Record<string, any>[]): number {
  let count = 0;
  rows.forEach((r) => {
    if (!r.CC_ID || !r.DISPOSITION_LEVEL) return;

    addKnowledgeNode({
      id: `disposition:${r.DISPOSITION_LEVEL}`,
      type: "disposition",
      label: r.DISPOSITION_LEVEL.replace(/_/g, " "),
    });

    addKnowledgeEdge({
      id: nextEdgeId("disp"),
      from: `complaint:${r.CC_ID}`,
      to: `disposition:${r.DISPOSITION_LEVEL}`,
      relation: "can_lead_to",
      metadata: {
        ruleId: r.DISP_RULE_ID,
        priority: r.PRIORITY,
        whenExpr: r.WHEN_EXPR,
        confidence: r.CONFIDENCE_HINT,
      },
    });

    recordClinicalChange({
      timestamp: Date.now(),
      sheet: "DISPOSITION_RULES",
      changeType: "upsert",
      key: r.DISP_RULE_ID,
      row: r,
    });

    count++;
  });
  return count;
}

export function ingestRedFlagRules(rows: Record<string, any>[]): number {
  let count = 0;
  rows.forEach((r) => {
    if (!r.CC_ID || !r.RULE_ID) return;

    addKnowledgeEdge({
      id: nextEdgeId("rfr"),
      from: `complaint:${r.CC_ID}`,
      to: "skill:red_flag_detection",
      relation: "requires",
      metadata: {
        ruleId: r.RULE_ID,
        priority: r.PRIORITY,
        whenExpr: r.WHEN_EXPR,
      },
    });

    recordClinicalChange({
      timestamp: Date.now(),
      sheet: "RED_FLAG_RULES",
      changeType: "upsert",
      key: r.RULE_ID,
      row: r,
    });

    count++;
  });
  return count;
}

export function ingestClusterScoringRules(rows: Record<string, any>[]): number {
  let count = 0;
  rows.forEach((r) => {
    if (!r.CC_ID || !r.CLUSTER_ID) return;

    addKnowledgeEdge({
      id: nextEdgeId("csr"),
      from: `complaint:${r.CC_ID}`,
      to: `engine:cluster_${r.CLUSTER_ID}`,
      relation: "handled_by",
      metadata: {
        clusterId: r.CLUSTER_ID,
        points: r.POINTS,
        whenExpr: r.WHEN_EXPR,
        evidenceFields: r.EVIDENCE_FIELDS,
      },
    });

    recordClinicalChange({
      timestamp: Date.now(),
      sheet: "CLUSTER_SCORING_RULES",
      changeType: "upsert",
      key: `${r.CC_ID}_${r.CLUSTER_ID}`,
      row: r,
    });

    count++;
  });
  return count;
}

export function ingestOutputTemplates(rows: Record<string, any>[]): number {
  let count = 0;
  rows.forEach((r) => {
    if (!r.TEMPLATE_ID) return;

    addKnowledgeNode({
      id: `template:${r.TEMPLATE_ID}`,
      type: "protocol" as any,
      label: r.TITLE || r.TEMPLATE_ID,
      metadata: {
        templateType: r.TEMPLATE_TYPE,
        body: r.BODY,
      },
    });

    recordClinicalChange({
      timestamp: Date.now(),
      sheet: "OUTPUT_TEMPLATES",
      changeType: "upsert",
      key: r.TEMPLATE_ID,
      row: r,
    });

    count++;
  });
  return count;
}
