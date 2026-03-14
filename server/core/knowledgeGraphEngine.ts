export type NodeType = "symptom" | "diagnosis" | "test" | "treatment" | "red_flag";

export interface GraphEdge {
  from: string;
  to: string;
  weight: number;
  type: NodeType;
}

export interface DiagnosisScore {
  diagnosis: string;
  score: number;
}

class KnowledgeGraphEngine {
  private edges: GraphEdge[];

  constructor(edges: GraphEdge[]) {
    this.edges = edges;
  }

  findDiagnosesFromSymptoms(symptoms: string[]): DiagnosisScore[] {
    const scores: Record<string, number> = {};
    for (const s of symptoms) {
      const related = this.edges.filter((e) => e.from === s && e.type === "diagnosis");
      for (const r of related) {
        scores[r.to] = (scores[r.to] || 0) + r.weight;
      }
    }
    return Object.entries(scores)
      .map(([diagnosis, score]) => ({ diagnosis, score }))
      .sort((a, b) => b.score - a.score);
  }

  getTestsForDiagnosis(dx: string): string[] {
    return this.edges
      .filter((e) => e.from === dx && e.type === "test")
      .sort((a, b) => b.weight - a.weight)
      .map((e) => e.to);
  }

  getTreatmentsForDiagnosis(dx: string): string[] {
    return this.edges
      .filter((e) => e.from === dx && e.type === "treatment")
      .sort((a, b) => b.weight - a.weight)
      .map((e) => e.to);
  }

  getRedFlags(dx: string): string[] {
    return this.edges
      .filter((e) => e.from === dx && e.type === "red_flag")
      .map((e) => e.to);
  }

  getSymptomsForDiagnosis(dx: string): string[] {
    return this.edges
      .filter((e) => e.to === dx && e.type === "diagnosis")
      .map((e) => e.from);
  }

  addEdge(edge: GraphEdge): void {
    this.edges.push(edge);
  }

  getEdgeCount(): number {
    return this.edges.length;
  }
}

export default KnowledgeGraphEngine;
