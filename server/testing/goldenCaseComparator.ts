type ComparatorInput = {
  actual: any;
  expected: any;
};

type ComparatorResult = {
  passed: boolean;
  failures: string[];
};

function includesCaseInsensitive(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function compareArrayContains(actual: any[], expected: any[], label: string, failures: string[]) {
  for (const item of expected) {
    const found = actual.some((a) =>
      String(a).toLowerCase() === String(item).toLowerCase() ||
      includesCaseInsensitive(String(a), String(item))
    );
    if (!found) failures.push(`${label} missing expected item: ${item}`);
  }
}

export function compareGoldenCase({ actual, expected }: ComparatorInput): ComparatorResult {
  const failures: string[] = [];

  if (expected.complaint_id && actual.complaint_id !== expected.complaint_id) {
    failures.push(`complaint_id expected ${expected.complaint_id} but got ${actual.complaint_id}`);
  }

  if (expected.disposition && actual.disposition !== expected.disposition) {
    failures.push(`disposition expected ${expected.disposition} but got ${actual.disposition}`);
  }

  if (typeof expected.clinical_score_name === "string") {
    if (actual.clinical_score_name !== expected.clinical_score_name) {
      failures.push(
        `clinical_score_name expected ${expected.clinical_score_name} but got ${actual.clinical_score_name}`
      );
    }
  }

  if (typeof expected.clinical_score_min === "number") {
    if (typeof actual.clinical_score_value !== "number" || actual.clinical_score_value < expected.clinical_score_min) {
      failures.push(
        `clinical_score_value expected >= ${expected.clinical_score_min} but got ${actual.clinical_score_value}`
      );
    }
  }

  if (Array.isArray(expected.red_flag_hits_contains)) {
    compareArrayContains(
      actual.red_flag_hits ?? [],
      expected.red_flag_hits_contains,
      "red_flag_hits",
      failures
    );
  }

  if (Array.isArray(expected.top_differential_contains)) {
    compareArrayContains(
      actual.top_differential ?? [],
      expected.top_differential_contains,
      "top_differential",
      failures
    );
  }

  if (Array.isArray(expected.affirmed_symptoms_contains)) {
    compareArrayContains(
      actual.affirmed_symptoms ?? [],
      expected.affirmed_symptoms_contains,
      "affirmed_symptoms",
      failures
    );
  }

  if (Array.isArray(expected.negated_symptoms_contains)) {
    compareArrayContains(
      actual.negated_symptoms ?? [],
      expected.negated_symptoms_contains,
      "negated_symptoms",
      failures
    );
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}
