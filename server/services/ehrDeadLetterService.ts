export type DeadLetterEntry = {
  id: string
  caseId: string
  error: string
  payload: unknown
  createdAt: string
  resolvedAt?: string
  resolved: boolean
  retryCount: number
}

const store: DeadLetterEntry[] = []

export function addToDeadLetter(entry: Omit<DeadLetterEntry, "id" | "resolved" | "retryCount">) {
  store.push({ ...entry, id: `dl_${Date.now()}`, resolved: false, retryCount: 0 })
}

export function listDeadLetters(includeResolved = false): DeadLetterEntry[] {
  return store.filter((e) => includeResolved || !e.resolved)
}

export function resolveDeadLetter(id: string): boolean {
  const entry = store.find((e) => e.id === id)
  if (!entry) return false
  entry.resolved = true
  entry.resolvedAt = new Date().toISOString()
  return true
}

export function retryDeadLetter(id: string): DeadLetterEntry | null {
  const entry = store.find((e) => e.id === id && !e.resolved)
  if (!entry) return null
  entry.retryCount++
  return entry
}

export function deadLetterStats() {
  return {
    total: store.length,
    unresolved: store.filter((e) => !e.resolved).length,
    resolved: store.filter((e) => e.resolved).length,
  }
}
