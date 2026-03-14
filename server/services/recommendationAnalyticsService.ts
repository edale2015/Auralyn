export type TemplateRecommendation = {
  templateId: string
  label: string
  category: string
  usageCount: number
  acceptanceRate: number
  avgEditDistance: number
  topComplaint: string
  score: number
}

export type RecommendationSummary = {
  totalTemplatesUsed: number
  topTemplates: TemplateRecommendation[]
  byCategory: Record<string, { used: number; accepted: number; rate: number }>
  byComplaint: Record<string, { count: number; topTemplate: string }>
}

const usageLog: { templateId: string; label: string; category: string; complaint: string; accepted: boolean; editDistance: number }[] = []

export function recordTemplateUsage(
  templateId: string,
  label: string,
  category: string,
  complaint: string,
  accepted: boolean,
  editDistance = 0
) {
  usageLog.push({ templateId, label, category, complaint, accepted, editDistance })
}

export function getRecommendationSummary(): RecommendationSummary {
  const byTemplate: Record<string, TemplateRecommendation> = {}
  const byCategory: Record<string, { used: number; accepted: number; rate: number }> = {}
  const byComplaint: Record<string, { count: number; topTemplate: string; tCount: Record<string, number> }> = {}

  for (const log of usageLog) {
    if (!byTemplate[log.templateId]) {
      byTemplate[log.templateId] = {
        templateId: log.templateId,
        label: log.label,
        category: log.category,
        usageCount: 0,
        acceptanceRate: 0,
        avgEditDistance: 0,
        topComplaint: log.complaint,
        score: 0,
      }
    }
    const t = byTemplate[log.templateId]
    t.usageCount++
    t.avgEditDistance = (t.avgEditDistance * (t.usageCount - 1) + log.editDistance) / t.usageCount
    if (log.accepted) t.acceptanceRate = (t.acceptanceRate * (t.usageCount - 1) + 1) / t.usageCount

    const bc = byCategory[log.category] ?? { used: 0, accepted: 0, rate: 0 }
    bc.used++
    if (log.accepted) bc.accepted++
    bc.rate = bc.accepted / bc.used
    byCategory[log.category] = bc

    const bco = byComplaint[log.complaint] ?? { count: 0, topTemplate: log.templateId, tCount: {} }
    bco.count++
    bco.tCount[log.templateId] = (bco.tCount[log.templateId] ?? 0) + 1
    bco.topTemplate = Object.entries(bco.tCount).sort((a, b) => b[1] - a[1])[0][0]
    byComplaint[log.complaint] = bco
  }

  const topTemplates = Object.values(byTemplate)
    .map((t) => ({ ...t, score: t.acceptanceRate * 0.7 + (1 - t.avgEditDistance / 100) * 0.3 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)

  const byComplaintClean: Record<string, { count: number; topTemplate: string }> = {}
  for (const [k, v] of Object.entries(byComplaint)) {
    byComplaintClean[k] = { count: v.count, topTemplate: v.topTemplate }
  }

  return {
    totalTemplatesUsed: Object.keys(byTemplate).length,
    topTemplates,
    byCategory,
    byComplaint: byComplaintClean,
  }
}
