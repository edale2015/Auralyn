import { runStartupChecks } from "../config/startupChecks"
import { checkAllProviders } from "./providerHealthService"
import { checkMigrations } from "./migrationCheckService"
import { deadLetterStats } from "./ehrDeadLetterService"

export type HealthBundle = {
  ok: boolean
  timestamp: string
  env: Awaited<ReturnType<typeof runStartupChecks>>
  providers: Awaited<ReturnType<typeof checkAllProviders>>
  migrations: Awaited<ReturnType<typeof checkMigrations>>
  deadLetter: ReturnType<typeof deadLetterStats>
}

export async function buildHealthBundle(): Promise<HealthBundle> {
  const [env, providers, migrations] = await Promise.all([
    runStartupChecks(),
    checkAllProviders(),
    checkMigrations(),
  ])

  const ok =
    env.every((c) => c.ok) &&
    migrations.ok

  return {
    ok,
    timestamp: new Date().toISOString(),
    env,
    providers,
    migrations,
    deadLetter: deadLetterStats(),
  }
}
