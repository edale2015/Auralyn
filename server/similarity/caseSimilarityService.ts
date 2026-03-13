import { extractCaseFeatures } from "./caseFeatureExtractor"
import { loadSimilarityIndex } from "./caseSimilarityStore"
import { scoreCaseSimilarity } from "./similarityScorer"

export interface SimilaritySummary {
  topDiagnoses: Array<{ diagnosis: string; count: number }>
  topDispositions: Array<{ disposition: string; count: number }>
  safetyWarnings: Array<{ diagnosis: string; cases: number; message: string }>
}

export interface SimilarityResult {
  query: ReturnType<typeof extractCaseFeatures>
  similarCases: any[]
  summary: SimilaritySummary
}

export async function findSimilarCasesForState(
  state: any,
  limit = 5
): Promise<SimilarityResult> {
  const current = extractCaseFeatures(state)
  const index = await loadSimilarityIndex()

  const scored = index
    .filter((row: any) => row.caseId !== current.caseId)
    .map((row: any) => ({
      ...row,
      similarityScore: scoreCaseSimilarity(current, row),
    }))
    .filter((row: any) => row.similarityScore > 0.1)
    .sort((a: any, b: any) => b.similarityScore - a.similarityScore)
    .slice(0, limit)

  const topDiagnosesMap: Record<string, number> = {}
  const topDispositionsMap: Record<string, number> = {}
  const safetyMissMap: Record<string, number> = {}

  for (const row of scored) {
    const dx = row.outcome?.actualDiagnosis || row.differential?.[0] || "unknown"
    const disp = row.outcome?.actualDisposition || row.disposition || "unknown"

    topDiagnosesMap[dx] = (topDiagnosesMap[dx] ?? 0) + 1
    topDispositionsMap[disp] = (topDispositionsMap[disp] ?? 0) + 1

    if (row.outcome?.safetyMiss && dx !== "unknown") {
      safetyMissMap[dx] = (safetyMissMap[dx] ?? 0) + 1
    }
  }

  const safetyWarnings = Object.entries(safetyMissMap)
    .filter(([, n]) => n > 0)
    .map(([diagnosis, cases]) => ({
      diagnosis,
      cases,
      message: `${cases} similar prior case(s) with "${diagnosis}" had a safety miss — review carefully.`,
    }))

  return {
    query: current,
    similarCases: scored,
    summary: {
      topDiagnoses: Object.entries(topDiagnosesMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([diagnosis, count]) => ({ diagnosis, count })),
      topDispositions: Object.entries(topDispositionsMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([disposition, count]) => ({ disposition, count })),
      safetyWarnings,
    },
  }
}
