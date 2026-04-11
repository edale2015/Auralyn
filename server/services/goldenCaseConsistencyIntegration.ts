import type { Request, Response } from "express";
import { runClinicalConsistencyEngine } from "./clinicalConsistencyEngine";
import type { CanonicalDecision } from "../../shared/clinicalConsistency";

export interface GoldenCaseEvalInput {
  complaint: string;
  features: Record<string, any>;
  expectedSyndromeId?: string;
  expectedMedicationKey?: string;
  expectedDisposition?: string;
}

export interface GoldenCaseEvalResult {
  phenotypeHash: string;
  passed: boolean;
  score: number;
  total: number;
  accuracy: number;
  mismatches: string[];
  canonical: CanonicalDecision;
}

export function scoreGoldenMatch(args: {
  expectedSyndromeId?: string;
  expectedMedicationKey?: string;
  expectedDisposition?: string;
  actual: CanonicalDecision;
}): { matched: number; total: number; reasons: string[] } {
  const reasons: string[] = [];
  let matched = 0;
  let total = 0;

  if (args.expectedSyndromeId) {
    total += 1;
    if (args.actual.winningSyndrome?.syndromeId === args.expectedSyndromeId) {
      matched += 1;
    } else {
      reasons.push(
        `Expected syndrome ${args.expectedSyndromeId}, got ${args.actual.winningSyndrome?.syndromeId ?? "none"}`
      );
    }
  }

  if (args.expectedMedicationKey) {
    total += 1;
    if (args.actual.treatment.medicationKey === args.expectedMedicationKey) {
      matched += 1;
    } else {
      reasons.push(
        `Expected medication ${args.expectedMedicationKey}, got ${args.actual.treatment.medicationKey ?? "none"}`
      );
    }
  }

  if (args.expectedDisposition) {
    total += 1;
    if (args.actual.disposition.disposition === args.expectedDisposition) {
      matched += 1;
    } else {
      reasons.push(
        `Expected disposition ${args.expectedDisposition}, got ${args.actual.disposition.disposition}`
      );
    }
  }

  return { matched, total, reasons };
}

export function evaluateGoldenCase(input: GoldenCaseEvalInput): GoldenCaseEvalResult {
  const canonical = runClinicalConsistencyEngine(input.complaint, input.features);

  const { matched, total, reasons } = scoreGoldenMatch({
    expectedSyndromeId: input.expectedSyndromeId,
    expectedMedicationKey: input.expectedMedicationKey,
    expectedDisposition: input.expectedDisposition,
    actual: canonical,
  });

  const score    = matched;
  const accuracy = total > 0 ? Math.round((matched / total) * 1000) / 1000 : 1;

  return {
    phenotypeHash: canonical.phenotypeHash,
    passed: reasons.length === 0,
    score,
    total,
    accuracy,
    mismatches: reasons,
    canonical,
  };
}

export async function evaluateGoldenCaseAgainstCanonicalHandler(req: Request, res: Response) {
  try {
    const { complaint, features, expectedSyndromeId, expectedMedicationKey, expectedDisposition } = req.body;
    if (!complaint) return res.status(400).json({ error: "complaint required" });

    const result = evaluateGoldenCase({
      complaint,
      features: features || {},
      expectedSyndromeId,
      expectedMedicationKey,
      expectedDisposition,
    });

    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Golden case evaluation failed" });
  }
}

export async function evaluateGoldenCaseBatchAgainstCanonicalHandler(req: Request, res: Response) {
  try {
    const { cases } = req.body;
    if (!Array.isArray(cases)) return res.status(400).json({ error: "cases array required" });

    const results = cases.map((c: GoldenCaseEvalInput) => evaluateGoldenCase(c));
    const passed  = results.filter((r) => r.passed).length;
    const total   = results.length;
    const overallAccuracy = total > 0
      ? Math.round((results.reduce((s, r) => s + r.accuracy, 0) / total) * 1000) / 1000
      : 1;

    res.json({ ok: true, total, passed, failed: total - passed, overallAccuracy, results });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Batch evaluation failed" });
  }
}
