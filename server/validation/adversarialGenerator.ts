/**
 * Adversarial case generator.
 *
 * Creates brittle, sparse, contradictory, and omission-heavy variants
 * from a set of base golden cases to stress-test the diagnosis engine
 * beyond well-formed inputs.
 */

import { GoldenCase } from "./goldenCaseTypes";

/** Return only the first ⌊n/2⌋ observations (minimum 1). */
export function generateSparseVariant(base: GoldenCase): GoldenCase {
  return {
    ...base,
    id:           `${base.id}__sparse`,
    title:        `${base.title} [Sparse]`,
    observations: base.observations.slice(0, Math.max(1, Math.floor(base.observations.length / 2))),
  };
}

/** Append a physiologically impossible contradiction marker. */
export function generateContradictoryVariant(base: GoldenCase): GoldenCase {
  return {
    ...base,
    id:           `${base.id}__contradictory`,
    title:        `${base.title} [Contradictory]`,
    observations: [...base.observations, { feature: "contradiction_marker", value: true }],
  };
}

/** Remove one critical feature from observations. */
export function generateMissingCriticalVariant(
  base:           GoldenCase,
  missingFeature: string,
): GoldenCase {
  return {
    ...base,
    id:           `${base.id}__missing_${missingFeature}`,
    title:        `${base.title} [Missing ${missingFeature}]`,
    observations: base.observations.filter((o) => o.feature !== missingFeature),
  };
}

/** Negate every boolean observation (present → absent). */
export function generateNegatedVariant(base: GoldenCase): GoldenCase {
  return {
    ...base,
    id:           `${base.id}__negated`,
    title:        `${base.title} [Negated]`,
    observations: base.observations.map((o) => ({
      ...o,
      value: typeof o.value === "boolean" ? !o.value : o.value,
    })),
  };
}

/**
 * Expand a seed set into 4× variants:
 *  original + sparse + contradictory + missing-first-feature
 */
export function expandAdversarialSet(baseCases: GoldenCase[]): GoldenCase[] {
  const out: GoldenCase[] = [];

  for (const c of baseCases) {
    out.push(c);
    out.push(generateSparseVariant(c));
    out.push(generateContradictoryVariant(c));
    if (c.observations[0]?.feature) {
      out.push(generateMissingCriticalVariant(c, c.observations[0].feature));
    }
  }

  return out;
}
