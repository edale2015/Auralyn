export function minimizeQuestions(qs: string[]): string[] {
  return qs.slice(0, 3);
}

export function debugFailure(err: string): string | undefined {
  if (err.includes("FHIR"))     return "Check token";
  if (err.includes("selector")) return "Heal selector";
  if (err.includes("network"))  return "Retry network call";
  if (err.includes("timeout"))  return "Increase timeout";
  return undefined;
}

export function trend(data: number[]): number {
  if (data.length < 2) return 0;
  return data[data.length - 1] - data[0];
}

export function captureTrace(traceId: string, step: string, data: unknown): void {
  console.log(JSON.stringify({ traceId, step, data, ts: new Date().toISOString() }));
}

export interface GoldenCase {
  input: Record<string, unknown>;
  expected: string;
}

export interface GoldenResult {
  expected: string;
  actual: string;
  match: boolean;
}

export async function runGoldenBatch(
  cases: GoldenCase[],
  runPipeline: (input: Record<string, unknown>) => Promise<string>
): Promise<GoldenResult[]> {
  return Promise.all(
    cases.map(async c => {
      const actual = await runPipeline(c.input);
      return { expected: c.expected, actual, match: c.expected === actual };
    })
  );
}
