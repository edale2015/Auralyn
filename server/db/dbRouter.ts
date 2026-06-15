import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import { isChaosActive } from "../chaos/chaosEngine";

const { Pool } = pg;

function createPool(url: string, label: string) {
  if (!url) throw new Error(`[DbRouter] Missing connection string for ${label}`);
  return new Pool({
    connectionString: url,
    max: parseInt(process.env.PG_POOL_MAX || "5", 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

const primaryPool = createPool(
  process.env.DATABASE_URL_PRIMARY ?? process.env.DATABASE_URL ?? "",
  "primary"
);

let replicaPool: pg.Pool | null = null;
if (process.env.DATABASE_URL_REPLICA) {
  try {
    replicaPool = createPool(process.env.DATABASE_URL_REPLICA, "replica");
    console.log("[DbRouter] Read replica pool initialized");
  } catch (e: any) {
    console.warn("[DbRouter] Replica pool unavailable:", e?.message);
  }
}

export const dbWrite = drizzle(primaryPool, { schema });
export const dbRead = drizzle(replicaPool ?? primaryPool, { schema });

export function getDb(mode: "read" | "write" = "write") {
  if (isChaosActive("db_down")) {
    throw new Error("CHAOS_DB_DOWN: database failure injected");
  }
  if (mode === "read" && replicaPool) return dbRead;
  return dbWrite;
}

export async function dbHealthCheck(): Promise<{ ok: boolean; latencyMs: number; replica: boolean }> {
  const start = Date.now();
  let client: pg.PoolClient | undefined;
  try {
    client = await primaryPool.connect();
    await client.query("SET statement_timeout = 3000; SELECT 1");
    return { ok: true, latencyMs: Date.now() - start, replica: !!replicaPool };
  } catch {
    return { ok: false, latencyMs: Date.now() - start, replica: !!replicaPool };
  } finally {
    client?.release();
  }
}

export async function query<T = any>(text: string, params: any[] = []): Promise<{ rows: T[]; rowCount: number | null }> {
  return primaryPool.query<T>(text, params);
}

export async function testDbConnection(): Promise<{ ok: boolean }> {
  const result = await query<{ ok: number }>("SELECT 1 AS ok", []);
  return { ok: result.rows[0]?.ok === 1 };
}
