import { getKnowledgeGraph } from "./knowledgeGraphStore";

export interface QuestionCoverageResult {
  skillLabel: string;
  skillId: string;
  questionCount: number;
  coverage: "good" | "adequate" | "weak" | "none";
  questions: string[];
}

export function scoreQuestionCoverage(): QuestionCoverageResult[] {
  const graph = getKnowledgeGraph();
  const results: QuestionCoverageResult[] = [];

  const skills = graph.nodes.filter(n => n.type === "skill");

  skills.forEach(skill => {
    const complaintsWithSkill = graph.edges
      .filter(e => e.to === skill.id && e.relation === "requires")
      .map(e => e.from);

    const questionIds = new Set<string>();
    complaintsWithSkill.forEach(cId => {
      graph.edges
        .filter(e => e.from === cId && e.relation === "asks")
        .forEach(e => questionIds.add(e.to));
    });

    const supportingQuestions = graph.edges
      .filter(e => e.to === skill.id && e.relation === "supports")
      .map(e => e.from);

    supportingQuestions.forEach(q => questionIds.add(q));

    const questions = Array.from(questionIds)
      .map(id => graph.nodes.find(n => n.id === id)?.label ?? id)
      .filter(Boolean);

    const count = questions.length;
    let coverage: "good" | "adequate" | "weak" | "none" = "none";
    if (count >= 3) coverage = "good";
    else if (count === 2) coverage = "adequate";
    else if (count === 1) coverage = "weak";

    results.push({
      skillLabel: skill.label,
      skillId: skill.id,
      questionCount: count,
      coverage,
      questions,
    });
  });

  return results.sort((a, b) => a.questionCount - b.questionCount);
}
