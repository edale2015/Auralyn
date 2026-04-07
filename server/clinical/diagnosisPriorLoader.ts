export interface DiagnosisPrior {
  diagnosis: string;
  baseProbability: number;
  featureLikelihoods: Record<string, number>;
  ruleId?: string;
  version?: number;
  tableName?: string;
}

export type PriorSource = "KB_DB" | "CSV" | "GOOGLE_SHEETS_CACHE" | "FALLBACK_HARDCODED";

export interface PriorBundle {
  ccId: string;
  version: number;
  loadedAt: string;
  source: PriorSource;
  priors: DiagnosisPrior[];
}

export interface RawPriorRow {
  ccId: string;
  diagnosis: string;
  baseProbability: number;
  feature: string;
  likelihood: number;
  version: number;
}

// ── Validation helpers ────────────────────────────────────────────────────────

function isFiniteProbability(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= 1
  );
}

function normalizeFeatureName(name: string): string {
  return name.trim().toLowerCase();
}

export function validateDiagnosisPrior(prior: DiagnosisPrior, ccId: string): void {
  if (!prior.diagnosis?.trim()) {
    throw new Error(`[Priors] ${ccId}: missing diagnosis name`);
  }

  if (!isFiniteProbability(prior.baseProbability)) {
    throw new Error(
      `[Priors] ${ccId}:${prior.diagnosis} invalid baseProbability=${prior.baseProbability} (must be finite and in (0,1])`
    );
  }

  if (
    !prior.featureLikelihoods ||
    typeof prior.featureLikelihoods !== "object" ||
    Array.isArray(prior.featureLikelihoods)
  ) {
    throw new Error(
      `[Priors] ${ccId}:${prior.diagnosis} missing featureLikelihoods object`
    );
  }

  const featureNames = Object.keys(prior.featureLikelihoods);

  if (featureNames.length === 0) {
    throw new Error(
      `[Priors] ${ccId}:${prior.diagnosis} has no modeled features`
    );
  }

  for (const feature of featureNames) {
    if (!normalizeFeatureName(feature)) {
      throw new Error(
        `[Priors] ${ccId}:${prior.diagnosis} contains blank feature name`
      );
    }

    const value = prior.featureLikelihoods[feature];
    if (!isFiniteProbability(value)) {
      throw new Error(
        `[Priors] ${ccId}:${prior.diagnosis} invalid likelihood ${feature}=${value} (must be finite and in (0,1])`
      );
    }
  }
}

export function validatePriorBundle(bundle: PriorBundle): void {
  if (!bundle.ccId?.trim()) {
    throw new Error("[Priors] Missing ccId in bundle");
  }

  if (!Number.isFinite(bundle.version) || bundle.version <= 0) {
    throw new Error(
      `[Priors] ${bundle.ccId}: invalid version=${bundle.version}`
    );
  }

  if (!bundle.loadedAt?.trim()) {
    throw new Error(`[Priors] ${bundle.ccId}: missing loadedAt`);
  }

  if (!Array.isArray(bundle.priors) || bundle.priors.length === 0) {
    throw new Error(`[Priors] ${bundle.ccId}: no priors loaded`);
  }

  const seenDiagnoses = new Set<string>();

  for (const prior of bundle.priors) {
    validateDiagnosisPrior(prior, bundle.ccId);

    const key = prior.diagnosis.trim().toLowerCase();
    if (seenDiagnoses.has(key)) {
      throw new Error(
        `[Priors] ${bundle.ccId}: duplicate diagnosis "${prior.diagnosis}"`
      );
    }
    seenDiagnoses.add(key);
  }

  const allFeatures = new Set<string>();
  for (const prior of bundle.priors) {
    Object.keys(prior.featureLikelihoods).forEach((f) =>
      allFeatures.add(normalizeFeatureName(f))
    );
  }

  if (allFeatures.size < 3) {
    console.warn(
      `[Priors] ${bundle.ccId}: very low feature coverage (${allFeatures.size} distinct features across all diagnoses)`
    );
  }
}

export function assemblePriorBundle(
  ccId: string,
  rows: RawPriorRow[]
): PriorBundle {
  const wrongComplaint = rows.find((r) => r.ccId !== ccId);
  if (wrongComplaint) {
    throw new Error(
      `[Priors] Complaint contamination: expected ccId="${ccId}", found row for ccId="${wrongComplaint.ccId}"`
    );
  }

  const byDiagnosis = new Map<string, DiagnosisPrior>();

  for (const row of rows) {
    if (!byDiagnosis.has(row.diagnosis)) {
      byDiagnosis.set(row.diagnosis, {
        diagnosis: row.diagnosis,
        baseProbability: row.baseProbability,
        featureLikelihoods: {},
        version: row.version,
        tableName: "diagnosis_priors",
      });
    }
    byDiagnosis.get(row.diagnosis)!.featureLikelihoods[row.feature] =
      row.likelihood;
  }

  const bundle: PriorBundle = {
    ccId,
    version: rows[0]?.version ?? 1,
    loadedAt: new Date().toISOString(),
    source: "KB_DB",
    priors: Array.from(byDiagnosis.values()),
  };

  validatePriorBundle(bundle);
  return bundle;
}

export function validateScorerCompatibility(
  scoringModule: string,
  priors: PriorBundle
): void {
  if (scoringModule === "bayesian" && priors.priors.length === 0) {
    throw new Error(
      "[Priors] Bayesian scorer requires at least one diagnosis prior"
    );
  }

  if (scoringModule !== "bayesian" && priors.priors.length > 0) {
    console.warn(
      `[Priors] Bundle has ${priors.priors.length} diagnosis prior(s) but scoringModule="${scoringModule}" — verify this is intentional`
    );
  }
}

// ── Cache + lazy load ─────────────────────────────────────────────────────────

const priorCache = new Map<string, PriorBundle>();
const PRIOR_CACHE_TTL_MS = 5 * 60_000;

async function loadPriorsFromRegistry(_ccId: string): Promise<PriorBundle> {
  throw new Error(
    `[Priors] No registry adapter registered — call registerPriorLoader() first`
  );
}

type PriorLoader = (ccId: string) => Promise<RawPriorRow[]>;
let _registeredLoader: PriorLoader | null = null;

export function registerPriorLoader(loader: PriorLoader): void {
  _registeredLoader = loader;
}

export async function loadComplaintPriors(ccId: string): Promise<PriorBundle> {
  const cached = priorCache.get(ccId);
  const cacheFresh =
    cached &&
    Date.now() - new Date(cached.loadedAt).getTime() < PRIOR_CACHE_TTL_MS;

  if (cacheFresh) {
    return cached!;
  }

  try {
    if (!_registeredLoader) {
      await loadPriorsFromRegistry(ccId);
      throw new Error("unreachable");
    }

    const rows = await _registeredLoader(ccId);
    const bundle = assemblePriorBundle(ccId, rows);
    priorCache.set(ccId, bundle);
    return bundle;
  } catch (err) {
    console.error(`[Priors] Failed to load priors for "${ccId}":`, err);

    if (cached) {
      console.warn(
        `[Priors] Using last-known-good prior bundle for "${ccId}" (version=${cached.version})`
      );
      return cached;
    }

    throw err;
  }
}

export function invalidatePriorCache(ccId?: string): void {
  if (ccId) {
    priorCache.delete(ccId);
  } else {
    priorCache.clear();
  }
}

export function getPriorCacheSnapshot(): Map<string, PriorBundle> {
  return new Map(priorCache);
}

export function _injectPriorCacheForTest(
  ccId: string,
  bundle: PriorBundle
): void {
  priorCache.set(ccId, bundle);
}
