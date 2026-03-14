import { listTemplates, type MultilingualTemplate } from "./multilingualTemplateCrudService"
import { getRecommendationSummary } from "./recommendationAnalyticsService"

export type RankedTemplate = MultilingualTemplate & {
  rank: number
  score: number
  usageCount: number
  acceptanceRate: number
}

export function getRankedTemplates(lang = "en", category?: string): RankedTemplate[] {
  const templates = listTemplates(lang, category)
  const summary = getRecommendationSummary()
  const topMap = new Map(summary.topTemplates.map((t) => [t.templateId, t]))

  return templates
    .map((t, i) => {
      const analytics = topMap.get(t.id)
      return {
        ...t,
        rank: i + 1,
        score: analytics?.score ?? 0.5,
        usageCount: analytics?.usageCount ?? 0,
        acceptanceRate: analytics?.acceptanceRate ?? 0,
      }
    })
    .sort((a, b) => b.score - a.score)
    .map((t, i) => ({ ...t, rank: i + 1 }))
}
