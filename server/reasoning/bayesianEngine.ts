/**
 * server/reasoning/bayesianEngine.ts — Lightweight Bayesian update engine
 *
 * FIX (Code Review Issue #16 — absent-evidence inversion):
 *   The COMPLAINT_EVIDENCE table defaulted ALL evidence entries to `present: false`.
 *   When runBayesianUpdate() processed evidence with `present: false`, it applied
 *   `1 / likelihoodRatio` — systematically penalizing diagnoses for the absence
 *   of findings that were never actually checked in the patient encounter.
 *
 *   Concretely: "chest pain" had two evidence entries both defaulting to false:
 *   - diaphoresis: LR=4.0, present=false → applied 1/4.0 = 0.25 multiplier to MI
 *   - radiation:   LR=3.0, present=false → applied 1/3.0 = 0.33 multiplier to MI
 *   Every chest pain patient had their MI probability reduced ~8x before any actual
 *   findings were considered — purely because the COMPLAINT_EVIDENCE template
 *   expressed "we expect these features" as "these features are absent."
 *
 *   Fixed:
 *   1. COMPLAINT_EVIDENCE entries removed — the template-based approach of
 *      pre-filling absent evidence is clinically incorrect. Evidence must come
 *      from actual observed findings, not from a complaint lookup table.
 *
 *   2. buildEvidenceFromResult() now builds evidence ONLY from explicitly provided
 *      positive findings (present: true). No negative evidence is inserted by default.
 *      Callers who want to include negative findings (explicitly documented absence)
 *      must pass them explicitly with present: false.
 *
 *   3. The Bayesian update itself is preserved — it correctly handles both positive
 *      (present: true → multiply by LR) and negative (present: false → multiply by
 *      1/LR) evidence when that evidence is explicitly provided.
 *
 *   Architecture note (Issue #15):
 *   This module provides a simple LR-based Bayesian update (for hybrid reasoning).
 *   server/clinical/bayesianEngine.ts provides the full Naive Bayes differential
 *   engine (for KB-driven differentials). They serve different purposes and are
 *   not duplicates, but callers should be explicit about which engine they use.
 */

export interface DiagnosisPrior {
  diagnosis: string;
  prior:     number;
}

export interface Evidence {
  feature:         string;
  likelihoodRatio: number;
  present:         boolean;   // true = observed, false = explicitly documented absent
}

export interface BayesianResult {
  diagnosis: string;
  prior:     number;
  posterior: number;
  delta:     number;
}

/**
 * runBayesianUpdate — update diagnosis priors given a list of evidence items.
 *
 * Only call with evidence that has been explicitly observed or explicitly documented
 * as absent. Do NOT pre-populate evidence with assumed defaults.
 */
export function runBayesianUpdate(params: {
  priors:   DiagnosisPrior[];
  evidence: Evidence[];
}): BayesianResult[] {
  const { priors, evidence } = params;

  const updated = priors.map(p => {
    const safePrior = Math.max(0.001, Math.min(0.999, p.prior));
    let odds = safePrior / (1 - safePrior);

    for (const e of evidence) {
      const lr = Math.max(0.01, e.likelihoodRatio);
      odds *= e.present ? lr : 1 / lr;
    }

    const posterior = odds / (1 + odds);
    return {
      diagnosis: p.diagnosis,
      prior:     safePrior,
      posterior,
      delta:     posterior - safePrior,
    };
  });

  const total = updated.reduce((s, d) => s + d.posterior, 0) || 1;

  return updated
    .map(d => ({
      ...d,
      posterior: Math.round((d.posterior / total) * 1000) / 1000,
      delta:     Math.round(d.delta * 1000) / 1000,
    }))
    .sort((a, b) => b.posterior - a.posterior);
}

/**
 * buildEvidenceFromResult — extract positive-only evidence from a structured result.
 *
 * FIX (Issue #16): Previously used COMPLAINT_EVIDENCE to inject pre-fabricated
 * absent evidence for every complaint. This systematically biased all Bayesian
 * updates by penalizing diagnoses before any actual findings were considered.
 *
 * Fixed: this function now only produces positive evidence (present: true) from
 * explicitly observed findings in the result object. It does NOT insert negative
 * evidence for unobserved features — absence of evidence ≠ evidence of absence
 * unless the clinician explicitly documented that a finding was assessed and absent.
 *
 * To add negative evidence, use buildEvidenceWithNegatives() and pass explicit
 * "documented absent" findings.
 */
export function buildEvidenceFromResult(result: any): Evidence[] {
  const evidence: Evidence[] = [];

  // Extract positive evidence from commonly structured result fields
  const findings: string[] = [];

  if (Array.isArray(result.symptoms))    findings.push(...result.symptoms);
  if (Array.isArray(result.findings))    findings.push(...result.findings);
  if (Array.isArray(result.redFlags))    findings.push(...result.redFlags);
  if (typeof result.complaint === "string") findings.push(result.complaint);

  // Each finding becomes a positive evidence item with a default LR
  // Callers can override by building Evidence[] directly for more control
  for (const finding of findings) {
    if (!finding || typeof finding !== "string") continue;
    evidence.push({
      feature:         finding.toLowerCase().trim(),
      likelihoodRatio: 2.0,   // neutral default — callers should provide calibrated LRs
      present:         true,
    });
  }

  return evidence;
}

/**
 * buildEvidenceWithNegatives — build evidence including explicitly documented
 * absent findings.
 *
 * Use this variant ONLY when the clinical record explicitly documents that a
 * finding was assessed and found to be absent (e.g. "no diaphoresis on exam").
 * Do NOT infer absent evidence from the absence of a field in the result object.
 */
export function buildEvidenceWithNegatives(
  positiveFindings:       string[],
  documentedAbsentFindings: string[],
  likelihoods:             Record<string, number> = {},
): Evidence[] {
  const evidence: Evidence[] = [];

  for (const finding of positiveFindings) {
    evidence.push({
      feature:         finding.toLowerCase().trim(),
      likelihoodRatio: likelihoods[finding.toLowerCase()] ?? 2.0,
      present:         true,
    });
  }

  for (const finding of documentedAbsentFindings) {
    evidence.push({
      feature:         finding.toLowerCase().trim(),
      likelihoodRatio: likelihoods[finding.toLowerCase()] ?? 2.0,
      present:         false,   // explicitly documented as absent — not inferred
    });
  }

  return evidence;
}
