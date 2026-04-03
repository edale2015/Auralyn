import { db } from "../db";
import { kbComplaints, kbGoldenCases } from "@shared/schema";
import { eq, count } from "drizzle-orm";
import { upsertCoverageMatrix } from "./goldenCaseRepository";
import { logger } from "../utils/logger";

const RISK_BANDS = ["low", "medium", "high", "critical"] as const;
const AGE_BANDS = ["pediatric", "adult", "elderly"] as const;
const TARGET_PER_CELL = 3;

export async function buildCoverageMatrix(): Promise<{
  complaint: string;
  riskBand: string;
  ageBand: string;
  count: number;
  target: number;
}[]> {
  const allCases = await db.select().from(kbGoldenCases).where(eq(kbGoldenCases.active, true));
  const complaints = [...new Set(allCases.map((c) => c.complaint.toLowerCase().replace(/\s+/g, "_")))];

  const matrix: { complaint: string; riskBand: string; ageBand: string; count: number; target: number }[] = [];

  for (const complaint of complaints) {
    const complainCase = allCases.filter(
      (c) => c.complaint.toLowerCase().replace(/\s+/g, "_") === complaint
    );

    for (const riskBand of RISK_BANDS) {
      for (const ageBand of AGE_BANDS) {
        const count = complainCase.filter((c) => {
          const tags = c.tags ?? [];
          const hasRisk = tags.some((t) => t.toLowerCase() === riskBand) ||
            c.expectedDisposition.toLowerCase().includes(riskBand);
          const hasAge = tags.some((t) => t.toLowerCase() === ageBand);
          return hasRisk || hasAge;
        }).length;

        await upsertCoverageMatrix(complaint, riskBand, ageBand, count, TARGET_PER_CELL);
        matrix.push({ complaint, riskBand, ageBand, count, target: TARGET_PER_CELL });
      }
    }
  }

  return matrix;
}

export async function generateExpansionTemplates(): Promise<{
  complaint: string;
  riskBand: string;
  ageBand: string;
  gap: number;
}[]> {
  const matrix = await buildCoverageMatrix();
  return matrix
    .filter((m) => m.count < m.target)
    .map((m) => ({
      complaint: m.complaint,
      riskBand: m.riskBand,
      ageBand: m.ageBand,
      gap: m.target - m.count,
    }));
}
