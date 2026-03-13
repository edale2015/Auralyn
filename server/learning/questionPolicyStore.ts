import * as fs from "fs/promises"
import * as path from "path"
import type { QuestionPolicy, QuestionImpact } from "./questionPolicyTypes"

const RUNTIME_DIR = path.resolve(process.cwd(), "server/data/runtime")
const POLICY_FILE = path.join(RUNTIME_DIR, "question_policies.ndjson")
const IMPACT_FILE = path.join(RUNTIME_DIR, "question_impacts.ndjson")

async function ensureDir() {
  await fs.mkdir(RUNTIME_DIR, { recursive: true })
}

export async function loadPolicies(): Promise<QuestionPolicy[]> {
  try {
    const raw = await fs.readFile(POLICY_FILE, "utf8")
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => JSON.parse(l))
  } catch {
    return []
  }
}

export async function savePolicy(policy: QuestionPolicy): Promise<void> {
  await ensureDir()
  const policies = await loadPolicies()
  const idx = policies.findIndex(
    (p) => p.question === policy.question && p.complaint === policy.complaint
  )
  if (idx >= 0) policies[idx] = policy
  else policies.push(policy)
  await fs.writeFile(
    POLICY_FILE,
    policies.map((p) => JSON.stringify(p)).join("\n") + "\n",
    "utf8"
  )
}

export async function getPolicy(
  question: string,
  complaint: string
): Promise<QuestionPolicy> {
  const policies = await loadPolicies()
  return (
    policies.find((p) => p.question === question && p.complaint === complaint) ?? {
      question,
      complaint,
      weight: 1.0,
      timesAsked: 0,
      timesImproved: 0,
      avgEntropyReduction: 0,
      avgDiagnosisShift: 0,
      lastUpdated: new Date().toISOString(),
    }
  )
}

export async function appendImpact(impact: QuestionImpact): Promise<void> {
  await ensureDir()
  await fs.appendFile(IMPACT_FILE, JSON.stringify(impact) + "\n", "utf8")
}

export async function loadImpacts(): Promise<QuestionImpact[]> {
  try {
    const raw = await fs.readFile(IMPACT_FILE, "utf8")
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => JSON.parse(l))
  } catch {
    return []
  }
}
