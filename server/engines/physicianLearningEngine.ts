export interface PhysicianCorrection {
  caseId: string;
  originalDisposition: string;
  correctedDisposition: string;
  originalDx: string;
  correctedDx?: string;
  physicianId: string;
  notes?: string;
  correctedAt: string;
}

export interface CorrectionPattern {
  complaint: string;
  originalDisposition: string;
  correctedDisposition: string;
  count: number;
  lastSeen: string;
}

class PhysicianLearningStore {
  private corrections: PhysicianCorrection[] = [];
  private readonly MAX_STORED = 500;

  record(correction: PhysicianCorrection): void {
    this.corrections.push(correction);
    if (this.corrections.length > this.MAX_STORED) {
      this.corrections = this.corrections.slice(-this.MAX_STORED);
    }

    const agreement = correction.originalDisposition === correction.correctedDisposition;
    console.log(
      `[PhysicianLearning] Case ${correction.caseId}: physician ${agreement ? 'agreed' : 'corrected'} ${correction.originalDisposition}` +
      (agreement ? '' : ` → ${correction.correctedDisposition}`)
    );
  }

  getPatterns(): CorrectionPattern[] {
    const map = new Map<string, CorrectionPattern>();
    for (const c of this.corrections) {
      if (c.originalDisposition === c.correctedDisposition) continue;
      const key = `${c.originalDisposition}→${c.correctedDisposition}`;
      const existing = map.get(key);
      if (existing) {
        existing.count++;
        existing.lastSeen = c.correctedAt;
      } else {
        map.set(key, {
          complaint: 'unknown',
          originalDisposition: c.originalDisposition,
          correctedDisposition: c.correctedDisposition,
          count: 1,
          lastSeen: c.correctedAt,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }

  getStats(): { total: number; agreements: number; overrideRate: number; topPattern?: CorrectionPattern } {
    const total = this.corrections.length;
    const agreements = this.corrections.filter((c) => c.originalDisposition === c.correctedDisposition).length;
    const patterns = this.getPatterns();
    return {
      total,
      agreements,
      overrideRate: total > 0 ? Math.round(((total - agreements) / total) * 1000) / 1000 : 0,
      topPattern: patterns[0],
    };
  }
}

export const physicianLearningStore = new PhysicianLearningStore();

export class PhysicianLearningEngine {
  readonly name = 'physicianLearningEngine';

  learn(caseReview: PhysicianCorrection): void {
    physicianLearningStore.record(caseReview);
  }

  run(context: any): any {
    if (context.physicianCorrection) {
      this.learn(context.physicianCorrection);
    }
    return {
      ...context,
      physicianLearningStats: physicianLearningStore.getStats(),
    };
  }
}

export const physicianLearningEngine = new PhysicianLearningEngine();
