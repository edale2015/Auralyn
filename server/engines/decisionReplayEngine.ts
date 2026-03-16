export interface ReplayStep {
  engine: string;
  input: unknown;
  output: unknown;
  timestamp: number;
  durationMs?: number;
  confidence?: number;
  layer?: string;
}

export interface CaseReplay {
  caseId: string;
  complaint: string;
  totalSteps: number;
  steps: ReplayStep[];
  finalDisposition?: string;
  overallConfidence?: number;
  replayedAt: string;
}

export interface ReplayOptions {
  includeInputs?: boolean;
  layerFilter?: string[];
  minConfidence?: number;
}

export class DecisionReplayEngine {
  buildReplay(caseRecord: any, options: ReplayOptions = {}): CaseReplay {
    const steps: ReplayStep[] = [];
    const includeInputs = options.includeInputs ?? true;

    const ts = (offset = 0): number => (caseRecord.createdAt ? new Date(caseRecord.createdAt).getTime() : Date.now()) + offset;

    // ── Intake / Normalization ────────────────────────────────────────────────
    if (caseRecord.answers && Object.keys(caseRecord.answers).length > 0) {
      steps.push({
        engine: 'Intake Normalization Engine',
        input: includeInputs ? { complaintId: caseRecord.complaintId, rawAnswers: caseRecord.answers } : '[hidden]',
        output: {
          normalizedComplaint: caseRecord.complaintId ?? caseRecord.complaint,
          answerCount: Object.keys(caseRecord.answers).length,
          status: 'normalized',
        },
        timestamp: ts(0),
        layer: 'L1-Normalization',
        confidence: 1.0,
      });
    }

    // ── Red Flag Safety Engine ────────────────────────────────────────────────
    const er = caseRecord.engineResult;
    if (er?.redFlagResult ?? caseRecord.redFlagResult) {
      const rfr = er?.redFlagResult ?? caseRecord.redFlagResult;
      steps.push({
        engine: 'Red Flag Safety Engine',
        input: includeInputs ? caseRecord.answers : '[hidden]',
        output: rfr,
        timestamp: ts(200),
        layer: 'L2-Safety',
        confidence: rfr?.confidence ?? 0.95,
        durationMs: 45,
      });
    }

    // ── Case Similarity Engine ───────────────────────────────────────────────
    if (er?.similarityMatches ?? caseRecord.similarityMatches) {
      const sm = er?.similarityMatches ?? caseRecord.similarityMatches;
      steps.push({
        engine: 'Case Similarity Engine',
        input: includeInputs ? { features: caseRecord.features ?? caseRecord.answers } : '[hidden]',
        output: sm,
        timestamp: ts(400),
        layer: 'L3-Matching',
        confidence: 0.87,
        durationMs: 120,
      });
    }

    // ── Bayesian Differential Engine ─────────────────────────────────────────
    if (er?.bayesScores ?? caseRecord.bayesScores ?? er?.differentialDx) {
      const scores = er?.bayesScores ?? caseRecord.bayesScores ?? er?.differentialDx;
      steps.push({
        engine: 'Bayesian Differential Engine',
        input: includeInputs ? { features: caseRecord.features ?? caseRecord.answers } : '[hidden]',
        output: scores,
        timestamp: ts(600),
        layer: 'L4-Differential',
        confidence: er?.differentialConfidence ?? 0.83,
        durationMs: 85,
      });
    }

    // ── Risk Stratification Engine ───────────────────────────────────────────
    if (er?.riskScore !== undefined || er?.severity) {
      steps.push({
        engine: 'Risk Stratification Engine',
        input: includeInputs ? { severity: er?.severity, redFlags: er?.redFlags } : '[hidden]',
        output: { riskScore: er?.riskScore, severity: er?.severity, urgency: er?.urgency },
        timestamp: ts(800),
        layer: 'L5-Risk',
        confidence: 0.9,
        durationMs: 30,
      });
    }

    // ── Temporal Analysis Engine ─────────────────────────────────────────────
    if (er?.temporalPattern ?? er?.onsetDuration) {
      steps.push({
        engine: 'Temporal Analysis Engine',
        input: includeInputs ? { duration: er?.onsetDuration, progression: er?.progression } : '[hidden]',
        output: { pattern: er?.temporalPattern ?? 'acute', onset: er?.onsetDuration },
        timestamp: ts(1000),
        layer: 'L6-Temporal',
        confidence: 0.78,
        durationMs: 25,
      });
    }

    // ── Consensus Engine ─────────────────────────────────────────────────────
    if (er?.consensusDx ?? er?.proposedDx) {
      steps.push({
        engine: 'Consensus Voting Engine',
        input: includeInputs ? { differentials: er?.differentialDx ?? er?.bayesScores } : '[hidden]',
        output: { consensus: er?.consensusDx ?? er?.proposedDx, confidence: er?.consensusConfidence ?? 0.82 },
        timestamp: ts(1200),
        layer: 'L7-Consensus',
        confidence: er?.consensusConfidence ?? 0.82,
        durationMs: 60,
      });
    }

    // ── Disposition Ensemble Engine ──────────────────────────────────────────
    const disp = er?.finalDisposition ?? er?.disposition ?? caseRecord.finalDisposition ?? caseRecord.disposition;
    if (disp) {
      steps.push({
        engine: 'Disposition Ensemble Engine',
        input: includeInputs ? { consensusDx: er?.consensusDx ?? er?.proposedDx, riskScore: er?.riskScore } : '[hidden]',
        output: { disposition: disp, confidence: er?.dispositionConfidence ?? 0.88 },
        timestamp: ts(1400),
        layer: 'L8-Disposition',
        confidence: er?.dispositionConfidence ?? 0.88,
        durationMs: 40,
      });
    }

    // ── Note Draft Engine ────────────────────────────────────────────────────
    if (caseRecord.noteDraft) {
      steps.push({
        engine: 'Clinical Note Generator',
        input: includeInputs ? { disposition: disp, dx: er?.consensusDx } : '[hidden]',
        output: { noteDraftLength: caseRecord.noteDraft.length, status: 'generated' },
        timestamp: ts(1600),
        layer: 'L9-Documentation',
        confidence: 1.0,
        durationMs: 15,
      });
    }

    const filteredSteps = options.layerFilter
      ? steps.filter((s) => options.layerFilter!.some((f) => s.layer?.includes(f)))
      : steps;

    const overallConfidence = filteredSteps.length
      ? filteredSteps.reduce((sum, s) => sum + (s.confidence ?? 0), 0) / filteredSteps.length
      : 0;

    return {
      caseId: caseRecord.caseId ?? caseRecord.id ?? 'unknown',
      complaint: caseRecord.complaintLabel ?? caseRecord.complaintId ?? caseRecord.complaint ?? 'Unknown',
      totalSteps: filteredSteps.length,
      steps: filteredSteps,
      finalDisposition: disp ?? undefined,
      overallConfidence: Math.round(overallConfidence * 1000) / 1000,
      replayedAt: new Date().toISOString(),
    };
  }

  buildDemoReplay(complaint = 'Headache'): CaseReplay {
    const demoCase = {
      caseId: `demo_${Date.now()}`,
      complaint,
      complaintId: complaint.toLowerCase().replace(/\s+/g, '_'),
      answers: { duration: '3 days', severity: '8/10', worstHeadache: 'yes', neckStiffness: 'no', fever: 'no' },
      engineResult: {
        redFlagResult: { triggered: true, flags: ['Worst headache of life'], severity: 'high' },
        riskScore: 0.78,
        severity: 'high',
        differentialDx: [
          { diagnosis: 'Subarachnoid Haemorrhage', probability: 0.35 },
          { diagnosis: 'Migraine with aura', probability: 0.40 },
          { diagnosis: 'Tension headache', probability: 0.25 },
        ],
        consensusDx: 'Probable migraine with subarachnoid exclusion required',
        consensusConfidence: 0.82,
        finalDisposition: 'ED referral — CT head + LP if normal',
        dispositionConfidence: 0.91,
      },
      noteDraft: 'Patient presents with worst headache of life. Red flags triggered. ED referral issued.',
    };
    return this.buildReplay(demoCase);
  }
}

export const decisionReplayEngine = new DecisionReplayEngine();
