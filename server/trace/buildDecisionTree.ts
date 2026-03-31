import type { AdvancedDiagnosisResult } from "../kb/kbAdvancedDiagnosisEngine";

export interface TreeNode {
  id: string;
  name: string;
  type: "question" | "finding" | "rule" | "dx" | "action" | "root";
  attributes?: Record<string, string>;
  children?: TreeNode[];
}

export interface DecisionTreeInput {
  symptoms?: string[];
  answers?: Record<string, unknown>;
  complaintId?: string;
  results: AdvancedDiagnosisResult[];
  disposition?: string;
  uncertainty?: number;
  margin?: number;
}

export function buildDecisionTree(input: DecisionTreeInput): TreeNode {
  const { symptoms = [], answers = {}, results, disposition, uncertainty, margin } = input;

  const symptomNodes: TreeNode[] = symptoms.map((s, i) => ({
    id: `symptom-${i}`,
    name: s,
    type: "finding",
    attributes: { type: "symptom", value: "present" },
  }));

  const answerNodes: TreeNode[] = Object.entries(answers).map(([k, v], i) => ({
    id: `answer-${i}`,
    name: k,
    type: "question",
    attributes: { answer: String(v) },
  }));

  const topN = results.slice(0, 5);
  const dxNodes: TreeNode[] = topN.map((r, i) => {
    const pct = (r.posterior * 100).toFixed(1);
    const topFeature = r.features
      .filter(f => f.contribution === "positive")
      .sort((a, b) => b.logLikelihood - a.logLikelihood)[0];

    const children: TreeNode[] = r.features
      .filter(f => Math.abs(f.logLikelihood) > 0.1)
      .sort((a, b) => Math.abs(b.logLikelihood) - Math.abs(a.logLikelihood))
      .slice(0, 4)
      .map((f, fi) => ({
        id: `feature-${i}-${fi}`,
        name: f.key,
        type: "finding" as const,
        attributes: {
          logLR: f.logLikelihood.toFixed(3),
          contribution: f.contribution,
          value: String(f.inputValue ?? "—"),
        },
      }));

    return {
      id: `dx-${i}`,
      name: `${r.diagnosisLabel} (${pct}%)`,
      type: "dx",
      attributes: {
        posterior: pct + "%",
        score: r.score.toFixed(2),
        source: r.source,
        rank: String(i + 1),
        ...(topFeature ? { keyFeature: topFeature.key } : {}),
      },
      children: children.length > 0 ? children : undefined,
    };
  });

  const uncertaintyPct = uncertainty != null ? (uncertainty * 100).toFixed(1) + "%" : "—";
  const marginPct = margin != null ? (margin * 100).toFixed(1) + "%" : "—";

  const tree: TreeNode = {
    id: "root",
    name: "Clinical Reasoning Flow",
    type: "root",
    attributes: { engineSource: "KB_DB", complaintId: input.complaintId ?? "—" },
    children: [
      ...(symptomNodes.length > 0 || answerNodes.length > 0
        ? [{
            id: "inputs",
            name: "Clinical Inputs",
            type: "rule" as const,
            attributes: { symptoms: String(symptomNodes.length), answers: String(answerNodes.length) },
            children: [
              ...(symptomNodes.length > 0 ? [{ id: "symptoms-group", name: "Symptoms", type: "finding" as const, children: symptomNodes }] : []),
              ...(answerNodes.length > 0 ? [{ id: "answers-group", name: "Answers", type: "question" as const, children: answerNodes }] : []),
            ],
          }]
        : []),
      {
        id: "differential",
        name: "Differential Diagnosis",
        type: "rule",
        attributes: { rulesEvaluated: String(results.length), uncertainty: uncertaintyPct, margin: marginPct },
        children: dxNodes,
      },
      ...(disposition
        ? [{
            id: "disposition",
            name: `Disposition: ${disposition}`,
            type: "action" as const,
            attributes: { uncertainty: uncertaintyPct, margin: marginPct },
          }]
        : []),
    ],
  };

  return tree;
}
