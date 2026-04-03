import { pool } from "../db/pool";

function lockKey(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export async function runWithAdvisoryLock(
  name: string,
  fn: () => Promise<void>
): Promise<{ ran: boolean }> {
  const client = await pool.connect();
  const key = lockKey(name);
  try {
    const { rows } = await client.query(
      `SELECT pg_try_advisory_lock($1) AS locked`,
      [key]
    );
    if (!rows[0]?.locked) return { ran: false };

    try {
      await fn();
      return { ran: true };
    } finally {
      await client.query(`SELECT pg_advisory_unlock($1)`, [key]);
    }
  } finally {
    client.release();
  }
}
