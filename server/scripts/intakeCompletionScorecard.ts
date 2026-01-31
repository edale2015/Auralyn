import { db } from "../firebase";

function norm(x: any) { return String(x ?? "").trim(); }

async function main() {
  const DAYS = Number(process.env.SCORECARD_DAYS || 14);
  const sinceMs = Date.now() - DAYS * 24 * 60 * 60 * 1000;

  const snap = await db.collection("encounters")
    .where("updatedAt", ">=", new Date(sinceMs))
    .limit(5000)
    .get();

  let total = 0;
  let hasLink = 0;
  let submitted = 0;

  const byFlow = new Map<string, { hasLink: number; submitted: number }>();

  for (const doc of snap.docs) {
    total++;
    const e: any = doc.data();
    const flowId = norm(e.flowId) || "UNKNOWN";

    const token = norm(e.intakeToken);
    const code = norm(e.intakeCode);
    const has = Boolean(token && code);
    if (has) hasLink++;

    const status = norm(e.status);
    if (status === "pending_review") submitted++;

    if (!byFlow.has(flowId)) byFlow.set(flowId, { hasLink: 0, submitted: 0 });
    const row = byFlow.get(flowId)!;
    if (has) row.hasLink++;
    if (status === "pending_review") row.submitted++;
  }

  console.log(`\n=== INTAKE COMPLETION SCORECARD (last ${DAYS} days) ===`);
  console.log(`Encounters scanned: ${total}`);
  console.log(`Has link+code: ${hasLink}`);
  console.log(`Submitted (pending_review): ${submitted}`);
  console.log(`Completion rate (submitted / hasLink): ${(hasLink ? (submitted / hasLink) : 0).toFixed(3)}`);

  console.log(`\nTop flows by submissions:`);
  const flows = Array.from(byFlow.entries())
    .sort((a, b) => b[1].submitted - a[1].submitted)
    .slice(0, 15);

  for (const [flow, s] of flows) {
    const rate = s.hasLink ? (s.submitted / s.hasLink) : 0;
    console.log(`  ${flow}: submitted=${s.submitted}, hasLink=${s.hasLink}, rate=${rate.toFixed(3)}`);
  }

  console.log("\nDone.");
}

main().catch(e => {
  console.error("intakeCompletionScorecard failed:", e);
  process.exit(1);
});
