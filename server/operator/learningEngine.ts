type StepLog = {
  stepId: number;
  action: string;
  field?: string;
  success: boolean;
  timestamp: string;
  program: string;
  errorMessage?: string;
  retryCount: number;
  duration: number;
};

type PatternAnalysis = {
  step: string;
  successRate: number;
  avgDuration: number;
  commonErrors: string[];
  totalAttempts: number;
  bestStrategy?: string;
};

let stepLogs: StepLog[] = [];
let patternCache: Map<string, PatternAnalysis> = new Map();

export class LearningEngine {
  logStep(log: Omit<StepLog, "timestamp">) {
    stepLogs.push({
      ...log,
      timestamp: new Date().toISOString()
    });

    if (stepLogs.length > 5000) {
      stepLogs = stepLogs.slice(-5000);
    }

    this.updatePattern(log);
  }

  private updatePattern(log: Omit<StepLog, "timestamp">) {
    const key = `${log.program}_${log.action}_${log.field || "none"}`;
    const existing = patternCache.get(key);

    if (existing) {
      const total = existing.totalAttempts + 1;
      const successes = existing.successRate * existing.totalAttempts + (log.success ? 1 : 0);

      existing.successRate = successes / total;
      existing.avgDuration = (existing.avgDuration * existing.totalAttempts + log.duration) / total;
      existing.totalAttempts = total;

      if (!log.success && log.errorMessage) {
        if (!existing.commonErrors.includes(log.errorMessage)) {
          existing.commonErrors.push(log.errorMessage);
          if (existing.commonErrors.length > 5) existing.commonErrors.shift();
        }
      }
    } else {
      patternCache.set(key, {
        step: key,
        successRate: log.success ? 1 : 0,
        avgDuration: log.duration,
        commonErrors: log.errorMessage ? [log.errorMessage] : [],
        totalAttempts: 1
      });
    }
  }

  getBestAction(program: string, action: string, field?: string): PatternAnalysis | null {
    const key = `${program}_${action}_${field || "none"}`;
    return patternCache.get(key) || null;
  }

  getPatterns(): PatternAnalysis[] {
    return Array.from(patternCache.values()).sort((a, b) => b.totalAttempts - a.totalAttempts);
  }

  getSuccessRate(program: string): number {
    const programLogs = stepLogs.filter(l => l.program === program);
    if (programLogs.length === 0) return 0;
    return programLogs.filter(l => l.success).length / programLogs.length;
  }

  getRecentLogs(limit: number = 50): StepLog[] {
    return stepLogs.slice(-limit);
  }

  getStats() {
    const programs = new Set(stepLogs.map(l => l.program));
    const programStats = Array.from(programs).map(p => ({
      program: p,
      totalSteps: stepLogs.filter(l => l.program === p).length,
      successRate: this.getSuccessRate(p),
      avgDuration: stepLogs.filter(l => l.program === p).reduce((a, b) => a + b.duration, 0) /
                   Math.max(stepLogs.filter(l => l.program === p).length, 1)
    }));

    return {
      totalLogs: stepLogs.length,
      uniquePrograms: programs.size,
      overallSuccessRate: stepLogs.length > 0
        ? stepLogs.filter(l => l.success).length / stepLogs.length
        : 0,
      patternsLearned: patternCache.size,
      programStats
    };
  }

  clearHistory() {
    stepLogs = [];
    patternCache.clear();
  }
}

export const learningEngine = new LearningEngine();
