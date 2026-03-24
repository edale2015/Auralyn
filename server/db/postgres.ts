import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("[postgres.ts] DATABASE_URL is required");
}

export const pg = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pg.on("error", (err) => {
  console.error("[postgres.ts] Pool error:", err.message);
});
