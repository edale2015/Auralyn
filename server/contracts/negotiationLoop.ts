import { getInsurers, updateInsurerStatus, generateNegotiationStrategy, type NegotiationStrategy } from "./contractPipeline";
import { sendOutreach } from "./outreachBot";
import { auditLog } from "../security/auditLogger";

export interface NegotiationCycleResult {
  cycleAt: string;
  outreachSent: number;
  strategiesGenerated: number;
  strategies: NegotiationStrategy[];
  promoted: Array<{ payerId: string; from: string; to: string }>;
}

const cycleHistory: NegotiationCycleResult[] = [];
let cycleCount = 0;

export async function runNegotiationCycle(performanceScore = 0.88): Promise<NegotiationCycleResult> {
  cycleCount++;
  const cycleAt = new Date().toISOString();
  let outreachSent = 0;
  const strategies: NegotiationStrategy[] = [];
  const promoted: Array<{ payerId: string; from: string; to: string }> = [];

  const targets = getInsurers("target");
  for (const insurer of targets) {
    await sendOutreach(insurer);
    updateInsurerStatus(insurer.payerId, "contacted");
    promoted.push({ payerId: insurer.payerId, from: "target", to: "contacted" });
    outreachSent++;
  }

  const allActive = [...getInsurers("contacted"), ...getInsurers("negotiating")];
  for (const insurer of allActive) {
    strategies.push(generateNegotiationStrategy(insurer, performanceScore));
  }

  auditLog({
    actor: "negotiation_loop",
    action: "cycle_complete",
    details: { cycle: cycleCount, outreachSent, strategiesGenerated: strategies.length },
  });

  const result: NegotiationCycleResult = {
    cycleAt,
    outreachSent,
    strategiesGenerated: strategies.length,
    strategies,
    promoted,
  };

  cycleHistory.push(result);
  if (cycleHistory.length > 50) cycleHistory.shift();

  return result;
}

export function getCycleHistory(limit = 20): NegotiationCycleResult[] {
  return cycleHistory.slice(-limit);
}

export function startNegotiationWorker(intervalMs = 60_000): () => void {
  const timer = setInterval(async () => {
    const result = await runNegotiationCycle();
    console.log(`[NegotiationLoop] Cycle #${cycleCount} — outreach: ${result.outreachSent}, strategies: ${result.strategiesGenerated}`);
  }, intervalMs);
  return () => clearInterval(timer);
}
