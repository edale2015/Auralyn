import { db } from "../firebase";

type RouterAudit = {
  routerReason?: string;
  routerPickedFlowId?: string;
  routerPickedSystem?: string;
  routerTextSnippet?: string;
  ts?: number;
  confidence?: string;
};

function norm(x: any) {
  return String(x ?? "").trim();
}

function inc(map: Map<string, number>, key: string, by = 1) {
  map.set(key, (map.get(key) || 0) + by);
}

function topN(map: Map<string, number>, n = 10) {
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, n);
}

async function main() {
  const DAYS = Number(process.env.SCORECARD_DAYS || 14);
  const sinceMs = Date.now() - DAYS * 24 * 60 * 60 * 1000;

  const flowCounts = new Map<string, number>();
  const reasonCounts = new Map<string, number>();
  const overrideFlowCounts = new Map<string, number>();
  const overrideSnippets = new Map<string, number>();
  const confidenceCounts = new Map<string, number>();

  const ED_WARN_FLOWIDS = new Set([
    "EMERG_CRITICAL_V1",
    "TRAUMA_MAJOR_V1",
    "UROGYN_VAGINAL_BLEEDING_V1",
    "UROGYN_TESTICULAR_PAIN_V1",
    "OPHTH_VISION_LOSS_V1",
    "NEURO_WEAKNESS_V1",
  ]);
  let edWarnHits = 0;

  const snap = await db.collection("encounters")
    .where("updatedAt", ">=", new Date(sinceMs))
    .limit(3000)
    .get();

  let total = 0;
  for (const doc of snap.docs) {
    total++;
    const data = doc.data() as any;

    const flowId = norm(data.flowId);
    if (flowId) inc(flowCounts, flowId);

    if (ED_WARN_FLOWIDS.has(flowId)) edWarnHits++;

    let answersObj: any = {};
    try {
      answersObj = data.answers ? JSON.parse(data.answers) : {};
    } catch {
      answersObj = {};
    }

    const ra: RouterAudit = answersObj.__routerAudit || {};
    const reason = norm(ra.routerReason) || "unknown";
    inc(reasonCounts, reason);

    const conf = norm(ra.confidence);
    if (conf) inc(confidenceCounts, conf);

    // Check history for all staff overrides (overrides can be overwritten by later routing)
    const hist = Array.isArray(answersObj.__routerAuditHistory) ? answersObj.__routerAuditHistory : [];
    for (const h of hist) {
      const hReason = String(h?.routerReason || "");
      const hSystem = String(h?.routerPickedSystem || "");
      if (hReason === "staff_override" || hSystem === "STAFF_OVERRIDE") {
        const pickedFlow = norm(h.routerPickedFlowId);
        if (pickedFlow) inc(overrideFlowCounts, pickedFlow);

        const snip = norm(h.routerTextSnippet);
        if (snip) inc(overrideSnippets, snip);
      }
    }

    // Fallback: also check latest audit for backwards compatibility
    const pickedSystem = norm(ra.routerPickedSystem);
    const latestReason = norm(ra.routerReason);
    if ((pickedSystem === "STAFF_OVERRIDE" || latestReason === "staff_override") && !hist.length) {
      const pickedFlow = norm(ra.routerPickedFlowId);
      if (pickedFlow) inc(overrideFlowCounts, pickedFlow);

      const snip = norm(ra.routerTextSnippet);
      if (snip) inc(overrideSnippets, snip);
    }
  }

  console.log(`\n=== ROUTER SCORECARD (last ${DAYS} days) ===`);
  console.log(`Encounters scanned: ${total}`);
  console.log(`ED-warning flow hits (proxy): ${edWarnHits}`);

  console.log(`\nTop flows:`);
  for (const [k, v] of topN(flowCounts, 15)) console.log(`  ${k}: ${v}`);

  console.log(`\nRouting reason distribution:`);
  for (const [k, v] of topN(reasonCounts, 10)) console.log(`  ${k}: ${v}`);

  if (confidenceCounts.size) {
    console.log(`\nRouting confidence distribution:`);
    for (const [k, v] of topN(confidenceCounts, 10)) console.log(`  ${k}: ${v}`);
  }

  if (overrideFlowCounts.size) {
    console.log(`\nTop staff overrides by flow:`);
    for (const [k, v] of topN(overrideFlowCounts, 10)) console.log(`  ${k}: ${v}`);
  }

  if (overrideSnippets.size) {
    console.log(`\nTop override snippets:`);
    for (const [k, v] of topN(overrideSnippets, 15)) console.log(`  "${k}"  (${v})`);
  } else {
    console.log(`\n(No staff overrides detected in this window.)`);
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error("routerScorecard failed:", e);
  process.exit(1);
});
