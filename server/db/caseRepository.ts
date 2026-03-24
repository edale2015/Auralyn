import { pg } from "./postgres";
import { getRedisClient } from "../redis/redisClient";

const CACHE_TTL_SECONDS = 3600;

export interface CaseRecord {
  caseId: string;
  complaint: string;
  diagnosis: string;
  riskScore: number | null;
  physician?: string | null;
  price?: number | null;
  billingCode?: string | null;
  disposition?: string | null;
  malpracticeRisk?: number | null;
}

export async function saveCase(caseData: CaseRecord): Promise<void> {
  try {
    await pg.query(
      `INSERT INTO cases (
         case_id, complaint, diagnosis, risk_score,
         physician, price, billing_code, disposition, malpractice_risk
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (case_id) DO UPDATE SET
         diagnosis        = EXCLUDED.diagnosis,
         risk_score       = EXCLUDED.risk_score,
         physician        = EXCLUDED.physician,
         price            = EXCLUDED.price,
         billing_code     = EXCLUDED.billing_code,
         disposition      = EXCLUDED.disposition,
         malpractice_risk = EXCLUDED.malpractice_risk,
         updated_at       = NOW()`,
      [
        caseData.caseId,
        caseData.complaint,
        caseData.diagnosis ?? caseData.complaint,
        caseData.riskScore ?? null,
        caseData.physician ?? null,
        caseData.price ?? null,
        caseData.billingCode ?? null,
        caseData.disposition ?? null,
        caseData.malpracticeRisk ?? null,
      ]
    );

    const redis = await getRedisClient();
    if (redis) {
      await redis.set(
        `case:${caseData.caseId}`,
        JSON.stringify(caseData),
        "EX",
        CACHE_TTL_SECONDS
      );
    }
  } catch (e: any) {
    console.error("[caseRepository] saveCase error:", e.message);
  }
}

export async function getCase(caseId: string): Promise<CaseRecord | null> {
  try {
    const redis = await getRedisClient();
    if (redis) {
      const cached = await redis.get(`case:${caseId}`);
      if (cached) return JSON.parse(cached);
    }

    const res = await pg.query(
      `SELECT case_id AS "caseId", complaint, diagnosis, risk_score AS "riskScore",
              physician, price, billing_code AS "billingCode", disposition,
              malpractice_risk AS "malpracticeRisk", created_at AS "createdAt"
       FROM cases WHERE case_id = $1`,
      [caseId]
    );

    if (!res.rows.length) return null;

    const row = res.rows[0];
    if (redis) {
      await redis.set(`case:${caseId}`, JSON.stringify(row), "EX", CACHE_TTL_SECONDS);
    }

    return row;
  } catch (e: any) {
    console.error("[caseRepository] getCase error:", e.message);
    return null;
  }
}

export async function listRecentCases(limit = 20): Promise<CaseRecord[]> {
  try {
    const res = await pg.query(
      `SELECT case_id AS "caseId", complaint, diagnosis, risk_score AS "riskScore",
              physician, price, billing_code AS "billingCode", disposition,
              malpractice_risk AS "malpracticeRisk", created_at AS "createdAt"
       FROM cases ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    return res.rows;
  } catch (e: any) {
    console.error("[caseRepository] listRecentCases error:", e.message);
    return [];
  }
}
