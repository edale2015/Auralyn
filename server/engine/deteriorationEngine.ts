import { db } from "../db";
import { kbDeteriorationRules, patientLiveStream, patientState } from "../../shared/schema";
import { eq, desc, and } from "drizzle-orm";

export interface DeteriorationAlert {
  featureKey: string;
  trend: string;
  delta: number;
  threshold: number;
  action: string;
  riskWeight: number;
  recentValues: number[];
}

export interface DeteriorationResult {
  patientId: string;
  risk: number;
  alerts: DeteriorationAlert[];
  level: "safe" | "watch" | "warning" | "critical";
}

export async function detectDeterioration(patientId: string): Promise<DeteriorationResult> {
  const [series, rules] = await Promise.all([
    db.select()
      .from(patientLiveStream)
      .where(eq(patientLiveStream.patientId, patientId))
      .orderBy(desc(patientLiveStream.timestamp))
      .limit(200),
    db.select().from(kbDeteriorationRules).where(eq(kbDeteriorationRules.isActive, true)),
  ]);

  let risk = 0;
  const alerts: DeteriorationAlert[] = [];

  for (const rule of rules) {
    const vals = series
      .filter(s => s.featureKey === rule.featureKey)
      .map(s => s.value);

    if (vals.length < 2) continue;

    const first = vals[vals.length - 1];
    const last = vals[0];
    const delta = last - first;

    const triggered =
      (rule.trend === "rising" && delta > rule.threshold) ||
      (rule.trend === "falling" && delta < -rule.threshold);

    if (triggered) {
      risk += rule.riskWeight;
      alerts.push({
        featureKey: rule.featureKey,
        trend: rule.trend,
        delta,
        threshold: rule.threshold,
        action: rule.action,
        riskWeight: rule.riskWeight,
        recentValues: vals.slice(0, 5),
      });
    }
  }

  const level: DeteriorationResult["level"] =
    risk >= 5 ? "critical" : risk >= 3 ? "warning" : risk >= 1 ? "watch" : "safe";

  return { patientId, risk, alerts, level };
}

export async function upsertPatientState(
  patientId: string,
  currentDx?: string,
  currentDisposition?: string,
  riskScore?: number
) {
  await db
    .insert(patientState)
    .values({ patientId, currentDx, currentDisposition, riskScore: riskScore ?? 0 })
    .onConflictDoUpdate({
      target: patientState.patientId,
      set: {
        currentDx: currentDx ?? undefined,
        currentDisposition: currentDisposition ?? undefined,
        riskScore: riskScore ?? 0,
        lastUpdated: new Date(),
      },
    });
}

export async function seedDeteriorationRules(): Promise<number> {
  const defaults = [
    { featureKey: "heart_rate", threshold: 20, trend: "rising", action: "ALERT", riskWeight: 2 },
    { featureKey: "heart_rate", threshold: 30, trend: "falling", action: "ER_NOW", riskWeight: 4 },
    { featureKey: "spo2", threshold: 5, trend: "falling", action: "ER_NOW", riskWeight: 5 },
    { featureKey: "temperature", threshold: 1.5, trend: "rising", action: "ALERT", riskWeight: 1.5 },
    { featureKey: "systolic_bp", threshold: 30, trend: "falling", action: "ER_NOW", riskWeight: 4 },
    { featureKey: "systolic_bp", threshold: 40, trend: "rising", action: "ALERT", riskWeight: 2 },
    { featureKey: "respiratory_rate", threshold: 8, trend: "rising", action: "ALERT", riskWeight: 2 },
  ];

  let count = 0;
  for (const r of defaults) {
    await db.insert(kbDeteriorationRules)
      .values({ ...r, isActive: true })
      .onConflictDoNothing();
    count++;
  }
  return count;
}
