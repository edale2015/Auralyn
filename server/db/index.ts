import { Pool, PoolClient } from "pg";
import { logger } from "../utils/logger";

const SLOW_QUERY_THRESHOLD_MS = 500;
const STATEMENT_TIMEOUT_MS = 10_000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL_PRIMARY ?? process.env.DATABASE_URL ?? undefined,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : undefined,
});

pool.on("error", (err: any) => {
  logger.error("db_pool_error", { message: err?.message || String(err) });
});

pool.on("connect", (client: PoolClient) => {
  client.query(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`).catch(() => {});
});

const _poolMetrics = {
  totalQueries: 0,
  slowQueries: 0,
  errors: 0,
  avgLatencyMs: 0,
  _latencySum: 0,
};

export function getPoolMetrics() {
  return {
    totalQueries: _poolMetrics.totalQueries,
    slowQueries: _poolMetrics.slowQueries,
    errors: _poolMetrics.errors,
    avgLatencyMs: _poolMetrics.totalQueries > 0
      ? Math.round(_poolMetrics._latencySum / _poolMetrics.totalQueries)
      : 0,
    totalConnections: pool.totalCount,
    idleConnections: pool.idleCount,
    waitingClients: pool.waitingCount,
  };
}

export async function query(text: string, values?: unknown[]): Promise<any> {
  const start = Date.now();
  _poolMetrics.totalQueries++;
  try {
    const result = await pool.query(text, values as any);
    const elapsed = Date.now() - start;
    _poolMetrics._latencySum += elapsed;
    if (elapsed > SLOW_QUERY_THRESHOLD_MS) {
      _poolMetrics.slowQueries++;
      logger.warn("db_slow_query", {
        durationMs: elapsed,
        query: text.slice(0, 200),
        threshold: SLOW_QUERY_THRESHOLD_MS,
      });
    }
    return result;
  } catch (err: any) {
    _poolMetrics.errors++;
    logger.error("db_query_error", { query: text.slice(0, 200), message: err?.message });
    throw err;
  }
}

const TRANSIENT_ERROR_CODES = new Set(["40001", "40P01", "57P01", "08006", "08003"]);

function isTransientError(err: any): boolean {
  return TRANSIENT_ERROR_CODES.has(err?.code);
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>, maxRetries = 3): Promise<T> {
  let attempt = 0;
  while (true) {
    attempt++;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err: any) {
      await client.query("ROLLBACK").catch(() => {});
      if (isTransientError(err) && attempt < maxRetries) {
        const backoff = 100 * Math.pow(2, attempt - 1);
        logger.warn("db_transaction_retry", { attempt, code: err?.code, backoffMs: backoff });
        await new Promise(r => setTimeout(r, backoff));
        continue;
      }
      logger.error("db_transaction_failed", { attempt, code: err?.code, message: err?.message });
      throw err;
    } finally {
      client.release();
    }
  }
}

export async function testDbConnection(): Promise<{ ok: number }> {
  const result = await pool.query("SELECT 1 as ok");
  return result.rows[0];
}

export { pool };

export { dbHealthCheck, dbWrite, dbRead, getDb } from "./dbRouter";
