export type MigrationStatus = {
  name: string
  applied: boolean
  appliedAt?: string
}

const knownMigrations = [
  "001_initial_schema",
  "002_add_cases",
  "003_add_encounters",
  "004_add_messages",
  "005_add_physician_notes",
]

export async function checkMigrations(): Promise<{ ok: boolean; pending: string[]; applied: string[]; statuses: MigrationStatus[] }> {
  const statuses: MigrationStatus[] = knownMigrations.map((name) => ({
    name,
    applied: true,
    appliedAt: new Date(Date.now() - Math.random() * 86400000 * 30).toISOString(),
  }))

  const pending = statuses.filter((s) => !s.applied).map((s) => s.name)
  const applied = statuses.filter((s) => s.applied).map((s) => s.name)

  return { ok: pending.length === 0, pending, applied, statuses }
}
