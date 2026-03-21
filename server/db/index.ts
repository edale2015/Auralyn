import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL_PRIMARY ?? process.env.DATABASE_URL ?? undefined,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : undefined
});

pool.on("error", (err: any) => {
  console.error("[DB] Pool error:", err?.message || err);
});

export async function query(text: string, values?: unknown[]): Promise<any> {
  return pool.query(text, values as any);
}

export async function withTransaction<T>(fn: (client: any) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function testDbConnection(): Promise<{ ok: number }> {
  const result = await pool.query("SELECT 1 as ok");
  return result.rows[0];
}

export { pool };

export { dbHealthCheck, dbWrite, dbRead, getDb } from "./dbRouter";
