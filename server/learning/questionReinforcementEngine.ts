import { loadPolicies, savePolicy } from "./questionPolicyStore"

export interface OutcomeSignal {
  questionsAsked: string[]
  complaint: string
  correctDiagnosis: boolean
  entropyReduction?: number
}

export async function reinforceQuestionWeights(signal: OutcomeSignal): Promise<void> {
  const policies = await loadPolicies()

  for (const question of signal.questionsAsked ?? []) {
    let policy = policies.find(
      (p) => p.question === question && p.complaint === signal.complaint
    )

    if (!policy) {
      policy = {
        question,
        complaint: signal.complaint,
        weight: 1.0,
        timesAsked: 0,
        impactScore: 0,
      }
      policies.push(policy)
    }

    if (signal.correctDiagnosis) {
      policy.weight = Math.min(3.0, policy.weight + 0.1)
      policy.impactScore = Math.min(1.0, policy.impactScore + 0.05)
    } else {
      policy.weight = Math.max(0.1, policy.weight - 0.05)
    }

    if (signal.entropyReduction !== undefined && signal.entropyReduction > 0) {
      policy.impactScore = Math.min(
        1.0,
        (policy.impactScore * policy.timesAsked + signal.entropyReduction) /
          (policy.timesAsked + 1)
      )
    }

    policy.timesAsked += 1
  }

  for (const p of policies) {
    await savePolicy(p)
  }
}

export async function getTopReinforcedQuestions(
  complaint: string,
  limit = 5
): Promise<Array<{ question: string; weight: number; impactScore: number }>> {
  const policies = await loadPolicies()
  return policies
    .filter((p) => p.complaint === complaint && p.timesAsked > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
    .map(({ question, weight, impactScore }) => ({ question, weight, impactScore }))
}
