interface FeatureSet {
  complaint: string
  symptoms: string[]
  alerts: string[]
  disposition: string
  differential: string[]
  ageBucket?: string
  sex?: string
}

function jaccardScore(a: string[], b: string[]): number {
  if (!a.length && !b.length) return 1
  if (!a.length || !b.length) return 0
  const setA = new Set(a)
  const setB = new Set(b)
  let intersection = 0
  for (const item of setA) {
    if (setB.has(item)) intersection++
  }
  const union = new Set([...a, ...b]).size
  return union === 0 ? 0 : intersection / union
}

export function scoreCaseSimilarity(
  current: FeatureSet,
  prior: FeatureSet
): number {
  let score = 0

  if (current.complaint === prior.complaint) score += 0.35
  else if (current.complaint !== "unknown" && prior.complaint !== "unknown") {
    score += 0
  }

  score += jaccardScore(current.symptoms, prior.symptoms) * 0.30
  score += jaccardScore(current.alerts, prior.alerts) * 0.10
  score += jaccardScore(current.differential, prior.differential) * 0.10

  if (current.disposition === prior.disposition) score += 0.05
  if (current.ageBucket && current.ageBucket === prior.ageBucket) score += 0.05
  if (current.sex && current.sex === prior.sex) score += 0.05

  return Math.min(1, Math.max(0, score))
}
