import type { SyntheticCase } from "./syntheticCaseGenerator";
import { runEngineOnCases, type EngineRunResult } from "./engineMassRunner";

export async function runEngineParallel(cases: SyntheticCase[], concurrency = 5): Promise<EngineRunResult[]> {
  const results: EngineRunResult[] = [];
  const chunks: SyntheticCase[][] = [];

  for (let i = 0; i < cases.length; i += concurrency) {
    chunks.push(cases.slice(i, i + concurrency));
  }

  for (const chunk of chunks) {
    const chunkResults = await Promise.all(chunk.map((c) => runEngineOnCases([c]).then((r) => r[0])));
    results.push(...chunkResults);
  }

  return results;
}
