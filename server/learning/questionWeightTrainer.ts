import { getPolicy, savePolicy, loadImpacts } from "./questionPolicyStore"
import type { PolicyUpdateResult } from "./questionPolicyTypes"

const LEARNING_RATE = 0.15
const MIN_WEIGHT = 0.1
const MAX_WEIGHT = 3.0
const MIN_SAMPLES = 2

export async function trainQuestionWeights(
  complaint?: string
): Promise<PolicyUpdateResult[]> {
  const impacts = await loadImpacts()
  const filtered = complaint
    ? impacts.filter((i) => i.complaint === complaint)
    : impacts

  const grouped: Record<string, typeof filtered> = {}
  for (const impact of filtered) {
    const key = `${impact.complaint}::${impact.question}`
    grouped[key] = grouped[key] ?? []
    grouped[key].push(impact)
  }

  const results: PolicyUpdateResult[] = []

  for (const [key, group] of Object.entries(grouped)) {
    if (group.length < MIN_SAMPLES) continue
    const [comp, ...qParts] = key.split("::")
    const question = qParts.join("::")

    const avgReduction = group.reduce((s, i) => s + i.entropyReduction, 0) / group.length
    const pctImproved =
      group.filter((i) => i.entropyReduction > 0.05).length / group.length

    const policy = await getPolicy(question, comp)

    const reward = avgReduction * 0.6 + pctImproved * 0.4
    const delta = LEARNING_RATE * (reward - 0.3)
    const newWeight = Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, policy.weight + delta))

    const updated = {
      ...policy,
      weight: newWeight,
      timesAsked: group.length,
      timesImproved: group.filter((i) => i.entropyReduction > 0.05).length,
      avgEntropyReduction: avgReduction,
      avgDiagnosisShift: group.filter((i) => i.diagnosisShifted).length / group.length,
      lastUpdated: new Date().toISOString(),
    }

    await savePolicy(updated)

    results.push({
      question,
      complaint: comp,
      previousWeight: policy.weight,
      newWeight,
      deltaWeight: delta,
      reason:
        `avgReduction=${avgReduction.toFixed(3)}, ` +
        `pctImproved=${(pctImproved * 100).toFixed(0)}%, ` +
        `samples=${group.length}`,
    })
  }

  return results
}
