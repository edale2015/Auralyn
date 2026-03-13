import * as fs from "fs/promises"
import * as path from "path"

const FILE = path.resolve(
  process.cwd(),
  "data/runtime/case_similarity_index.json"
)

export async function loadSimilarityIndex(): Promise<any[]> {
  try {
    const raw = await fs.readFile(FILE, "utf8")
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export async function saveSimilarityIndex(rows: any[]): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true })
  await fs.writeFile(FILE, JSON.stringify(rows, null, 2), "utf8")
}

export async function upsertCaseInIndex(features: any): Promise<void> {
  const index = await loadSimilarityIndex()
  const existing = index.findIndex(r => r.caseId === features.caseId)
  if (existing >= 0) {
    index[existing] = features
  } else {
    index.push(features)
  }
  await saveSimilarityIndex(index)
}
