import { questionImpactAnalyzer } from "../../questions/questionImpactAnalyzer";
import { protocolConflictDetector } from "../../protocols/protocolConflictDetector";
import { caseClusterDiscovery } from "../../cases/caseClusterDiscovery";

export interface AnalyticsSummary {
  questionImpact: { totalQuestions: number; topQuestion: string };
  protocolConflicts: { total: number; critical: number };
  caseClusters: { total: number; largest: number };
  timestamp: number;
}

export class AnalyticsLayer {
  summarize(): AnalyticsSummary {
    const questions = questionImpactAnalyzer.analyzeAllQuestions();
    const conflicts = protocolConflictDetector.getSummary();
    const clusters = caseClusterDiscovery.getSummary();

    return {
      questionImpact: {
        totalQuestions: questions.length,
        topQuestion: questions[0]?.questionText || "N/A",
      },
      protocolConflicts: {
        total: conflicts.totalConflicts,
        critical: conflicts.bySeverity.critical,
      },
      caseClusters: {
        total: clusters.totalClusters,
        largest: clusters.largestCluster,
      },
      timestamp: Date.now(),
    };
  }
}

export const analyticsLayer = new AnalyticsLayer();
