import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("[postgres.ts] DATABASE_URL is required");
}

export const pg = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.PG_POOL_MAX || "10", 10),
  idleTimeoutMillis: parseInt(process.env.PG_IDLE_TIMEOUT_MS || "30000", 10),
  connectionTimeoutMillis: parseInt(process.env.PG_CONN_TIMEOUT_MS || "5000", 10),
});

pg.on("error", (err) => {
  console.error("[postgres.ts] Pool error:", err.message);
});
