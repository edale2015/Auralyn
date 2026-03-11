import { computeSkillLayerAnalytics } from "./skillLayerAnalytics";

export async function printSkillLayerDashboardSummary() {
  const stats = await computeSkillLayerAnalytics();

  console.log("\n=== SKILL LAYER DASHBOARD SUMMARY ===");
  console.log(`Total cases: ${stats.totalCases}`);
  console.log(`Total skill runs: ${stats.totalSkillRuns}`);
  console.log(`Safety misses: ${stats.safetyMisses}`);

  console.log("\nDisposition counts:");
  for (const [k, v] of Object.entries(stats.dispositionCounts)) {
    console.log(`- ${k}: ${v}`);
  }

  console.log("\nSkill performance:");
  for (const [skill, info] of Object.entries(stats.bySkill)) {
    console.log(`- ${skill}: count=${info.count}, avgLatencyMs=${info.avgLatency.toFixed(1)}`);
  }

  return stats;
}

const isMainModule = typeof process !== "undefined" && process.argv[1]?.includes("skillLayerDashboardSummary");
if (isMainModule) {
  printSkillLayerDashboardSummary().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
