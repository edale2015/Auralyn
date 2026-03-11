type GraphComparatorInput = {
  actual: any;
  expected: any;
};

type GraphComparatorResult = {
  passed: boolean;
  failures: string[];
};

function startsWithArray(actual: string[], expectedPrefix: string[]): boolean {
  if (expectedPrefix.length > actual.length) return false;
  return expectedPrefix.every((item, idx) => actual[idx] === item);
}

export function compareGraphGoldenCase({
  actual,
  expected,
}: GraphComparatorInput): GraphComparatorResult {
  const failures: string[] = [];

  if (Array.isArray(expected.expected_skill_path_prefix)) {
    if (
      !startsWithArray(
        actual.completed_skills ?? [],
        expected.expected_skill_path_prefix
      )
    ) {
      failures.push(
        `graph_skill_path expected prefix ${JSON.stringify(
          expected.expected_skill_path_prefix
        )} but got ${JSON.stringify(actual.completed_skills ?? [])}`
      );
    }
  }

  if (typeof expected.expected_stop_reason_contains === "string") {
    const stopReason = String(actual.stop_reason ?? "");
    if (
      !stopReason
        .toLowerCase()
        .includes(expected.expected_stop_reason_contains.toLowerCase())
    ) {
      failures.push(
        `graph_stop_reason expected to contain "${expected.expected_stop_reason_contains}" but got "${stopReason}"`
      );
    }
  }

  if (typeof expected.expected_max_total_cost_usd === "number") {
    const actualCost = Number(actual.total_estimated_cost_usd ?? 0);
    if (actualCost > expected.expected_max_total_cost_usd) {
      failures.push(
        `graph_total_cost expected <= ${expected.expected_max_total_cost_usd} but got ${actualCost}`
      );
    }
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}
